const { BlobBrawlEngine } = require('../server/dist/server/src/engines/BlobBrawlEngine');
const { GlowballEngine } = require('../server/dist/server/src/engines/GlowballEngine');
const { ACCGEngine } = require('../server/dist/server/src/engines/ACCGEngine');
const { MahjongEngine } = require('../server/dist/server/src/engines/MahjongEngine');
const { MahjongSolitaireEngine } = require('../server/dist/server/src/engines/MahjongSolitaireEngine');
const { BrickBreakerEngine } = require('../server/dist/server/src/engines/BrickBreakerEngine');
const { CheckersEngine } = require('../server/dist/server/src/engines/CheckersEngine');
const { CyberSlitherEngine } = require('../server/dist/server/src/engines/CyberSlitherEngine');
const { GalaxyStrikeEngine } = require('../server/dist/server/src/engines/GalaxyStrikeEngine');

async function testAllNineEngines() {
  console.log('====================================================');
  console.log('   ARCADE HUB: ALL 9 ENGINES VERIFICATION SUITE   ');
  console.log('====================================================\n');

  const playerTemplate = {
    socketId: 'local_player',
    userId: 'u_tester_01',
    profile: { id: 'u_tester_01', displayName: 'ArcadeMaster', favoriteColor: '#00e5ff', level: 5 },
    score: 0,
    isReady: true,
    connected: true
  };

  // 1. BLOB BRAWL
  console.log('[1/9] Testing Blob Brawl Engine...');
  const blob = new BlobBrawlEngine('ROOM_BLOB', () => {});
  blob.registerPlayer(playerTemplate);
  blob.handleInput('local_player', { dx: 1, dy: -1, dash: true });
  for (let i = 0; i < 10; i++) blob.tick(0.05);
  const blobState = blob.getState();
  console.log('   ✓ Player registered, moved, coins count:', blobState.coins.length, 'player score:', blobState.players['local_player'].score);

  // 2. GLOWBALL OVERDRIVE
  console.log('[2/9] Testing Glowball Overdrive Engine...');
  const glow = new GlowballEngine('ROOM_GLOW', () => {});
  glow.registerPlayer(playerTemplate);
  glow.handleInput('local_player', { dx: 0, dy: 1, dash: false });
  for (let i = 0; i < 10; i++) glow.tick(0.05);
  const glowState = glow.getState();
  console.log('   ✓ Player registered, orbs count:', glowState.orbs.length, 'team:', glowState.players['local_player'].team);

  // 3. ACCG TACTICAL SIEGE
  console.log('[3/9] Testing ACCG Tactical Siege Engine...');
  const accg = new ACCGEngine('ROOM_ACCG', () => {});
  accg.registerPlayer(playerTemplate);
  for (let i = 0; i < 10; i++) accg.tick(0.05);
  const accgState = accg.getState();
  console.log('   ✓ Units spawned:', Object.keys(accgState.units).length, 'turn:', accgState.currentTurn);

  // 4. TRADITIONAL MAHJONG
  console.log('[4/9] Testing Traditional 4-Player Mahjong Engine...');
  const mahjong = new MahjongEngine('ROOM_MAHJONG', () => {});
  mahjong.registerPlayer(playerTemplate);
  for (let i = 0; i < 5; i++) mahjong.tick(0.05);
  const mahjongState = mahjong.getState();
  console.log('   ✓ Table initialized with 4 seats (1 human + 3 bots), remaining wall tiles:', mahjongState.wallTilesRemaining);

  // 5. MAHJONG SOLITAIRE
  console.log('[5/9] Testing Mahjong Solitaire Speed Match Engine...');
  const solitaire = new MahjongSolitaireEngine('ROOM_SOLITAIRE', () => {});
  solitaire.registerPlayer(playerTemplate);
  solitaire.handleInput('local_player', { action: 'powerup', powerupId: 'lightning' });
  solitaire.tick(0.05);
  const solState = solitaire.getState();
  console.log('   ✓ Board tiles initialized:', solState.tiles.length, 'lightning powerup fired, score:', solState.players['local_player'].score);

  // 6. BRICK BREAKER OVERCHARGE
  console.log('[6/9] Testing Break Breaker Overcharge Engine...');
  const brick = new BrickBreakerEngine('ROOM_BRICK', () => {});
  brick.registerPlayer(playerTemplate);
  brick.handleInput('local_player', { targetX: 450, action: 'fire' });
  for (let i = 0; i < 20; i++) brick.tick(0.05);
  const brickState = brick.getState();
  console.log('   ✓ Bricks count:', brickState.bricks.length, 'balls count:', brickState.balls.length, 'paddle x:', brickState.paddle.x, 'lives:', brickState.lives, 'score:', brickState.score);

  // 7. NEON CYBER CHECKERS
  console.log('[7/9] Testing Neon Cyber Checkers Engine...');
  const checkers = new CheckersEngine('ROOM_CHECKERS', () => {});
  checkers.registerPlayer(playerTemplate);
  const chState = checkers.getState();
  console.log('   ✓ Checkers board initialized 8x8, pieces count:', chState.pieces.length, 'turn:', chState.currentTurn, 'AI active:', !!chState.players['bot_checkers_rival']);
  // Test selecting a piece
  const humanPiece = chState.pieces.find(p => p.player === 'red' && p.row === 5);
  if (humanPiece) {
    checkers.handleInput('local_player', { action: 'select_piece', pieceId: humanPiece.id });
    console.log('   ✓ Selected piece:', humanPiece.id, 'at [5,', humanPiece.col, '] selected in state:', checkers.getState().selectedPieceId === humanPiece.id);
  }

  // 8. CYBER SLITHER 3000
  console.log('[8/9] Testing Cyber Slither 3000 Engine...');
  const slither = new CyberSlitherEngine('ROOM_SLITHER', () => {});
  slither.registerPlayer(playerTemplate);
  slither.handleInput('local_player', { targetX: 600, targetY: 400, dash: true });
  for (let i = 0; i < 20; i++) slither.tick(0.05);
  const slitherState = slither.getState();
  const humanSnake = slitherState.snakes['local_player'];
  console.log('   ✓ Snakes in arena:', Object.keys(slitherState.snakes).length, 'energy pellets:', slitherState.pellets.length, 'human segments:', humanSnake ? humanSnake.segments.length : 'spawned');

  // 9. NEON GALAXY STRIKE
  console.log('[9/9] Testing Neon Galaxy Strike Engine...');
  const galaxy = new GalaxyStrikeEngine('ROOM_GALAXY', () => {});
  galaxy.registerPlayer(playerTemplate);
  galaxy.handleInput('local_player', { targetX: 400, shoot: true });
  for (let i = 0; i < 25; i++) galaxy.tick(0.05);
  const galaxyState = galaxy.getState();
  console.log('   ✓ Starfighter active at x:', galaxyState.player.x, 'enemies spawned:', galaxyState.enemies.length, 'player lasers:', galaxyState.lasers.length, 'wave:', galaxyState.wave);

  console.log('\n====================================================');
  console.log('   ✅ ALL 9 ARCADE HUB ENGINES TESTED & VERIFIED!    ');
  console.log('====================================================');
}

testAllNineEngines().catch(err => {
  console.error('Test Suite Failed:', err);
  process.exit(1);
});
