"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GlowballEngine = void 0;
const BaseGameEngine_1 = require("./BaseGameEngine");
const src_1 = require("../../../shared/src");
const DEFAULT_BOTS = [
    { id: 'bot_neon', name: '⚡ Neon-Racer', color: '#00e5ff', skill: 0.8 },
    { id: 'bot_turbo', name: '🔥 Turbo-Glider', color: '#f43f5e', skill: 0.75 },
    { id: 'bot_phantom', name: '💎 Pulse-Phantom', color: '#8b5cf6', skill: 0.85 }
];
class GlowballEngine extends BaseGameEngine_1.BaseGameEngine {
    orbIdCounter = 100;
    botsSpawned = false;
    lastStealTime = new Map();
    initializeState() {
        const orbs = [];
        for (let i = 0; i < src_1.GLOWBALL_CONFIG.MAX_ORBS; i++) {
            const isSuper = i % 4 === 0;
            orbs.push({
                id: i,
                x: Math.random() * (src_1.GLOWBALL_CONFIG.ARENA_WIDTH - 160) + 80,
                y: Math.random() * (src_1.GLOWBALL_CONFIG.ARENA_HEIGHT - 160) + 80,
                value: isSuper ? 30 : 10,
                type: isSuper ? 'super' : 'standard'
            });
        }
        // Two moving / pulsing hazard EMP mines
        const hazards = [
            { id: 1, x: src_1.GLOWBALL_CONFIG.ARENA_WIDTH * 0.28, y: src_1.GLOWBALL_CONFIG.ARENA_HEIGHT * 0.5, radius: 24 },
            { id: 2, x: src_1.GLOWBALL_CONFIG.ARENA_WIDTH * 0.72, y: src_1.GLOWBALL_CONFIG.ARENA_HEIGHT * 0.5, radius: 24 }
        ];
        // Neon Hyper Speed Gates
        const gates = [
            { id: 1, x: src_1.GLOWBALL_CONFIG.ARENA_WIDTH * 0.5, y: 130, width: 34, height: 90, label: 'GATE 1' },
            { id: 2, x: src_1.GLOWBALL_CONFIG.ARENA_WIDTH * 0.5, y: src_1.GLOWBALL_CONFIG.ARENA_HEIGHT - 130, width: 34, height: 90, label: 'GATE 2' }
        ];
        // The high-speed Glowball Puck
        const puck = {
            x: src_1.GLOWBALL_CONFIG.ARENA_WIDTH / 2,
            y: src_1.GLOWBALL_CONFIG.ARENA_HEIGHT / 2,
            vx: (Math.random() > 0.5 ? 1 : -1) * 220,
            vy: (Math.random() - 0.5) * 180,
            radius: 18,
            lastHitBy: undefined,
            lastHitName: undefined,
            lastHitColor: '#ffffff',
            isOverdrive: false,
            overdriveTimer: 0
        };
        this.botsSpawned = false;
        this.lastStealTime = new Map();
        return {
            arenaWidth: src_1.GLOWBALL_CONFIG.ARENA_WIDTH,
            arenaHeight: src_1.GLOWBALL_CONFIG.ARENA_HEIGHT,
            puck,
            gates,
            orbs,
            hazards,
            players: {},
            events: []
        };
    }
    spawnBotsIfNeeded() {
        if (this.botsSpawned)
            return;
        this.botsSpawned = true;
        for (const bot of DEFAULT_BOTS) {
            if (!this.state.players[bot.id]) {
                this.state.players[bot.id] = {
                    x: Math.random() * (this.state.arenaWidth - 200) + 100,
                    y: Math.random() * (this.state.arenaHeight - 200) + 100,
                    vx: 0,
                    vy: 0,
                    dashTimer: 0,
                    dashCooldown: 3 + Math.random() * 2,
                    score: 0,
                    color: bot.color,
                    name: bot.name,
                    isBot: true,
                    stunTimer: 0,
                    overdriveMeter: 20 + Math.floor(Math.random() * 30),
                    targetDx: 0,
                    targetDy: 0
                };
            }
        }
    }
    onPlayerJoined(player) {
        this.state.players[player.socketId] = {
            x: Math.random() * 500 + 200,
            y: Math.random() * 350 + 150,
            vx: 0,
            vy: 0,
            dashTimer: 0,
            dashCooldown: 0,
            score: 0,
            color: player.profile.favoriteColor || '#00e5ff',
            name: player.profile.displayName,
            isBot: false,
            stunTimer: 0,
            overdriveMeter: 0,
            targetDx: 0,
            targetDy: 0
        };
        this.spawnBotsIfNeeded();
    }
    onPlayerLeft(socketId) {
        delete this.state.players[socketId];
    }
    handleInput(socketId, input) {
        const p = this.state.players[socketId];
        if (!p || (p.stunTimer || 0) > 0)
            return;
        // Overdrive Super Blast activation
        if (input.action === 'overdrive' || input.overdrive) {
            if (p.overdriveMeter >= 80 && !p.isOverdriveActive) {
                p.isOverdriveActive = true;
                p.overdriveTimer = 4.5;
                p.overdriveMeter = 0;
                // Shockwave: repel nearby rivals and vacuum nearby orbs
                for (const [otherId, other] of Object.entries(this.state.players)) {
                    if (otherId === socketId)
                        continue;
                    const dist = Math.hypot(other.x - p.x, other.y - p.y);
                    if (dist < 220) {
                        const angle = Math.atan2(other.y - p.y, other.x - p.x);
                        other.vx = Math.cos(angle) * 450;
                        other.vy = Math.sin(angle) * 450;
                        other.stunTimer = 1.2;
                    }
                }
                // Magnet vacuum orbs
                for (const orb of this.state.orbs) {
                    if (Math.hypot(orb.x - p.x, orb.y - p.y) < 260) {
                        orb.x += (p.x - orb.x) * 0.65;
                        orb.y += (p.y - orb.y) * 0.65;
                    }
                }
                this.pushEvent({
                    id: Math.random().toString(36),
                    type: 'overdrive',
                    text: `💥 OVERDRIVE NOVA! ${p.name}`,
                    x: p.x,
                    y: p.y,
                    color: '#ffe600',
                    timestamp: Date.now()
                });
            }
        }
        // Hyper Dash trigger
        if (input.dash && p.dashCooldown <= 0) {
            p.dashTimer = src_1.GLOWBALL_CONFIG.DASH_DURATION_SEC;
            p.dashCooldown = src_1.GLOWBALL_CONFIG.DASH_COOLDOWN_SEC;
            const curSpeed = Math.hypot(p.vx, p.vy);
            let dirX = p.targetDx || 0;
            let dirY = p.targetDy || 0;
            if (dirX === 0 && dirY === 0) {
                if (curSpeed > 10) {
                    dirX = p.vx / curSpeed;
                    dirY = p.vy / curSpeed;
                }
                else {
                    dirX = 1;
                }
            }
            else {
                const len = Math.hypot(dirX, dirY) || 1;
                dirX /= len;
                dirY /= len;
            }
            p.vx = dirX * src_1.GLOWBALL_CONFIG.BASE_SPEED * src_1.GLOWBALL_CONFIG.DASH_MULTIPLIER;
            p.vy = dirY * src_1.GLOWBALL_CONFIG.BASE_SPEED * src_1.GLOWBALL_CONFIG.DASH_MULTIPLIER;
            this.pushEvent({
                id: Math.random().toString(36),
                type: 'dash',
                text: '⚡ HYPER DASH!',
                x: p.x,
                y: p.y,
                color: p.color,
                timestamp: Date.now()
            });
        }
        // Set target direction for analog acceleration
        const rawDx = Number(input.dx);
        const rawDy = Number(input.dy);
        p.targetDx = isNaN(rawDx) ? 0 : Math.max(-1, Math.min(1, rawDx));
        p.targetDy = isNaN(rawDy) ? 0 : Math.max(-1, Math.min(1, rawDy));
    }
    pushEvent(evt) {
        this.state.events.push(evt);
        if (this.state.events.length > 15) {
            this.state.events.shift();
        }
    }
    updateBots(deltaSeconds) {
        const entries = Object.entries(this.state.players);
        const puck = this.state.puck;
        for (const [id, bot] of entries) {
            if (!bot.isBot || (bot.stunTimer || 0) > 0)
                continue;
            if (bot.dashTimer > 0)
                bot.dashTimer -= deltaSeconds;
            if (bot.dashCooldown > 0)
                bot.dashCooldown -= deltaSeconds;
            // Smart Bot AI: Choose between intercepting puck, collecting orbs, or hitting gates
            const distToPuck = Math.hypot(bot.x - puck.x, bot.y - puck.y);
            let targetX = puck.x;
            let targetY = puck.y;
            if (distToPuck < 280) {
                // Line up shot towards center or towards human player
                targetX = puck.x;
                targetY = puck.y;
            }
            else {
                // Collect closest high-value orb
                let bestWeight = -Infinity;
                for (const orb of this.state.orbs) {
                    const d = Math.hypot(bot.x - orb.x, bot.y - orb.y);
                    const weight = orb.value / (d + 20);
                    if (weight > bestWeight) {
                        bestWeight = weight;
                        targetX = orb.x;
                        targetY = orb.y;
                    }
                }
            }
            // Avoid hazards
            for (const h of this.state.hazards) {
                const d = Math.hypot(bot.x - h.x, bot.y - h.y);
                if (d < 90) {
                    targetX += (bot.x - h.x) * 2.2;
                    targetY += (bot.y - h.y) * 2.2;
                }
            }
            // Bot Overdrive trigger
            if (bot.overdriveMeter >= 95 && !bot.isOverdriveActive) {
                bot.isOverdriveActive = true;
                bot.overdriveTimer = 4.0;
                bot.overdriveMeter = 0;
                this.pushEvent({
                    id: Math.random().toString(36),
                    type: 'overdrive',
                    text: `💥 BOT NOVA! ${bot.name}`,
                    x: bot.x,
                    y: bot.y,
                    color: bot.color,
                    timestamp: Date.now()
                });
            }
            // Bot Dash towards puck if close
            if (bot.dashCooldown <= 0 && distToPuck > 80 && distToPuck < 200) {
                bot.dashTimer = src_1.GLOWBALL_CONFIG.DASH_DURATION_SEC;
                bot.dashCooldown = src_1.GLOWBALL_CONFIG.DASH_COOLDOWN_SEC + Math.random() * 2;
                this.pushEvent({
                    id: Math.random().toString(36),
                    type: 'dash',
                    text: `${bot.name} DASH!`,
                    x: bot.x,
                    y: bot.y,
                    color: bot.color,
                    timestamp: Date.now()
                });
            }
            const angle = Math.atan2(targetY - bot.y, targetX - bot.x);
            bot.targetDx = Math.cos(angle);
            bot.targetDy = Math.sin(angle);
        }
    }
    tick(deltaSeconds) {
        const now = Date.now();
        this.spawnBotsIfNeeded();
        this.updateBots(deltaSeconds);
        const puck = this.state.puck;
        const entries = Object.entries(this.state.players);
        // 1. Update Player Positions with Analog Acceleration & Smooth Gliding Inertia
        for (const [id, p] of entries) {
            if ((p.stunTimer || 0) > 0) {
                p.stunTimer = Math.max(0, (p.stunTimer || 0) - deltaSeconds);
                p.vx *= 0.88;
                p.vy *= 0.88;
                p.x += p.vx * deltaSeconds;
                p.y += p.vy * deltaSeconds;
                continue;
            }
            if (p.dashTimer > 0)
                p.dashTimer = Math.max(0, p.dashTimer - deltaSeconds);
            if (p.dashCooldown > 0)
                p.dashCooldown = Math.max(0, p.dashCooldown - deltaSeconds);
            // Overdrive timer decay
            if (p.isOverdriveActive) {
                p.overdriveTimer = Math.max(0, (p.overdriveTimer || 0) - deltaSeconds);
                if (p.overdriveTimer <= 0)
                    p.isOverdriveActive = false;
            }
            // Analog glide physics
            const targetDx = p.targetDx || 0;
            const targetDy = p.targetDy || 0;
            const isInput = Math.hypot(targetDx, targetDy) > 0.05;
            const baseSpeed = src_1.GLOWBALL_CONFIG.BASE_SPEED * (p.isOverdriveActive ? 1.4 : 1.0);
            const mult = p.dashTimer > 0 ? src_1.GLOWBALL_CONFIG.DASH_MULTIPLIER : 1;
            const targetSpeed = baseSpeed * mult;
            if (isInput) {
                const targetVx = targetDx * targetSpeed;
                const targetVy = targetDy * targetSpeed;
                const accelRate = p.dashTimer > 0 ? 25 : 12;
                p.vx += (targetVx - p.vx) * Math.min(1, deltaSeconds * accelRate);
                p.vy += (targetVy - p.vy) * Math.min(1, deltaSeconds * accelRate);
            }
            else {
                // Viscous cyber-ice drag
                p.vx *= Math.pow(0.85, deltaSeconds * 60);
                p.vy *= Math.pow(0.85, deltaSeconds * 60);
            }
            // Update position
            p.x = Math.max(24, Math.min(this.state.arenaWidth - 24, p.x + p.vx * deltaSeconds));
            p.y = Math.max(24, Math.min(this.state.arenaHeight - 24, p.y + p.vy * deltaSeconds));
            // Hazard EMP collision check
            for (const h of this.state.hazards) {
                if (Math.hypot(p.x - h.x, p.y - h.y) < h.radius + 18) {
                    p.stunTimer = 1.4;
                    p.score = Math.max(0, p.score - 15);
                    const session = this.players.get(id);
                    if (session)
                        session.score = p.score;
                    // Repulsive bounce
                    const angle = Math.atan2(p.y - h.y, p.x - h.x);
                    p.vx = Math.cos(angle) * 380;
                    p.vy = Math.sin(angle) * 380;
                    this.pushEvent({
                        id: Math.random().toString(36),
                        type: 'hazard',
                        text: `⚠️ ${p.name} SHOCKED! -15`,
                        x: p.x,
                        y: p.y,
                        color: '#ef4444',
                        timestamp: now
                    });
                }
            }
            // Orb collection check
            for (const orb of this.state.orbs) {
                if (Math.hypot(p.x - orb.x, p.y - orb.y) < 30) {
                    const points = orb.value * (p.isOverdriveActive ? 2 : 1);
                    p.score += points;
                    p.overdriveMeter = Math.min(100, (p.overdriveMeter || 0) + (orb.type === 'super' ? 25 : 10));
                    const session = this.players.get(id);
                    if (session)
                        session.score = p.score;
                    this.pushEvent({
                        id: Math.random().toString(36),
                        type: orb.type === 'super' ? 'super_orb' : 'orb',
                        text: orb.type === 'super' ? `🌟 +${points} SUPER ORB!` : `+${points}`,
                        x: orb.x,
                        y: orb.y,
                        color: orb.type === 'super' ? '#ffe600' : '#00e5ff',
                        timestamp: now
                    });
                    // Respawn orb
                    orb.x = Math.random() * (this.state.arenaWidth - 160) + 80;
                    orb.y = Math.random() * (this.state.arenaHeight - 160) + 80;
                    orb.type = Math.random() < 0.25 ? 'super' : 'standard';
                    orb.value = orb.type === 'super' ? 30 : 10;
                }
            }
            // Player to Puck Strike Physics (Air-Hockey Deflection)
            const distToPuck = Math.hypot(p.x - puck.x, p.y - puck.y);
            if (distToPuck < 24 + puck.radius) {
                const hitAngle = Math.atan2(puck.y - p.y, puck.x - p.x);
                const isDashing = p.dashTimer > 0;
                const hitSpeed = isDashing ? 720 : 480;
                puck.vx = Math.cos(hitAngle) * hitSpeed;
                puck.vy = Math.sin(hitAngle) * hitSpeed;
                puck.lastHitBy = id;
                puck.lastHitName = p.name;
                puck.lastHitColor = p.color;
                puck.isOverdrive = isDashing || !!p.isOverdriveActive;
                // Player recoil
                p.vx -= Math.cos(hitAngle) * 90;
                p.vy -= Math.sin(hitAngle) * 90;
                p.score += 5;
                p.overdriveMeter = Math.min(100, (p.overdriveMeter || 0) + 15);
                const session = this.players.get(id);
                if (session)
                    session.score = p.score;
                this.pushEvent({
                    id: Math.random().toString(36),
                    type: 'puck_hit',
                    text: isDashing ? `⚡ SMASH DEFLECTION! +5` : `🏓 PUCK STRUCK! +5`,
                    x: puck.x,
                    y: puck.y,
                    color: p.color,
                    timestamp: now
                });
            }
        }
        // 2. High-Speed Glowball Puck Physics & Wall Bounces
        puck.x += puck.vx * deltaSeconds;
        puck.y += puck.vy * deltaSeconds;
        // Air friction for puck
        puck.vx *= Math.pow(0.985, deltaSeconds * 60);
        puck.vy *= Math.pow(0.985, deltaSeconds * 60);
        // Wall bounce: Left / Right
        if (puck.x <= puck.radius + 12) {
            puck.x = puck.radius + 12;
            puck.vx = Math.abs(puck.vx) * 0.96;
        }
        else if (puck.x >= this.state.arenaWidth - puck.radius - 12) {
            puck.x = this.state.arenaWidth - puck.radius - 12;
            puck.vx = -Math.abs(puck.vx) * 0.96;
        }
        // Wall bounce: Top / Bottom
        if (puck.y <= puck.radius + 12) {
            puck.y = puck.radius + 12;
            puck.vy = Math.abs(puck.vy) * 0.96;
        }
        else if (puck.y >= this.state.arenaHeight - puck.radius - 12) {
            puck.y = this.state.arenaHeight - puck.radius - 12;
            puck.vy = -Math.abs(puck.vy) * 0.96;
        }
        // Puck passing through Speed Gates
        for (const gate of this.state.gates) {
            const inX = Math.abs(puck.x - gate.x) < gate.width / 2 + puck.radius;
            const inY = Math.abs(puck.y - gate.y) < gate.height / 2 + puck.radius;
            if (inX && inY) {
                const curSpd = Math.hypot(puck.vx, puck.vy);
                if (curSpd > 120 && !puck.isOverdrive) {
                    puck.isOverdrive = true;
                    puck.overdriveTimer = 3.5;
                    puck.vx *= 1.6;
                    puck.vy *= 1.6;
                    if (puck.lastHitBy) {
                        const striker = this.state.players[puck.lastHitBy];
                        if (striker) {
                            striker.score += 25;
                            const session = this.players.get(puck.lastHitBy);
                            if (session)
                                session.score = striker.score;
                        }
                    }
                    this.pushEvent({
                        id: Math.random().toString(36),
                        type: 'gate_boost',
                        text: `🚀 SPEED GATE ACCELERATION! +25`,
                        x: gate.x,
                        y: gate.y,
                        color: '#00e5ff',
                        timestamp: now
                    });
                }
            }
        }
        // Puck hits orbs (Cascade Destruction)
        for (const orb of this.state.orbs) {
            if (Math.hypot(puck.x - orb.x, puck.y - orb.y) < puck.radius + 20) {
                if (puck.lastHitBy) {
                    const striker = this.state.players[puck.lastHitBy];
                    if (striker) {
                        striker.score += orb.value * 2;
                        const session = this.players.get(puck.lastHitBy);
                        if (session)
                            session.score = striker.score;
                    }
                }
                this.pushEvent({
                    id: Math.random().toString(36),
                    type: 'orb',
                    text: `💥 PUCK DETONATION! +${orb.value * 2}`,
                    x: orb.x,
                    y: orb.y,
                    color: puck.lastHitColor || '#ffe600',
                    timestamp: now
                });
                // Respawn orb
                orb.x = Math.random() * (this.state.arenaWidth - 160) + 80;
                orb.y = Math.random() * (this.state.arenaHeight - 160) + 80;
                orb.type = Math.random() < 0.25 ? 'super' : 'standard';
                orb.value = orb.type === 'super' ? 30 : 10;
            }
        }
        // High-Speed Puck striking other players
        const puckSpd = Math.hypot(puck.vx, puck.vy);
        if (puckSpd > 300) {
            for (const [id, p] of entries) {
                if (id === puck.lastHitBy)
                    continue;
                if (Math.hypot(p.x - puck.x, p.y - puck.y) < puck.radius + 24) {
                    p.stunTimer = 1.0;
                    const pointsLost = Math.min(20, p.score);
                    p.score -= pointsLost;
                    if (puck.lastHitBy) {
                        const attacker = this.state.players[puck.lastHitBy];
                        if (attacker)
                            attacker.score += pointsLost;
                    }
                    // Knockback
                    p.vx += (puck.vx / puckSpd) * 350;
                    p.vy += (puck.vy / puckSpd) * 350;
                    // Puck slows slightly
                    puck.vx *= 0.6;
                    puck.vy *= 0.6;
                    this.pushEvent({
                        id: Math.random().toString(36),
                        type: 'steal',
                        text: `⚡ PUCK RICOCHET STRIKE! ${puck.lastHitName || 'Puck'} hit ${p.name}!`,
                        x: p.x,
                        y: p.y,
                        color: '#ef4444',
                        timestamp: now
                    });
                }
            }
        }
        // 3. Player to Player High-Speed Dash Collision Steal
        for (let i = 0; i < entries.length; i++) {
            for (let j = i + 1; j < entries.length; j++) {
                const [idA, pA] = entries[i];
                const [idB, pB] = entries[j];
                const dist = Math.hypot(pA.x - pB.x, pA.y - pB.y);
                if (dist < 36) {
                    const pairKey = [idA, idB].sort().join(':');
                    if (now - (this.lastStealTime.get(pairKey) || 0) >= 1000) {
                        this.lastStealTime.set(pairKey, now);
                        const isADashing = pA.dashTimer > 0;
                        const isBDashing = pB.dashTimer > 0;
                        if (isADashing || isBDashing) {
                            const [attacker, defender, attId, defId] = isADashing ? [pA, pB, idA, idB] : [pB, pA, idB, idA];
                            const stealAmount = Math.min(25, defender.score);
                            defender.score -= stealAmount;
                            attacker.score += stealAmount;
                            // Elastic push
                            const angle = Math.atan2(defender.y - attacker.y, defender.x - attacker.x);
                            defender.vx = Math.cos(angle) * 400;
                            defender.vy = Math.sin(angle) * 400;
                            defender.stunTimer = 0.8;
                            const sessionDef = this.players.get(defId);
                            if (sessionDef)
                                sessionDef.score = defender.score;
                            const sessionAtt = this.players.get(attId);
                            if (sessionAtt)
                                sessionAtt.score = attacker.score;
                            this.pushEvent({
                                id: Math.random().toString(36),
                                type: 'steal',
                                text: `⚡ DASH TACKLE! ${attacker.name} stole ${stealAmount} pts!`,
                                x: (pA.x + pB.x) / 2,
                                y: (pA.y + pB.y) / 2,
                                color: '#f59e0b',
                                timestamp: now
                            });
                        }
                    }
                }
            }
        }
        if (typeof this.onStateUpdate === 'function') {
            this.onStateUpdate(this.state);
        }
    }
}
exports.GlowballEngine = GlowballEngine;
