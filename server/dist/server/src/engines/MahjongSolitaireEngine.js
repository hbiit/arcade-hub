"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MahjongSolitaireEngine = void 0;
const BaseGameEngine_1 = require("./BaseGameEngine");
const SUIT_DATA = {
    wan: {
        names: ['', '一萬', '二萬', '三萬', '四萬', '五萬', '六萬', '七萬', '八萬', '九萬'],
        sub: 'Wan',
        color: '#ef4444'
    },
    tiao: {
        names: ['', '1條', '2條', '3條', '4條', '5條', '6條', '7條', '8條', '9條'],
        sub: 'Bamboo',
        color: '#10b981'
    },
    tong: {
        names: ['', '1筒', '2筒', '3筒', '4筒', '5筒', '6筒', '7筒', '8筒', '9筒'],
        sub: 'Dots',
        color: '#3b82f6'
    },
    wind: {
        names: ['', '東', '南', '西', '北'],
        sub: 'Wind',
        color: '#8b5cf6'
    },
    dragon: {
        names: ['', '🀄 中', '🀅 發', '🀆 白'],
        sub: 'Dragon',
        color: '#f59e0b'
    },
    flower: {
        names: ['', '🌸 梅', '🌺 蘭', '🎋 竹', '🌼 菊'],
        sub: 'Flower',
        color: '#ec4899'
    },
    season: {
        names: ['', '🌱 春', '☀️ 夏', '🍂 秋', '❄️ 冬'],
        sub: 'Season',
        color: '#06b6d4'
    }
};
class MahjongSolitaireEngine extends BaseGameEngine_1.BaseGameEngine {
    botTimer = 0;
    initializeState() {
        const layoutSlots = this.generateShanghaiLayout();
        const deck = this.generateSolitaireDeck(layoutSlots.length);
        const tiles = layoutSlots.map((slot, index) => {
            const card = deck[index];
            return {
                id: `stile_${index}`,
                suit: card.suit,
                value: card.value,
                symbol: card.symbol,
                subText: card.subText,
                color: card.color,
                layer: slot.layer,
                row: slot.row,
                col: slot.col,
                isMatched: false
            };
        });
        const state = {
            tiles,
            players: {},
            remainingTiles: tiles.length,
            totalTiles: tiles.length,
            timeRemaining: 120, // 2 minute speed rush
            freePairsCount: 0,
            status: 'playing',
            events: [
                {
                    id: `ev_${Date.now()}`,
                    text: '🀄 Mahjong Solitaire / Shanghai Rush started! Clear tiles by matching free unblocked pairs!',
                    color: '#00e5ff',
                    timestamp: Date.now()
                }
            ]
        };
        // Calculate initial free tiles and free pairs count
        this.updateTileFreeStatus(state.tiles);
        state.freePairsCount = this.countFreePairs(state.tiles);
        return state;
    }
    /**
     * Generates a 3D pyramid / turtle layout slots.
     * Standard integer coordinate system: each tile has width 2, height 2.
     */
    generateShanghaiLayout() {
        const slots = [];
        // Layer 0: Ground Base Turtle (approx 86 tiles)
        // Rows from 1 to 10
        const rowColsL0 = {
            1: [8, 10, 12, 14],
            2: [6, 8, 10, 12, 14, 16],
            3: [4, 6, 8, 10, 12, 14, 16, 18],
            4: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
            5: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22],
            6: [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22],
            7: [2, 4, 6, 8, 10, 12, 14, 16, 18, 20],
            8: [4, 6, 8, 10, 12, 14, 16, 18],
            9: [6, 8, 10, 12, 14, 16],
            10: [8, 10, 12, 14]
        };
        for (const [rStr, cols] of Object.entries(rowColsL0)) {
            const r = parseInt(rStr, 10);
            for (const c of cols) {
                slots.push({ layer: 0, row: r, col: c });
            }
        }
        // Side Wings at Layer 0 (Extra turtle fins)
        slots.push({ layer: 0, row: 5, col: 24 });
        slots.push({ layer: 0, row: 6, col: 24 });
        // Layer 1: Mid Pyramid (36 tiles: 6x6 centered)
        for (let r = 3; r <= 8; r++) {
            for (let c = 6; c <= 16; c += 2) {
                slots.push({ layer: 1, row: r, col: c });
            }
        }
        // Layer 2: Upper Pyramid (16 tiles: 4x4 centered)
        for (let r = 4; r <= 7; r++) {
            for (let c = 8; c <= 14; c += 2) {
                slots.push({ layer: 2, row: r, col: c });
            }
        }
        // Layer 3: Crown Tier (4 tiles: 2x2 centered)
        for (let r = 5; r <= 6; r++) {
            for (let c = 10; c <= 12; c += 2) {
                slots.push({ layer: 3, row: r, col: c });
            }
        }
        // Layer 4: Apex Peak Tile (2 tiles stacked at pinnacle)
        slots.push({ layer: 4, row: 5, col: 11 });
        slots.push({ layer: 4, row: 6, col: 11 });
        // If odd number, pop one so total is even (guaranteeing exact pairs)
        if (slots.length % 2 !== 0) {
            slots.pop();
        }
        return slots;
    }
    /**
     * Generates a balanced deck of identical tile pairs matching the total slot count.
     */
    generateSolitaireDeck(totalSlots) {
        const pairsNeeded = Math.floor(totalSlots / 2);
        const candidates = [];
        // Wan 1-9 (4 of each)
        for (let v = 1; v <= 9; v++) {
            for (let k = 0; k < 2; k++) {
                candidates.push({
                    suit: 'wan',
                    value: v,
                    symbol: SUIT_DATA.wan.names[v],
                    subText: SUIT_DATA.wan.sub,
                    color: SUIT_DATA.wan.color
                });
            }
        }
        // Tiao 1-9 (4 of each)
        for (let v = 1; v <= 9; v++) {
            for (let k = 0; k < 2; k++) {
                candidates.push({
                    suit: 'tiao',
                    value: v,
                    symbol: SUIT_DATA.tiao.names[v],
                    subText: SUIT_DATA.tiao.sub,
                    color: SUIT_DATA.tiao.color
                });
            }
        }
        // Tong 1-9 (4 of each)
        for (let v = 1; v <= 9; v++) {
            for (let k = 0; k < 2; k++) {
                candidates.push({
                    suit: 'tong',
                    value: v,
                    symbol: SUIT_DATA.tong.names[v],
                    subText: SUIT_DATA.tong.sub,
                    color: SUIT_DATA.tong.color
                });
            }
        }
        // Winds (East, South, West, North - 4 of each)
        for (let v = 1; v <= 4; v++) {
            for (let k = 0; k < 2; k++) {
                candidates.push({
                    suit: 'wind',
                    value: v,
                    symbol: SUIT_DATA.wind.names[v],
                    subText: SUIT_DATA.wind.sub,
                    color: SUIT_DATA.wind.color
                });
            }
        }
        // Dragons (Red, Green, White - 4 of each)
        for (let v = 1; v <= 3; v++) {
            for (let k = 0; k < 2; k++) {
                candidates.push({
                    suit: 'dragon',
                    value: v,
                    symbol: SUIT_DATA.dragon.names[v],
                    subText: SUIT_DATA.dragon.sub,
                    color: SUIT_DATA.dragon.color
                });
            }
        }
        // Flowers (4)
        for (let v = 1; v <= 4; v++) {
            candidates.push({
                suit: 'flower',
                value: v,
                symbol: SUIT_DATA.flower.names[v],
                subText: SUIT_DATA.flower.sub,
                color: SUIT_DATA.flower.color
            });
        }
        // Seasons (4)
        for (let v = 1; v <= 4; v++) {
            candidates.push({
                suit: 'season',
                value: v,
                symbol: SUIT_DATA.season.names[v],
                subText: SUIT_DATA.season.sub,
                color: SUIT_DATA.season.color
            });
        }
        // Select pairsNeeded items and duplicate each to guarantee matching pairs
        // Shuffle candidate pool first
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
        }
        const selectedPairs = candidates.slice(0, pairsNeeded);
        const finalDeck = [];
        // Each selected candidate produces a matching pair (2 tiles)
        for (const item of selectedPairs) {
            finalDeck.push({ ...item });
            finalDeck.push({ ...item });
        }
        // Shuffle the final deck thoroughly
        for (let i = finalDeck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [finalDeck[i], finalDeck[j]] = [finalDeck[j], finalDeck[i]];
        }
        return finalDeck;
    }
    /**
     * Authentic Shanghai Solitaire Free Tile Rule:
     * A tile is FREE if:
     * 1. No tile on a higher layer overlaps it (layer + 1).
     * 2. AND either its left side is free OR its right side is free.
     */
    isTileFree(target, tiles) {
        if (target.isMatched)
            return false;
        // Check 1: Top obstruction (higher layer)
        for (const other of tiles) {
            if (other.isMatched)
                continue;
            if (other.layer > target.layer) {
                // Tile footprint overlap
                if (Math.abs(other.row - target.row) < 2 && Math.abs(other.col - target.col) < 2) {
                    return false; // Covered from above
                }
            }
        }
        // Check 2: Lateral obstructions (same layer)
        let blockedLeft = false;
        let blockedRight = false;
        for (const other of tiles) {
            if (other.isMatched || other.id === target.id)
                continue;
            if (other.layer === target.layer) {
                // Must overlap vertically to block horizontally
                if (Math.abs(other.row - target.row) < 2) {
                    if (other.col === target.col - 2) {
                        blockedLeft = true;
                    }
                    if (other.col === target.col + 2) {
                        blockedRight = true;
                    }
                }
            }
        }
        // Free if at least one lateral side is unblocked
        return !blockedLeft || !blockedRight;
    }
    /**
     * Updates `isFree` boolean on all tiles in place.
     */
    updateTileFreeStatus(tiles) {
        for (const tile of tiles) {
            tile.isFree = this.isTileFree(tile, tiles);
        }
    }
    /**
     * Checks if two tiles are matchable.
     */
    areTilesMatchable(t1, t2) {
        if (t1.id === t2.id)
            return false;
        if (t1.isMatched || t2.isMatched)
            return false;
        // Flowers match any Flowers, Seasons match any Seasons
        if (t1.suit === 'flower' && t2.suit === 'flower')
            return true;
        if (t1.suit === 'season' && t2.suit === 'season')
            return true;
        // Otherwise exact suit and value match
        return t1.suit === t2.suit && t1.value === t2.value;
    }
    /**
     * Counts currently available free matching pairs on the board.
     */
    countFreePairs(tiles) {
        const freeTiles = tiles.filter(t => !t.isMatched && t.isFree);
        let count = 0;
        const visited = new Set();
        for (let i = 0; i < freeTiles.length; i++) {
            if (visited.has(freeTiles[i].id))
                continue;
            for (let j = i + 1; j < freeTiles.length; j++) {
                if (visited.has(freeTiles[j].id))
                    continue;
                if (this.areTilesMatchable(freeTiles[i], freeTiles[j])) {
                    count++;
                    visited.add(freeTiles[i].id);
                    visited.add(freeTiles[j].id);
                    break;
                }
            }
        }
        return count;
    }
    handleInput(socketId, input) {
        if (!input || this.state.status !== 'playing')
            return;
        const player = this.state.players[socketId];
        if (!player)
            return;
        if (player.frozenTimer > 0)
            return; // Player is frozen by rival Frost Wind
        // 1. SELECT TILE ACTION
        if (input.action === 'selectTile' && input.tileId) {
            const tile = this.state.tiles.find(t => t.id === input.tileId);
            if (!tile || tile.isMatched)
                return;
            // Verify the tile is free according to authentic Shanghai rules
            if (!this.isTileFree(tile, this.state.tiles)) {
                this.addEvent(`⚠️ Tile [${tile.symbol}] is blocked by neighboring tiles!`, '#ef4444');
                return;
            }
            // If no tile currently selected, select this one
            if (!player.selectedTileId) {
                player.selectedTileId = tile.id;
                return;
            }
            // If clicking same tile, deselect
            if (player.selectedTileId === tile.id) {
                player.selectedTileId = undefined;
                return;
            }
            // Player clicked a second tile: Check if it matches!
            const firstTile = this.state.tiles.find(t => t.id === player.selectedTileId);
            if (!firstTile || firstTile.isMatched) {
                player.selectedTileId = tile.id;
                return;
            }
            if (this.areTilesMatchable(firstTile, tile)) {
                // MATCH SUCCESS!
                this.executeMatch(player, firstTile, tile);
                player.selectedTileId = undefined;
            }
            else {
                // Not a match: switch selection to the new free tile
                player.selectedTileId = tile.id;
            }
        }
        // 2. POWERUP ACTION
        else if (input.action === 'powerup' && input.powerupId) {
            this.usePowerup(player, input.powerupId);
        }
        // 3. SHUFFLE ACTION
        else if (input.action === 'shuffle') {
            this.usePowerup(player, 'shuffle');
        }
    }
    /**
     * Executes match elimination of two free tiles.
     */
    executeMatch(player, t1, t2) {
        t1.isMatched = true;
        t1.matchedBy = player.id;
        t2.isMatched = true;
        t2.matchedBy = player.id;
        // Combo streak calculation
        player.combo++;
        player.comboTimer = 4.0; // 4 seconds to maintain combo
        const comboBonus = (player.combo - 1) * 10;
        const pointsAwarded = 20 + comboBonus;
        player.score += pointsAwarded;
        this.state.remainingTiles = this.state.tiles.filter(t => !t.isMatched).length;
        this.state.lastMatch = {
            tile1: { ...t1 },
            tile2: { ...t2 },
            playerName: player.name,
            points: pointsAwarded
        };
        // Update free status and count
        this.updateTileFreeStatus(this.state.tiles);
        this.state.freePairsCount = this.countFreePairs(this.state.tiles);
        const comboText = player.combo > 1 ? ` (${player.combo}x COMBO!)` : '';
        this.addEvent(`✨ ${player.name} matched [${t1.symbol}] + [${t2.symbol}] for +${pointsAwarded} pts!${comboText}`, player.color);
        // If no remaining tiles -> Win!
        if (this.state.remainingTiles === 0) {
            this.state.status = 'cleared';
            this.addEvent(`🎉 ALL TILES CLEARED! ${player.name} achieved victory!`, '#10b981');
        }
    }
    /**
     * Uses an arcade powerup.
     */
    usePowerup(player, type) {
        if (player.powerups[type] <= 0)
            return;
        player.powerups[type]--;
        if (type === 'lightning') {
            // Find the first available free pair and match it automatically
            const freeTiles = this.state.tiles.filter(t => !t.isMatched && t.isFree);
            let matched = false;
            for (let i = 0; i < freeTiles.length; i++) {
                for (let j = i + 1; j < freeTiles.length; j++) {
                    if (this.areTilesMatchable(freeTiles[i], freeTiles[j])) {
                        this.executeMatch(player, freeTiles[i], freeTiles[j]);
                        this.state.activeEffect = {
                            type: 'lightning',
                            targetPlayer: player.name,
                            timestamp: Date.now()
                        };
                        this.addEvent(`⚡ LIGHTNING JADE: ${player.name} invoked celestial lightning to dissolve a pair!`, '#00e5ff');
                        matched = true;
                        break;
                    }
                }
                if (matched)
                    break;
            }
            if (!matched) {
                // If no free pairs exist, auto-shuffle first
                this.reshuffleUnmatched();
                this.addEvent(`⚡ Lightning auto-shuffled the remaining tiles to uncover new matches!`, '#f59e0b');
            }
        }
        else if (type === 'freeze') {
            // Freeze opponents or freeze clock
            let targetFound = false;
            for (const other of Object.values(this.state.players)) {
                if (other.id !== player.id) {
                    other.frozenTimer = 3.0;
                    targetFound = true;
                }
            }
            if (!targetFound) {
                // Solo play: grant +15 extra seconds!
                this.state.timeRemaining = Math.min(180, this.state.timeRemaining + 15);
                this.addEvent(`❄️ FROST WIND: Time slowed down! +15 seconds added to clock!`, '#38bdf8');
            }
            else {
                this.addEvent(`❄️ FROST WIND: ${player.name} froze rivals with glacial frost for 3s!`, '#38bdf8');
            }
            this.state.activeEffect = {
                type: 'freeze',
                targetPlayer: player.name,
                timestamp: Date.now()
            };
        }
        else if (type === 'shuffle') {
            this.reshuffleUnmatched();
            this.state.activeEffect = {
                type: 'shuffle',
                targetPlayer: player.name,
                timestamp: Date.now()
            };
            this.addEvent(`🔀 ASTRAL SHUFFLE: ${player.name} reshuffled the mystic pyramid!`, '#a855f7');
        }
    }
    /**
     * Reshuffles values/suits among all remaining unmatched tiles,
     * guaranteeing that free matching pairs exist.
     */
    reshuffleUnmatched() {
        const activeTiles = this.state.tiles.filter(t => !t.isMatched);
        if (activeTiles.length < 2)
            return;
        // Collect all card faces
        const faces = activeTiles.map(t => ({
            suit: t.suit,
            value: t.value,
            symbol: t.symbol,
            subText: t.subText,
            color: t.color
        }));
        // Shuffle multiple times until free pairs count > 0 or max iterations
        let attempts = 0;
        while (attempts < 10) {
            for (let i = faces.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [faces[i], faces[j]] = [faces[j], faces[i]];
            }
            // Reassign to active tiles
            activeTiles.forEach((tile, idx) => {
                tile.suit = faces[idx].suit;
                tile.value = faces[idx].value;
                tile.symbol = faces[idx].symbol;
                tile.subText = faces[idx].subText;
                tile.color = faces[idx].color;
            });
            this.updateTileFreeStatus(this.state.tiles);
            const freePairs = this.countFreePairs(this.state.tiles);
            if (freePairs >= 2 || activeTiles.length <= 4) {
                this.state.freePairsCount = freePairs;
                break;
            }
            attempts++;
        }
        this.state.freePairsCount = this.countFreePairs(this.state.tiles);
    }
    tick(deltaSeconds) {
        if (this.state.status !== 'playing')
            return;
        // Decrement round timer
        this.state.timeRemaining -= deltaSeconds;
        if (this.state.timeRemaining <= 0) {
            this.state.timeRemaining = 0;
            this.state.status = 'time_up';
            this.addEvent('⌛ TIME IS UP! Round finished!', '#ef4444');
            return;
        }
        // Update player combo timers and frozen timers
        for (const player of Object.values(this.state.players)) {
            if (player.comboTimer > 0) {
                player.comboTimer -= deltaSeconds;
                if (player.comboTimer <= 0) {
                    player.combo = 0;
                }
            }
            if (player.frozenTimer > 0) {
                player.frozenTimer -= deltaSeconds;
                if (player.frozenTimer < 0)
                    player.frozenTimer = 0;
            }
        }
        // Periodic AI rival bot simulation (if bot exists)
        this.botTimer += deltaSeconds;
        if (this.botTimer >= 5.0) {
            this.botTimer = 0;
            this.simulateBotAction();
        }
        this.onStateUpdate(this.state);
    }
    simulateBotAction() {
        const bots = Object.values(this.state.players).filter(p => p.id.startsWith('bot_'));
        if (bots.length === 0)
            return;
        const bot = bots[Math.floor(Math.random() * bots.length)];
        if (bot.frozenTimer > 0)
            return;
        // 60% chance bot finds a match
        if (Math.random() < 0.6) {
            const freeTiles = this.state.tiles.filter(t => !t.isMatched && t.isFree);
            for (let i = 0; i < freeTiles.length; i++) {
                for (let j = i + 1; j < freeTiles.length; j++) {
                    if (this.areTilesMatchable(freeTiles[i], freeTiles[j])) {
                        this.executeMatch(bot, freeTiles[i], freeTiles[j]);
                        return;
                    }
                }
            }
        }
    }
    onPlayerJoined(player) {
        if (!this.state.players[player.socketId]) {
            this.state.players[player.socketId] = {
                id: player.socketId,
                name: player.profile.displayName,
                color: player.profile.favoriteColor || '#00e5ff',
                score: 0,
                combo: 0,
                comboTimer: 0,
                powerups: {
                    lightning: 2,
                    freeze: 1,
                    shuffle: 2
                },
                frozenTimer: 0
            };
            // Add a rival AI bot if solo player for speed rush excitement
            const humanCount = Object.keys(this.state.players).length;
            if (humanCount === 1) {
                const botId = 'bot_shanghai';
                this.state.players[botId] = {
                    id: botId,
                    name: '🤖 Shanghai Master',
                    color: '#f59e0b',
                    score: 0,
                    combo: 0,
                    comboTimer: 0,
                    powerups: { lightning: 1, freeze: 1, shuffle: 1 },
                    frozenTimer: 0
                };
            }
        }
    }
    onPlayerLeft(socketId) {
        delete this.state.players[socketId];
    }
    addEvent(text, color) {
        this.state.events.push({
            id: `ev_${Date.now()}_${Math.random()}`,
            text,
            color,
            timestamp: Date.now()
        });
        if (this.state.events.length > 8) {
            this.state.events.shift();
        }
    }
}
exports.MahjongSolitaireEngine = MahjongSolitaireEngine;
