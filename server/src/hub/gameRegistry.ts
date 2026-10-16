import { GameId, GameMetadata } from '../../../shared/src';
import { BaseGameEngine } from '../engines/BaseGameEngine';
import { ACCGEngine } from '../engines/ACCGEngine';
import { GlowballEngine } from '../engines/GlowballEngine';
import { BlobBrawlEngine } from '../engines/BlobBrawlEngine';
import { MahjongEngine } from '../engines/MahjongEngine';
import { MahjongSolitaireEngine } from '../engines/MahjongSolitaireEngine';

export interface GameEntry {
  metadata: GameMetadata;
  factory: (roomCode: string, onUpdate: (state: any) => void) => BaseGameEngine<any>;
}

export class GameRegistry {
  private static games = new Map<GameId, GameEntry>();

  public static initialize(): void {
    this.register({
      metadata: {
        id: 'blob',
        title: 'Blob Brawl',
        category: 'Arena Action',
        minPlayers: 1,
        maxPlayers: 6,
        durationSeconds: 60,
        description: '60-second high-energy coin frenzy! Bump slower opponents to steal coins, grab power-up crates, and survive 3-bump knockouts.',
        objective: 'Collect the highest count of arena coins before the 60s timer expires. Bump rivals to knock coins loose.',
        controls: 'WASD / Arrow Keys to move • Spacebar or Dash Button for Hyper Dash • Touch D-Pad for mobile',
        rules: [
          '12 active coins spawn continuously across the arena',
          'Steal 1-3 coins on direct collision with other players',
          'Every 3 consecutive bumps received causes a temporary knockout (3s respawn)',
          'Break power-up crates for Speed Boost, Coin Magnet, or Impact Shield',
          'Solo players are automatically matched against smart AI rival bots'
        ]
      },
      factory: (room, cb) => new BlobBrawlEngine(room, cb)
    });

    this.register({
      metadata: {
        id: 'glowball',
        title: 'Glowball Arena',
        category: 'Arena Action',
        minPlayers: 1,
        maxPlayers: 6,
        durationSeconds: 90,
        description: 'Collect radiant energy orbs and dash past rivals in a high-speed neon cyber arena.',
        objective: 'Harvest glowing photon orbs and surge orbs to maximize energy score. Hyper dash through opponents to siphon their charge.',
        controls: 'WASD / Arrow Keys to steer • Spacebar or Dash Button to surge dash • Touch D-Pad for mobile',
        rules: [
          '15 radiant energy orbs active in the arena',
          'Golden Surge Orbs grant 3x energy bonus and temporary speed',
          'Dashing through an opponent siphons 25% of their carried energy',
          'Colliding with arena boundary reflectors bounces your vector without speed penalty',
          'Player with highest total energy score at 90s claims victory'
        ]
      },
      factory: (room, cb) => new GlowballEngine(room, cb)
    });

    this.register({
      metadata: {
        id: 'accg',
        title: 'Arena Clash: Cyber Grid',
        category: 'Tactical Strategy',
        minPlayers: 1,
        maxPlayers: 4,
        durationSeconds: 120,
        description: 'Tactical 8x8 cybernetic grid combat with laser beams, EMP blasts, data cores, and energy shields.',
        objective: 'Eliminate rival grid operatives or hold the central Data Core to dominate match standings.',
        controls: 'Click adjacent tiles to Move (1 AP) • Select Laser & click row/col to Fire (1 AP) • Trigger EMP (2 AP) or Shield (1 AP)',
        rules: [
          'Each operative starts with 100 HP and regains Action Points (AP) each turn cycle',
          'Move costs 1 AP (orthogonal adjacent tiles)',
          'Laser Beam deals 25 damage along straight lines up to 3 tiles',
          'EMP Blast deals 35 damage and disables target abilities in a 3x3 radius',
          'Energy Shield absorbs 40 incoming damage until shattered'
        ]
      },
      factory: (room, cb) => new ACCGEngine(room, cb)
    });

    this.register({
      metadata: {
        id: 'mahjong',
        title: 'Traditional Table Mahjong (麻將)',
        category: 'Puzzle & Board',
        minPlayers: 1,
        maxPlayers: 4,
        durationSeconds: 180,
        description: 'Authentic 136-tile 4-player table Mahjong! Draw & discard, call Chow (吃), Pung (碰), Kong (槓), and declare HU (胡)!',
        objective: 'Form 4 sets (melds) and 1 pair (eye) of tiles from Wan, Tiao, Tong, Winds, and Dragons to achieve winning HU hand.',
        controls: 'Click tile in your hand once to inspect, click again to discard • Interactive action buttons for Chow, Pung, Kong, Hu, and Pass',
        rules: [
          'Standard 136 tile set: Character (Wan), Bamboo (Tiao), Dot (Tong), Winds & Dragons',
          'Draw from the wall on your turn; discard 1 tile into the river',
          'Call Chow (吃) for sequences from left opponent',
          'Call Pung (碰) for triplets from any player discard',
          'Declare HU (胡) on Self-Drawn (Zimo) or rival discard (Ron) for maximum victory score'
        ]
      },
      factory: (room, cb) => new MahjongEngine(room, cb)
    });

    this.register({
      metadata: {
        id: 'mahjong-solitaire',
        title: 'Mahjong Solitaire / Shanghai Rush',
        category: 'Puzzle & Board',
        minPlayers: 1,
        maxPlayers: 4,
        durationSeconds: 120,
        description: 'Classic Shanghai 3D Pyramid tile-matching! Free unblocked tiles, combo multipliers, and mystical power-ups in solo or speed rush.',
        objective: 'Clear all 144 stacked tiles by selecting matching pairs of free unblocked tiles before time runs out.',
        controls: 'Click any free highlighted tile to select • Click matching pair to clear • Use Frost Wind, Lightning Bolt, or Astral Shuffle power-ups',
        rules: [
          'A tile is free only if it has no tiles above it and either left or right lateral side is open',
          'Matching consecutive pairs quickly builds up Combo Multipliers (up to 5x points)',
          'Frost Wind power-up freezes opponent combos for 4 seconds in multiplayer rush',
          'Lightning Bolt automatically reveals and matches an available pair',
          'Astral Shuffle rearranges remaining blocked tiles when no free moves remain'
        ]
      },
      factory: (room, cb) => new MahjongSolitaireEngine(room, cb)
    });
  }

  public static register(entry: GameEntry): void {
    this.games.set(entry.metadata.id, entry);
  }

  public static getGame(id: GameId): GameEntry | undefined {
    return this.games.get(id);
  }

  public static getAllMetadata(): GameMetadata[] {
    return Array.from(this.games.values()).map((e) => e.metadata);
  }
}
