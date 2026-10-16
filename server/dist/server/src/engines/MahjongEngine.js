"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MahjongEngine = void 0;
const BaseGameEngine_1 = require("./BaseGameEngine");
const SUIT_SYMBOLS = {
    wan: ['', '一萬', '二萬', '三萬', '四萬', '五萬', '六萬', '七萬', '八萬', '九萬'],
    tiao: ['', '1條', '2條', '3條', '4條', '5條', '6條', '7條', '8條', '9條'],
    tong: ['', '1筒', '2筒', '3筒', '4筒', '5筒', '6筒', '7筒', '8筒', '9筒'],
    wind: ['', '東', '南', '西', '北'],
    dragon: ['', '🀄 中', '🀅 發', '🀆 白']
};
const SUIT_COLORS = {
    wan: '#ef4444',
    tiao: '#10b981',
    tong: '#00e5ff',
    wind: '#f59e0b',
    dragon: '#dc2626'
};
const BOT_NAMES = ['🤖 Master Chen', '🌸 Jade Lotus', '⚡ Dragon Claw'];
const BOT_COLORS = ['#10b981', '#a855f7', '#f59e0b'];
class MahjongEngine extends BaseGameEngine_1.BaseGameEngine {
    wall = [];
    botActionCooldown = 1.6;
    pendingCalls = new Map();
    waitingCallTimer = 0;
    initializeState() {
        this.wall = this.buildAndShuffleWall();
        this.botActionCooldown = 1.6;
        this.pendingCalls = new Map();
        this.waitingCallTimer = 0;
        // Create 4 seats
        const seats = [
            {
                id: 'player_0',
                name: 'Operative',
                color: '#00e5ff',
                seatIndex: 0,
                wind: 'East',
                hand: [],
                melds: [],
                discards: [],
                score: 1000,
                isBot: false
            },
            {
                id: 'bot_1',
                name: BOT_NAMES[0],
                color: BOT_COLORS[0],
                seatIndex: 1,
                wind: 'South',
                hand: [],
                melds: [],
                discards: [],
                score: 1000,
                isBot: true
            },
            {
                id: 'bot_2',
                name: BOT_NAMES[1],
                color: BOT_COLORS[1],
                seatIndex: 2,
                wind: 'West',
                hand: [],
                melds: [],
                discards: [],
                score: 1000,
                isBot: true
            },
            {
                id: 'bot_3',
                name: BOT_NAMES[2],
                color: BOT_COLORS[2],
                seatIndex: 3,
                wind: 'North',
                hand: [],
                melds: [],
                discards: [],
                score: 1000,
                isBot: true
            }
        ];
        // Deal 13 tiles to each seat
        for (let i = 0; i < 13; i++) {
            for (const seat of seats) {
                if (this.wall.length > 0) {
                    seat.hand.push(this.wall.pop());
                }
            }
        }
        // Sort all hands
        seats.forEach(s => this.sortHand(s.hand));
        // Initial East player draws 14th tile
        const firstDraw = this.wall.pop();
        seats[0].drawnTile = firstDraw;
        return {
            seats,
            currentTurnSeat: 0,
            wallCount: this.wall.length,
            phase: 'discard',
            roundTimer: 180,
            events: [
                {
                    id: Math.random().toString(36),
                    text: '🀄 MATCH STARTED: 136-Tile Traditional Mahjong Table (East Wind Round)',
                    color: '#ffe600',
                    timestamp: Date.now()
                }
            ]
        };
    }
    // 136 Authentic Mahjong Tiles
    buildAndShuffleWall() {
        const tiles = [];
        let tileId = 0;
        const suits = ['wan', 'tiao', 'tong'];
        suits.forEach(suit => {
            for (let val = 1; val <= 9; val++) {
                for (let copy = 0; copy < 4; copy++) {
                    tiles.push({
                        id: `tile_${tileId++}`,
                        suit,
                        value: val,
                        symbol: SUIT_SYMBOLS[suit][val],
                        color: SUIT_COLORS[suit]
                    });
                }
            }
        });
        // Winds (East, South, West, North)
        for (let val = 1; val <= 4; val++) {
            for (let copy = 0; copy < 4; copy++) {
                tiles.push({
                    id: `tile_${tileId++}`,
                    suit: 'wind',
                    value: val,
                    symbol: SUIT_SYMBOLS['wind'][val],
                    color: SUIT_COLORS['wind']
                });
            }
        }
        // Dragons (Red, Green, White)
        for (let val = 1; val <= 3; val++) {
            for (let copy = 0; copy < 4; copy++) {
                tiles.push({
                    id: `tile_${tileId++}`,
                    suit: 'dragon',
                    value: val,
                    symbol: SUIT_SYMBOLS['dragon'][val],
                    color: val === 1 ? '#dc2626' : val === 2 ? '#059669' : '#38bdf8'
                });
            }
        }
        // Fisher-Yates Shuffle
        for (let i = tiles.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
        }
        return tiles;
    }
    // Sort hand standard: Wan -> Tiao -> Tong -> Wind -> Dragon, then numerical
    sortHand(hand) {
        const suitOrder = { wan: 1, tiao: 2, tong: 3, wind: 4, dragon: 5 };
        hand.sort((a, b) => {
            if (suitOrder[a.suit] !== suitOrder[b.suit]) {
                return suitOrder[a.suit] - suitOrder[b.suit];
            }
            return a.value - b.value;
        });
    }
    onPlayerJoined(player) {
        const humanSeat = this.state.seats[0];
        if (humanSeat) {
            humanSeat.id = player.socketId;
            humanSeat.name = player.profile.displayName;
            humanSeat.color = player.profile.favoriteColor || '#00e5ff';
            humanSeat.isBot = false;
        }
    }
    onPlayerLeft(socketId) {
        const seat = this.state.seats.find(s => s.id === socketId);
        if (seat) {
            seat.isBot = true;
            seat.name = '🤖 Substitute AI';
        }
    }
    handleInput(socketId, input) {
        if (!input || this.state.phase === 'ended')
            return;
        const seat = this.state.seats.find(s => s.id === socketId);
        if (!seat)
            return;
        // Action 1: Discard a tile on your turn
        if (input.action === 'discard' && input.tileId) {
            if (this.state.currentTurnSeat === seat.seatIndex && this.state.phase === 'discard') {
                this.executeDiscard(seat.seatIndex, input.tileId);
            }
        }
        // Action 2: Calls on someone else's discard (Chi, Pong, Kong, Hu, Pass)
        else if (this.state.phase === 'waiting_calls' && seat.availableCalls) {
            if (input.action === 'hu' && seat.availableCalls.canHu) {
                this.resolveCall(seat.seatIndex, 'hu');
            }
            else if (input.action === 'pong' && seat.availableCalls.canPong) {
                this.resolveCall(seat.seatIndex, 'pong');
            }
            else if (input.action === 'kong' && seat.availableCalls.canKong) {
                this.resolveCall(seat.seatIndex, 'kong');
            }
            else if (input.action === 'chi' && seat.availableCalls.canChi) {
                const chiCombo = seat.availableCalls.chiCombinations?.[0];
                if (chiCombo) {
                    this.resolveCall(seat.seatIndex, 'chi', chiCombo);
                }
            }
            else if (input.action === 'pass') {
                this.resolveCall(seat.seatIndex, 'pass');
            }
        }
    }
    // Execute a Discard from the current seat
    executeDiscard(seatIndex, tileId) {
        const seat = this.state.seats[seatIndex];
        let discardedTile = null;
        // Was it the drawn tile?
        if (seat.drawnTile && seat.drawnTile.id === tileId) {
            discardedTile = seat.drawnTile;
            seat.drawnTile = undefined;
        }
        else {
            const idx = seat.hand.findIndex(t => t.id === tileId);
            if (idx !== -1) {
                discardedTile = seat.hand.splice(idx, 1)[0];
                if (seat.drawnTile) {
                    seat.hand.push(seat.drawnTile);
                    seat.drawnTile = undefined;
                }
                this.sortHand(seat.hand);
            }
        }
        if (!discardedTile)
            return;
        seat.discards.push(discardedTile);
        this.state.lastDiscard = { tile: discardedTile, fromSeat: seatIndex };
        this.pushEvent({
            id: Math.random().toString(36),
            text: `${seat.name} discarded [${discardedTile.symbol}]`,
            color: discardedTile.color,
            timestamp: Date.now()
        });
        // Check if any OTHER player can call Hu, Pong, Kong, or Chi!
        this.evaluateDiscardsForCalls(discardedTile, seatIndex);
    }
    // Scan all other 3 players for potential Chi, Pong, Kong, Hu on the discarded tile
    evaluateDiscardsForCalls(tile, fromSeat) {
        let anyCallsPossible = false;
        this.pendingCalls.clear();
        for (let i = 0; i < 4; i++) {
            if (i === fromSeat) {
                this.state.seats[i].availableCalls = undefined;
                continue;
            }
            const otherSeat = this.state.seats[i];
            const calls = this.calculateCalls(otherSeat, tile, fromSeat);
            if (calls.canHu || calls.canPong || calls.canKong || calls.canChi) {
                otherSeat.availableCalls = calls;
                anyCallsPossible = true;
            }
            else {
                otherSeat.availableCalls = undefined;
            }
        }
        if (anyCallsPossible) {
            this.state.phase = 'waiting_calls';
            this.waitingCallTimer = 5.0; // 5-second window for calls
        }
        else {
            this.advanceToNextTurn();
        }
    }
    // Calculate legal calls for a specific player on a discarded tile
    calculateCalls(seat, tile, fromSeat) {
        const fullHand = [...seat.hand, tile];
        const canHu = this.isWinningHand(fullHand);
        // Pong: Holds at least 2 identical tiles
        const matchingCount = seat.hand.filter(t => t.suit === tile.suit && t.value === tile.value).length;
        const canPong = matchingCount >= 2;
        const canKong = matchingCount >= 3;
        // Chi: Only player directly to the right of discarder (seatIndex === (fromSeat + 1) % 4)
        let canChi = false;
        const chiCombinations = [];
        const isNextPlayer = seat.seatIndex === (fromSeat + 1) % 4;
        if (isNextPlayer && ['wan', 'tiao', 'tong'].includes(tile.suit)) {
            const v = tile.value;
            const suit = tile.suit;
            // Pattern 1: [v-2, v-1, v]
            const tMinus2 = seat.hand.find(t => t.suit === suit && t.value === v - 2);
            const tMinus1 = seat.hand.find(t => t.suit === suit && t.value === v - 1);
            if (tMinus2 && tMinus1) {
                canChi = true;
                chiCombinations.push([tMinus2, tMinus1]);
            }
            // Pattern 2: [v-1, v, v+1]
            const tPlus1 = seat.hand.find(t => t.suit === suit && t.value === v + 1);
            if (tMinus1 && tPlus1) {
                canChi = true;
                chiCombinations.push([tMinus1, tPlus1]);
            }
            // Pattern 3: [v, v+1, v+2]
            const tPlus2 = seat.hand.find(t => t.suit === suit && t.value === v + 2);
            if (tPlus1 && tPlus2) {
                canChi = true;
                chiCombinations.push([tPlus1, tPlus2]);
            }
        }
        return { canHu, canPong, canKong, canChi, chiCombinations };
    }
    // Standard Mahjong Winning Hand Validation:
    // A hand of (14 - 3 * melds) tiles is winning iff it consists of exactly 1 Pair + Chows and Pungs.
    isWinningHand(tiles) {
        const countMap = {};
        for (const t of tiles) {
            const key = `${t.suit}_${t.value}`;
            countMap[key] = (countMap[key] || 0) + 1;
        }
        // Try each unique tile that has count >= 2 as the Pair (The Eyes)
        for (const key of Object.keys(countMap)) {
            if (countMap[key] >= 2) {
                const copy = { ...countMap };
                copy[key] -= 2; // Remove the pair
                if (this.canFormMelds(copy)) {
                    return true;
                }
            }
        }
        return false;
    }
    // Recursive check: Can remaining tiles be decomposed into Chows and Pungs?
    canFormMelds(counts) {
        // Find first tile present
        const firstKey = Object.keys(counts).find(k => counts[k] > 0);
        if (!firstKey)
            return true; // All tiles successfully partitioned into melds!
        const [suit, valStr] = firstKey.split('_');
        const val = parseInt(valStr, 10);
        // Option A: Try Pung (Triplet)
        if (counts[firstKey] >= 3) {
            counts[firstKey] -= 3;
            if (this.canFormMelds(counts))
                return true;
            counts[firstKey] += 3; // Backtrack
        }
        // Option B: Try Chow (Sequence of 3 in suited tiles)
        if (['wan', 'tiao', 'tong'].includes(suit) && val <= 7) {
            const k2 = `${suit}_${val + 1}`;
            const k3 = `${suit}_${val + 2}`;
            if ((counts[k2] || 0) > 0 && (counts[k3] || 0) > 0) {
                counts[firstKey] -= 1;
                counts[k2] -= 1;
                counts[k3] -= 1;
                if (this.canFormMelds(counts))
                    return true;
                counts[firstKey] += 1;
                counts[k2] += 1;
                counts[k3] += 1; // Backtrack
            }
        }
        return false;
    }
    // Resolve a Call (Hu, Pong, Kong, Chi, or Pass)
    resolveCall(seatIndex, callType, meld) {
        const lastDiscard = this.state.lastDiscard;
        if (!lastDiscard)
            return;
        if (callType === 'pass') {
            const seat = this.state.seats[seatIndex];
            seat.availableCalls = undefined;
            // Check if all calling players have passed
            const remainingCallers = this.state.seats.filter(s => s.availableCalls);
            if (remainingCallers.length === 0) {
                this.advanceToNextTurn();
            }
            return;
        }
        // Priority Check: Hu > Pong/Kong > Chi
        if (callType === 'hu') {
            const winner = this.state.seats[seatIndex];
            const loser = this.state.seats[lastDiscard.fromSeat];
            winner.score += 800;
            loser.score = Math.max(0, loser.score - 800);
            winner.hand.push(lastDiscard.tile);
            this.sortHand(winner.hand);
            this.state.winnerSeat = seatIndex;
            this.state.winType = 'ron';
            this.state.phase = 'ended';
            this.pushEvent({
                id: Math.random().toString(36),
                text: `🎉🏆 MAHJONG HU! ${winner.name} called WIN on ${loser.name}'s [${lastDiscard.tile.symbol}]! (+800 pts)`,
                color: '#ffe600',
                timestamp: Date.now()
            });
            return;
        }
        if (callType === 'pong') {
            const caller = this.state.seats[seatIndex];
            // Remove 2 matching tiles from caller's hand
            let removed = 0;
            for (let i = caller.hand.length - 1; i >= 0 && removed < 2; i--) {
                if (caller.hand[i].suit === lastDiscard.tile.suit && caller.hand[i].value === lastDiscard.tile.value) {
                    caller.hand.splice(i, 1);
                    removed++;
                }
            }
            caller.melds.push({
                type: 'pung',
                tiles: [lastDiscard.tile, lastDiscard.tile, lastDiscard.tile],
                claimedFrom: this.state.seats[lastDiscard.fromSeat].name
            });
            this.clearAllCalls();
            this.state.currentTurnSeat = seatIndex;
            this.state.phase = 'discard';
            this.pushEvent({
                id: Math.random().toString(36),
                text: `碰 PONG! ${caller.name} claimed triplet of [${lastDiscard.tile.symbol}]!`,
                color: '#10b981',
                timestamp: Date.now()
            });
            return;
        }
        if (callType === 'chi' && meld) {
            const caller = this.state.seats[seatIndex];
            for (const m of meld) {
                const idx = caller.hand.findIndex(t => t.id === m.id);
                if (idx !== -1)
                    caller.hand.splice(idx, 1);
            }
            caller.melds.push({
                type: 'chow',
                tiles: [meld[0], lastDiscard.tile, meld[1]],
                claimedFrom: this.state.seats[lastDiscard.fromSeat].name
            });
            this.clearAllCalls();
            this.state.currentTurnSeat = seatIndex;
            this.state.phase = 'discard';
            this.pushEvent({
                id: Math.random().toString(36),
                text: `吃 CHI! ${caller.name} completed run with [${lastDiscard.tile.symbol}]!`,
                color: '#00e5ff',
                timestamp: Date.now()
            });
            return;
        }
    }
    clearAllCalls() {
        this.state.seats.forEach(s => (s.availableCalls = undefined));
        this.state.lastDiscard = undefined;
    }
    // Move clockwise to next turn
    advanceToNextTurn() {
        this.clearAllCalls();
        if (this.wall.length === 0) {
            // Wall exhausted -> Draw Game (Ryuukyoku)
            this.state.phase = 'ended';
            this.pushEvent({
                id: Math.random().toString(36),
                text: '🏁 WALL EXHAUSTED: DRAW GAME (RYUUKYOKU)!',
                color: '#94a3b8',
                timestamp: Date.now()
            });
            return;
        }
        const nextSeat = (this.state.currentTurnSeat + 1) % 4;
        this.state.currentTurnSeat = nextSeat;
        this.state.wallCount = this.wall.length;
        // Next player draws 1 tile
        const drawn = this.wall.pop();
        const seat = this.state.seats[nextSeat];
        seat.drawnTile = drawn;
        this.state.wallCount = this.wall.length;
        this.state.phase = 'discard';
        // Check if self-drawn win (Zimo)
        if (this.isWinningHand([...seat.hand, drawn])) {
            if (seat.isBot) {
                // Bot auto-declares Zimo!
                this.executeZimo(nextSeat);
                return;
            }
        }
    }
    executeZimo(seatIndex) {
        const winner = this.state.seats[seatIndex];
        if (winner.drawnTile) {
            winner.hand.push(winner.drawnTile);
            winner.drawnTile = undefined;
        }
        this.sortHand(winner.hand);
        winner.score += 1200;
        this.state.seats.forEach((s, idx) => {
            if (idx !== seatIndex)
                s.score = Math.max(0, s.score - 400);
        });
        this.state.winnerSeat = seatIndex;
        this.state.winType = 'zimo';
        this.state.phase = 'ended';
        this.pushEvent({
            id: Math.random().toString(36),
            text: `🎉🏆 SELF-DRAWN WIN! (ZIMO / TSUMO) ${winner.name} won by drawing their own tile! (+1200 pts)`,
            color: '#ffe600',
            timestamp: Date.now()
        });
    }
    // AI Bots Play Decisions
    updateBots(deltaSeconds) {
        // 1. Handle Bot Calls on Discard
        if (this.state.phase === 'waiting_calls') {
            this.waitingCallTimer -= deltaSeconds;
            for (let i = 1; i < 4; i++) {
                const bot = this.state.seats[i];
                if (bot.availableCalls) {
                    if (bot.availableCalls.canHu) {
                        this.resolveCall(i, 'hu');
                        return;
                    }
                    else if (bot.availableCalls.canPong && Math.random() < 0.8) {
                        this.resolveCall(i, 'pong');
                        return;
                    }
                    else if (bot.availableCalls.canChi && Math.random() < 0.6) {
                        const combo = bot.availableCalls.chiCombinations?.[0];
                        if (combo) {
                            this.resolveCall(i, 'chi', combo);
                            return;
                        }
                    }
                    else {
                        this.resolveCall(i, 'pass');
                    }
                }
            }
            // Timeout call window if human doesn't respond
            if (this.waitingCallTimer <= 0) {
                this.advanceToNextTurn();
            }
            return;
        }
        // 2. Handle Bot Discards
        if (this.state.phase === 'discard') {
            const currentSeat = this.state.seats[this.state.currentTurnSeat];
            if (currentSeat.isBot) {
                this.botActionCooldown -= deltaSeconds;
                if (this.botActionCooldown <= 0) {
                    this.botActionCooldown = Math.random() * 0.8 + 1.2;
                    // Smart Bot Discard Logic:
                    // Keep tiles that are part of pairs or sequences. Discard isolated honors or isolated ends.
                    const candidateTiles = currentSeat.drawnTile
                        ? [...currentSeat.hand, currentSeat.drawnTile]
                        : [...currentSeat.hand];
                    let chosenTile = candidateTiles[0];
                    // Priority 1: Isolated winds or dragons (count === 1)
                    const singleHonor = candidateTiles.find(t => (t.suit === 'wind' || t.suit === 'dragon') && candidateTiles.filter(x => x.suit === t.suit && x.value === t.value).length === 1);
                    if (singleHonor) {
                        chosenTile = singleHonor;
                    }
                    else {
                        // Priority 2: Isolated ends (1s or 9s without adjacent neighbors)
                        const isolatedEnd = candidateTiles.find(t => {
                            if (['wan', 'tiao', 'tong'].includes(t.suit) && (t.value === 1 || t.value === 9)) {
                                const hasAdjacent = candidateTiles.some(x => x.suit === t.suit && (x.value === t.value + 1 || x.value === t.value - 1));
                                return !hasAdjacent;
                            }
                            return false;
                        });
                        if (isolatedEnd) {
                            chosenTile = isolatedEnd;
                        }
                        else {
                            // Priority 3: Discard drawn tile or random end
                            chosenTile = currentSeat.drawnTile || candidateTiles[candidateTiles.length - 1];
                        }
                    }
                    this.executeDiscard(currentSeat.seatIndex, chosenTile.id);
                }
            }
        }
    }
    tick(deltaSeconds) {
        if (this.state.phase !== 'ended') {
            this.state.roundTimer = Math.max(0, this.state.roundTimer - deltaSeconds);
            if (this.state.roundTimer <= 0) {
                this.state.phase = 'ended';
            }
            this.updateBots(deltaSeconds);
        }
        if (typeof this.onStateUpdate === 'function') {
            this.onStateUpdate(this.state);
        }
    }
    pushEvent(evt) {
        this.state.events.push(evt);
        if (this.state.events.length > 8) {
            this.state.events.shift();
        }
    }
}
exports.MahjongEngine = MahjongEngine;
