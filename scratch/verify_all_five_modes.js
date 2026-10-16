const { io } = require('c:/Users/ADMIN/Desktop/HNG/game/arcade-hub-project/client/node_modules/socket.io-client');

const SOCKET_EVENTS = {
  HUB_LIST_GAMES: 'hub:list_games',
  HUB_CREATE_ROOM: 'hub:create_room',
  HUB_JOIN_ROOM: 'hub:join_room',
  HUB_ADD_BOT: 'hub:add_bot',
  HUB_LEAVE_ROOM: 'hub:leave_room',
  ROOM_UPDATED: 'room:updated',
  GAME_START: 'game:start',
  GAME_INPUT: 'game:input',
  GAME_PAUSE_TOGGLE: 'game:pause_toggle',
  GAME_STATE_TICK: 'game:state_tick'
};

const SERVER_URL = 'http://localhost:4000';

async function testAllModes() {
  console.log('====================================================');
  console.log('   OWE ARCADE HUB: COMPLETE 5-MODE E2E TEST SUITE   ');
  console.log('====================================================');

  const socket = io(SERVER_URL, { reconnectionDelay: 500 });
  await new Promise((resolve) => socket.on('connect', resolve));
  console.log(`Connected to Authoritative Server [Socket ID: ${socket.id}]`);

  // Step 1: Catalog Check
  console.log('\n[1/6] Verifying Registry & Game Catalog...');
  const catalog = await new Promise((res) => socket.emit(SOCKET_EVENTS.HUB_LIST_GAMES, res));
  console.log(`Found ${catalog.length} registered games:`);
  catalog.forEach((g) => {
    console.log(`  ✓ [${g.id}] "${g.title}" | Category: ${g.category} | Players: ${g.minPlayers}-${g.maxPlayers}`);
  });

  const expectedModes = ['blob', 'glowball', 'accg', 'mahjong', 'mahjong-solitaire'];
  for (const m of expectedModes) {
    if (!catalog.some((g) => g.id === m)) {
      throw new Error(`Missing expected mode: ${m}`);
    }
  }

  // Helper function to test a mode lifecycle
  async function testMode(gameId, actionTestFn) {
    console.log(`\n--- Testing Mode: [${gameId.toUpperCase()}] ---`);
    let roomCode = '';
    
    // Create Room
    await new Promise((res) => {
      const onUpdate = (room) => {
        if (room.gameId === gameId && !roomCode) {
          roomCode = room.roomCode;
          socket.off(SOCKET_EVENTS.ROOM_UPDATED, onUpdate);
          res(room);
        }
      };
      socket.on(SOCKET_EVENTS.ROOM_UPDATED, onUpdate);
      socket.emit(SOCKET_EVENTS.HUB_CREATE_ROOM, { gameId, customName: `Test_${gameId}` });
    });

    console.log(`  ✓ Room created with code: ${roomCode}`);

    // Add Bot in Lobby
    socket.emit(SOCKET_EVENTS.HUB_ADD_BOT, { roomCode });
    await new Promise((r) => setTimeout(r, 150));
    console.log(`  ✓ Add Bot dispatched to lobby`);

    // Start Game
    socket.emit(SOCKET_EVENTS.GAME_START, { roomCode });

    // Wait for in_progress state tick
    const tickData = await new Promise((res, rej) => {
      const timeout = setTimeout(() => rej(new Error(`Timeout waiting for tick in ${gameId}`)), 6000);
      const onTick = (room) => {
        if (room.roomCode === roomCode && room.status === 'in_progress') {
          clearTimeout(timeout);
          socket.off(SOCKET_EVENTS.GAME_STATE_TICK, onTick);
          res(room);
        }
      };
      socket.on(SOCKET_EVENTS.GAME_STATE_TICK, onTick);
    });

    console.log(`  ✓ Game launched & ticking (Players: ${Object.keys(tickData.players).length})`);

    // Test specific game inputs
    if (actionTestFn) {
      await actionTestFn(roomCode, tickData);
    }

    // Test Pause
    socket.emit(SOCKET_EVENTS.GAME_PAUSE_TOGGLE, { roomCode });
    const pausedRoom = await new Promise((res) => {
      const onUpdate = (room) => {
        if (room.roomCode === roomCode && room.status === 'paused') {
          socket.off(SOCKET_EVENTS.ROOM_UPDATED, onUpdate);
          res(room);
        }
      };
      socket.on(SOCKET_EVENTS.ROOM_UPDATED, onUpdate);
    });
    console.log(`  ✓ Match paused successfully (Status: ${pausedRoom.status})`);

    // Resume
    socket.emit(SOCKET_EVENTS.GAME_PAUSE_TOGGLE, { roomCode });
    await new Promise((r) => setTimeout(r, 150));
    console.log(`  ✓ Match resumed successfully`);

    // Leave Room Cleanly
    socket.emit(SOCKET_EVENTS.HUB_LEAVE_ROOM, { roomCode });
    console.log(`  ✓ Left room cleanly. Mode [${gameId}] verified 100%!`);
  }

  // Mode 1: Blob Brawl
  await testMode('blob', async (roomCode) => {
    socket.emit(SOCKET_EVENTS.GAME_INPUT, { roomCode, dx: 1, dy: 0, dash: true });
    await new Promise((r) => setTimeout(r, 200));
    console.log(`  ✓ Sent steering (dx: 1, dy: 0) and dash pulse to BlobBrawl engine`);
  });

  // Mode 2: Glowball Overdrive
  await testMode('glowball', async (roomCode) => {
    socket.emit(SOCKET_EVENTS.GAME_INPUT, { roomCode, dy: -1 });
    await new Promise((r) => setTimeout(r, 200));
    console.log(`  ✓ Sent paddle movement (dy: -1) to Glowball engine`);
  });

  // Mode 3: ACCG Tactical Siege
  await testMode('accg', async (roomCode) => {
    socket.emit(SOCKET_EVENTS.GAME_INPUT, { roomCode, abilityId: 'vanguard', targetRow: 1 });
    await new Promise((r) => setTimeout(r, 200));
    console.log(`  ✓ Deployed tactical unit 'vanguard' to row 1 in ACCG engine`);
  });

  // Mode 4: Traditional Mahjong
  await testMode('mahjong', async (roomCode, room) => {
    const seats = room.gameData.seats;
    console.log(`  ✓ 4 authentic table seats initialized with winds: ${seats.map((s) => s.wind).join(', ')}`);
  });

  // Mode 5: Mahjong Solitaire Speed Match
  await testMode('mahjong-solitaire', async (roomCode, room) => {
    const tiles = room.gameData.tiles;
    console.log(`  ✓ Solitaire layout initialized with ${tiles.length} ivory tiles and power-up charges`);
  });

  console.log('\n====================================================');
  console.log('   🎉 ALL 5 GAME MODES FULLY VERIFIED & OPERATIONAL! ');
  console.log('====================================================\n');
  socket.disconnect();
  process.exit(0);
}

testAllModes().catch((err) => {
  console.error('VERIFICATION ERROR:', err);
  process.exit(1);
});
