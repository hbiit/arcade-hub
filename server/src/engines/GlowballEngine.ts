import { BaseGameEngine } from './BaseGameEngine';
import { GLOWBALL_CONFIG, PlayerInputPayload, PlayerSession } from '../../../shared/src';

export interface GlowballOrb {
  id: number;
  x: number;
  y: number;
  value: number;
  type: 'standard' | 'super' | 'hyper';
}

export interface GlowballHazard {
  id: number;
  x: number;
  y: number;
  radius: number;
}

export interface GlowballPlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  dashTimer: number;
  dashCooldown: number;
  score: number;
  color: string;
  name: string;
  isBot?: boolean;
  stunTimer?: number;
}

export interface GlowballEvent {
  id: string;
  type: 'orb' | 'super_orb' | 'steal' | 'hazard' | 'dash';
  text: string;
  x: number;
  y: number;
  color?: string;
  timestamp: number;
}

export interface GlowballState {
  arenaWidth: number;
  arenaHeight: number;
  orbs: GlowballOrb[];
  hazards: GlowballHazard[];
  players: Record<string, GlowballPlayerState>;
  events: GlowballEvent[];
}

interface BotProfile {
  id: string;
  name: string;
  color: string;
}

const DEFAULT_BOTS: BotProfile[] = [
  { id: 'bot_neon', name: '⚡ Neon-Racer', color: '#00e5ff' },
  { id: 'bot_turbo', name: '🔥 Turbo-Glider', color: '#f43f5e' },
  { id: 'bot_phantom', name: '💎 Pulse-Phantom', color: '#8b5cf6' }
];

export class GlowballEngine extends BaseGameEngine<GlowballState> {
  private orbIdCounter = 100;
  private botsSpawned = false;
  private lastStealTime = new Map<string, number>();

  initializeState(): GlowballState {
    const orbs: GlowballOrb[] = [];
    for (let i = 0; i < GLOWBALL_CONFIG.MAX_ORBS; i++) {
      const isSuper = i % 4 === 0;
      orbs.push({
        id: i,
        x: Math.random() * (GLOWBALL_CONFIG.ARENA_WIDTH - 120) + 60,
        y: Math.random() * (GLOWBALL_CONFIG.ARENA_HEIGHT - 120) + 60,
        value: isSuper ? 30 : 10,
        type: isSuper ? 'super' : 'standard'
      });
    }

    // Spawn 2 moving/static hazard EMP mines
    const hazards: GlowballHazard[] = [
      { id: 1, x: GLOWBALL_CONFIG.ARENA_WIDTH * 0.35, y: GLOWBALL_CONFIG.ARENA_HEIGHT * 0.5, radius: 22 },
      { id: 2, x: GLOWBALL_CONFIG.ARENA_WIDTH * 0.65, y: GLOWBALL_CONFIG.ARENA_HEIGHT * 0.5, radius: 22 }
    ];

    this.botsSpawned = false;
    if (this.lastStealTime) {
      this.lastStealTime.clear();
    } else {
      this.lastStealTime = new Map();
    }

    return {
      arenaWidth: GLOWBALL_CONFIG.ARENA_WIDTH,
      arenaHeight: GLOWBALL_CONFIG.ARENA_HEIGHT,
      orbs,
      hazards,
      players: {},
      events: []
    };
  }

  private spawnBotsIfNeeded() {
    if (this.botsSpawned) return;
    this.botsSpawned = true;

    for (const bot of DEFAULT_BOTS) {
      if (!this.state.players[bot.id]) {
        this.state.players[bot.id] = {
          x: Math.random() * (this.state.arenaWidth - 160) + 80,
          y: Math.random() * (this.state.arenaHeight - 160) + 80,
          vx: 0,
          vy: 0,
          dashTimer: 0,
          dashCooldown: 3 + Math.random() * 2,
          score: 0,
          color: bot.color,
          name: bot.name,
          isBot: true,
          stunTimer: 0
        };
      }
    }
  }

  onPlayerJoined(player: PlayerSession): void {
    this.state.players[player.socketId] = {
      x: Math.random() * 700 + 100,
      y: Math.random() * 450 + 100,
      vx: 0,
      vy: 0,
      dashTimer: 0,
      dashCooldown: 0,
      score: 0,
      color: player.profile.favoriteColor || '#00e5ff',
      name: player.profile.displayName,
      isBot: false,
      stunTimer: 0
    };

    this.spawnBotsIfNeeded();
  }

  onPlayerLeft(socketId: string): void {
    delete this.state.players[socketId];
  }

  handleInput(socketId: string, input: PlayerInputPayload): void {
    const p = this.state.players[socketId];
    if (!p || (p.stunTimer || 0) > 0) return;

    if (input.dash && p.dashCooldown <= 0) {
      p.dashTimer = GLOWBALL_CONFIG.DASH_DURATION_SEC;
      p.dashCooldown = GLOWBALL_CONFIG.DASH_COOLDOWN_SEC;
      this.pushEvent({
        id: Math.random().toString(36),
        type: 'dash',
        text: '⚡ SUPER DASH!',
        x: p.x,
        y: p.y,
        color: p.color,
        timestamp: Date.now()
      });
    }

    const dx = Math.max(-1, Math.min(1, Number(input.dx) || 0));
    const dy = Math.max(-1, Math.min(1, Number(input.dy) || 0));
    const mult = p.dashTimer > 0 ? GLOWBALL_CONFIG.DASH_MULTIPLIER : 1;
    p.vx = dx * GLOWBALL_CONFIG.BASE_SPEED * mult;
    p.vy = dy * GLOWBALL_CONFIG.BASE_SPEED * mult;
  }

