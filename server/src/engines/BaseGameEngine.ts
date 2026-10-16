import { DifficultyLevel, PlayerInputPayload, PlayerSession } from '../../../shared/src';

export abstract class BaseGameEngine<TState = any> {
  protected roomCode: string;
  protected players: Map<string, PlayerSession>;
  protected state: TState;
  protected onStateUpdate: (state: TState) => void;
  public difficulty: DifficultyLevel = 'normal';

  constructor(roomCode: string = 'SOLO_ROOM', onStateUpdate: (state: TState) => void = () => {}) {
    this.roomCode = roomCode || 'SOLO_ROOM';
    this.players = new Map();
    this.onStateUpdate = typeof onStateUpdate === 'function' ? onStateUpdate : () => {};
    this.state = this.initializeState();
  }

  public setDifficulty(difficulty: DifficultyLevel): void {
    this.difficulty = difficulty;
  }

  public registerPlayer(player: PlayerSession): void {
    this.players.set(player.socketId, player);
    this.onPlayerJoined(player);
  }

  public unregisterPlayer(socketId: string): void {
    this.players.delete(socketId);
    this.onPlayerLeft(socketId);
  }

  public reset(): void {
    this.state = this.initializeState();
    for (const player of this.players.values()) {
      player.score = 0;
      this.onPlayerJoined(player);
    }
  }

  public getState(): TState {
    return this.state;
  }

  abstract initializeState(): TState;
  abstract handleInput(socketId: string, inputPayload: PlayerInputPayload): void;
  abstract tick(deltaSeconds: number): void;
  abstract onPlayerJoined(player: PlayerSession): void;
  abstract onPlayerLeft(socketId: string): void;
}
