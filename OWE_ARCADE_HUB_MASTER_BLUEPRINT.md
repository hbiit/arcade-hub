# OWE_ARCADE_HUB_MASTER_BLUEPRINT.md

> **Architecture & Implementation Specification**  
> **Project:** OWE / `start.ng` Multiplayer Arcade Hub  
> **Role:** Expert Game Architect and Developer (GM)  

---

## 1. Executive Summary & Architecture Overview

The **OWE Arcade Hub** is a multi-genre, high-performance multiplayer arcade ecosystem built for the `start.ng` developer network. It combines an authoritative 20Hz Node.js + Socket.io backend, a responsive React + Vite frontend, shared TypeScript data contracts, automated AI rival bot simulation (solo or multiplayer), and persistent match statistics.

### Monorepo Directory Tree

```text
owe-arcade-hub/
├── package.json
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── .gitignore
├── docs/
│   ├── GDD.md
│   ├── ARCHITECTURE.md
│   └── QA_TEST_PLAN.md
├── shared/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── constants/
│       │   ├── balance.ts
│       │   └── events.ts
│       └── types/
│           ├── entity.ts
│           ├── network.ts
│           └── world.ts
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── config/
│       │   └── server.config.ts
│       ├── services/
│       │   └── platformAdapter.ts
│       ├── hub/
│       │   ├── gameRegistry.ts
│       │   └── roomManager.ts
│       ├── engines/
│       │   ├── BaseGameEngine.ts
│       │   ├── BlobBrawlEngine.ts
│       │   ├── GlowballEngine.ts
│       │   ├── ACCGEngine.ts
│       │   ├── MahjongEngine.ts
│       │   └── MahjongSolitaireEngine.ts
│       └── tests/
│           └── engine.test.ts
└── client/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── utils/
        │   └── soundEffects.ts
        └── games/
            ├── blob/
            │   └── BlobBrawlCanvas.tsx
            ├── glowball/
            │   └── GlowballCanvas.tsx
            ├── accg/
            │   └── ACCGCanvas.tsx
            └── mahjong/
                ├── MahjongCanvas.tsx
                └── MahjongSolitaireCanvas.tsx
```

---

## 2. Root Configuration Files

### File: `package.json` (Root)

```json
{
  "name": "owe-arcade-hub-monorepo",
  "version": "2.0.0",
  "private": true,
  "description": "Full-stack extensible multiplayer game architecture for start.ng",
  "scripts": {
    "dev:server": "npm --prefix server run dev",
    "dev:client": "npm --prefix client run dev",
    "postinstall": "npm --prefix shared install && npm --prefix server install && npm --prefix client install",
    "build": "npm --prefix shared run build --if-present && npm --prefix server run build && npm --prefix client run build",
    "start": "node server/dist/server/src/index.js",
    "test": "npm --prefix server test"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

### File: `docker-compose.yml`

```yaml
version: "3.9"
services:
  owe-arcade-hub:
    build: .
    ports:
      - "4000:4000"
    environment:
      - PORT=4000
      - NODE_ENV=production
      - USE_MOCK_PLATFORM=true
      - PLATFORM_API_URL=https://api.start.ng/v1
    restart: unless-stopped
```

### File: `Dockerfile`

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
COPY shared ./shared
COPY server ./server
COPY client ./client
RUN cd shared && npm install && npm run build --if-present
RUN cd server && npm install && npm run build
RUN cd client && npm install && npm run build
EXPOSE 4000
ENV PORT=4000
ENV NODE_ENV=production
ENV USE_MOCK_PLATFORM=true
CMD ["node", "server/dist/server/src/index.js"]
```

### File: `.env.example`

```env
PORT=4000
NODE_ENV=development
USE_MOCK_PLATFORM=true
PLATFORM_API_URL=https://api.start.ng/v1
PLATFORM_API_KEY=your_secret_key
CLIENT_ORIGIN=http://localhost:5173
```

### File: `.gitignore`

```text
node_modules/
dist/
.env
*.log
.DS_Store
*.zip
leaderboard.mock.json
```

---

## 3. Shared Module (`shared/`)

### File: `shared/package.json`

```json
{
  "name": "@owe/shared",
  "version": "2.0.0",
  "main": "src/index.ts"
}
```

### File: `shared/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "strict": true,
    "declaration": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

