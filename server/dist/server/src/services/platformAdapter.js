"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformAdapter = void 0;
const axios_1 = __importDefault(require("axios"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const server_config_1 = require("../config/server.config");
class PlatformAdapter {
    static instance;
    leaderboardPath;
    leaderboardCache = {};
    constructor() {
        this.leaderboardPath = path_1.default.join(process.cwd(), 'leaderboard.mock.json');
        this.loadLocalLeaderboard();
    }
    static getInstance() {
        if (!PlatformAdapter.instance) {
            PlatformAdapter.instance = new PlatformAdapter();
        }
        return PlatformAdapter.instance;
    }
    loadLocalLeaderboard() {
        try {
            if (fs_1.default.existsSync(this.leaderboardPath)) {
                const raw = fs_1.default.readFileSync(this.leaderboardPath, 'utf8');
                this.leaderboardCache = JSON.parse(raw);
            }
        }
        catch {
            this.leaderboardCache = {};
        }
    }
    saveLocalLeaderboard() {
        try {
            fs_1.default.writeFileSync(this.leaderboardPath, JSON.stringify(this.leaderboardCache, null, 2), 'utf8');
        }
        catch {
            // Non-blocking in read-only containers
        }
    }
    getLeaderboard() {
        return Object.values(this.leaderboardCache).sort((a, b) => b.totalScore - a.totalScore);
    }
    async fetchUserProfile(userId, authToken, customName) {
        if (server_config_1.SERVER_CONFIG.USE_MOCK_PLATFORM || !authToken) {
            return this.generateMockProfile(userId, customName);
        }
        try {
            const response = await axios_1.default.get(`${server_config_1.SERVER_CONFIG.PLATFORM_API_URL}/users/${userId}/character`, {
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
        }
        catch {
            return this.generateMockProfile(userId, customName);
        }
    }
    async recordMatchResult(gameId, winnerId, standings) {
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
            if (p.userId === winnerId)
                existing.wins += 1;
            existing.level = Math.min(50, 1 + Math.floor(existing.totalScore / 250));
            this.leaderboardCache[p.userId] = existing;
        }
        this.saveLocalLeaderboard();
    }
    generateMockProfile(userId, customName) {
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
exports.PlatformAdapter = PlatformAdapter;
