import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { GameId, UserProfile } from '../../../shared/src';
import { SERVER_CONFIG } from '../config/server.config';

export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  favoriteColor: string;
  wins: number;
  totalScore: number;
  matchesPlayed: number;
  level: number;
}

export class PlatformAdapter {
  private static instance: PlatformAdapter;
  private leaderboardPath: string;
  private leaderboardCache: Record<string, LeaderboardEntry> = {};

  private constructor() {
    this.leaderboardPath = path.join(process.cwd(), 'leaderboard.mock.json');
    this.loadLocalLeaderboard();
  }

  public static getInstance(): PlatformAdapter {
    if (!PlatformAdapter.instance) {
      PlatformAdapter.instance = new PlatformAdapter();
    }
    return PlatformAdapter.instance;
  }

  private loadLocalLeaderboard(): void {
    try {
      if (fs.existsSync(this.leaderboardPath)) {
        const raw = fs.readFileSync(this.leaderboardPath, 'utf8');
        this.leaderboardCache = JSON.parse(raw);
      }
    } catch {
      this.leaderboardCache = {};
    }
  }

  private saveLocalLeaderboard(): void {
    try {
      fs.writeFileSync(this.leaderboardPath, JSON.stringify(this.leaderboardCache, null, 2), 'utf8');
    } catch {
      // Non-blocking in read-only containers
    }
  }

  public getLeaderboard(): LeaderboardEntry[] {
    return Object.values(this.leaderboardCache).sort((a, b) => b.totalScore - a.totalScore);
  }

  public async fetchUserProfile(userId: string, authToken?: string, customName?: string): Promise<UserProfile> {
    if (SERVER_CONFIG.USE_MOCK_PLATFORM || !authToken) {
      return this.generateMockProfile(userId, customName);
    }
    try {
      const response = await axios.get(`${SERVER_CONFIG.PLATFORM_API_URL}/users/${userId}/character`, {
        headers: { Authorization: `Bearer ${authToken}` },
        timeout: 3000
      });
      const data = response.data;
      return {
        id: data.id || userId,
        displayName: customName || data.name || `Operative_${userId.slice(-4)}`,
        avatarUrl: data.avatar || undefined,
        favoriteColor: data.color || '#00e5ff',
        level: Math.max(1, Number(data.level) || 1)
      };
    } catch {
      return this.generateMockProfile(userId, customName);
    }
  }

  public async recordMatchResult(
    gameId: GameId,
    winnerId: string | undefined,
    standings: { userId: string; displayName: string; favoriteColor: string; score: number; level: number }[]
  ): Promise<void> {
    for (const p of standings) {
      const existing = this.leaderboardCache[p.userId] || {
        userId: p.userId,
        displayName: p.displayName,
        favoriteColor: p.favoriteColor,
        wins: 0,
        totalScore: 0,
        matchesPlayed: 0,
        level: p.level
      };
      existing.matchesPlayed += 1;
      existing.totalScore += Math.max(0, p.score);
      if (p.userId === winnerId) existing.wins += 1;
      existing.level = Math.min(50, 1 + Math.floor(existing.totalScore / 250));
      this.leaderboardCache[p.userId] = existing;
    }
    this.saveLocalLeaderboard();
  }

  private generateMockProfile(userId: string, customName?: string): UserProfile {
    const cached = this.leaderboardCache[userId];
    if (cached) {
      return { id: userId, displayName: customName || cached.displayName, favoriteColor: cached.favoriteColor, level: cached.level };
    }
    const palette = ['#00e5ff', '#ff0055', '#ffe600', '#00ff66', '#bd00ff', '#ff9100'];
    const hash = userId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return {
      id: userId,
      displayName: customName || `Operative_${userId.slice(-4).toUpperCase()}`,
      favoriteColor: palette[hash % palette.length],
      level: (hash % 10) + 1
    };
  }
}
