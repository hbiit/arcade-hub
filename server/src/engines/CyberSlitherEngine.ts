import { BaseGameEngine } from './BaseGameEngine';
import { CYBER_SLITHER_CONFIG, PlayerInputPayload, PlayerSession } from '../../../shared/src';

export interface SnakeSegment {
  x: number;
  y: number;
}

export interface SlitherPellet {
  id: number;
  x: number;
  y: number;
  value: number;
  color: string;
}

export interface SnakeEntity {
  id: string;
  name: string;
  color: string;
  segments: SnakeSegment[];
  angle: number;
  targetAngle: number;
  speed: number;
  score: number;
  isBoosting: boolean;
  isDead: boolean;
  respawnTimer: number;
  isBot: boolean;
  kills: number;
}

export interface SlitherEvent {
  id: string;
  type: 'eat' | 'kill' | 'crash' | 'boost';
  text: string;
  x: number;
  y: number;
  color?: string;
  timestamp: number;
}

export interface CyberSlitherState {
  arenaWidth: number;
  arenaHeight: number;
  snakes: Record<string, SnakeEntity>;
  pellets: SlitherPellet[];
  events: SlitherEvent[];
}

const DEFAULT_SLITHER_BOTS = [
  { id: 'bot_viper', name: '🐍 Viper-9', color: '#f43f5e' },
  { id: 'bot_cobra', name: '⚡ Neon-Cobra', color: '#ffe600' },
  { id: 'bot_python', name: '💎 Quantum-Python', color: '#a855f7' }
];

export class CyberSlitherEngine extends BaseGameEngine<CyberSlitherState> {
  private pelletIdCounter = 1;
  private botsSpawned = false;

  initializeState(): CyberSlitherState {
    const pellets: SlitherPellet[] = [];
    const colors = ['#00e5ff', '#ffe600', '#f43f5e', '#10b981', '#a855f7'];

    for (let i = 0; i < 65; i++) {
      pellets.push({
        id: this.pelletIdCounter++,
        x: Math.random() * (CYBER_SLITHER_CONFIG.ARENA_WIDTH - 80) + 40,
        y: Math.random() * (CYBER_SLITHER_CONFIG.ARENA_HEIGHT - 80) + 40,
        value: 1,
        color: colors[i % colors.length]
      });
    }

    this.botsSpawned = false;

    return {
      arenaWidth: CYBER_SLITHER_CONFIG.ARENA_WIDTH,
      arenaHeight: CYBER_SLITHER_CONFIG.ARENA_HEIGHT,
      snakes: {},
      pellets,
      events: []
    };
  }

  private createSnakeSegments(startX: number, startY: number, angle: number, count: number): SnakeSegment[] {
    const segs: SnakeSegment[] = [];
    for (let i = 0; i < count; i++) {
      segs.push({
        x: startX - Math.cos(angle) * i * 10,
        y: startY - Math.sin(angle) * i * 10
      });
    }
    return segs;
  }

  private spawnBotsIfNeeded() {
    if (this.botsSpawned) return;
    this.botsSpawned = true;

    for (const bot of DEFAULT_SLITHER_BOTS) {
      if (!this.state.snakes[bot.id]) {
        const angle = Math.random() * Math.PI * 2;
        const x = Math.random() * (this.state.arenaWidth - 250) + 125;
        const y = Math.random() * (this.state.arenaHeight - 250) + 125;
        this.state.snakes[bot.id] = {
          id: bot.id,
          name: bot.name,
          color: bot.color,
          segments: this.createSnakeSegments(x, y, angle, CYBER_SLITHER_CONFIG.STARTING_SEGMENTS),
          angle,
          targetAngle: angle,
          speed: CYBER_SLITHER_CONFIG.BASE_SPEED,
          score: 0,
          isBoosting: false,
          isDead: false,
          respawnTimer: 0,
          isBot: true,
          kills: 0
        };
      }
    }
  }

