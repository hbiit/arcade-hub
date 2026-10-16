import { Server, Socket } from 'socket.io';
import { GameId, PlayerInputPayload, PlayerSession, RoomState, SOCKET_EVENTS } from '../../../shared/src';
import { GameRegistry } from './gameRegistry';
import { BaseGameEngine } from '../engines/BaseGameEngine';
import { PlatformAdapter } from '../services/platformAdapter';

interface ActiveRoom {
  state: RoomState;
  engine: BaseGameEngine;
  intervalId?: NodeJS.Timeout;
}

export class RoomManager {
  private rooms = new Map<string, ActiveRoom>();
  private io: Server;

  constructor(io: Server) {
    this.io = io;
  }

  public async createRoom(hostSocket: Socket, gameId: GameId, userId?: string, token?: string, customName?: string): Promise<string> {
    const entry = GameRegistry.getGame(gameId);
    if (!entry) throw new Error('Invalid game ID');

    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const profile = await PlatformAdapter.getInstance().fetchUserProfile(userId || hostSocket.id, token, customName);

    const engine = entry.factory(roomCode, (gameData) => {
      const room = this.rooms.get(roomCode);
      if (room) {
        room.state.gameData = gameData;
        this.io.to(roomCode).emit(SOCKET_EVENTS.GAME_STATE_TICK, room.state);
      }
    });

    const hostSession: PlayerSession = {
      socketId: hostSocket.id,
      userId: profile.id,
      profile,
      score: 0,
      isReady: true,
      connected: true
    };

    const roomState: RoomState = {
      roomCode,
      gameId,
      hostSocketId: hostSocket.id,
      status: 'lobby',
      players: { [hostSocket.id]: hostSession },
      gameData: engine.getState(),
      hasTimer: entry.metadata.hasTimer !== false,
      timeRemaining: entry.metadata.durationSeconds || 60,
      elapsedSeconds: 0
    };

    engine.registerPlayer(hostSession);
    this.rooms.set(roomCode, { state: roomState, engine });
    hostSocket.join(roomCode);
    this.io.to(roomCode).emit(SOCKET_EVENTS.ROOM_UPDATED, roomState);
    return roomCode;
  }

  public async joinRoom(socket: Socket, roomCode: string, userId?: string, token?: string, customName?: string): Promise<void> {
    const room = this.rooms.get(roomCode);
    if (!room) {
      socket.emit(SOCKET_EVENTS.ERROR_MESSAGE, 'Room not found.');
      return;
    }

    const effectiveUserId = userId || socket.id;

    // N-03: Reconnection support - check if player with matching userId was already in room
    const existingEntry = Object.entries(room.state.players).find(
      ([, s]) => s.userId === effectiveUserId
    );

    if (existingEntry) {
      const [oldSocketId, session] = existingEntry;
      delete room.state.players[oldSocketId];
      session.socketId = socket.id;
      session.connected = true;
      delete session.disconnectedAt;
      room.state.players[socket.id] = session;

      if (room.state.hostSocketId === oldSocketId) {
        room.state.hostSocketId = socket.id;
      }

      room.engine.registerPlayer(session);
      socket.join(roomCode);
      this.io.to(roomCode).emit(SOCKET_EVENTS.ROOM_UPDATED, room.state);
      return;
    }

    const profile = await PlatformAdapter.getInstance().fetchUserProfile(effectiveUserId, token, customName);
    const session: PlayerSession = {
      socketId: socket.id,
      userId: profile.id,
      profile,
      score: 0,
      isReady: true,
      connected: true
    };

    room.state.players[socket.id] = session;
    room.engine.registerPlayer(session);
    socket.join(roomCode);
    this.io.to(roomCode).emit(SOCKET_EVENTS.ROOM_UPDATED, room.state);
  }

  public togglePause(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    if (room.state.status === 'in_progress') {
      room.state.status = 'paused';
    } else if (room.state.status === 'paused') {
      room.state.status = 'in_progress';
    }
    this.io.to(roomCode).emit(SOCKET_EVENTS.ROOM_UPDATED, room.state);
  }

  public leaveRoom(socket: Socket, roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    room.engine.unregisterPlayer(socket.id);
    delete room.state.players[socket.id];
    socket.leave(roomCode);

    // N-04: If host left, transfer host role to next remaining connected player
    if (room.state.hostSocketId === socket.id) {
      const remainingConnected = Object.values(room.state.players).find(p => p.connected && !p.isBot);
      if (remainingConnected) {
        room.state.hostSocketId = remainingConnected.socketId;
      }
    }

    if (Object.keys(room.state.players).length === 0) {
      if (room.intervalId) clearInterval(room.intervalId);
      this.rooms.delete(roomCode);
    } else {
      this.io.to(roomCode).emit(SOCKET_EVENTS.ROOM_UPDATED, room.state);
    }
  }

