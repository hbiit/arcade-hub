export type GameId = 'blob' | 'glowball' | 'accg' | 'mahjong' | 'mahjong-solitaire' | 'brick_breaker' | 'checkers' | 'cyber_slither' | 'galaxy_strike';

export interface UserProfile {
  id: string;
  displayName: string;
  avatarUrl?: string;
  favoriteColor: string;
  level: number;
}

export interface PlayerSession {
  socketId: string;
  userId: string;
  profile: UserProfile;
  score: number;
  isReady: boolean;
  isBot?: boolean;
  connected: boolean;
  disconnectedAt?: number;
}

export interface GameMetadata {
  id: GameId;
  title: string;
  category?: 'Arena Action' | 'Tactical Strategy' | 'Party & Trivia' | 'Puzzle & Board' | 'Puzzle & Arcade';
  minPlayers: number;
  maxPlayers: number;
  durationSeconds: number;
  description: string;
  objective?: string;
  controls?: string;
  rules?: string[];
}
