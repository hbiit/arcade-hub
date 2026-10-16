"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BaseGameEngine = void 0;
class BaseGameEngine {
    roomCode;
    players;
    state;
    onStateUpdate;
    constructor(roomCode, onStateUpdate) {
        this.roomCode = roomCode;
        this.players = new Map();
        this.onStateUpdate = onStateUpdate;
        this.state = this.initializeState();
    }
    registerPlayer(player) {
        this.players.set(player.socketId, player);
        this.onPlayerJoined(player);
    }
    unregisterPlayer(socketId) {
        this.players.delete(socketId);
        this.onPlayerLeft(socketId);
    }
    reset() {
        this.state = this.initializeState();
        for (const player of this.players.values()) {
            player.score = 0;
            this.onPlayerJoined(player);
        }
    }
    getState() {
        return this.state;
    }
}
exports.BaseGameEngine = BaseGameEngine;