  onPlayerJoined(player: PlayerSession): void {
    const socketId = player.socketId || 'local_player';
    const angle = 0;
    const x = this.state.arenaWidth / 2;
    const y = this.state.arenaHeight / 2;

    this.state.snakes[socketId] = {
      id: socketId,
      name: player.profile.displayName,
      color: player.profile.favoriteColor || '#00e5ff',
      segments: this.createSnakeSegments(x, y, angle, CYBER_SLITHER_CONFIG.STARTING_SEGMENTS),
      angle,
      targetAngle: angle,
      speed: CYBER_SLITHER_CONFIG.BASE_SPEED,
      score: 0,
      isBoosting: false,
      isDead: false,
      respawnTimer: 0,
      isBot: false,
      kills: 0
    };

    this.spawnBotsIfNeeded();
  }

  onPlayerLeft(socketId: string): void {
    delete this.state.snakes[socketId];
  }

  handleInput(socketId: string, input: PlayerInputPayload): void {
    const snake = this.state.snakes[socketId];
    if (!snake || snake.isDead) return;

    if (input.targetX !== undefined && input.targetY !== undefined && snake.segments.length > 0) {
      const head = snake.segments[0];
      snake.targetAngle = Math.atan2(Number(input.targetY) - head.y, Number(input.targetX) - head.x);
    } else if (input.dx !== undefined || input.dy !== undefined) {
      const dx = Number(input.dx) || 0;
      const dy = Number(input.dy) || 0;
      if (Math.hypot(dx, dy) > 0.1) {
        snake.targetAngle = Math.atan2(dy, dx);
      }
    }

    snake.isBoosting = !!(input.dash || (input as any).boost);
  }

  private pushEvent(evt: SlitherEvent) {
    this.state.events.push(evt);
    if (this.state.events.length > 15) this.state.events.shift();
  }

  private updateBots(deltaSeconds: number) {
    const snakes = Object.values(this.state.snakes);

    for (const bot of snakes) {
      if (!bot.isBot || bot.isDead || bot.segments.length === 0) continue;

      const head = bot.segments[0];

      // Find nearest pellet
      let bestDist = Infinity;
      let targetX = this.state.arenaWidth / 2;
      let targetY = this.state.arenaHeight / 2;

      for (const p of this.state.pellets) {
        const d = Math.hypot(p.x - head.x, p.y - head.y);
        if (d < bestDist) {
          bestDist = d;
          targetX = p.x;
          targetY = p.y;
        }
      }

      // Avoid walls
      const margin = 70;
      if (head.x < margin) targetX = head.x + 150;
      else if (head.x > this.state.arenaWidth - margin) targetX = head.x - 150;
      if (head.y < margin) targetY = head.y + 150;
      else if (head.y > this.state.arenaHeight - margin) targetY = head.y - 150;

      // Avoid other snakes' bodies
      for (const other of snakes) {
        if (other.id === bot.id || other.isDead) continue;
        for (let i = 0; i < other.segments.length; i += 2) {
          const seg = other.segments[i];
          const d = Math.hypot(seg.x - head.x, seg.y - head.y);
          if (d < 45) {
            targetX += (head.x - seg.x) * 3;
            targetY += (head.y - seg.y) * 3;
          }
        }
      }

      bot.targetAngle = Math.atan2(targetY - head.y, targetX - head.x);

      // Random smart boost if hunting
      bot.isBoosting = bestDist < 120 && bot.segments.length > 8 && Math.random() < 0.15;
    }
  }

