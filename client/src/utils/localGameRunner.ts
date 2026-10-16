import { GameId, PlayerSession, RoomState } from '../../../shared/src';
import { BlobBrawlEngine } from '../../../server/src/engines/BlobBrawlEngine';
import { GlowballEngine } from '../../../server/src/engines/GlowballEngine';
import { ACCGEngine } from '../../../server/src/engines/ACCGEngine';
import { MahjongEngine } from '../../../server/src/engines/MahjongEngine';
import { MahjongSolitaireEngine } from '../../../server/src/engines/MahjongSolitaireEngine';
import { BrickBreakerEngine } from '../../../server/src/engines/BrickBreakerEngine';
import { CheckersEngine } from '../../../server/src/engines/CheckersEngine';
import { CyberSlitherEngine } from '../../../server/src/engines/CyberSlitherEngine';
import { GalaxyStrikeEngine } from '../../../server/src/engines/GalaxyStrikeEngine';

export class LocalGameRunner {
  private engine: any;
  private intervalId: any = null;
  private state: RoomState<any>;
  private onUpdate: (room: RoomState<any>) => void;
  private playerSocketId: string;

  constructor(gameId: GameId, playerSession: PlayerSession, onUpdate: (room: RoomState<any>) => void) {
    this.onUpdate = onUpdate;
    this.playerSocketId = playerSession.socketId || 'local_player';

    const roomCode = 'SOLO_' + Math.random().toString(36).substring(2, 6).toUpperCase();

    const onEngineUpdate = (engineData: any) => {
      if (this.state) {
        this.state.gameData = engineData;
        this.onUpdate({ ...this.state });
      }
    };

    if (gameId === 'blob') {
      this.engine = new BlobBrawlEngine(roomCode, onEngineUpdate);
    } else if (gameId === 'glowball') {
      this.engine = new GlowballEngine(roomCode, onEngineUpdate);
    } else if (gameId === 'accg') {
      this.engine = new ACCGEngine(roomCode, onEngineUpdate);
    } else if (gameId === 'mahjong') {
      this.engine = new MahjongEngine(roomCode, onEngineUpdate);
    } else if (gameId === 'brick_breaker') {
      this.engine = new BrickBreakerEngine(roomCode, onEngineUpdate);
    } else if (gameId === 'checkers') {
      this.engine = new CheckersEngine(roomCode, onEngineUpdate);
    } else if (gameId === 'cyber_slither') {
      this.engine = new CyberSlitherEngine(roomCode, onEngineUpdate);
    } else if (gameId === 'galaxy_strike') {
      this.engine = new GalaxyStrikeEngine(roomCode, onEngineUpdate);
    } else {
      this.engine = new MahjongSolitaireEngine(roomCode, onEngineUpdate);
    }

    const cleanSession: PlayerSession = {
      ...playerSession,
      socketId: this.playerSocketId
    };
    this.engine.registerPlayer(cleanSession);

    const initialGameData = this.engine.getState();

    const durations: Record<GameId, number> = {
      blob: 60,
      glowball: 90,
      accg: 120,
      mahjong: 90,
      'mahjong-solitaire': 90,
      mahjong_solitaire: 90,
      brick_breaker: 90,
      checkers: 180,
      cyber_slither: 90,
      galaxy_strike: 90,
      party_blitz: 60
    };

    this.state = {
      roomCode,
      gameId,
      hostSocketId: this.playerSocketId,
      status: 'in_progress',
      players: { [this.playerSocketId]: cleanSession },
      gameData: initialGameData,
      timeRemaining: durations[gameId] || 60
    };
  }

  public start(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    let lastTime = Date.now();
    this.intervalId = setInterval(() => {
      if (this.state.status !== 'in_progress') return;
      const now = Date.now();
      const dt = Math.min(0.1, (now - lastTime) / 1000);
      lastTime = now;

      this.state.timeRemaining = Math.max(0, this.state.timeRemaining - dt);
      this.engine.tick(dt);
      this.state.gameData = this.engine.getState();

      if (this.state.timeRemaining <= 0) {
        this.state.status = 'ended';
        const sorted = Object.values(this.state.players).sort((a: any, b: any) => (b.score || 0) - (a.score || 0));
        if (sorted.length > 0) {
          this.state.winnerSocketId = sorted[0].socketId;
        }
        clearInterval(this.intervalId);
        this.intervalId = null;
      }

      this.onUpdate({ ...this.state });
    }, 50); // 20Hz Authoritative Loop
  }

  public handleInput(socketId: string, payload: any): void {
    if (this.engine && this.state.status === 'in_progress') {
      const cleanPayload = payload?.input !== undefined ? payload.input : payload;
      this.engine.handleInput(this.playerSocketId, cleanPayload);
      this.state.gameData = this.engine.getState();
      this.onUpdate({ ...this.state });
    }
  }

  public togglePause(): void {
    if (this.state.status === 'in_progress') {
      this.state.status = 'paused';
    } else if (this.state.status === 'paused') {
      this.state.status = 'in_progress';
    }
    this.onUpdate({ ...this.state });
  }

  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  public getState(): RoomState<any> {
    return this.state;
  }
}
