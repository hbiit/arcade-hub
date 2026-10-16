import { DifficultyLevel, GameId, PlayerSession, RoomState } from '../../../shared/src';
import { BlobBrawlEngine } from '../../../server/src/engines/BlobBrawlEngine';
import { GlowballEngine } from '../../../server/src/engines/GlowballEngine';
import { ACCGEngine } from '../../../server/src/engines/ACCGEngine';
import { MahjongEngine } from '../../../server/src/engines/MahjongEngine';
import { MahjongSolitaireEngine } from '../../../server/src/engines/MahjongSolitaireEngine';
import { BrickBreakerEngine } from '../../../server/src/engines/BrickBreakerEngine';
import { CheckersEngine } from '../../../server/src/engines/CheckersEngine';
import { CyberSlitherEngine } from '../../../server/src/engines/CyberSlitherEngine';
import { GalaxyStrikeEngine } from '../../../server/src/engines/GalaxyStrikeEngine';

export const TIMED_GAMES: GameId[] = ['blob', 'glowball', 'accg', 'mahjong-solitaire'];

export class LocalGameRunner {
  private engine: any;
  private intervalId: any = null;
  private state: RoomState<any>;
  private onUpdate: (room: RoomState<any>) => void;
  private playerSocketId: string;
  private difficulty: DifficultyLevel;
  private hasTimer: boolean;

  constructor(
    gameId: GameId,
    playerSession: PlayerSession,
    onUpdate: (room: RoomState<any>) => void,
    difficulty: DifficultyLevel = 'normal'
  ) {
    this.onUpdate = onUpdate;
    this.playerSocketId = playerSession.socketId || 'local_player';
    this.difficulty = difficulty;
    this.hasTimer = TIMED_GAMES.includes(gameId);

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

    if (typeof this.engine.setDifficulty === 'function') {
      this.engine.setDifficulty(difficulty);
    }

    const cleanSession: PlayerSession = {
      ...playerSession,
      socketId: this.playerSocketId
    };
    this.engine.registerPlayer(cleanSession);

    const initialGameData = this.engine.getState();

    // Calculate match duration for timed games
    let duration = 0;
    if (gameId === 'blob') {
      duration = difficulty === 'easy' ? 75 : difficulty === 'hard' ? 45 : 60;
    } else if (gameId === 'glowball') {
      duration = difficulty === 'easy' ? 90 : difficulty === 'hard' ? 75 : 90;
    } else if (gameId === 'accg') {
      duration = difficulty === 'easy' ? 120 : difficulty === 'hard' ? 90 : 120;
    } else if (gameId === 'mahjong-solitaire') {
      duration = difficulty === 'easy' ? 120 : difficulty === 'hard' ? 60 : 90;
    }

    this.state = {
      roomCode,
      gameId,
      hostSocketId: this.playerSocketId,
      status: 'in_progress',
      players: { [this.playerSocketId]: cleanSession },
      gameData: initialGameData,
      timeRemaining: duration,
      elapsedSeconds: 0,
      hasTimer: this.hasTimer,
      difficulty
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

      // Timer & Stopwatch management
      if (this.hasTimer) {
        this.state.timeRemaining = Math.max(0, this.state.timeRemaining - dt);
      }
      this.state.elapsedSeconds = (this.state.elapsedSeconds || 0) + dt;

      // Engine physics and AI tick
      this.engine.tick(dt);
      const data = this.engine.getState();
      this.state.gameData = data;

      // Check Termination & Victory Conditions

      // 1. Timed Game expiration
      if (this.hasTimer && this.state.timeRemaining <= 0) {
        this.state.status = 'ended';
        const sorted = Object.values(this.state.players).sort((a: any, b: any) => (b.score || 0) - (a.score || 0));
        if (sorted.length > 0) {
          this.state.winnerSocketId = sorted[0].socketId;
        }
        this.stop();
        this.onUpdate({ ...this.state });
        return;
      }

      // 2. Brick Breaker: Game Over (all lives lost) or Grand Victory (all levels cleared)
      if (this.state.gameId === 'brick_breaker' && data.isGameOver) {
        this.state.status = 'ended';
        if (data.isVictory) {
          this.state.winnerSocketId = this.playerSocketId;
        }
        this.stop();
        this.onUpdate({ ...this.state });
        return;
      }

      // 3. Checkers: Game Over (one side has 0 pieces or 0 moves)
      if (this.state.gameId === 'checkers' && data.winner) {
        this.state.status = 'ended';
        if (data.winner === 'cyan') {
          this.state.winnerSocketId = this.playerSocketId;
        }
        this.stop();
        this.onUpdate({ ...this.state });
        return;
      }

      // 4. Galaxy Strike: Game Over (all lives lost) or Grand Victory (Void Dreadnought destroyed)
      if (this.state.gameId === 'galaxy_strike' && data.isGameOver) {
        this.state.status = 'ended';
        if (data.isVictory) {
          this.state.winnerSocketId = this.playerSocketId;
        }
        this.stop();
        this.onUpdate({ ...this.state });
        return;
      }

      // 5. Traditional Mahjong: Hand completed (Hu) or Wall Exhausted
      if (this.state.gameId === 'mahjong' && data.phase === 'ended') {
        this.state.status = 'ended';
        const humanSeat = data.seats?.find((s: any) => s.id === this.playerSocketId);
        if (data.winnerSeat !== undefined && humanSeat && data.winnerSeat === humanSeat.seatIndex) {
          this.state.winnerSocketId = this.playerSocketId;
        }
        this.stop();
        this.onUpdate({ ...this.state });
        return;
      }

      // 6. Mahjong Solitaire: All tiles cleared
      if (this.state.gameId === 'mahjong-solitaire' && data.remainingTiles === 0) {
        this.state.status = 'ended';
        this.state.winnerSocketId = this.playerSocketId;
        this.stop();
        this.onUpdate({ ...this.state });
        return;
      }

      // 7. Glowball: Target goals reached
      if (this.state.gameId === 'glowball') {
        const goalTarget = this.difficulty === 'easy' ? 3 : this.difficulty === 'hard' ? 7 : 5;
        const p1 = Object.values(data.players || {})[0] as any;
        if (p1 && p1.goals >= goalTarget) {
          this.state.status = 'ended';
          this.state.winnerSocketId = this.playerSocketId;
          this.stop();
          this.onUpdate({ ...this.state });
          return;
        }
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
