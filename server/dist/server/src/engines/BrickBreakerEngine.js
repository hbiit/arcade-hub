"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BrickBreakerEngine = void 0;
const BaseGameEngine_1 = require("./BaseGameEngine");
const src_1 = require("../../../shared/src");
class BrickBreakerEngine extends BaseGameEngine_1.BaseGameEngine {
    nextId = 100;
    targetPaddleX = src_1.BRICK_BREAKER_CONFIG.ARENA_WIDTH / 2;
    speedFactor = 1.0;
    setDifficulty(difficulty) {
        super.setDifficulty(difficulty);
        if (difficulty === 'easy') {
            this.state.lives = 4;
            this.state.paddle.width = Math.round(src_1.BRICK_BREAKER_CONFIG.PADDLE_WIDTH * 1.25);
            this.speedFactor = 0.85;
        }
        else if (difficulty === 'hard') {
            this.state.lives = 2;
            this.state.paddle.width = Math.round(src_1.BRICK_BREAKER_CONFIG.PADDLE_WIDTH * 0.85);
            this.speedFactor = 1.2;
        }
        else {
            this.state.lives = 3;
            this.state.paddle.width = src_1.BRICK_BREAKER_CONFIG.PADDLE_WIDTH;
            this.speedFactor = 1.0;
        }
    }
    initializeState() {
        this.targetPaddleX = src_1.BRICK_BREAKER_CONFIG.ARENA_WIDTH / 2;
        const bricks = this.generateBrickLayout(1);
        const paddleY = src_1.BRICK_BREAKER_CONFIG.ARENA_HEIGHT - 45;
        const paddleX = src_1.BRICK_BREAKER_CONFIG.ARENA_WIDTH / 2;
        const balls = [
            {
                id: 1,
                x: paddleX,
                y: paddleY - src_1.BRICK_BREAKER_CONFIG.BALL_RADIUS - 2,
                vx: 220,
                vy: -280,
                radius: src_1.BRICK_BREAKER_CONFIG.BALL_RADIUS
            }
        ];
        return {
            arenaWidth: src_1.BRICK_BREAKER_CONFIG.ARENA_WIDTH,
            arenaHeight: src_1.BRICK_BREAKER_CONFIG.ARENA_HEIGHT,
            paddle: {
                x: paddleX,
                y: paddleY,
                width: src_1.BRICK_BREAKER_CONFIG.PADDLE_WIDTH,
                height: src_1.BRICK_BREAKER_CONFIG.PADDLE_HEIGHT,
                vx: 0,
                hasLaser: false,
                laserTimer: 0,
                hasShield: false
            },
            balls,
            bricks,
            powerups: [],
            lasers: [],
            score: 0,
            combo: 0,
            lives: src_1.BRICK_BREAKER_CONFIG.MAX_LIVES,
            level: 1,
            maxLevels: 3,
            ballAttached: true,
            events: []
        };
    }
    generateBrickLayout(level) {
        const bricks = [];
        const rows = 5;
        const cols = 9;
        const brickW = 74;
        const brickH = 24;
        const startX = (src_1.BRICK_BREAKER_CONFIG.ARENA_WIDTH - cols * (brickW + 8)) / 2;
        const startY = 70;
        const colors = ['#00e5ff', '#ff007f', '#a855f7', '#ffe600', '#10b981'];
        let count = 1;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                let type = 'normal';
                let hp = 1;
                if (r === 0 && c % 3 === 1) {
                    type = 'explosive';
                }
                else if (r === 1 && c % 4 === 2) {
                    type = 'multiball';
                }
                else if (r === 2 && (c === 0 || c === cols - 1)) {
                    type = 'laser';
                }
                else if (r === 3 && c % 3 === 0) {
                    type = 'armor';
                    hp = 2;
                }
                else if (r === 4 && c === Math.floor(cols / 2)) {
                    type = 'shield';
                }
                bricks.push({
                    id: count++,
                    x: startX + c * (brickW + 8),
                    y: startY + r * (brickH + 8),
                    width: brickW,
                    height: brickH,
                    hp,
                    maxHp: hp,
                    type,
                    color: type === 'explosive' ? '#ef4444' : type === 'multiball' ? '#ffe600' : type === 'laser' ? '#ff007f' : type === 'shield' ? '#10b981' : colors[r % colors.length]
                });
            }
        }
        return bricks;
    }
    onPlayerJoined(player) {
        // Single / co-op ready
    }
    onPlayerLeft(socketId) {
        // cleanup if needed
    }
    handleInput(socketId, input) {
        const p = this.state.paddle;
        if (input.targetX !== undefined && !isNaN(Number(input.targetX))) {
            this.targetPaddleX = Math.max(p.width / 2, Math.min(this.state.arenaWidth - p.width / 2, Number(input.targetX)));
        }
        else if (input.dx !== undefined) {
            const dx = Number(input.dx) || 0;
            this.targetPaddleX = Math.max(p.width / 2, Math.min(this.state.arenaWidth - p.width / 2, p.x + dx * 28));
        }
        // Launch attached ball or fire lasers
        if (input.dash || input.action === 'fire' || input.fire) {
            if (this.state.ballAttached && this.state.balls.length > 0) {
                this.state.ballAttached = false;
                const b = this.state.balls[0];
                b.vx = (Math.random() - 0.5) * 160;
                b.vy = -src_1.BRICK_BREAKER_CONFIG.BASE_BALL_SPEED;
                this.pushEvent({
                    id: Math.random().toString(36),
                    type: 'combo',
                    text: '🚀 LAUNCH!',
                    x: b.x,
                    y: b.y,
                    color: '#00e5ff',
                    timestamp: Date.now()
                });
            }
            else if (p.hasLaser) {
                // Fire twin lasers
                this.state.lasers.push({ id: ++this.nextId, x: p.x - p.width * 0.35, y: p.y - 10, vy: -600 }, { id: ++this.nextId, x: p.x + p.width * 0.35, y: p.y - 10, vy: -600 });
                this.pushEvent({
                    id: Math.random().toString(36),
                    type: 'laser_fire',
                    text: '⚡ LASER!',
                    x: p.x,
                    y: p.y,
                    color: '#ff007f',
                    timestamp: Date.now()
                });
            }
        }
    }
    pushEvent(evt) {
        this.state.events.push(evt);
        if (this.state.events.length > 15)
            this.state.events.shift();
    }
    tick(deltaSeconds) {
        const now = Date.now();
        const p = this.state.paddle;
        // Smooth paddle interpolation
        p.x += (this.targetPaddleX - p.x) * Math.min(1, deltaSeconds * 18);
        // Laser timer
        if (p.hasLaser) {
            p.laserTimer = Math.max(0, p.laserTimer - deltaSeconds);
            if (p.laserTimer <= 0)
                p.hasLaser = false;
        }
        // If ball is attached, keep it on paddle
        if (this.state.ballAttached && this.state.balls.length > 0) {
            this.state.balls[0].x = p.x;
            this.state.balls[0].y = p.y - src_1.BRICK_BREAKER_CONFIG.BALL_RADIUS - 4;
            this.state.balls[0].vx = 0;
            this.state.balls[0].vy = 0;
        }
        // 1. Move and update Lasers
        for (let l = this.state.lasers.length - 1; l >= 0; l--) {
            const laser = this.state.lasers[l];
            laser.y += laser.vy * deltaSeconds;
            // Laser vs Bricks collision
            let laserDestroyed = false;
            for (let bIdx = this.state.bricks.length - 1; bIdx >= 0; bIdx--) {
                const brick = this.state.bricks[bIdx];
                if (laser.x >= brick.x &&
                    laser.x <= brick.x + brick.width &&
                    laser.y >= brick.y &&
                    laser.y <= brick.y + brick.height) {
                    laserDestroyed = true;
                    this.damageBrick(bIdx, now);
                    break;
                }
            }
            if (laserDestroyed || laser.y < 0) {
                this.state.lasers.splice(l, 1);
            }
        }
        // 2. Move and update Powerup Drops
        for (let u = this.state.powerups.length - 1; u >= 0; u--) {
            const pwr = this.state.powerups[u];
            pwr.y += pwr.vy * deltaSeconds;
            // Caught by paddle?
            if (pwr.y >= p.y - p.height / 2 &&
                pwr.y <= p.y + p.height / 2 &&
                pwr.x >= p.x - p.width / 2 - 8 &&
                pwr.x <= p.x + p.width / 2 + 8) {
                this.collectPowerup(pwr.type, now);
                this.state.powerups.splice(u, 1);
                continue;
            }
            // Dropped past floor
            if (pwr.y > this.state.arenaHeight + 20) {
                this.state.powerups.splice(u, 1);
            }
        }
        // 3. Move and update Balls
        if (!this.state.ballAttached) {
            for (let i = this.state.balls.length - 1; i >= 0; i--) {
                const ball = this.state.balls[i];
                ball.x += ball.vx * deltaSeconds;
                ball.y += ball.vy * deltaSeconds;
                // Bounce Left / Right walls
                if (ball.x <= ball.radius + 6) {
                    ball.x = ball.radius + 6;
                    ball.vx = Math.abs(ball.vx);
                }
                else if (ball.x >= this.state.arenaWidth - ball.radius - 6) {
                    ball.x = this.state.arenaWidth - ball.radius - 6;
                    ball.vx = -Math.abs(ball.vx);
                }
                // Bounce Top wall
                if (ball.y <= ball.radius + 6) {
                    ball.y = ball.radius + 6;
                    ball.vy = Math.abs(ball.vy);
                }
                // Paddle Collision with Angular Deflection
                const paddleTop = p.y - p.height / 2;
                if (ball.y + ball.radius >= paddleTop &&
                    ball.y - ball.radius <= paddleTop + 14 &&
                    ball.x >= p.x - p.width / 2 - ball.radius &&
                    ball.x <= p.x + p.width / 2 + ball.radius &&
                    ball.vy > 0) {
                    ball.y = paddleTop - ball.radius;
                    // Angular deflection based on hit location (-1 on far left, +1 on far right)
                    const hitFactor = Math.max(-0.9, Math.min(0.9, (ball.x - p.x) / (p.width / 2)));
                    const speed = Math.max(src_1.BRICK_BREAKER_CONFIG.BASE_BALL_SPEED, Math.hypot(ball.vx, ball.vy) * 1.01);
                    const maxAngle = (Math.PI / 180) * 65; // up to 65 degrees deflection
                    const angle = hitFactor * maxAngle;
                    ball.vx = Math.sin(angle) * speed;
                    ball.vy = -Math.cos(angle) * speed;
                    this.state.combo = 0; // reset brick combo on paddle hit
                    this.pushEvent({
                        id: Math.random().toString(36),
                        type: 'brick_hit',
                        text: '🏓 DEFLECT!',
                        x: ball.x,
                        y: ball.y,
                        color: '#00e5ff',
                        timestamp: now
                    });
                }
                // Brick Collision Check
                for (let bIdx = this.state.bricks.length - 1; bIdx >= 0; bIdx--) {
                    const brick = this.state.bricks[bIdx];
                    // AABB vs Circle
                    const closestX = Math.max(brick.x, Math.min(ball.x, brick.x + brick.width));
                    const closestY = Math.max(brick.y, Math.min(ball.y, brick.y + brick.height));
                    const dist = Math.hypot(ball.x - closestX, ball.y - closestY);
                    if (dist <= ball.radius) {
                        // Collision normal
                        const dx = ball.x - (brick.x + brick.width / 2);
                        const dy = ball.y - (brick.y + brick.height / 2);
                        if (Math.abs(dx / brick.width) > Math.abs(dy / brick.height)) {
                            ball.vx = -ball.vx;
                        }
                        else {
                            ball.vy = -ball.vy;
                        }
                        this.damageBrick(bIdx, now);
                        break;
                    }
                }
                // Bottom Wall / Pit Check
                if (ball.y >= this.state.arenaHeight + 20) {
                    if (p.hasShield) {
                        // Save with shield
                        p.hasShield = false;
                        ball.y = this.state.arenaHeight - 20;
                        ball.vy = -Math.abs(ball.vy);
                        this.pushEvent({
                            id: Math.random().toString(36),
                            type: 'combo',
                            text: '🛡️ SHIELD SAVED BALL!',
                            x: ball.x,
                            y: ball.y,
                            color: '#10b981',
                            timestamp: now
                        });
                    }
                    else {
                        // Remove lost ball
                        this.state.balls.splice(i, 1);
                    }
                }
            }
            // Check if all balls were lost
            if (this.state.balls.length === 0) {
                this.state.lives -= 1;
                this.state.combo = 0;
                if (this.state.lives > 0) {
                    this.state.ballAttached = true;
                    this.state.balls.push({
                        id: ++this.nextId,
                        x: p.x,
                        y: p.y - src_1.BRICK_BREAKER_CONFIG.BALL_RADIUS - 4,
                        vx: 0,
                        vy: 0,
                        radius: src_1.BRICK_BREAKER_CONFIG.BALL_RADIUS
                    });
                    this.pushEvent({
                        id: Math.random().toString(36),
                        type: 'life_lost',
                        text: `💔 LIFE LOST! (${this.state.lives} remaining)`,
                        x: p.x,
                        y: p.y,
                        color: '#ef4444',
                        timestamp: now
                    });
                }
                else {
                    this.state.isGameOver = true;
                    this.state.isVictory = false;
                    this.pushEvent({
                        id: Math.random().toString(36),
                        type: 'life_lost',
                        text: '💀 GAME OVER! OUT OF LIVES',
                        x: p.x,
                        y: p.y,
                        color: '#ef4444',
                        timestamp: now
                    });
                }
            }
        }
        // Level Clear Check
        if (this.state.bricks.length === 0 && !this.state.isGameOver) {
            if (this.state.level >= this.state.maxLevels) {
                this.state.isGameOver = true;
                this.state.isVictory = true;
                this.state.score += 1000;
                this.pushEvent({
                    id: Math.random().toString(36),
                    type: 'combo',
                    text: '🏆 ALL LEVELS CLEARED! GRAND VICTORY! +1000',
                    x: this.state.arenaWidth / 2,
                    y: this.state.arenaHeight / 2,
                    color: '#ffe600',
                    timestamp: now
                });
            }
            else {
                this.state.level += 1;
                this.state.score += 250;
                this.state.bricks = this.generateBrickLayout(this.state.level);
                this.state.ballAttached = true;
                this.state.balls = [
                    {
                        id: ++this.nextId,
                        x: p.x,
                        y: p.y - src_1.BRICK_BREAKER_CONFIG.BALL_RADIUS - 4,
                        vx: 0,
                        vy: 0,
                        radius: src_1.BRICK_BREAKER_CONFIG.BALL_RADIUS
                    }
                ];
                this.pushEvent({
                    id: Math.random().toString(36),
                    type: 'combo',
                    text: `🌟 LEVEL ${this.state.level} INITIATED! +250`,
                    x: this.state.arenaWidth / 2,
                    y: this.state.arenaHeight / 2,
                    color: '#00e5ff',
                    timestamp: now
                });
            }
        }
        if (typeof this.onStateUpdate === 'function') {
            this.onStateUpdate(this.state);
        }
    }
    damageBrick(brickIdx, now) {
        const brick = this.state.bricks[brickIdx];
        brick.hp -= 1;
        if (brick.hp <= 0) {
            this.state.combo += 1;
            const points = 10 * this.state.combo;
            this.state.score += points;
            const comboText = this.state.combo > 1 ? `💥 +${points} (x${this.state.combo} COMBO!)` : `+${points}`;
            this.pushEvent({
                id: Math.random().toString(36),
                type: 'brick_destroyed',
                text: comboText,
                x: brick.x + brick.width / 2,
                y: brick.y + brick.height / 2,
                color: brick.color,
                timestamp: now
            });
            // Special powerup spawn or explosive blast
            if (brick.type === 'explosive') {
                this.explodeAdjacentBricks(brick.x + brick.width / 2, brick.y + brick.height / 2, now);
            }
            else if (brick.type === 'multiball' || brick.type === 'laser' || brick.type === 'shield') {
                this.state.powerups.push({
                    id: ++this.nextId,
                    x: brick.x + brick.width / 2,
                    y: brick.y + brick.height / 2,
                    vy: 140,
                    type: brick.type
                });
            }
            this.state.bricks.splice(brickIdx, 1);
        }
        else {
            this.pushEvent({
                id: Math.random().toString(36),
                type: 'brick_hit',
                text: '🛡️ CRACK!',
                x: brick.x + brick.width / 2,
                y: brick.y + brick.height / 2,
                color: '#94a3b8',
                timestamp: now
            });
        }
    }
    explodeAdjacentBricks(centerX, centerY, now) {
        for (let i = this.state.bricks.length - 1; i >= 0; i--) {
            const b = this.state.bricks[i];
            const d = Math.hypot(b.x + b.width / 2 - centerX, b.y + b.height / 2 - centerY);
            if (d < 95) {
                this.state.score += 25;
                this.state.bricks.splice(i, 1);
            }
        }
        this.pushEvent({
            id: Math.random().toString(36),
            type: 'combo',
            text: '💥 EXPLOSIVE CHAIN REACTION! +50',
            x: centerX,
            y: centerY,
            color: '#ef4444',
            timestamp: now
        });
    }
    collectPowerup(type, now) {
        const p = this.state.paddle;
        if (type === 'multiball') {
            // Split each existing ball into 3 balls
            const newBalls = [];
            for (const b of this.state.balls) {
                newBalls.push({ id: ++this.nextId, x: b.x, y: b.y, vx: b.vx * 0.8 - 120, vy: b.vy * 0.8, radius: b.radius }, { id: ++this.nextId, x: b.x, y: b.y, vx: b.vx * 0.8 + 120, vy: b.vy * 0.8, radius: b.radius });
            }
            this.state.balls.push(...newBalls.slice(0, 4));
            this.pushEvent({
                id: Math.random().toString(36),
                type: 'powerup_collect',
                text: '⚡ MULTI-BALL UNLEASHED!',
                x: p.x,
                y: p.y - 20,
                color: '#ffe600',
                timestamp: now
            });
        }
        else if (type === 'laser') {
            p.hasLaser = true;
            p.laserTimer = 9.0;
            this.pushEvent({
                id: Math.random().toString(36),
                type: 'powerup_collect',
                text: '🔥 DUAL LASER CANNONS [Space/Click]!',
                x: p.x,
                y: p.y - 20,
                color: '#ff007f',
                timestamp: now
            });
        }
        else if (type === 'shield') {
            p.hasShield = true;
            this.pushEvent({
                id: Math.random().toString(36),
                type: 'powerup_collect',
                text: '🛡️ ENERGY SHIELD DEPLOYED!',
                x: p.x,
                y: p.y - 20,
                color: '#10b981',
                timestamp: now
            });
        }
    }
}
exports.BrickBreakerEngine = BrickBreakerEngine;