  public handleDisconnect(socket: Socket): void {
    for (const [roomCode, room] of this.rooms.entries()) {
      const player = room.state.players[socket.id];
      if (player) {
        player.connected = false;
        player.disconnectedAt = Date.now();
        this.io.to(roomCode).emit(SOCKET_EVENTS.ROOM_UPDATED, room.state);

        // N-04: Grace period: after 30 seconds without reconnecting, permanently remove
        setTimeout(() => {
          const current = this.rooms.get(roomCode);
          if (current && current.state.players[socket.id] && !current.state.players[socket.id].connected) {
            this.leaveRoom(socket, roomCode);
          }
        }, 30000);
      }
    }
  }

  public async addBot(roomCode: string): Promise<void> {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    const botNames = ['Cipher_AI', 'Sparky_Bot', 'Brawler_X', 'Neon_Ghost'];
    const chosenName = botNames[Math.floor(Math.random() * botNames.length)];
    const profile = await PlatformAdapter.getInstance().fetchUserProfile(
      `bot_${Math.random().toString(36).substring(2, 7)}`,
      undefined,
      chosenName
    );
    const botSession: PlayerSession = {
      socketId: profile.id,
      userId: profile.id,
      profile,
      score: 0,
      isReady: true,
      isBot: true,
      connected: true
    };
    room.state.players[profile.id] = botSession;
    room.engine.registerPlayer(botSession);
    this.io.to(roomCode).emit(SOCKET_EVENTS.ROOM_UPDATED, room.state);
  }

  public async startGame(roomCode: string): Promise<void> {
    const room = this.rooms.get(roomCode);
    if (!room || room.state.status === 'in_progress') return;

    // Solo fallback: inject AI rival if single player
    if (Object.keys(room.state.players).length === 1) {
      await this.addBot(roomCode);
    }

    if (room.state.status === 'ended') {
      const entry = GameRegistry.getGame(room.state.gameId);
      room.state.timeRemaining = entry ? (entry.metadata.durationSeconds || 60) : 60;
      room.state.elapsedSeconds = 0;
      room.engine.reset();
      room.state.gameData = room.engine.getState();
      for (const p of Object.values(room.state.players)) {
        p.score = 0;
      }
    }

    room.state.status = 'in_progress';
    this.io.to(roomCode).emit(SOCKET_EVENTS.ROOM_UPDATED, room.state);

    let lastTick = Date.now();
    if (room.intervalId) clearInterval(room.intervalId);
    room.intervalId = setInterval(() => {
      if (room.state.status !== 'in_progress') {
        lastTick = Date.now();
        return;
      }
      const now = Date.now();
      const dt = (now - lastTick) / 1000;
      lastTick = now;

      room.engine.tick(dt);

      if (room.state.hasTimer !== false) {
        room.state.timeRemaining = Math.max(0, room.state.timeRemaining - dt);
        if (room.state.timeRemaining <= 0) {
          this.endGame(roomCode);
        }
      } else {
        room.state.elapsedSeconds = (room.state.elapsedSeconds || 0) + dt;
        const engAny = room.engine as any;
        if (engAny.isGameOver && typeof engAny.isGameOver === 'function' && engAny.isGameOver()) {
          if (engAny.winnerSocketId) {
            room.state.winnerSocketId = engAny.winnerSocketId;
          }
          this.endGame(roomCode);
        }
      }
    }, 50); // 20 Hz
  }

  public handleInput(socketId: string, roomCode: string, payload: PlayerInputPayload): void {
    const room = this.rooms.get(roomCode);
    if (room && room.state.status === 'in_progress') {
      room.engine.handleInput(socketId, payload);
    }
  }

  private endGame(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    if (room.intervalId) clearInterval(room.intervalId);
    room.state.status = 'ended';

    const sorted = Object.values(room.state.players).sort((a, b) => b.score - a.score);
    if (sorted.length > 0) {
      // G-06: Ties show all tied players as winners
      const topScore = sorted[0].score;
      const tiedWinners = sorted.filter(p => p.score === topScore);
      room.state.winnerSocketId = tiedWinners.map(w => w.socketId).join(',');
    }

    PlatformAdapter.getInstance().recordMatchResult(
      room.state.gameId,
      room.state.winnerSocketId,
      sorted.map((p) => ({
        userId: p.userId,
        displayName: p.profile.displayName,
        favoriteColor: p.profile.favoriteColor,
        score: p.score,
        level: p.profile.level
      }))
    );

    this.io.to(roomCode).emit(SOCKET_EVENTS.ROOM_UPDATED, room.state);

    // G-06: Results display for 8 seconds, then the room returns to the lobby
    setTimeout(() => {
      const current = this.rooms.get(roomCode);
      if (current && current.state.status === 'ended') {
        current.state.status = 'lobby';
        current.engine.reset();
        current.state.gameData = current.engine.getState();
        const entry = GameRegistry.getGame(current.state.gameId);
        current.state.timeRemaining = entry ? (entry.metadata.durationSeconds || 60) : 60;
        current.state.elapsedSeconds = 0;
        this.io.to(roomCode).emit(SOCKET_EVENTS.ROOM_UPDATED, current.state);
      }
    }, 8000);
  }
}
