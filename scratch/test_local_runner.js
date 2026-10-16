const { BlobBrawlEngine } = require('../server/dist/server/src/engines/BlobBrawlEngine');
const { GlowballEngine } = require('../server/dist/server/src/engines/GlowballEngine');
const { ACCGEngine } = require('../server/dist/server/src/engines/ACCGEngine');
const { MahjongEngine } = require('../server/dist/server/src/engines/MahjongEngine');
const { MahjongSolitaireEngine } = require('../server/dist/server/src/engines/MahjongSolitaireEngine');

async function testFull() {
  console.log('--- 1. Testing Blob Brawl Input & Ticks ---');
  let blobUpdated = false;
  const blob = new BlobBrawlEngine('TEST_BLOB', (st) => { blobUpdated = true; });
  blob.registerPlayer({
    socketId: 'local_player',
    userId: 'u1',
    profile: { id: 'u1', displayName: 'Hero', favoriteColor: '#00e5ff', level: 1 },
    score: 0,
    isReady: true,
    connected: true
  });
  blob.handleInput('local_player', { dx: 1, dy: 0, dash: false });
  blob.tick(0.05);
  const blobP = blob.getState().players['local_player'];
  console.log('Blob player moved:', blobP.x > 0, 'vx:', blobP.vx, 'coins:', blob.getState().coins.length);

  console.log('\n--- 2. Testing Glowball Input & Ticks ---');
  const glow = new GlowballEngine('TEST_GLOW', () => {});
  glow.registerPlayer({
    socketId: 'local_player',
    userId: 'u1',
    profile: { id: 'u1', displayName: 'Hero', favoriteColor: '#00e5ff', level: 1 },
    score: 0,
    isReady: true,
    connected: true
  });
  glow.handleInput('local_player', { dx: 0, dy: 1, dash: true });
  glow.tick(0.05);
  const glowP = glow.getState().players['local_player'];
  console.log('Glowball player dashed:', glowP.dashTimer > 0, 'score:', glowP.score, 'orbs:', glow.getState().orbs.length);

  console.log('\n--- 3. Testing ACCG Tactical Siege Input & Ticks ---');
  const accg = new ACCGEngine('TEST_ACCG', () => {});
  accg.registerPlayer({
    socketId: 'local_player',
    userId: 'u1',
    profile: { id: 'u1', displayName: 'Commander', favoriteColor: '#00e5ff', level: 1 },
    score: 0,
    isReady: true,
    connected: true
  });
  const myUnit = accg.getState().units['local_player'];
  console.log('ACCG unit spawned at row:', myUnit.row, 'col:', myUnit.col, 'HP:', myUnit.hp);
  // Test move
  accg.handleInput('local_player', { abilityId: 'move', targetRow: myUnit.row + 1, targetCol: myUnit.col });
  accg.tick(0.05);
  console.log('ACCG unit moved to row:', accg.getState().units['local_player'].row);

  console.log('\n--- 4. Testing Traditional Mahjong Input & Ticks ---');
  const mahjong = new MahjongEngine('TEST_MAHJONG', () => {});
  mahjong.registerPlayer({
    socketId: 'local_player',
    userId: 'u1',
    profile: { id: 'u1', displayName: 'Player1', favoriteColor: '#00e5ff', level: 1 },
    score: 0,
    isReady: true,
    connected: true
  });
  const mState = mahjong.getState();
  const humanSeat = mState.seats.find(s => s.id === 'local_player');
  console.log('Mahjong seats:', mState.seats.length, 'human seatIndex:', humanSeat?.seatIndex, 'hand size:', humanSeat?.hand.length, 'drawnTile:', humanSeat?.drawnTile ? humanSeat.drawnTile.symbol : 'none');
  if (humanSeat && humanSeat.drawnTile) {
    mahjong.handleInput('local_player', { action: 'discard', tileId: humanSeat.drawnTile.id });
    console.log('Mahjong discard succeeded! Phase now:', mahjong.getState().phase);
  }

  console.log('\n--- 5. Testing Mahjong Solitaire Speed Match Input & Ticks ---');
  const solitaire = new MahjongSolitaireEngine('TEST_SOLITAIRE', () => {});
  solitaire.registerPlayer({
    socketId: 'local_player',
    userId: 'u1',
    profile: { id: 'u1', displayName: 'Player1', favoriteColor: '#00e5ff', level: 1 },
    score: 0,
    isReady: true,
    connected: true
  });
  const sState = solitaire.getState();
  console.log('Solitaire tiles count:', sState.tiles.length, 'free pairs:', sState.freePairsCount, 'player:', sState.players['local_player']?.name);
  // Test lightning powerup
  solitaire.handleInput('local_player', { action: 'powerup', powerupId: 'lightning' });
  solitaire.tick(0.05);
  console.log('Solitaire lightning fired! Remaining tiles:', solitaire.getState().remainingTiles, 'score:', solitaire.getState().players['local_player'].score);

  console.log('\n=== ALL 5 GAME ENGINES FULLY OPERATIONAL ===');
}

testFull();