### File: `shared/src/constants/balance.ts`

```typescript
export const SERVER_TICK_RATE = 20; // 20 Hz authoritative network broadcast
export const PHYSICS_STEP_SEC = 1 / 60;
export const RECONNECT_GRACE_MS = 30000;

export const BLOB_BRAWL_CONFIG = {
  ARENA_WIDTH: 800,
  ARENA_HEIGHT: 600,
  ROUND_DURATION_SEC: 60,
  MAX_COINS: 12,
  BASE_SPEED: 220,
  LEVEL_SPEED_BONUS: 0.02,
  BUMP_COOLDOWN_MS: 1000,
  KNOCKOUT_BUMPS: 3,
  RESPAWN_TIME_SEC: 3.0,
  PLAYER_RADIUS: 18,
  COIN_RADIUS: 10
};

export const GLOWBALL_CONFIG = {
  ARENA_WIDTH: 900,
  ARENA_HEIGHT: 650,
  ROUND_DURATION_SEC: 90,
  MAX_ORBS: 15,
  BASE_SPEED: 240,
  DASH_MULTIPLIER: 2.5,
  DASH_DURATION_SEC: 0.25,
  DASH_COOLDOWN_SEC: 2.5
};

export const ACCG_CONFIG = {
  GRID_SIZE: 8,
  ROUND_DURATION_SEC: 120,
  STARTING_HP: 100,
  ATTACK_DAMAGE: 25
};

export const MAHJONG_CONFIG = {
  ROUND_DURATION_SEC: 90,
  MATCH_SCORE: 20,
  COMBO_BONUS: 10,
  SPECIAL_TILE_SCORE: 50,
  FREEZE_DURATION_SEC: 2.5
};
```

### File: `shared/src/constants/events.ts`

```typescript
export const SOCKET_EVENTS = {
  HUB_LIST_GAMES: 'hub:list_games',
  HUB_CREATE_ROOM: 'hub:create_room',
  HUB_JOIN_ROOM: 'hub:join_room',
  HUB_ADD_BOT: 'hub:add_bot',
  HUB_LEAVE_ROOM: 'hub:leave_room',
  ROOM_UPDATED: 'room:updated',
  GAME_START: 'game:start',
  GAME_PAUSE_TOGGLE: 'game:pause_toggle',
  GAME_INPUT: 'game:input',
  GAME_STATE_TICK: 'game:state_tick',
  GAME_REMATCH: 'game:rematch',
  ERROR_MESSAGE: 'system:error'
} as const;
```

### File: `shared/src/types/entity.ts`

```typescript
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
```

### File: `shared/src/types/network.ts`

```typescript
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
  action?: 'discard' | 'chi' | 'pong' | 'kong' | 'hu' | 'pass' | 'selectTile' | 'matchTiles' | 'powerup' | 'shuffle';
  tileId?: string;
  targetTileId?: string;
  powerupId?: 'lightning' | 'freeze' | 'shuffle';
  meldTileIds?: string[];
}
```

### File: `shared/src/types/world.ts`

```typescript
export interface Vector2D { x: number; y: number; }
export interface CollectibleItem { id: number; x: number; y: number; value: number; kind?: 'normal' | 'surge'; }
```

### File: `shared/src/index.ts`

```typescript
export * from './constants/balance';
export * from './constants/events';
export * from './types/entity';
export * from './types/network';
export * from './types/world';
```

---

## 4. Server Module (`server/`)

### File: `server/package.json`

```json
{
  "name": "@owe/server",
  "version": "1.0.0",
  "main": "src/index.ts",
  "scripts": {
    "dev": "ts-node src/index.ts",
    "build": "tsc",
    "test": "ts-node src/tests/engine.test.ts"
  },
  "dependencies": {
    "axios": "^1.6.8",
    "cors": "^2.8.5",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "socket.io": "^4.7.5"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^4.17.21",
    "@types/node": "^20.12.7",
    "ts-node": "^10.9.2",
    "typescript": "^5.4.5"
  }
}
```

### File: `server/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "outDir": "./dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*", "../shared/src/**/*"]
}
```

### File: `server/src/config/server.config.ts`

```typescript
import dotenv from 'dotenv';
dotenv.config({ path: '../.env' });

