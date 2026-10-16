import { GameId, PlayerSession, RoomState } from '../../../shared/src';
import { BlobBrawlEngine } from '../../../server/src/engines/BlobBrawlEngine';
import { GlowballEngine } from '../../../server/src/engines/GlowballEngine';
import { ACCGEngine } from '../../../server/src/engines/ACCGEngine';
import { MahjongEngine } from '../../../server/src/engines/MahjongEngine';
import { MahjongSolitaireEngine } from '../../../server/src/engines/MahjongSolitaireEngine';

export class LocalGameRunner {
  private engine: any;
  private intervalId: any = null;
  private state: RoomState<any>;
  private onUpdate: (room: RoomState<any>) => void;

  constructor(gameId: GameId, playerSession: PlayerSession, onUpdate: (room: RoomState<any>) => void) {
    this.onUpdate = onUpdate;

    if (gameId === 'blob') this.engine = new BlobBrawlEngine();
    else if (gameId === 'glowball') this.engine = new GlowballEngine();
    else if (gameId === 'accg') this.engine = new ACCGEngine();
    else if (gameId === 'mahjong') this.engine = new MahjongEngine();
    else this.engine = new MahjongSolitaireEngine();

    const initialGameData = this.engine.initializeState();
    this.engine.registerPlayer(playerSession);

    const durations: Record<GameId, number> = {
      blob: 60,
      glowball: 90,
      accg: 120,
      mahjong: 90,
      'mahjong-solitaire': 90,
      mahjong_solitaire: 90,
      cyber_slither: 60,
      party_blitz: 60
    };

    this.state = {
      roomCode: 'SOLO_' + Math.random().toString(36).substring(2, 6).toUpperCase(),
      gameId,
      hostSocketId: playerSession.socketId,
      status: 'in_progress',
      players: { [playerSession.socketId]: playerSession },
      gameData: initialGameData,
      timeRemaining: durations[gameId] || 60
    };
  }

  public start(): void {
    let lastTime = Date.now();
    this.intervalId = setInterval(() => {
      if (this.state.status !== 'in_progress') return;
      const now = Date.now();
      const dt = (now - lastTime) / 1000;
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
      }

      this.onUpdate({ ...this.state });
    }, 50); // 20Hz
  }

  public handleInput(socketId: string, payload: any): void {
    if (this.engine && this.state.status === 'in_progress') {
      this.engine.handleInput(socketId, payload);
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
