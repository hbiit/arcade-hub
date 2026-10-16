import { GameId, PlayerSession } from './entity';

export interface RoomState<TGameState = unknown> {
  roomCode: string;
  gameId: GameId;
  hostSocketId: string;
  status: 'lobby' | 'in_progress' | 'paused' | 'ended';
  players: Record<string, PlayerSession>;
  gameData: TGameState;
  timeRemaining: number;
  winnerSocketId?: string;
}

export interface PlayerInputPayload {
  dx?: number;
  dy?: number;
  dash?: boolean;
  targetRow?: number;
  targetCol?: number;
  abilityId?: string;
  // Mahjong specific actions
  action?: 'discard' | 'chi' | 'pong' | 'kong' | 'hu' | 'pass' | 'selectTile' | 'matchTiles' | 'powerup' | 'shuffle';
  tileId?: string;
  targetTileId?: string;
  powerupId?: 'lightning' | 'freeze' | 'shuffle';
  meldTileIds?: string[];
}
