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
  type: 'coin' | 'bump' | 'knockout' | 'powerup' | 'dash';
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
}

export interface BlobBrawlState {
  arenaWidth: number;
  arenaHeight: number;
  players: Record<string, BlobEntityState>;
  coins: CollectibleItem[];
  powerups: PowerupItem[];
  events: GameEvent[];
}

interface BotProfile {
  id: string;
  name: string;
  color: string;
  aggression: number; // 0 to 1
  level: number;
}

const DEFAULT_BOTS: BotProfile[] = [
  { id: 'bot_sparky', name: '⚡ Sparky', color: '#f59e0b', aggression: 0.3, level: 3 },
  { id: 'bot_brawler', name: '🔥 Brawler-Bot', color: '#ef4444', aggression: 0.8, level: 5 },
  { id: 'bot_glitch', name: '💀 Shadow-Glitch', color: '#a855f7', aggression: 0.6, level: 4 }
];

export class BlobBrawlEngine extends BaseGameEngine<BlobBrawlState> {
  private lastBumpTime = new Map<string, number>();
  private nextPowerupSpawn = 8; // seconds
  private powerupIdCounter = 100;
  private botsSpawned = false;

  initializeState(): BlobBrawlState {
    const coins: CollectibleItem[] = [];
    for (let i = 0; i < BLOB_BRAWL_CONFIG.MAX_COINS; i++) {
      coins.push({
        id: i,
        x: Math.random() * (BLOB_BRAWL_CONFIG.ARENA_WIDTH - 120) + 60,
        y: Math.random() * (BLOB_BRAWL_CONFIG.ARENA_HEIGHT - 120) + 60,
        value: 1
      });
    }

    this.botsSpawned = false;
    this.nextPowerupSpawn = 6;
    if (this.lastBumpTime) {
      this.lastBumpTime.clear();
    } else {
      this.lastBumpTime = new Map<string, number>();
    }

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
          x: Math.random() * 600 + 100,
          y: Math.random() * 400 + 100,
          vx: 0,
          vy: 0,
          coinsCarried: 0,
          bumpsReceived: 0,
          isKnockedOut: false,
          respawnTimer: 0,
          speedMultiplier: 1 + bot.level * BLOB_BRAWL_CONFIG.LEVEL_SPEED_BONUS,
          color: bot.color,
          name: bot.name,
          isBot: true,
          dashCooldown: 3 + Math.random() * 3,
          dashTimer: 0,
          activePowerup: null,
          powerupTimer: 0
        };
      }
    }
  }

  onPlayerJoined(player: PlayerSession): void {
    const speedBonus = 1 + player.profile.level * BLOB_BRAWL_CONFIG.LEVEL_SPEED_BONUS;
    this.state.players[player.socketId] = {
      x: Math.random() * 600 + 100,
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
      powerupTimer: 0
    };

    // Ensure rivals are present so single-player / small rooms are packed with fun!
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
      p.dashCooldown = 2.2;
      this.pushEvent({
        id: Math.random().toString(36),
        type: 'dash',
        text: '⚡ DASH!',
        x: p.x,
        y: p.y,
        color: p.color,
        timestamp: Date.now()
      });
    }

    const dx = Math.max(-1, Math.min(1, Number(input.dx) || 0));
    const dy = Math.max(-1, Math.min(1, Number(input.dy) || 0));
    const speedBoost = p.activePowerup === 'speed' ? 1.7 : 1;
    const dashMult = (p.dashTimer || 0) > 0 ? 2.4 : 1;
    const speed = BLOB_BRAWL_CONFIG.BASE_SPEED * p.speedMultiplier * speedBoost * dashMult;

    p.vx = dx * speed;
    p.vy = dy * speed;
  }

  private pushEvent(evt: GameEvent) {
    this.state.events.push(evt);
    if (this.state.events.length > 12) {
      this.state.events.shift();
    }
  }

  private updateBots(deltaSeconds: number) {
    const playerEntries = Object.entries(this.state.players);

    for (const [id, bot] of playerEntries) {
      if (!bot.isBot || bot.isKnockedOut) continue;

      // Update cooldowns
      if ((bot.dashTimer || 0) > 0) bot.dashTimer = Math.max(0, (bot.dashTimer || 0) - deltaSeconds);
      if ((bot.dashCooldown || 0) > 0) bot.dashCooldown = Math.max(0, (bot.dashCooldown || 0) - deltaSeconds);

      // Determine target (powerup > closest coin or high-coin player)
      let targetX = this.state.arenaWidth / 2;
      let targetY = this.state.arenaHeight / 2;
      let bestDist = Infinity;

      // Target powerups if any exist
      if (this.state.powerups.length > 0) {
        const pwr = this.state.powerups[0];
        targetX = pwr.x;
        targetY = pwr.y;
      } else {
        // Target nearest coin
        for (const coin of this.state.coins) {
          const d = Math.hypot(bot.x - coin.x, bot.y - coin.y);
          if (d < bestDist) {
            bestDist = d;
            targetX = coin.x;
            targetY = coin.y;
          }
        }

        // Aggressive bots also target players with coins to steal
        const botMeta = DEFAULT_BOTS.find(b => b.id === id);
        if (botMeta && botMeta.aggression > 0.5) {
          for (const [otherId, targetP] of playerEntries) {
            if (otherId !== id && !targetP.isKnockedOut && targetP.coinsCarried > 0) {
              const d = Math.hypot(bot.x - targetP.x, bot.y - targetP.y);
              if (d < 180) {
                targetX = targetP.x;
                targetY = targetP.y;
                // Trigger bot dash if close!
                if ((bot.dashCooldown || 0) <= 0 && d < 120) {
                  bot.dashTimer = 0.28;
                  bot.dashCooldown = 3.5;
                  this.pushEvent({
                    id: Math.random().toString(36),
                    type: 'dash',
                    text: '⚡ DASH!',
                    x: bot.x,
                    y: bot.y,
                    color: bot.color,
                    timestamp: Date.now()
                  });
                }
                break;
              }
            }
          }
        }
      }

      const angle = Math.atan2(targetY - bot.y, targetX - bot.x);
      const speedBoost = bot.activePowerup === 'speed' ? 1.6 : 1;
      const dashMult = (bot.dashTimer || 0) > 0 ? 2.2 : 1;
      const speed = BLOB_BRAWL_CONFIG.BASE_SPEED * bot.speedMultiplier * speedBoost * dashMult;

      bot.vx = Math.cos(angle) * speed;
      bot.vy = Math.sin(angle) * speed;
    }
  }

  tick(deltaSeconds: number): void {
    const now = Date.now();
    this.spawnBotsIfNeeded();
    this.updateBots(deltaSeconds);

    // Powerup Spawner Timer
    this.nextPowerupSpawn -= deltaSeconds;
    if (this.nextPowerupSpawn <= 0) {
      this.nextPowerupSpawn = 10 + Math.random() * 5;
      if (this.state.powerups.length < 2) {
        const types: Array<'speed' | 'magnet' | 'shield'> = ['speed', 'magnet', 'shield'];
        const chosen = types[Math.floor(Math.random() * types.length)];
        this.state.powerups.push({
          id: ++this.powerupIdCounter,
          type: chosen,
          x: Math.random() * (this.state.arenaWidth - 140) + 70,
          y: Math.random() * (this.state.arenaHeight - 140) + 70
        });
      }
    }

    const entries = Object.entries(this.state.players);

    for (const [id, p] of entries) {
      // Dash timers
      if ((p.dashTimer || 0) > 0) p.dashTimer = Math.max(0, (p.dashTimer || 0) - deltaSeconds);
      if ((p.dashCooldown || 0) > 0) p.dashCooldown = Math.max(0, (p.dashCooldown || 0) - deltaSeconds);

      // Active power-up duration timer
      if ((p.powerupTimer || 0) > 0) {
        p.powerupTimer = Math.max(0, (p.powerupTimer || 0) - deltaSeconds);
        if (p.powerupTimer <= 0) {
          p.activePowerup = null;
        }
      }

      if (p.isKnockedOut) {
        p.respawnTimer -= deltaSeconds;
        if (p.respawnTimer <= 0) {
          p.isKnockedOut = false;
          p.bumpsReceived = 0;
          p.x = Math.random() * (this.state.arenaWidth - 120) + 60;
          p.y = Math.random() * (this.state.arenaHeight - 120) + 60;
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

      // Move player with border bounds
      p.x = Math.max(24, Math.min(this.state.arenaWidth - 24, p.x + p.vx * deltaSeconds));
      p.y = Math.max(24, Math.min(this.state.arenaHeight - 24, p.y + p.vy * deltaSeconds));

      // Coin Magnet effect (pulls coins within radius)
      if (p.activePowerup === 'magnet') {
        for (const coin of this.state.coins) {
          const d = Math.hypot(p.x - coin.x, p.y - coin.y);
          if (d < 180 && d > 5) {
            const pullAngle = Math.atan2(p.y - coin.y, p.x - coin.x);
            coin.x += Math.cos(pullAngle) * 220 * deltaSeconds;
            coin.y += Math.sin(pullAngle) * 220 * deltaSeconds;
          }
        }
      }

      // Check Coin Collection (Atomic per-tick pickup to prevent double increments)
      for (const coin of this.state.coins) {
        if (Math.hypot(p.x - coin.x, p.y - coin.y) < BLOB_BRAWL_CONFIG.PLAYER_RADIUS + BLOB_BRAWL_CONFIG.COIN_RADIUS) {
          p.coinsCarried += 1;
          const session = this.players.get(id);
          if (session) session.score = p.coinsCarried;

          this.pushEvent({
            id: Math.random().toString(36),
            type: 'coin',
            text: '+1',
            x: coin.x,
            y: coin.y,
            color: '#ffe600',
            timestamp: now
          });

          // Respawn coin immediately at a free position within the arena (maintains exactly 12 coins)
          coin.x = Math.random() * (this.state.arenaWidth - 120) + 60;
          coin.y = Math.random() * (this.state.arenaHeight - 120) + 60;
        }
      }

      // Check Powerup Collection
      for (let k = this.state.powerups.length - 1; k >= 0; k--) {
        const pwr = this.state.powerups[k];
        if (Math.hypot(p.x - pwr.x, p.y - pwr.y) < BLOB_BRAWL_CONFIG.PLAYER_RADIUS + 14) {
          p.activePowerup = pwr.type;
          p.powerupTimer = 7.0; // 7 seconds of active powerup

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

    // Player vs Player / Bot Collision & Bump Mechanics
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [idA, pA] = entries[i];
        const [idB, pB] = entries[j];
        if (pA.isKnockedOut || pB.isKnockedOut) continue;

        const dist = Math.hypot(pA.x - pB.x, pA.y - pB.y);
        if (dist < BLOB_BRAWL_CONFIG.PLAYER_RADIUS * 2) {
          const pairKey = [idA, idB].sort().join(':');
          if (now - (this.lastBumpTime.get(pairKey) || 0) >= BLOB_BRAWL_CONFIG.BUMP_COOLDOWN_MS) {
            this.lastBumpTime.set(pairKey, now);

            // Bouncing physics impulse away from each other
            const angle = Math.atan2(pB.y - pA.y, pB.x - pA.x);
            pA.x -= Math.cos(angle) * 16;
            pA.y -= Math.sin(angle) * 16;
            pB.x += Math.cos(angle) * 16;
            pB.y += Math.sin(angle) * 16;

            const speedA = Math.hypot(pA.vx, pA.vy);
            const speedB = Math.hypot(pB.vx, pB.vy);
            const [attacker, defender] = speedA >= speedB ? [pA, pB] : [pB, pA];

            // If defender has Shield powerup, deflect attack!
            if (defender.activePowerup === 'shield') {
              defender.activePowerup = null; // consume shield
              attacker.vx = -attacker.vx * 1.5;
              attacker.vy = -attacker.vy * 1.5;
              this.pushEvent({
                id: Math.random().toString(36),
                type: 'bump',
                text: '🛡️ DEFLECTED!',
                x: (pA.x + pB.x) / 2,
                y: (pA.y + pB.y) / 2,
                color: '#10b981',
                timestamp: now
              });
              continue;
            }

            // G-03: Exactly one coin transfers from slower to faster player (coins never negative)
            let stolen = 0;
            if (defender.coinsCarried > 0) {
              const stealAmount = Math.min(1, defender.coinsCarried);
              defender.coinsCarried -= stealAmount;
              attacker.coinsCarried += stealAmount;
              stolen = stealAmount;
            }

            defender.bumpsReceived += 1;

            if (defender.bumpsReceived >= BLOB_BRAWL_CONFIG.KNOCKOUT_BUMPS) {
              // 💥 G-04: Knockout and respawn after 3 seconds; loses carried coins
              defender.isKnockedOut = true;
              defender.respawnTimer = BLOB_BRAWL_CONFIG.RESPAWN_TIME_SEC;
              const droppedCoins = defender.coinsCarried;
              defender.coinsCarried = 0;

              // Scatter up to 6 of the existing arena coins around knockout location (keeps count at exactly 12)
              const countToScatter = Math.min(droppedCoins, 6);
              for (let c = 0; c < countToScatter; c++) {
                const targetCoin = this.state.coins[c % this.state.coins.length];
                const scatterAngle = (c / Math.max(1, countToScatter)) * Math.PI * 2;
                targetCoin.x = Math.max(40, Math.min(this.state.arenaWidth - 40, defender.x + Math.cos(scatterAngle) * 65));
                targetCoin.y = Math.max(40, Math.min(this.state.arenaHeight - 40, defender.y + Math.sin(scatterAngle) * 65));
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
                color: '#f97316',
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
