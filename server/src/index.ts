import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import cors from 'cors';
import { Server } from 'socket.io';
import { SERVER_CONFIG } from './config/server.config';
import { GameRegistry } from './hub/gameRegistry';
import { RoomManager } from './hub/roomManager';
import { PlatformAdapter } from './services/platformAdapter';
import { SOCKET_EVENTS } from '../../shared/src';

const app = express();
app.use(cors({ origin: SERVER_CONFIG.CLIENT_ORIGIN }));

app.get('/health', (_req, res) =>
  res.json({ status: 'ok', service: 'owe-arcade-hub', games: GameRegistry.getAllMetadata().length })
);

app.get('/api/leaderboard', (_req, res) => {
  res.json(PlatformAdapter.getInstance().getLeaderboard());
});

const possibleDistPaths = [
  path.join(process.cwd(), 'client/dist'),
  path.join(__dirname, '../../client/dist'),
  path.join(__dirname, '../../../../client/dist')
];
const clientDistPath = possibleDistPaths.find((p) => fs.existsSync(p));
if (clientDistPath) {
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

  socket.on(SOCKET_EVENTS.HUB_CREATE_ROOM, async ({ gameId, userId, token, customName }) => {
    await roomManager.createRoom(socket, gameId, userId, token, customName);
  });

  socket.on(SOCKET_EVENTS.HUB_JOIN_ROOM, async ({ roomCode, userId, token, customName }) => {
    await roomManager.joinRoom(socket, roomCode, userId, token, customName);
  });

  socket.on(SOCKET_EVENTS.HUB_ADD_BOT, async ({ roomCode }) => {
    await roomManager.addBot(roomCode);
  });

  socket.on(SOCKET_EVENTS.HUB_LEAVE_ROOM, ({ roomCode }) => {
    roomManager.leaveRoom(socket, roomCode);
  });

  socket.on(SOCKET_EVENTS.GAME_START, async ({ roomCode }) => {
    await roomManager.startGame(roomCode);
  });

  socket.on(SOCKET_EVENTS.GAME_PAUSE_TOGGLE, ({ roomCode }) => {
    roomManager.togglePause(roomCode);
  });

  socket.on(SOCKET_EVENTS.GAME_INPUT, (data: any) => {
    if (!data) return;
    const roomCode = data.roomCode;
    const input = data.input || data;
    roomManager.handleInput(socket.id, roomCode, input);
  });

  socket.on('disconnect', () => {
    roomManager.handleDisconnect(socket);
  });
});

server.listen(SERVER_CONFIG.PORT, () => {
  console.log(`[GM Server] OWE Arcade Hub listening on port ${SERVER_CONFIG.PORT}`);
});
