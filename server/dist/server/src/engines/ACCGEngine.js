"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ACCGEngine = void 0;
const BaseGameEngine_1 = require("./BaseGameEngine");
const src_1 = require("../../../shared/src");
const DEFAULT_BOTS = [
    { id: 'bot_hunter', name: '🤖 Byte-Hunter', color: '#f43f5e', strategy: 'hunter' },
    { id: 'bot_sentinel', name: '🛡️ Grid-Sentinel', color: '#a855f7', strategy: 'sentinel' }
];
class ACCGEngine extends BaseGameEngine_1.BaseGameEngine {
    botsSpawned = false;
    botActionCooldown = 2.0;
    initializeState() {
        const cores = [
            { id: 1, row: 2, col: 2 },
            { id: 2, row: 2, col: 5 },
            { id: 3, row: 5, col: 2 },
            { id: 4, row: 5, col: 5 }
        ];
        this.botsSpawned = false;
        this.botActionCooldown = 2.0;
        return {
            gridSize: src_1.ACCG_CONFIG.GRID_SIZE,
            units: {},
            cores,
            events: [],
            turnTimer: 30
        };
    }
    spawnBotsIfNeeded() {
        if (this.botsSpawned)
            return;
        this.botsSpawned = true;
        const botSpawns = [
            { row: 0, col: 7 },
            { row: 7, col: 0 }
        ];
        DEFAULT_BOTS.forEach((bot, idx) => {
            if (!this.state.units[bot.id]) {
                this.state.units[bot.id] = {
                    row: botSpawns[idx].row,
                    col: botSpawns[idx].col,
                    hp: src_1.ACCG_CONFIG.STARTING_HP,
                    maxHp: src_1.ACCG_CONFIG.STARTING_HP,
                    shield: 20,
                    ap: 3,
                    score: 0,
                    color: bot.color,
                    name: bot.name,
                    isBot: true
                };
            }
        });
    }
    onPlayerJoined(player) {
        const spawnPositions = [
            { row: 0, col: 0 },
            { row: 7, col: 7 }
        ];
        const playerIdx = Object.values(this.state.units).filter(u => !u.isBot).length;
        const spawn = spawnPositions[playerIdx % spawnPositions.length] || { row: 3, col: 3 };
        this.state.units[player.socketId] = {
            row: spawn.row,
            col: spawn.col,
            hp: src_1.ACCG_CONFIG.STARTING_HP,
            maxHp: src_1.ACCG_CONFIG.STARTING_HP,
            shield: 25,
            ap: 3,
            score: 0,
            color: player.profile.favoriteColor || '#00e5ff',
            name: player.profile.displayName,
            isBot: false
        };
        this.spawnBotsIfNeeded();
    }
    onPlayerLeft(socketId) {
        delete this.state.units[socketId];
    }
    handleInput(socketId, input) {
        const unit = this.state.units[socketId];
        if (!unit || unit.hp <= 0)
            return;
        const ability = input.abilityId;
        // Movement Action
        if (ability === 'move' && typeof input.targetRow === 'number' && typeof input.targetCol === 'number') {
            if (unit.ap < 1)
                return;
            const r = Math.max(0, Math.min(this.state.gridSize - 1, input.targetRow));
            const c = Math.max(0, Math.min(this.state.gridSize - 1, input.targetCol));
            const dist = Math.abs(unit.row - r) + Math.abs(unit.col - c);
            // Adjacent move (1 tile step)
            if (dist === 1) {
                // Check if tile already occupied
                const occupied = Object.values(this.state.units).some(u => u.hp > 0 && u.row === r && u.col === c);
                if (!occupied) {
                    unit.row = r;
                    unit.col = c;
                    unit.ap -= 1;
                    this.pushEvent({
                        id: Math.random().toString(36),
                        type: 'move',
                        text: `${unit.name} moved to [${r},${c}]`,
                        fromRow: unit.row,
                        fromCol: unit.col,
                        color: unit.color,
                        timestamp: Date.now()
                    });
                    // Check Data Core Capture
                    for (const core of this.state.cores) {
                        if (core.row === r && core.col === c && core.controlledBy !== unit.name) {
                            core.controlledBy = unit.name;
                            unit.score += 15;
                            unit.shield = Math.min(50, unit.shield + 15);
                            const session = this.players.get(socketId);
                            if (session)
                                session.score = unit.score;
                            this.pushEvent({
                                id: Math.random().toString(36),
                                type: 'capture',
                                text: `⚡ ${unit.name} CAPTURED DATA CORE!`,
                                toRow: r,
                                toCol: c,
                                color: '#ffe600',
                                timestamp: Date.now()
                            });
                        }
                    }
                }
            }
        }
        // Laser Strike Action (Straight line up to 3 tiles)
        else if (ability === 'laser' && typeof input.targetRow === 'number' && typeof input.targetCol === 'number') {
            if (unit.ap < 2)
                return;
            const targetR = input.targetRow;
            const targetC = input.targetCol;
            const isSameRow = targetR === unit.row;
            const isSameCol = targetC === unit.col;
            const dist = Math.abs(targetR - unit.row) + Math.abs(targetC - unit.col);
            if ((isSameRow || isSameCol) && dist >= 1 && dist <= 3) {
                unit.ap -= 2;
                // Find targets on target tile
                for (const [targetId, targetUnit] of Object.entries(this.state.units)) {
                    if (targetId !== socketId && targetUnit.hp > 0 && targetUnit.row === targetR && targetUnit.col === targetC) {
                        this.applyDamage(unit, targetUnit, 35);
                    }
                }
                this.pushEvent({
                    id: Math.random().toString(36),
                    type: 'laser',
                    text: `⚡ ${unit.name} FIRED LASER BEAM!`,
                    fromRow: unit.row,
                    fromCol: unit.col,
                    toRow: targetR,
                    toCol: targetC,
                    color: '#00e5ff',
                    timestamp: Date.now()
                });
            }
        }
        // Radial EMP Blast Action (Cost 2 AP, hits all surrounding 8 tiles)
        else if (ability === 'emp') {
            if (unit.ap < 2)
                return;
            unit.ap -= 2;
            for (const [targetId, targetUnit] of Object.entries(this.state.units)) {
                if (targetId !== socketId && targetUnit.hp > 0) {
                    const rowDiff = Math.abs(targetUnit.row - unit.row);
                    const colDiff = Math.abs(targetUnit.col - unit.col);
                    if (rowDiff <= 1 && colDiff <= 1) {
                        this.applyDamage(unit, targetUnit, 25);
                    }
                }
            }
            this.pushEvent({
                id: Math.random().toString(36),
                type: 'emp',
                text: `💣 ${unit.name} DETONATED EMP SHOCKWAVE!`,
                fromRow: unit.row,
                fromCol: unit.col,
                color: '#f59e0b',
                timestamp: Date.now()
            });
        }
        // Shield Recharge Action (Cost 1 AP, restores 25 Shield)
        else if (ability === 'shield') {
            if (unit.ap < 1)
                return;
            unit.ap -= 1;
            unit.shield = Math.min(50, unit.shield + 25);
            this.pushEvent({
                id: Math.random().toString(36),
                type: 'shield',
                text: `🛡️ ${unit.name} RECHARGED SHIELD (+25)!`,
                fromRow: unit.row,
                fromCol: unit.col,
                color: '#10b981',
                timestamp: Date.now()
            });
        }
    }
    applyDamage(attacker, defender, damage) {
        let remainingDamage = damage;
        if (defender.shield > 0) {
            const absorbed = Math.min(defender.shield, remainingDamage);
            defender.shield -= absorbed;
            remainingDamage -= absorbed;
        }
        if (remainingDamage > 0) {
            defender.hp = Math.max(0, defender.hp - remainingDamage);
        }
        attacker.score += damage;
        if (defender.hp <= 0) {
            attacker.score += 50; // elimination bounty
            this.pushEvent({
                id: Math.random().toString(36),
                type: 'emp',
                text: `💥 ${defender.name} ELIMINATED BY ${attacker.name}! (+50)`,
                fromRow: defender.row,
                fromCol: defender.col,
                color: '#ef4444',
                timestamp: Date.now()
            });
        }
    }
    pushEvent(evt) {
        this.state.events.push(evt);
        if (this.state.events.length > 12) {
            this.state.events.shift();
        }
    }
    updateBots() {
        for (const [botId, bot] of Object.entries(this.state.units)) {
            if (!bot.isBot || bot.hp <= 0 || bot.ap < 1)
                continue;
            // Find nearest living opponent
            let nearestOpponent = null;
            let minDistance = Infinity;
            for (const [otherId, other] of Object.entries(this.state.units)) {
                if (otherId !== botId && other.hp > 0) {
                    const d = Math.abs(bot.row - other.row) + Math.abs(bot.col - other.col);
                    if (d < minDistance) {
                        minDistance = d;
                        nearestOpponent = other;
                    }
                }
            }
            if (nearestOpponent) {
                const isSameRow = nearestOpponent.row === bot.row;
                const isSameCol = nearestOpponent.col === bot.col;
                const dist = Math.abs(nearestOpponent.row - bot.row) + Math.abs(nearestOpponent.col - bot.col);
                // Can fire laser?
                if (bot.ap >= 2 && (isSameRow || isSameCol) && dist <= 3) {
                    this.handleInput(botId, {
                        abilityId: 'laser',
                        targetRow: nearestOpponent.row,
                        targetCol: nearestOpponent.col
                    });
                    continue;
                }
                // Can fire EMP blast?
                if (bot.ap >= 2 && dist === 1) {
                    this.handleInput(botId, { abilityId: 'emp' });
                    continue;
                }
                // Move toward opponent or core
                if (bot.ap >= 1) {
                    let stepR = bot.row;
                    let stepC = bot.col;
                    if (bot.row < nearestOpponent.row)
                        stepR++;
                    else if (bot.row > nearestOpponent.row)
                        stepR--;
                    else if (bot.col < nearestOpponent.col)
                        stepC++;
                    else if (bot.col > nearestOpponent.col)
                        stepC--;
                    this.handleInput(botId, {
                        abilityId: 'move',
                        targetRow: stepR,
                        targetCol: stepC
                    });
                }
            }
        }
    }
    tick(deltaSeconds) {
        this.spawnBotsIfNeeded();
        this.state.turnTimer -= deltaSeconds;
        this.botActionCooldown -= deltaSeconds;
        // AI Bot action ticks every 1.5 seconds
        if (this.botActionCooldown <= 0) {
            this.botActionCooldown = 1.5;
            this.updateBots();
        }
        // Turn AP Recharge Loop every 4 seconds
        if (this.state.turnTimer <= 0) {
            this.state.turnTimer = 4.0;
            for (const unit of Object.values(this.state.units)) {
                if (unit.hp > 0) {
                    unit.ap = Math.min(3, unit.ap + 2); // recharge 2 AP
                }
            }
            // Controlled cores yield periodic bonus points
            for (const core of this.state.cores) {
                if (core.controlledBy) {
                    const owner = Object.values(this.state.units).find(u => u.name === core.controlledBy);
                    if (owner && owner.hp > 0) {
                        owner.score += 5;
                    }
                }
            }
        }
        this.onStateUpdate(this.state);
    }
}
exports.ACCGEngine = ACCGEngine;
