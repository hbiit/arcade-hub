"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const BlobBrawlEngine_1 = require("../engines/BlobBrawlEngine");
const GlowballEngine_1 = require("../engines/GlowballEngine");
const ACCGEngine_1 = require("../engines/ACCGEngine");
const MahjongSolitaireEngine_1 = require("../engines/MahjongSolitaireEngine");
console.log('[Test] Initializing arcade-hub game engine unit tests...');
// 1. Test BlobBrawlEngine
const blobEngine = new BlobBrawlEngine_1.BlobBrawlEngine('TESTROOM_BLOB', (_state) => { });
blobEngine.registerPlayer({
    socketId: 'player_1',
    userId: 'usr_1',
    profile: { id: 'usr_1', displayName: 'Tester', favoriteColor: '#00e5ff', level: 1 },
    score: 0,
    isReady: true,
    connected: true
});
blobEngine.tick(0.05);
const blobState = blobEngine.getState();
if (blobState && blobState.players['player_1']) {
    console.log('[Test] SUCCESS: BlobBrawlEngine ticked successfully with player state!');
}
else {
    console.error('[Test] FAILED: BlobBrawlEngine player state missing.');
    process.exit(1);
}
// 2. Test GlowballEngine
const glowEngine = new GlowballEngine_1.GlowballEngine('TESTROOM_GLOW', (_state) => { });
glowEngine.registerPlayer({
    socketId: 'player_2',
    userId: 'usr_2',
    profile: { id: 'usr_2', displayName: 'GlowTester', favoriteColor: '#ffe600', level: 2 },
    score: 0,
    isReady: true,
    connected: true
});
glowEngine.tick(0.05);
const glowState = glowEngine.getState();
if (glowState && glowState.players['player_2']) {
    console.log('[Test] SUCCESS: GlowballEngine ticked successfully with player state!');
}
else {
    console.error('[Test] FAILED: GlowballEngine player state missing.');
    process.exit(1);
}
// 3. Test ACCGEngine
const accgEngine = new ACCGEngine_1.ACCGEngine('TESTROOM_ACCG', (_state) => { });
accgEngine.registerPlayer({
    socketId: 'player_3',
    userId: 'usr_3',
    profile: { id: 'usr_3', displayName: 'GridCommander', favoriteColor: '#00ff66', level: 3 },
    score: 0,
    isReady: true,
    connected: true
});
accgEngine.tick(0.05);
const accgState = accgEngine.getState();
if (accgState && accgState.units['player_3']) {
    console.log('[Test] SUCCESS: ACCGEngine ticked successfully with grid unit state!');
}
else {
    console.error('[Test] FAILED: ACCGEngine unit state missing.');
    process.exit(1);
}
// 4. Test MahjongSolitaireEngine
const mahjongSolitaire = new MahjongSolitaireEngine_1.MahjongSolitaireEngine('TESTROOM_SOLITAIRE', (_state) => { });
mahjongSolitaire.registerPlayer({
    socketId: 'player_4',
    userId: 'usr_4',
    profile: { id: 'usr_4', displayName: 'TileMaster', favoriteColor: '#ff0055', level: 4 },
    score: 0,
    isReady: true,
    connected: true
});
mahjongSolitaire.tick(0.05);
const mahjongState = mahjongSolitaire.getState();
if (mahjongState && mahjongState.players['player_4']) {
    console.log('[Test] SUCCESS: MahjongSolitaireEngine ticked successfully with player state!');
}
else {
    console.error('[Test] FAILED: MahjongSolitaireEngine state missing.');
    process.exit(1);
}
console.log('[Test] ALL ENGINE TESTS PASSED CLEANLY! ✨');