export const SERVER_CONFIG = {
  PORT: Number(process.env.PORT) || 4000,
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || '*',
  PLATFORM_API_URL: process.env.PLATFORM_API_URL || 'https://api.start.ng/v1',
  USE_MOCK_PLATFORM: process.env.USE_MOCK_PLATFORM !== 'false'
};
```

### File: `server/src/services/platformAdapter.ts`

Provides user character profile resolution, mock fallback, and automatic match result recording to `leaderboard.mock.json`.

```typescript
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
```

### File: `server/src/engines/BaseGameEngine.ts`

```typescript
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
```

### File: `server/src/hub/roomManager.ts`

```typescript
import { Server, Socket } from 'socket.io';
import { GameId, PlayerInputPayload, PlayerSession, RoomState, SOCKET_EVENTS } from '../../../shared/src';
import { GameRegistry } from './gameRegistry';
import { BaseGameEngine } from '../engines/BaseGameEngine';
import { PlatformAdapter } from '../services/platformAdapter';

interface ActiveRoom {
  state: RoomState;
  engine: BaseGameEngine;
  intervalId?: NodeJS.Timeout;
}

export class RoomManager {
  private rooms = new Map<string, ActiveRoom>();
  private io: Server;

  constructor(io: Server) { this.io = io; }

  public async createRoom(hostSocket: Socket, gameId: GameId, userId?: string, token?: string): Promise<string> {
    const entry = GameRegistry.getGame(gameId);
    if (!entry) throw new Error('Invalid game ID');

    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const profile = await PlatformAdapter.getInstance().fetchUserProfile(userId || hostSocket.id, token);

    const engine = entry.factory(roomCode, (gameData) => {
      const room = this.rooms.get(roomCode);
      if (room) {
        room.state.gameData = gameData;
        this.io.to(roomCode).emit(SOCKET_EVENTS.GAME_STATE_TICK, room.state);
      }
    });

    const hostSession: PlayerSession = {
      socketId: hostSocket.id,
      userId: profile.id,
      profile,
      score: 0,
      isReady: true,
      connected: true
    };

    const roomState: RoomState = {
      roomCode,
      gameId,
      hostSocketId: hostSocket.id,
      status: 'lobby',
      players: { [hostSocket.id]: hostSession },
      gameData: engine.getState(),
      timeRemaining: entry.metadata.durationSeconds
    };

    engine.registerPlayer(hostSession);
    this.rooms.set(roomCode, { state: roomState, engine });
    hostSocket.join(roomCode);
    this.io.to(roomCode).emit(SOCKET_EVENTS.ROOM_UPDATED, roomState);
    return roomCode;
  }

  public async joinRoom(socket: Socket, roomCode: string, userId?: string, token?: string): Promise<void> {
    const room = this.rooms.get(roomCode);
    if (!room) {
      socket.emit(SOCKET_EVENTS.ERROR_MESSAGE, 'Room not found.');
      return;
    }

    const profile = await PlatformAdapter.getInstance().fetchUserProfile(userId || socket.id, token);
    const session: PlayerSession = {
      socketId: socket.id,
      userId: profile.id,
      profile,
      score: 0,
      isReady: true,
      connected: true
    };

    room.state.players[socket.id] = session;
    room.engine.registerPlayer(session);
    socket.join(roomCode);
    this.io.to(roomCode).emit(SOCKET_EVENTS.ROOM_UPDATED, room.state);
  }

  public async addBot(roomCode: string): Promise<void> {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    const botNames = ['Cipher_AI', 'Sparky_Bot', 'Brawler_X', 'Neon_Ghost'];
    const chosenName = botNames[Math.floor(Math.random() * botNames.length)];
    const profile = await PlatformAdapter.getInstance().fetchUserProfile(
      `bot_${Math.random().toString(36).substring(2, 7)}`,
      undefined,
      chosenName
    );
    const botSession: PlayerSession = {
      socketId: profile.id,
      userId: profile.id,
      profile,
      score: 0,
      isReady: true,
      isBot: true,
      connected: true
    };
    room.state.players[profile.id] = botSession;
    room.engine.registerPlayer(botSession);
    this.io.to(roomCode).emit(SOCKET_EVENTS.ROOM_UPDATED, room.state);
  }

