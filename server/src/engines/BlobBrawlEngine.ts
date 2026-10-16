import { BaseGameEngine } from './BaseGameEngine';
import { BLOB_BRAWL_CONFIG, CollectibleItem, PlayerInputPayload, PlayerSession } from '../../../shared/src';

export interface PowerupItem {
  id: number;
  type: 'speed' | 'magnet' | 'shield';
  x: number;
  y: number;
}

export interface GameEvent {
  id: string;
  type: 'coin' | 'bump' | 'knockout' | 'powerup' | 'dash' | 'combo';
  text: string;
  x: number;
  y: number;
  color?: string;
  timestamp: number;
}

export interface BlobEntityState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  coinsCarried: number;
  bumpsReceived: number;
  isKnockedOut: boolean;
  respawnTimer: number;
  speedMultiplier: number;
  color: string;
  name: string;
  isBot?: boolean;
  dashCooldown?: number;
  dashTimer?: number;
  activePowerup?: 'speed' | 'magnet' | 'shield' | null;
  powerupTimer?: number;
  targetDx?: number;
  targetDy?: number;
  comboStreak?: number;
  lastCoinTime?: number;
}

export interface BlobBrawlState {
  arenaWidth: number;
  arenaHeight: number;
  players: Record<string, BlobEntityState>;
  coins: CollectibleItem[];
  powerups: PowerupItem[];
  events: GameEvent[];
  megaCoin?: CollectibleItem;
}

interface BotProfile {
  id: string;
  name: string;
  color: string;
  aggression: number; // 0 to 1
  level: number;
}

const DEFAULT_BOTS: BotProfile[] = [
  { id: 'bot_sparky', name: '⚡ Sparky', color: '#f59e0b', aggression: 0.35, level: 3 },
  { id: 'bot_brawler', name: '🔥 Brawler-Bot', color: '#ef4444', aggression: 0.85, level: 5 },
  { id: 'bot_glitch', name: '💀 Shadow-Glitch', color: '#a855f7', aggression: 0.65, level: 4 }
];

export class BlobBrawlEngine extends BaseGameEngine<BlobBrawlState> {
  private lastBumpTime = new Map<string, number>();
  private nextPowerupSpawn = 7; // seconds
  private megaCoinTimer = 18; // seconds
  private powerupIdCounter = 100;
  private botsSpawned = false;

  initializeState(): BlobBrawlState {
    const coins: CollectibleItem[] = [];
    for (let i = 0; i < BLOB_BRAWL_CONFIG.MAX_COINS; i++) {
      coins.push({
        id: i,
        x: Math.random() * (BLOB_BRAWL_CONFIG.ARENA_WIDTH - 140) + 70,
        y: Math.random() * (BLOB_BRAWL_CONFIG.ARENA_HEIGHT - 140) + 70,
        value: 1
      });
    }

    this.botsSpawned = false;
    this.nextPowerupSpawn = 6;
    this.megaCoinTimer = 15;
    this.lastBumpTime = new Map<string, number>();

    return {
      arenaWidth: BLOB_BRAWL_CONFIG.ARENA_WIDTH,
      arenaHeight: BLOB_BRAWL_CONFIG.ARENA_HEIGHT,
      players: {},
      coins,
      powerups: [],
      events: []
    };
  }

  private spawnBotsIfNeeded() {
    if (this.botsSpawned) return;
    this.botsSpawned = true;

    for (const bot of DEFAULT_BOTS) {
      if (!this.state.players[bot.id]) {
        this.state.players[bot.id] = {
          x: Math.random() * (this.state.arenaWidth - 200) + 100,
          y: Math.random() * (this.state.arenaHeight - 200) + 100,
          vx: 0,
          vy: 0,
          coinsCarried: 0,
          bumpsReceived: 0,
          isKnockedOut: false,
          respawnTimer: 0,
          speedMultiplier: 1.0 + bot.level * BLOB_BRAWL_CONFIG.LEVEL_SPEED_BONUS,
          color: bot.color,
          name: bot.name,
          isBot: true,
          dashCooldown: 3 + Math.random() * 2,
          dashTimer: 0,
          activePowerup: null,
          powerupTimer: 0,
          targetDx: 0,
          targetDy: 0,
          comboStreak: 0,
          lastCoinTime: 0
        };
      }
    }
  }