  tick(deltaSeconds: number): void {
    const now = Date.now();
    this.spawnBotsIfNeeded();
    this.updateBots(deltaSeconds);

    const snakes = Object.values(this.state.snakes);

    for (const snake of snakes) {
      if (snake.isDead) {
        snake.respawnTimer -= deltaSeconds;
        if (snake.respawnTimer <= 0) {
          snake.isDead = false;
          const x = Math.random() * (this.state.arenaWidth - 250) + 125;
          const y = Math.random() * (this.state.arenaHeight - 250) + 125;
          snake.segments = this.createSnakeSegments(x, y, 0, CYBER_SLITHER_CONFIG.STARTING_SEGMENTS);
          snake.score = 0;
          this.pushEvent({
            id: Math.random().toString(36),
            type: 'boost',
            text: `✨ ${snake.name} Respawned!`,
            x,
            y,
            color: snake.color,
            timestamp: now
          });
        }
        continue;
      }

      if (snake.segments.length === 0) continue;

      // Smooth turning angle towards targetAngle
      let diff = snake.targetAngle - snake.angle;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      const turnRate = 5.5; // rad/s
      snake.angle += Math.max(-turnRate * deltaSeconds, Math.min(turnRate * deltaSeconds, diff));

      // Speed & Boost Consumption
      const speed = snake.isBoosting && snake.segments.length > 6
        ? CYBER_SLITHER_CONFIG.BOOST_SPEED
        : CYBER_SLITHER_CONFIG.BASE_SPEED;

      if (snake.isBoosting && snake.segments.length > 6 && Math.random() < 0.12) {
        // Drop a tiny pellet behind tail when boosting
        const tail = snake.segments[snake.segments.length - 1];
        this.state.pellets.push({
          id: this.pelletIdCounter++,
          x: tail.x,
          y: tail.y,
          value: 1,
          color: snake.color
        });
        snake.segments.pop();
      }

      // Move Head
      const head = snake.segments[0];
      const newHeadX = head.x + Math.cos(snake.angle) * speed * deltaSeconds;
      const newHeadY = head.y + Math.sin(snake.angle) * speed * deltaSeconds;

      // Wall boundaries (bounce or wrap)
      const clampedX = Math.max(12, Math.min(this.state.arenaWidth - 12, newHeadX));
      const clampedY = Math.max(12, Math.min(this.state.arenaHeight - 12, newHeadY));

      snake.segments.unshift({ x: clampedX, y: clampedY });
      snake.segments.pop();

      // Pellet Collection Check
      for (let pIdx = this.state.pellets.length - 1; pIdx >= 0; pIdx--) {
        const pellet = this.state.pellets[pIdx];
        if (Math.hypot(clampedX - pellet.x, clampedY - pellet.y) < 16) {
          snake.score += pellet.value * 10;
          this.state.pellets.splice(pIdx, 1);

          // Grow snake
          const tail = snake.segments[snake.segments.length - 1];
          snake.segments.push({ x: tail.x, y: tail.y });

          // Respawn replacement pellet
          this.state.pellets.push({
            id: this.pelletIdCounter++,
            x: Math.random() * (this.state.arenaWidth - 80) + 40,
            y: Math.random() * (this.state.arenaHeight - 80) + 40,
            value: 1,
            color: pellet.color
          });
        }
      }
    }

    // Snake vs Snake Body Collision Check
    for (const snake of snakes) {
      if (snake.isDead || snake.segments.length === 0) continue;
      const head = snake.segments[0];

      for (const other of snakes) {
        if (other.isDead) continue;
        const startIndex = other.id === snake.id ? 5 : 0; // self collision check only past segment 5

        for (let i = startIndex; i < other.segments.length; i++) {
          const seg = other.segments[i];
          if (Math.hypot(head.x - seg.x, head.y - seg.y) < 14) {
            // CRASH!
            snake.isDead = true;
            snake.respawnTimer = 3.5;

            if (other.id !== snake.id) {
              other.kills += 1;
              other.score += 150;
            }

            // Explode snake body into delicious energy pellets!
            for (let s = 0; s < snake.segments.length; s += 2) {
              this.state.pellets.push({
                id: this.pelletIdCounter++,
                x: snake.segments[s].x,
                y: snake.segments[s].y,
                value: 3,
                color: snake.color
              });
            }

            this.pushEvent({
              id: Math.random().toString(36),
              type: 'crash',
              text: `💥 ${snake.name} CRASHED into ${other.name}!`,
              x: head.x,
              y: head.y,
              color: '#ef4444',
              timestamp: now
            });
            break;
          }
        }
        if (snake.isDead) break;
      }
    }

    if (typeof this.onStateUpdate === 'function') {
      this.onStateUpdate(this.state);
    }
  }
}
