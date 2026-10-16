export type GameId = 'accg' | 'glowball' | 'blob' | 'mahjong' | 'mahjong-solitaire' | 'mahjong_solitaire' | 'cyber_slither' | 'party_blitz';

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
  category?: 'Arena Action' | 'Tactical Strategy' | 'Party & Trivia' | 'Puzzle & Board';
  minPlayers: number;
  maxPlayers: number;
  durationSeconds: number;
  description: string;
  objective?: string;
  controls?: string;
  rules?: string[];
}
