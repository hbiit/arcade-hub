"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomManager = void 0;
const src_1 = require("../../../shared/src");
const gameRegistry_1 = require("./gameRegistry");
const platformAdapter_1 = require("../services/platformAdapter");
class RoomManager {
    rooms = new Map();
    io;
    constructor(io) {
        this.io = io;
    }
    async createRoom(hostSocket, gameId, userId, token, customName) {
        const entry = gameRegistry_1.GameRegistry.getGame(gameId);
        if (!entry)
            throw new Error('Invalid game ID');
        const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
        const profile = await platformAdapter_1.PlatformAdapter.getInstance().fetchUserProfile(userId || hostSocket.id, token, customName);
        const engine = entry.factory(roomCode, (gameData) => {
            const room = this.rooms.get(roomCode);
            if (room) {
                room.state.gameData = gameData;
                this.io.to(roomCode).emit(src_1.SOCKET_EVENTS.GAME_STATE_TICK, room.state);
            }
        });
        const hostSession = {
            socketId: hostSocket.id,
            userId: profile.id,
            profile,
            score: 0,
            isReady: true,
            connected: true
        };
        const roomState = {
            roomCode,
            gameId,
            hostSocketId: hostSocket.id,
            status: 'lobby',
            players: { [hostSocket.id]: hostSession },
            gameData: engine.getState(),
            timeRemaining: entry.metadata.durationSeconds
        };
        engine.registerPlayer(hostSession);
        this.rooms.set(roomCode, { state: roomState, engine });
        hostSocket.join(roomCode);
        this.io.to(roomCode).emit(src_1.SOCKET_EVENTS.ROOM_UPDATED, roomState);
        return roomCode;
    }
    async joinRoom(socket, roomCode, userId, token, customName) {
        const room = this.rooms.get(roomCode);
        if (!room) {
            socket.emit(src_1.SOCKET_EVENTS.ERROR_MESSAGE, 'Room not found.');
            return;
        }
        const effectiveUserId = userId || socket.id;
        // N-03: Reconnection support - check if player with matching userId was already in room
        const existingEntry = Object.entries(room.state.players).find(([, s]) => s.userId === effectiveUserId);
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
            this.io.to(roomCode).emit(src_1.SOCKET_EVENTS.ROOM_UPDATED, room.state);
            return;
        }
        const profile = await platformAdapter_1.PlatformAdapter.getInstance().fetchUserProfile(effectiveUserId, token, customName);
        const session = {
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
        this.io.to(roomCode).emit(src_1.SOCKET_EVENTS.ROOM_UPDATED, room.state);
    }
    togglePause(roomCode) {
        const room = this.rooms.get(roomCode);
        if (!room)
            return;
        if (room.state.status === 'in_progress') {
            room.state.status = 'paused';
        }
        else if (room.state.status === 'paused') {
            room.state.status = 'in_progress';
        }
        this.io.to(roomCode).emit(src_1.SOCKET_EVENTS.ROOM_UPDATED, room.state);
    }
    leaveRoom(socket, roomCode) {
        const room = this.rooms.get(roomCode);
        if (!room)
            return;
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
            if (room.intervalId)
                clearInterval(room.intervalId);
            this.rooms.delete(roomCode);
        }
        else {
            this.io.to(roomCode).emit(src_1.SOCKET_EVENTS.ROOM_UPDATED, room.state);
        }
    }
    handleDisconnect(socket) {
        for (const [roomCode, room] of this.rooms.entries()) {
            const player = room.state.players[socket.id];
            if (player) {
                player.connected = false;
                player.disconnectedAt = Date.now();
                this.io.to(roomCode).emit(src_1.SOCKET_EVENTS.ROOM_UPDATED, room.state);
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
    async addBot(roomCode) {
        const room = this.rooms.get(roomCode);
        if (!room)
            return;
        const botNames = ['Cipher_AI', 'Sparky_Bot', 'Brawler_X', 'Neon_Ghost'];
        const chosenName = botNames[Math.floor(Math.random() * botNames.length)];
        const profile = await platformAdapter_1.PlatformAdapter.getInstance().fetchUserProfile(`bot_${Math.random().toString(36).substring(2, 7)}`, undefined, chosenName);
        const botSession = {
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
        this.io.to(roomCode).emit(src_1.SOCKET_EVENTS.ROOM_UPDATED, room.state);
    }
    async startGame(roomCode) {
        const room = this.rooms.get(roomCode);
        if (!room || room.state.status === 'in_progress')
            return;
        // Solo fallback: inject AI rival if single player
        if (Object.keys(room.state.players).length === 1) {
            await this.addBot(roomCode);
        }
        if (room.state.status === 'ended') {
            const entry = gameRegistry_1.GameRegistry.getGame(room.state.gameId);
            room.state.timeRemaining = entry ? entry.metadata.durationSeconds : 60;
            room.engine.reset();
            room.state.gameData = room.engine.getState();
            for (const p of Object.values(room.state.players)) {
                p.score = 0;
            }
        }
        room.state.status = 'in_progress';
        this.io.to(roomCode).emit(src_1.SOCKET_EVENTS.ROOM_UPDATED, room.state);
        let lastTick = Date.now();
        if (room.intervalId)
            clearInterval(room.intervalId);
        room.intervalId = setInterval(() => {
            if (room.state.status !== 'in_progress') {
                lastTick = Date.now();
                return;
            }
            const now = Date.now();
            const dt = (now - lastTick) / 1000;
            lastTick = now;
            room.state.timeRemaining = Math.max(0, room.state.timeRemaining - dt);
            room.engine.tick(dt);
            if (room.state.timeRemaining <= 0) {
                this.endGame(roomCode);
            }
        }, 50); // 20 Hz
    }
    handleInput(socketId, roomCode, payload) {
        const room = this.rooms.get(roomCode);
        if (room && room.state.status === 'in_progress') {
            room.engine.handleInput(socketId, payload);
        }
    }
    endGame(roomCode) {
        const room = this.rooms.get(roomCode);
        if (!room)
            return;
        if (room.intervalId)
            clearInterval(room.intervalId);
        room.state.status = 'ended';
        const sorted = Object.values(room.state.players).sort((a, b) => b.score - a.score);
        if (sorted.length > 0) {
            // G-06: Ties show all tied players as winners
            const topScore = sorted[0].score;
            const tiedWinners = sorted.filter(p => p.score === topScore);
            room.state.winnerSocketId = tiedWinners.map(w => w.socketId).join(',');
        }
        platformAdapter_1.PlatformAdapter.getInstance().recordMatchResult(room.state.gameId, room.state.winnerSocketId, sorted.map((p) => ({
            userId: p.userId,
            displayName: p.profile.displayName,
            favoriteColor: p.profile.favoriteColor,
            score: p.score,
            level: p.profile.level
        })));
        this.io.to(roomCode).emit(src_1.SOCKET_EVENTS.ROOM_UPDATED, room.state);
        // G-06: Results display for 8 seconds, then the room returns to the lobby
        setTimeout(() => {
            const current = this.rooms.get(roomCode);
            if (current && current.state.status === 'ended') {
                current.state.status = 'lobby';
                current.engine.reset();
                current.state.gameData = current.engine.getState();
                const entry = gameRegistry_1.GameRegistry.getGame(current.state.gameId);
                current.state.timeRemaining = entry ? entry.metadata.durationSeconds : 60;
                this.io.to(roomCode).emit(src_1.SOCKET_EVENTS.ROOM_UPDATED, current.state);
            }
        }, 8000);
    }
}
exports.RoomManager = RoomManager;
