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
  targetX?: number;
  targetY?: number;
  shoot?: boolean;
  // Universal and game-specific actions
  action?: 'discard' | 'chi' | 'pong' | 'kong' | 'hu' | 'pass' | 'selectTile' | 'matchTiles' | 'powerup' | 'shuffle' | 'fire' | 'select_piece' | 'make_move' | 'overdrive' | string;
  tileId?: string;
  targetTileId?: string;
  powerupId?: 'lightning' | 'freeze' | 'shuffle';
  meldTileIds?: string[];
  pieceId?: string;
  toRow?: number;
  toCol?: number;
}