  onPlayerJoined(player: PlayerSession): void {
    const playerLevel = player.profile.level || 1;
    const speedBonus = 1 + playerLevel * BLOB_BRAWL_CONFIG.LEVEL_SPEED_BONUS;

    this.state.players[player.socketId] = {
      x: Math.random() * 500 + 150,
      y: Math.random() * 400 + 100,
      vx: 0,
      vy: 0,
      coinsCarried: 0,
      bumpsReceived: 0,
      isKnockedOut: false,
      respawnTimer: 0,
      speedMultiplier: speedBonus,
      color: player.profile.favoriteColor,
      name: player.profile.displayName,
      isBot: false,
      dashCooldown: 0,
      dashTimer: 0,
      activePowerup: null,
      powerupTimer: 0,
      targetDx: 0,
      targetDy: 0,
      comboStreak: 0,
      lastCoinTime: 0
    };

    this.spawnBotsIfNeeded();
  }

  onPlayerLeft(socketId: string): void {
    delete this.state.players[socketId];
  }

  handleInput(socketId: string, input: PlayerInputPayload): void {
    const p = this.state.players[socketId];
    if (!p || p.isKnockedOut) return;

    if (input.dash && (p.dashCooldown || 0) <= 0) {
      p.dashTimer = 0.28;
      p.dashCooldown = 2.0;

      const curSpeed = Math.hypot(p.vx, p.vy);
      let dirX = p.targetDx || 0;
      let dirY = p.targetDy || 0;
      if (dirX === 0 && dirY === 0) {
        if (curSpeed > 10) {
          dirX = p.vx / curSpeed;
          dirY = p.vy / curSpeed;
        } else {
          dirX = 1;
        }
      } else {
        const len = Math.hypot(dirX, dirY) || 1;
        dirX /= len;
        dirY /= len;
      }

      const speedBoost = p.activePowerup === 'speed' ? 1.5 : 1;
      p.vx = dirX * BLOB_BRAWL_CONFIG.BASE_SPEED * p.speedMultiplier * speedBoost * 2.5;
      p.vy = dirY * BLOB_BRAWL_CONFIG.BASE_SPEED * p.speedMultiplier * speedBoost * 2.5;

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

    const rawDx = Number(input.dx);
    const rawDy = Number(input.dy);
    p.targetDx = isNaN(rawDx) ? 0 : Math.max(-1, Math.min(1, rawDx));
    p.targetDy = isNaN(rawDy) ? 0 : Math.max(-1, Math.min(1, rawDy));
  }

  private pushEvent(evt: GameEvent) {
    this.state.events.push(evt);
    if (this.state.events.length > 15) {
      this.state.events.shift();
    }
  }

  private updateBots(deltaSeconds: number) {
    const playerEntries = Object.entries(this.state.players);

    for (const [id, bot] of playerEntries) {
      if (!bot.isBot || bot.isKnockedOut) continue;

      if ((bot.dashTimer || 0) > 0) bot.dashTimer = Math.max(0, (bot.dashTimer || 0) - deltaSeconds);
      if ((bot.dashCooldown || 0) > 0) bot.dashCooldown = Math.max(0, (bot.dashCooldown || 0) - deltaSeconds);

      let targetX = this.state.arenaWidth / 2;
      let targetY = this.state.arenaHeight / 2;
      let bestDist = Infinity;

      // Priority 1: Mega-Coin if active!
      if (this.state.megaCoin) {
        targetX = this.state.megaCoin.x;
        targetY = this.state.megaCoin.y;
      } else if (this.state.powerups.length > 0) {
        // Priority 2: Powerup
        const pwr = this.state.powerups[0];
        targetX = pwr.x;
        targetY = pwr.y;
      } else {
        // Priority 3: Nearest coin
        for (const coin of this.state.coins) {
          const d = Math.hypot(bot.x - coin.x, bot.y - coin.y);
          if (d < bestDist) {
            bestDist = d;
            targetX = coin.x;
            targetY = coin.y;
          }
        }

        // Priority 4: Aggressive bots chase rich players
        const botMeta = DEFAULT_BOTS.find(b => b.id === id);
        if (botMeta && botMeta.aggression > 0.5) {
          for (const [otherId, targetP] of playerEntries) {
            if (otherId !== id && !targetP.isKnockedOut && targetP.coinsCarried > 2) {
              const d = Math.hypot(bot.x - targetP.x, bot.y - targetP.y);
              if (d < 200) {
                targetX = targetP.x;
                targetY = targetP.y;
                if ((bot.dashCooldown || 0) <= 0 && d > 60) {
                  bot.dashTimer = 0.28;
                  bot.dashCooldown = 3.0;
                }
              }
            }
          }
        }
      }

      const angle = Math.atan2(targetY - bot.y, targetX - bot.x);
      bot.targetDx = Math.cos(angle);
      bot.targetDy = Math.sin(angle);
    }
  }

  tick(deltaSeconds: number): void {
    const now = Date.now();
    this.spawnBotsIfNeeded();
    this.updateBots(deltaSeconds);

    // Powerup Spawner Timer
    this.nextPowerupSpawn -= deltaSeconds;
    if (this.nextPowerupSpawn <= 0) {
      this.nextPowerupSpawn = 9 + Math.random() * 4;
      if (this.state.powerups.length < 2) {
        const types: Array<'speed' | 'magnet' | 'shield'> = ['speed', 'magnet', 'shield'];
        const chosen = types[Math.floor(Math.random() * types.length)];
        this.state.powerups.push({
          id: ++this.powerupIdCounter,
          type: chosen,
          x: Math.random() * (this.state.arenaWidth - 160) + 80,
          y: Math.random() * (this.state.arenaHeight - 160) + 80
        });
      }
    }

    // Mega Star Coin Spawner Timer
    this.megaCoinTimer -= deltaSeconds;
    if (this.megaCoinTimer <= 0 && !this.state.megaCoin) {
      this.state.megaCoin = {
        id: 9999,
        x: this.state.arenaWidth / 2,
        y: this.state.arenaHeight / 2,
        value: 3
      };
      this.pushEvent({
        id: Math.random().toString(36),
        type: 'combo',
        text: '⭐ GOLDEN MEGA-STAR SPAWNED!',
        x: this.state.arenaWidth / 2,
        y: this.state.arenaHeight / 2,
        color: '#ffe600',
        timestamp: now
      });
    }

    const entries = Object.entries(this.state.players);

    for (const [id, p] of entries) {
      if ((p.dashTimer || 0) > 0) p.dashTimer = Math.max(0, (p.dashTimer || 0) - deltaSeconds);
      if ((p.dashCooldown || 0) > 0) p.dashCooldown = Math.max(0, (p.dashCooldown || 0) - deltaSeconds);

      if ((p.powerupTimer || 0) > 0) {
        p.powerupTimer = Math.max(0, (p.powerupTimer || 0) - deltaSeconds);
        if (p.powerupTimer <= 0) {
          p.activePowerup = null;
        }
      }

      if (p.isKnockedOut) {
        p.respawnTimer -= deltaSeconds;
        p.vx *= 0.85;
        p.vy *= 0.85;
        if (p.respawnTimer <= 0) {
          p.isKnockedOut = false;
          p.bumpsReceived = 0;
          p.x = Math.random() * (this.state.arenaWidth - 140) + 70;
          p.y = Math.random() * (this.state.arenaHeight - 140) + 70;
          this.pushEvent({
            id: Math.random().toString(36),
            type: 'bump',
            text: `${p.name} Revived!`,
            x: p.x,
            y: p.y,
            color: p.color,
            timestamp: now
          });
        }
        continue;
      }

      // Analog Squishy Acceleration & Friction Physics
      const targetDx = p.targetDx || 0;
      const targetDy = p.targetDy || 0;
      const isInput = Math.hypot(targetDx, targetDy) > 0.05;

      const speedBoost = p.activePowerup === 'speed' ? 1.6 : 1;
      const dashMult = (p.dashTimer || 0) > 0 ? 2.3 : 1;
      const targetSpeed = BLOB_BRAWL_CONFIG.BASE_SPEED * p.speedMultiplier * speedBoost * dashMult;

      if (isInput) {
        const targetVx = targetDx * targetSpeed;
        const targetVy = targetDy * targetSpeed;
        const accelRate = (p.dashTimer || 0) > 0 ? 25 : 14;
        p.vx += (targetVx - p.vx) * Math.min(1, deltaSeconds * accelRate);
        p.vy += (targetVy - p.vy) * Math.min(1, deltaSeconds * accelRate);
      } else {
        // Elastic viscous squish damping
        p.vx *= Math.pow(0.86, deltaSeconds * 60);
        p.vy *= Math.pow(0.86, deltaSeconds * 60);
      }

      // Move player with arena bounds
      p.x = Math.max(24, Math.min(this.state.arenaWidth - 24, p.x + p.vx * deltaSeconds));
      p.y = Math.max(24, Math.min(this.state.arenaHeight - 24, p.y + p.vy * deltaSeconds));

      // Coin Magnet Pull Effect
      if (p.activePowerup === 'magnet') {
        for (const coin of this.state.coins) {
          const d = Math.hypot(p.x - coin.x, p.y - coin.y);
          if (d < 220 && d > 5) {
            const pullAngle = Math.atan2(p.y - coin.y, p.x - coin.x);
            coin.x += Math.cos(pullAngle) * 260 * deltaSeconds;
            coin.y += Math.sin(pullAngle) * 260 * deltaSeconds;
          }
        }
      }

      // Check Mega Coin Collection
      if (this.state.megaCoin) {
        const mc = this.state.megaCoin;
        if (Math.hypot(p.x - mc.x, p.y - mc.y) < BLOB_BRAWL_CONFIG.PLAYER_RADIUS + 18) {
          p.coinsCarried += mc.value;
          const session = this.players.get(id);
          if (session) session.score = p.coinsCarried;

          this.pushEvent({
            id: Math.random().toString(36),
            type: 'combo',
            text: `🌟 ${p.name} CLAIMED THE MEGA-STAR! +${mc.value}🪙`,
            x: mc.x,
            y: mc.y,
            color: '#ffe600',
            timestamp: now
          });

          this.state.megaCoin = undefined;
          this.megaCoinTimer = 22;
        }
      }

      // Check Coin Collection & Combo Streak
      for (const coin of this.state.coins) {
        if (Math.hypot(p.x - coin.x, p.y - coin.y) < BLOB_BRAWL_CONFIG.PLAYER_RADIUS + BLOB_BRAWL_CONFIG.COIN_RADIUS) {
          p.coinsCarried += 1;
          const session = this.players.get(id);
          if (session) session.score = p.coinsCarried;

          // Combo tracking
          if (now - (p.lastCoinTime || 0) < 2500) {
            p.comboStreak = (p.comboStreak || 1) + 1;
          } else {
            p.comboStreak = 1;
          }
          p.lastCoinTime = now;

          const streak = p.comboStreak || 1;
          let eventText = '+1🪙';
          if (streak >= 5) {
            eventText = `🔥 MEGA STREAK x${streak}! +1🪙`;
            p.coinsCarried += 1; // bonus coin
          } else if (streak >= 3) {
            eventText = `⚡ FRENZY x${streak}! +1🪙`;
          } else if (streak === 2) {
            eventText = `x2 COMBO! +1🪙`;
          }

          this.pushEvent({
            id: Math.random().toString(36),
            type: streak >= 2 ? 'combo' : 'coin',
            text: eventText,
            x: coin.x,
            y: coin.y,
            color: streak >= 3 ? '#ffe600' : '#00e5ff',
            timestamp: now
          });

          // Respawn coin
          coin.x = Math.random() * (this.state.arenaWidth - 140) + 70;
          coin.y = Math.random() * (this.state.arenaHeight - 140) + 70;
        }
      }

      // Check Powerup Collection
      for (let k = this.state.powerups.length - 1; k >= 0; k--) {
        const pwr = this.state.powerups[k];
        if (Math.hypot(p.x - pwr.x, p.y - pwr.y) < BLOB_BRAWL_CONFIG.PLAYER_RADIUS + 16) {
          p.activePowerup = pwr.type;
          p.powerupTimer = 8.0;

          const label = pwr.type === 'speed' ? '⚡ 2x SPEED!' : pwr.type === 'magnet' ? '🧲 MAGNET!' : '🛡️ SHIELD!';
          this.pushEvent({
            id: Math.random().toString(36),
            type: 'powerup',
            text: `${p.name}: ${label}`,
            x: pwr.x,
            y: pwr.y,
            color: pwr.type === 'speed' ? '#00e5ff' : pwr.type === 'magnet' ? '#f59e0b' : '#10b981',
            timestamp: now
          });

          this.state.powerups.splice(k, 1);
        }
      }
    }

    // Player vs Player / Bot Collision & Mass-Impulse Bump Mechanics
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [idA, pA] = entries[i];
        const [idB, pB] = entries[j];
        if (pA.isKnockedOut || pB.isKnockedOut) continue;

        const dist = Math.hypot(pA.x - pB.x, pA.y - pB.y);
        if (dist < BLOB_BRAWL_CONFIG.PLAYER_RADIUS * 2 + 4) {
          const pairKey = [idA, idB].sort().join(':');
          if (now - (this.lastBumpTime.get(pairKey) || 0) >= BLOB_BRAWL_CONFIG.BUMP_COOLDOWN_MS) {
            this.lastBumpTime.set(pairKey, now);

            // Mass-dependent physics collision
            const massA = 1 + pA.coinsCarried * 0.08;
            const massB = 1 + pB.coinsCarried * 0.08;
            const totalMass = massA + massB;

            const angle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
            const isADashing = (pA.dashTimer || 0) > 0;
            const isBDashing = (pB.dashTimer || 0) > 0;

            const baseImpulse = isADashing || isBDashing ? 420 : 260;
            pA.vx -= Math.cos(angle) * (massB / totalMass) * baseImpulse;
            pA.vy -= Math.sin(angle) * (massB / totalMass) * baseImpulse;
            pB.vx += Math.cos(angle) * (massA / totalMass) * baseImpulse;
            pB.vy += Math.sin(angle) * (massA / totalMass) * baseImpulse;

            const speedA = Math.hypot(pA.vx, pA.vy) * (isADashing ? 1.8 : 1);
            const speedB = Math.hypot(pB.vx, pB.vy) * (isBDashing ? 1.8 : 1);
            const [attacker, defender] = speedA >= speedB ? [pA, pB] : [pB, pA];

            // If defender has Shield, reflect bump!
            if (defender.activePowerup === 'shield') {
              defender.activePowerup = null;
              attacker.vx = -attacker.vx * 1.6;
              attacker.vy = -attacker.vy * 1.6;
              this.pushEvent({
                id: Math.random().toString(36),
                type: 'bump',
                text: '🛡️ SHIELD DEFLECTED ATTACK!',
                x: (pA.x + pB.x) / 2,
                y: (pA.y + pB.y) / 2,
                color: '#10b981',
                timestamp: now
              });
              continue;
            }

            // Coin transfer on bump
            let stolen = 0;
            if (defender.coinsCarried > 0) {
              const stealAmount = Math.min(isADashing || isBDashing ? 2 : 1, defender.coinsCarried);
              defender.coinsCarried -= stealAmount;
              attacker.coinsCarried += stealAmount;
              stolen = stealAmount;
            }

            defender.bumpsReceived += 1;

            if (defender.bumpsReceived >= BLOB_BRAWL_CONFIG.KNOCKOUT_BUMPS) {
              // 💥 Knockout and scatter carried coins!
              defender.isKnockedOut = true;
              defender.respawnTimer = BLOB_BRAWL_CONFIG.RESPAWN_TIME_SEC;
              const droppedCoins = defender.coinsCarried;
              defender.coinsCarried = 0;

              const countToScatter = Math.min(droppedCoins, 6);
              for (let c = 0; c < countToScatter; c++) {
                const targetCoin = this.state.coins[c % this.state.coins.length];
                const scatterAngle = (c / Math.max(1, countToScatter)) * Math.PI * 2;
                targetCoin.x = Math.max(40, Math.min(this.state.arenaWidth - 40, defender.x + Math.cos(scatterAngle) * 70));
                targetCoin.y = Math.max(40, Math.min(this.state.arenaHeight - 40, defender.y + Math.sin(scatterAngle) * 70));
              }

              this.pushEvent({
                id: Math.random().toString(36),
                type: 'knockout',
                text: `💥 ${defender.name} KNOCKED OUT by ${attacker.name}!`,
                x: defender.x,
                y: defender.y,
                color: '#ef4444',
                timestamp: now
              });
            } else {
              this.pushEvent({
                id: Math.random().toString(36),
                type: 'bump',
                text: stolen > 0 ? `💥 BUMP! Stole ${stolen}🪙` : `💥 BUMP! (${defender.bumpsReceived}/${BLOB_BRAWL_CONFIG.KNOCKOUT_BUMPS})`,
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
