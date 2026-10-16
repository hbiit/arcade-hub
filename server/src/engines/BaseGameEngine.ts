import { PlayerInputPayload, PlayerSession } from '../../../shared/src';

export abstract class BaseGameEngine<TState = any> {
  protected roomCode: string;
  protected players: Map<string, PlayerSession>;
  protected state: TState;
  protected onStateUpdate: (state: TState) => void;

  constructor(roomCode: string, onStateUpdate: (state: TState) => void) {
    this.roomCode = roomCode;
    this.players = new Map();
    this.onStateUpdate = onStateUpdate;
    this.state = this.initializeState();
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