  public async startGame(roomCode: string): Promise<void> {
    const room = this.rooms.get(roomCode);
    if (!room || room.state.status === 'in_progress') return;

    if (Object.keys(room.state.players).length === 1) {
      await this.addBot(roomCode);
    }

    if (room.state.status === 'ended') {
      const entry = GameRegistry.getGame(room.state.gameId);
      room.state.timeRemaining = entry ? entry.metadata.durationSeconds : 60;
      room.engine.reset();
      room.state.gameData = room.engine.getState();
      for (const p of Object.values(room.state.players)) {
        p.score = 0;
      }
    }

    room.state.status = 'in_progress';
    this.io.to(roomCode).emit(SOCKET_EVENTS.ROOM_UPDATED, room.state);

    let lastTick = Date.now();
    if (room.intervalId) clearInterval(room.intervalId);
    room.intervalId = setInterval(() => {
      if (room.state.status !== 'in_progress') {
        lastTick = Date.now();
        return;
      }
      const now = Date.now();
      const dt = (now - lastTick) / 1000;
      lastTick = now;

      room.state.timeRemaining = Math.max(0, room.state.timeRemaining - dt);
      room.engine.tick(dt);

      if (room.state.timeRemaining <= 0) {
        this.endGame(roomCode);
      }
    }, 50); // 20 Hz
  }

  public handleInput(socketId: string, roomCode: string, payload: PlayerInputPayload): void {
    const room = this.rooms.get(roomCode);
    if (room && room.state.status === 'in_progress') {
      room.engine.handleInput(socketId, payload);
    }
  }

  private endGame(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    if (room.intervalId) clearInterval(room.intervalId);
    room.state.status = 'ended';

    const sorted = Object.values(room.state.players).sort((a, b) => b.score - a.score);
    if (sorted.length > 0) {
      room.state.winnerSocketId = sorted[0].socketId;
    }

    PlatformAdapter.getInstance().recordMatchResult(
      room.state.gameId,
      room.state.winnerSocketId,
      sorted.map((p) => ({
        userId: p.userId,
        displayName: p.profile.displayName,
        favoriteColor: p.profile.favoriteColor,
        score: p.score,
        level: p.profile.level
      }))
    );

    this.io.to(roomCode).emit(SOCKET_EVENTS.ROOM_UPDATED, room.state);
  }
}
```

### File: `server/src/index.ts`

```typescript
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import { Server } from 'socket.io';
import { SERVER_CONFIG } from './config/server.config';
import { GameRegistry } from './hub/gameRegistry';
import { RoomManager } from './hub/roomManager';
import { SOCKET_EVENTS } from '../../shared/src';

const app = express();
app.use(cors({ origin: SERVER_CONFIG.CLIENT_ORIGIN }));

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', service: 'owe-arcade-hub', games: GameRegistry.getAllMetadata().length })
);

const clientDistPath = path.join(__dirname, '../../client/dist');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDistPath, 'index.html')));
}

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: SERVER_CONFIG.CLIENT_ORIGIN, methods: ['GET', 'POST'] }
});

GameRegistry.initialize();
const roomManager = new RoomManager(io);

io.on('connection', (socket) => {
  socket.on(SOCKET_EVENTS.HUB_LIST_GAMES, (cb) => {
    if (typeof cb === 'function') cb(GameRegistry.getAllMetadata());
  });

  socket.on(SOCKET_EVENTS.HUB_CREATE_ROOM, async ({ gameId, userId, token }) => {
    await roomManager.createRoom(socket, gameId, userId, token);
  });

  socket.on(SOCKET_EVENTS.HUB_JOIN_ROOM, async ({ roomCode, userId, token }) => {
    await roomManager.joinRoom(socket, roomCode, userId, token);
  });

  socket.on(SOCKET_EVENTS.HUB_ADD_BOT, async ({ roomCode }) => {
    await roomManager.addBot(roomCode);
  });

  socket.on(SOCKET_EVENTS.GAME_START, async ({ roomCode }) => {
    await roomManager.startGame(roomCode);
  });

  socket.on(SOCKET_EVENTS.GAME_INPUT, (data: any) => {
    if (!data) return;
    const roomCode = data.roomCode;
    const input = data.input || data;
    roomManager.handleInput(socket.id, roomCode, input);
  });
});