  private pushEvent(evt: GlowballEvent) {
    this.state.events.push(evt);
    if (this.state.events.length > 12) {
      this.state.events.shift();
    }
  }

  private updateBots(deltaSeconds: number) {
    const entries = Object.entries(this.state.players);

    for (const [id, bot] of entries) {
      if (!bot.isBot || (bot.stunTimer || 0) > 0) continue;

      if (bot.dashTimer > 0) bot.dashTimer -= deltaSeconds;
      if (bot.dashCooldown > 0) bot.dashCooldown -= deltaSeconds;

      // Find closest high-value orb
      let targetX = this.state.arenaWidth / 2;
      let targetY = this.state.arenaHeight / 2;
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

      // Avoid hazards
      for (const h of this.state.hazards) {
        const d = Math.hypot(bot.x - h.x, bot.y - h.y);
        if (d < 100) {
          targetX += (bot.x - h.x) * 2;
          targetY += (bot.y - h.y) * 2;
        }
      }

      // Occasional bot dash if far from target or near high-value orb
      if (bot.dashCooldown <= 0 && Math.hypot(bot.x - targetX, bot.y - targetY) > 200) {
        bot.dashTimer = GLOWBALL_CONFIG.DASH_DURATION_SEC;
        bot.dashCooldown = GLOWBALL_CONFIG.DASH_COOLDOWN_SEC + Math.random() * 2;
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
      const mult = bot.dashTimer > 0 ? GLOWBALL_CONFIG.DASH_MULTIPLIER : 1;
      bot.vx = Math.cos(angle) * GLOWBALL_CONFIG.BASE_SPEED * mult;
      bot.vy = Math.sin(angle) * GLOWBALL_CONFIG.BASE_SPEED * mult;
    }
  }

  tick(deltaSeconds: number): void {
    const now = Date.now();
    this.spawnBotsIfNeeded();
    this.updateBots(deltaSeconds);

    const entries = Object.entries(this.state.players);

    for (const [id, p] of entries) {
      if ((p.stunTimer || 0) > 0) {
        p.stunTimer = Math.max(0, (p.stunTimer || 0) - deltaSeconds);
        p.vx = 0;
        p.vy = 0;
        continue;
      }

      if (p.dashTimer > 0) p.dashTimer = Math.max(0, p.dashTimer - deltaSeconds);
      if (p.dashCooldown > 0) p.dashCooldown = Math.max(0, p.dashCooldown - deltaSeconds);

      p.x = Math.max(24, Math.min(this.state.arenaWidth - 24, p.x + p.vx * deltaSeconds));
      p.y = Math.max(24, Math.min(this.state.arenaHeight - 24, p.y + p.vy * deltaSeconds));

      // Hazard EMP collision check
      for (const h of this.state.hazards) {
        if (Math.hypot(p.x - h.x, p.y - h.y) < h.radius + 16) {
          p.stunTimer = 1.6;
          p.score = Math.max(0, p.score - 15);
          const session = this.players.get(id);
          if (session) session.score = p.score;

          // Knockback
          const angle = Math.atan2(p.y - h.y, p.x - h.x);
          p.x += Math.cos(angle) * 35;
          p.y += Math.sin(angle) * 35;

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
        if (Math.hypot(p.x - orb.x, p.y - orb.y) < 28) {
          p.score += orb.value;
          const session = this.players.get(id);
          if (session) session.score = p.score;

          this.pushEvent({
            id: Math.random().toString(36),
            type: orb.type === 'super' ? 'super_orb' : 'orb',
            text: orb.type === 'super' ? `🌟 +${orb.value} SUPER ORB!` : `+${orb.value}`,
            x: orb.x,
            y: orb.y,
            color: orb.type === 'super' ? '#ffe600' : '#00e5ff',
            timestamp: now
          });

          // Respawn orb
          orb.x = Math.random() * (this.state.arenaWidth - 120) + 60;
          orb.y = Math.random() * (this.state.arenaHeight - 120) + 60;
          orb.type = Math.random() < 0.25 ? 'super' : 'standard';
          orb.value = orb.type === 'super' ? 30 : 10;
        }
      }
    }

    // High-Speed Dash Collision Steal
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [idA, pA] = entries[i];
        const [idB, pB] = entries[j];
        const dist = Math.hypot(pA.x - pB.x, pA.y - pB.y);

        if (dist < 34) {
          const pairKey = [idA, idB].sort().join(':');
          if (now - (this.lastStealTime.get(pairKey) || 0) >= 1200) {
            this.lastStealTime.set(pairKey, now);

            const isADashing = pA.dashTimer > 0;
            const isBDashing = pB.dashTimer > 0;

            if (isADashing || isBDashing) {
              const [attacker, defender, attId, defId] = isADashing ? [pA, pB, idA, idB] : [pB, pA, idB, idA];
              const stealAmount = Math.min(20, defender.score);
              defender.score -= stealAmount;
              attacker.score += stealAmount;

              const sessionDef = this.players.get(defId);
              if (sessionDef) sessionDef.score = defender.score;
              const sessionAtt = this.players.get(attId);
              if (sessionAtt) sessionAtt.score = attacker.score;

              this.pushEvent({
                id: Math.random().toString(36),
                type: 'steal',
                text: `⚡ DASH STEAL! ${attacker.name} stole ${stealAmount} pts!`,
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

    this.onStateUpdate(this.state);
  }
}
