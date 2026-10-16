"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GalaxyStrikeEngine = void 0;
const BaseGameEngine_1 = require("./BaseGameEngine");
const src_1 = require("../../../shared/src");
class GalaxyStrikeEngine extends BaseGameEngine_1.BaseGameEngine {
    idCounter = 1;
    shootCooldown = 0;
    waveSpawnTimer = 1.0;
    targetPlayerX = src_1.GALAXY_STRIKE_CONFIG.ARENA_WIDTH / 2;
    initializeState() {
        this.targetPlayerX = src_1.GALAXY_STRIKE_CONFIG.ARENA_WIDTH / 2;
        this.shootCooldown = 0;
        this.waveSpawnTimer = 0.5;
        return {
            arenaWidth: src_1.GALAXY_STRIKE_CONFIG.ARENA_WIDTH,
            arenaHeight: src_1.GALAXY_STRIKE_CONFIG.ARENA_HEIGHT,
            player: {
                x: src_1.GALAXY_STRIKE_CONFIG.ARENA_WIDTH / 2,
                y: src_1.GALAXY_STRIKE_CONFIG.ARENA_HEIGHT - 55,
                vx: 0,
                lives: src_1.GALAXY_STRIKE_CONFIG.MAX_LIVES,
                score: 0,
                powerup: 'none',
                powerupTimer: 0,
                invulnerableTimer: 2.0
            },
            enemies: [],
            lasers: [],
            enemyBolts: [],
            powerups: [],
            wave: 1,
            events: []
        };
    }
    spawnWave(waveNumber) {
        const enemies = [];
        const isBossWave = waveNumber % 3 === 0;
        if (isBossWave) {
            enemies.push({
                id: ++this.idCounter,
                x: src_1.GALAXY_STRIKE_CONFIG.ARENA_WIDTH / 2,
                y: 110,
                vx: 120,
                vy: 0,
                hp: 35 + waveNumber * 10,
                maxHp: 35 + waveNumber * 10,
                type: 'boss',
                scoreValue: 500,
                shootCooldown: 1.2,
                phase: 0
            });
            this.pushEvent({
                id: Math.random().toString(36),
                type: 'boss_spawn',
                text: `⚠️ DREADNOUGHT BOSS DETECTED! (WAVE ${waveNumber})`,
                x: src_1.GALAXY_STRIKE_CONFIG.ARENA_WIDTH / 2,
                y: 110,
                color: '#ef4444',
                timestamp: Date.now()
            });
        }
        else {
            // Swarm formation
            const rows = 3;
            const cols = 7;
            const spacingX = 85;
            const spacingY = 48;
            const startX = (src_1.GALAXY_STRIKE_CONFIG.ARENA_WIDTH - cols * spacingX) / 2 + 35;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const isCruiser = r === 0;
                    enemies.push({
                        id: ++this.idCounter,
                        x: startX + c * spacingX,
                        y: 70 + r * spacingY,
                        vx: 80,
                        vy: 8,
                        hp: isCruiser ? 3 : 1,
                        maxHp: isCruiser ? 3 : 1,
                        type: isCruiser ? 'cruiser' : 'drone',
                        scoreValue: isCruiser ? 50 : 20,
                        shootCooldown: 2 + Math.random() * 4,
                        phase: Math.random() * Math.PI * 2
                    });
                }
            }
        }
        return enemies;
    }
    onPlayerJoined(player) {
        // Single / co-op ready
    }
    onPlayerLeft(socketId) {
        // cleanup
    }
    handleInput(socketId, input) {
        const p = this.state.player;
        if (p.lives <= 0)
            return;
        if (input.targetX !== undefined && !isNaN(Number(input.targetX))) {
            this.targetPlayerX = Math.max(30, Math.min(this.state.arenaWidth - 30, Number(input.targetX)));
        }
        else if (input.dx !== undefined) {
            const dx = Number(input.dx) || 0;
            this.targetPlayerX = Math.max(30, Math.min(this.state.arenaWidth - 30, p.x + dx * 28));
        }
        // Fire plasma cannons
        if (input.dash || input.action === 'fire' || input.fire || input.shoot) {
            this.firePlayerLaser();
        }
    }
    firePlayerLaser() {
        const p = this.state.player;
        if (this.shootCooldown > 0)
            return;
        const rate = p.powerup === 'rapid' ? 0.12 : 0.22;
        this.shootCooldown = rate;
        if (p.powerup === 'spread') {
            this.state.lasers.push({ id: ++this.idCounter, x: p.x, y: p.y - 18, vx: 0, vy: -src_1.GALAXY_STRIKE_CONFIG.LASER_SPEED }, { id: ++this.idCounter, x: p.x - 12, y: p.y - 16, vx: -140, vy: -src_1.GALAXY_STRIKE_CONFIG.LASER_SPEED * 0.95 }, { id: ++this.idCounter, x: p.x + 12, y: p.y - 16, vx: 140, vy: -src_1.GALAXY_STRIKE_CONFIG.LASER_SPEED * 0.95 });
        }
        else {
            this.state.lasers.push({ id: ++this.idCounter, x: p.x - 8, y: p.y - 18, vx: 0, vy: -src_1.GALAXY_STRIKE_CONFIG.LASER_SPEED }, { id: ++this.idCounter, x: p.x + 8, y: p.y - 18, vx: 0, vy: -src_1.GALAXY_STRIKE_CONFIG.LASER_SPEED });
        }
    }
    pushEvent(evt) {
        this.state.events.push(evt);
        if (this.state.events.length > 15)
            this.state.events.shift();
    }
    tick(deltaSeconds) {
        const now = Date.now();
        const p = this.state.player;
        if (this.shootCooldown > 0)
            this.shootCooldown -= deltaSeconds;
        if (p.invulnerableTimer > 0)
            p.invulnerableTimer -= deltaSeconds;
        if (p.powerupTimer > 0) {
            p.powerupTimer -= deltaSeconds;
            if (p.powerupTimer <= 0)
                p.powerup = 'none';
        }
        // Auto-fire or continuous fire
        this.firePlayerLaser();
        // Smooth ship movement
        p.x += (this.targetPlayerX - p.x) * Math.min(1, deltaSeconds * 16);
        // Wave Spawning
        if (this.state.enemies.length === 0) {
            this.waveSpawnTimer -= deltaSeconds;
            if (this.waveSpawnTimer <= 0) {
                this.waveSpawnTimer = 2.0;
                this.state.enemies = this.spawnWave(this.state.wave);
                this.pushEvent({
                    id: Math.random().toString(36),
                    type: 'wave_clear',
                    text: `🚀 WAVE ${this.state.wave} INCOMING!`,
                    x: this.state.arenaWidth / 2,
                    y: 60,
                    color: '#00e5ff',
                    timestamp: now
                });
            }
        }
        // 1. Move Player Lasers
        for (let l = this.state.lasers.length - 1; l >= 0; l--) {
            const laser = this.state.lasers[l];
            laser.x += laser.vx * deltaSeconds;
            laser.y += laser.vy * deltaSeconds;
            let hitEnemy = false;
            for (let eIdx = this.state.enemies.length - 1; eIdx >= 0; eIdx--) {
                const enemy = this.state.enemies[eIdx];
                const hitRadius = enemy.type === 'boss' ? 55 : 24;
                if (Math.hypot(laser.x - enemy.x, laser.y - enemy.y) < hitRadius) {
                    hitEnemy = true;
                    enemy.hp -= 1;
                    if (enemy.hp <= 0) {
                        p.score += enemy.scoreValue;
                        this.pushEvent({
                            id: Math.random().toString(36),
                            type: 'kill',
                            text: `💥 +${enemy.scoreValue}`,
                            x: enemy.x,
                            y: enemy.y,
                            color: '#ffe600',
                            timestamp: now
                        });
                        // Random powerup drop
                        if (Math.random() < 0.22 || enemy.type === 'boss') {
                            const types = ['spread', 'rapid', 'shield'];
                            this.state.powerups.push({
                                id: ++this.idCounter,
                                x: enemy.x,
                                y: enemy.y,
                                vy: 110,
                                type: types[Math.floor(Math.random() * types.length)]
                            });
                        }
                        this.state.enemies.splice(eIdx, 1);
                        // If wave cleared, advance wave
                        if (this.state.enemies.length === 0) {
                            this.state.wave += 1;
                            p.score += 200;
                            this.waveSpawnTimer = 1.5;
                        }
                    }
                    break;
                }
            }
            if (hitEnemy || laser.y < -20 || laser.x < 0 || laser.x > this.state.arenaWidth) {
                this.state.lasers.splice(l, 1);
            }
        }
        // 2. Move Enemies & Enemy AI Attacks
        for (const enemy of this.state.enemies) {
            enemy.phase += deltaSeconds * 2.5;
            enemy.x += enemy.vx * deltaSeconds;
            enemy.y += enemy.vy * deltaSeconds;
            // Wall bounce for formation
            if (enemy.x < 35 || enemy.x > this.state.arenaWidth - 35) {
                enemy.vx = -enemy.vx;
            }
            // Enemy Shooting
            enemy.shootCooldown -= deltaSeconds;
            if (enemy.shootCooldown <= 0 && enemy.y < this.state.arenaHeight - 140) {
                enemy.shootCooldown = enemy.type === 'boss' ? 0.9 : 2.5 + Math.random() * 2;
                if (enemy.type === 'boss') {
                    // Spread barrage
                    this.state.enemyBolts.push({ id: ++this.idCounter, x: enemy.x - 30, y: enemy.y + 35, vy: 260 }, { id: ++this.idCounter, x: enemy.x, y: enemy.y + 40, vy: 280 }, { id: ++this.idCounter, x: enemy.x + 30, y: enemy.y + 35, vy: 260 });
                }
                else {
                    this.state.enemyBolts.push({
                        id: ++this.idCounter,
                        x: enemy.x,
                        y: enemy.y + 16,
                        vy: 240
                    });
                }
            }
        }
        // 3. Move Enemy Plasma Bolts & Check Collision with Player
        for (let b = this.state.enemyBolts.length - 1; b >= 0; b--) {
            const bolt = this.state.enemyBolts[b];
            bolt.y += bolt.vy * deltaSeconds;
            // Player Collision Check
            if (p.lives > 0 && p.invulnerableTimer <= 0) {
                if (Math.hypot(bolt.x - p.x, bolt.y - p.y) < 22) {
                    this.state.enemyBolts.splice(b, 1);
                    if (p.powerup === 'shield') {
                        p.powerup = 'none';
                        p.invulnerableTimer = 1.0;
                        this.pushEvent({
                            id: Math.random().toString(36),
                            type: 'player_hit',
                            text: '🛡️ SHIELD BLOCKED LASER!',
                            x: p.x,
                            y: p.y,
                            color: '#10b981',
                            timestamp: now
                        });
                    }
                    else {
                        p.lives -= 1;
                        p.invulnerableTimer = 2.2;
                        this.pushEvent({
                            id: Math.random().toString(36),
                            type: 'player_hit',
                            text: `💥 SHIP DAMAGED! (${p.lives} LIVES)`,
                            x: p.x,
                            y: p.y,
                            color: '#ef4444',
                            timestamp: now
                        });
                    }
                    continue;
                }
            }
            if (bolt.y > this.state.arenaHeight + 20) {
                this.state.enemyBolts.splice(b, 1);
            }
        }
        // 4. Move Powerups & Player Pickup
        for (let u = this.state.powerups.length - 1; u >= 0; u--) {
            const pwr = this.state.powerups[u];
            pwr.y += pwr.vy * deltaSeconds;
            if (Math.hypot(pwr.x - p.x, pwr.y - p.y) < 28) {
                p.powerup = pwr.type;
                p.powerupTimer = 10.0;
                p.score += 50;
                const label = pwr.type === 'spread' ? '⚡ TRIPLE SPREAD CANNON!' : pwr.type === 'rapid' ? '🔥 HYPER RAPID FIRE!' : '🛡️ PLASMA SHIELD!';
                this.pushEvent({
                    id: Math.random().toString(36),
                    type: 'powerup',
                    text: label,
                    x: p.x,
                    y: p.y - 18,
                    color: '#ffe600',
                    timestamp: now
                });
                this.state.powerups.splice(u, 1);
                continue;
            }
            if (pwr.y > this.state.arenaHeight + 20) {
                this.state.powerups.splice(u, 1);
            }
        }
        if (typeof this.onStateUpdate === 'function') {
            this.onStateUpdate(this.state);
        }
    }
}
exports.GalaxyStrikeEngine = GalaxyStrikeEngine;