server.listen(SERVER_CONFIG.PORT, () => {
  console.log(`[GM Server] OWE Arcade Hub listening on port ${SERVER_CONFIG.PORT}`);
});
```

### File: `server/src/tests/engine.test.ts`

```typescript
import { BlobBrawlEngine } from '../engines/BlobBrawlEngine';
import { GlowballEngine } from '../engines/GlowballEngine';
import { ACCGEngine } from '../engines/ACCGEngine';
import { MahjongSolitaireEngine } from '../engines/MahjongSolitaireEngine';

console.log('[Test] Initializing arcade-hub game engine unit tests...');

// 1. Test BlobBrawlEngine
const blobEngine = new BlobBrawlEngine('TESTROOM_BLOB', (_state) => {});
blobEngine.registerPlayer({
  socketId: 'player_1',
  userId: 'usr_1',
  profile: { id: 'usr_1', displayName: 'Tester', favoriteColor: '#00e5ff', level: 1 },
  score: 0,
  isReady: true,
  connected: true
});
blobEngine.tick(0.05);
const blobState = blobEngine.getState();
if (blobState && blobState.players['player_1']) {
  console.log('[Test] SUCCESS: BlobBrawlEngine ticked successfully with player state!');
} else {
  console.error('[Test] FAILED: BlobBrawlEngine player state missing.');
  process.exit(1);
}

// 2. Test GlowballEngine
const glowEngine = new GlowballEngine('TESTROOM_GLOW', (_state) => {});
glowEngine.registerPlayer({
  socketId: 'player_2',
  userId: 'usr_2',
  profile: { id: 'usr_2', displayName: 'GlowTester', favoriteColor: '#ffe600', level: 2 },
  score: 0,
  isReady: true,
  connected: true
});
glowEngine.tick(0.05);
const glowState = glowEngine.getState();
if (glowState && glowState.players['player_2']) {
  console.log('[Test] SUCCESS: GlowballEngine ticked successfully with player state!');
} else {
  console.error('[Test] FAILED: GlowballEngine player state missing.');
  process.exit(1);
}

// 3. Test ACCGEngine
const accgEngine = new ACCGEngine('TESTROOM_ACCG', (_state) => {});
accgEngine.registerPlayer({
  socketId: 'player_3',
  userId: 'usr_3',
  profile: { id: 'usr_3', displayName: 'GridCommander', favoriteColor: '#00ff66', level: 3 },
  score: 0,
  isReady: true,
  connected: true
});
accgEngine.tick(0.05);
const accgState = accgEngine.getState();
if (accgState && accgState.units['player_3']) {
  console.log('[Test] SUCCESS: ACCGEngine ticked successfully with grid unit state!');
} else {
  console.error('[Test] FAILED: ACCGEngine unit state missing.');
  process.exit(1);
}

// 4. Test MahjongSolitaireEngine
const mahjongSolitaire = new MahjongSolitaireEngine('TESTROOM_SOLITAIRE', (_state) => {});
mahjongSolitaire.registerPlayer({
  socketId: 'player_4',
  userId: 'usr_4',
  profile: { id: 'usr_4', displayName: 'TileMaster', favoriteColor: '#ff0055', level: 4 },
  score: 0,
  isReady: true,
  connected: true
});
mahjongSolitaire.tick(0.05);
const mahjongState = mahjongSolitaire.getState();
if (mahjongState && mahjongState.players['player_4']) {
  console.log('[Test] SUCCESS: MahjongSolitaireEngine ticked successfully with player state!');
} else {
  console.error('[Test] FAILED: MahjongSolitaireEngine state missing.');
  process.exit(1);
}

console.log('[Test] ALL ENGINE TESTS PASSED CLEANLY! ✨');
```

---

## 5. Client Module (`client/`)

### File: `client/package.json`

```json
{
  "name": "@owe/client",
  "version": "1.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "socket.io-client": "^4.7.5"
  },
  "devDependencies": {
    "@types/react": "^18.3.1",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.2.1",
    "typescript": "^5.4.5",
    "vite": "^5.2.10"
  }
}
```

### File: `client/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

### File: `client/vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, host: true }
});
```

---

## 6. Execution & Verification Guide

### Quick Start
```bash
# 1. Install all dependencies across monorepo
npm run postinstall

# 2. Run engine test suite
npm test

# 3. Build entire monorepo (shared, server dist, client dist)
npm run build

# 4. Start production server (serves API, WebSockets, and client bundle)
npm start
```

### Docker Deployment
```bash
docker-compose up --build
```
The application will be live at `http://localhost:4000`.
