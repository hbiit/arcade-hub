"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const cors_1 = __importDefault(require("cors"));
const socket_io_1 = require("socket.io");
const server_config_1 = require("./config/server.config");
const gameRegistry_1 = require("./hub/gameRegistry");
const roomManager_1 = require("./hub/roomManager");
const platformAdapter_1 = require("./services/platformAdapter");
const src_1 = require("../../shared/src");
const app = (0, express_1.default)();
app.use((0, cors_1.default)({ origin: server_config_1.SERVER_CONFIG.CLIENT_ORIGIN }));
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'owe-arcade-hub', games: gameRegistry_1.GameRegistry.getAllMetadata().length }));
app.get('/api/leaderboard', (_req, res) => {
    res.json(platformAdapter_1.PlatformAdapter.getInstance().getLeaderboard());
});
const possibleDistPaths = [
    path_1.default.join(process.cwd(), 'client/dist'),
    path_1.default.join(__dirname, '../../client/dist'),
    path_1.default.join(__dirname, '../../../../client/dist')
];
const clientDistPath = possibleDistPaths.find((p) => fs_1.default.existsSync(p));
if (clientDistPath) {
    app.use(express_1.default.static(clientDistPath));
    app.get('*', (_req, res) => res.sendFile(path_1.default.join(clientDistPath, 'index.html')));
}
const server = http_1.default.createServer(app);
const io = new socket_io_1.Server(server, {
    cors: { origin: server_config_1.SERVER_CONFIG.CLIENT_ORIGIN, methods: ['GET', 'POST'] }
});
gameRegistry_1.GameRegistry.initialize();
const roomManager = new roomManager_1.RoomManager(io);
io.on('connection', (socket) => {
    socket.on(src_1.SOCKET_EVENTS.HUB_LIST_GAMES, (cb) => {
        if (typeof cb === 'function')
            cb(gameRegistry_1.GameRegistry.getAllMetadata());
    });
    socket.on(src_1.SOCKET_EVENTS.HUB_CREATE_ROOM, async ({ gameId, userId, token, customName }) => {
        await roomManager.createRoom(socket, gameId, userId, token, customName);
    });
    socket.on(src_1.SOCKET_EVENTS.HUB_JOIN_ROOM, async ({ roomCode, userId, token, customName }) => {
        await roomManager.joinRoom(socket, roomCode, userId, token, customName);
    });
    socket.on(src_1.SOCKET_EVENTS.HUB_ADD_BOT, async ({ roomCode }) => {
        await roomManager.addBot(roomCode);
    });
    socket.on(src_1.SOCKET_EVENTS.HUB_LEAVE_ROOM, ({ roomCode }) => {
        roomManager.leaveRoom(socket, roomCode);
    });
    socket.on(src_1.SOCKET_EVENTS.GAME_START, async ({ roomCode }) => {
        await roomManager.startGame(roomCode);
    });
    socket.on(src_1.SOCKET_EVENTS.GAME_PAUSE_TOGGLE, ({ roomCode }) => {
        roomManager.togglePause(roomCode);
    });
    socket.on(src_1.SOCKET_EVENTS.GAME_INPUT, (data) => {
        if (!data)
            return;
        const roomCode = data.roomCode;
        const input = data.input || data;
        roomManager.handleInput(socket.id, roomCode, input);
    });
    socket.on('disconnect', () => {
        roomManager.handleDisconnect(socket);
    });
});
server.listen(server_config_1.SERVER_CONFIG.PORT, () => {
    console.log(`[GM Server] OWE Arcade Hub listening on port ${server_config_1.SERVER_CONFIG.PORT}`);
});
