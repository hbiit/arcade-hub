import React, { useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { GameId, GameMetadata, PlayerSession, RoomState, SOCKET_EVENTS } from '../../shared/src';
import { BlobBrawlCanvas } from './games/blob/BlobBrawlCanvas';
import { GlowballCanvas } from './games/glowball/GlowballCanvas';
import { ACCGCanvas } from './games/accg/ACCGCanvas';
import { MahjongCanvas } from './games/mahjong/MahjongCanvas';
import { MahjongSolitaireCanvas } from './games/mahjong/MahjongSolitaireCanvas';
import { SoundFX } from './utils/soundEffects';
import { fetchStartNgPlayer, triggerStartNgSignIn, saveStartNgScore, StartNgUser } from './utils/startNg';
import { LocalGameRunner } from './utils/localGameRunner';

const socketUrl = typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'http://localhost:4000' : '/';
const socket: Socket = io(socketUrl, { autoConnect: true, reconnectionAttempts: 2, timeout: 2500 });

const DEFAULT_GAMES: GameMetadata[] = [
  {
    id: 'blob',
    title: 'Blob Brawl',
    category: 'Arena Action',
    minPlayers: 1,
    maxPlayers: 6,
    durationSeconds: 60,
    description: 'Fast 60s coin gathering frenzy! Bump opponents to steal coins, dodge smart AI bots, and grab powerups!'
  },
  {
    id: 'glowball',
    title: 'Glowball Overdrive',
    category: 'Arena Action',
    minPlayers: 1,
    maxPlayers: 6,
    durationSeconds: 90,
    description: 'Neon Cyber Pong & Air Hockey with curve deflection physics, speed gates, and paddle powers!'
  },
  {
    id: 'accg',
    title: 'ACCG Tactical Siege',
    category: 'Tactical Strategy',
    minPlayers: 1,
    maxPlayers: 4,
    durationSeconds: 120,
    description: '3-Lane card assault defense! Deploy tactical battle cards to march down lanes and destroy the Command Core.'
  },
  {
    id: 'mahjong',
    title: 'Traditional 4-Player Mahjong (麻將)',
    category: 'Puzzle & Board',
    minPlayers: 1,
    maxPlayers: 4,
    durationSeconds: 90,
    description: 'Authentic 136 ivory tiles with Chow (吃), Pung (碰), Kong (槓), and Hu (胡) against 3 AI table rivals.'
  },
  {
    id: 'mahjong-solitaire',
    title: 'Mahjong Solitaire Speed Match',
    category: 'Puzzle & Board',
    minPlayers: 1,
    maxPlayers: 4,
    durationSeconds: 90,
    description: '3D multi-layered ivory tile matching puzzle with combo streaks, Lightning Zap, and Time Freeze.'
  }
];

interface LeaderboardRecord {
  userId: string;
  displayName: string;
  favoriteColor: string;
  wins: number;
  totalScore: number;
  matchesPlayed: number;
  level: number;
}

export const App: React.FC = () => {
  const [games, setGames] = useState<GameMetadata[]>(DEFAULT_GAMES);
  const [selectedGame, setSelectedGame] = useState<GameId>('blob');
  const [activeCategory, setActiveCategory] = useState<'all' | 'action' | 'strategy' | 'puzzle'>('all');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [activeRoom, setActiveRoom] = useState<RoomState<any> | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);

  // start.ng Player Character State
  const [startNgUser, setStartNgUser] = useState<StartNgUser | null>(null);
  const [isGuest, setIsGuest] = useState(true);

  // User Profile Customization
  const [playerName, setPlayerName] = useState(() => localStorage.getItem('arcade_player_name') || 'Cyber_Striker');
  const [playerColor, setPlayerColor] = useState(() => localStorage.getItem('arcade_player_color') || '#00e5ff');

  // Modals & Dialogs
  const [activeModal, setActiveModal] = useState<'none' | 'manual' | 'leaderboard' | 'settings'>('none');
  const [manualGameTab, setManualGameTab] = useState<GameId>('blob');
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [leaderboardData, setLeaderboardData] = useState<LeaderboardRecord[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('disconnected');

  const localRunnerRef = useRef<LocalGameRunner | null>(null);

  // Intercept socket events for standalone in-browser runner
  useEffect(() => {
    const origEmit = socket.emit.bind(socket);
    socket.emit = (event: string, ...args: any[]) => {
      if (localRunnerRef.current) {
        if (event === SOCKET_EVENTS.GAME_INPUT) {
          const payload = args[0]?.input || args[0];
          localRunnerRef.current.handleInput(socket.id || 'local_player', payload);
        } else if (event === SOCKET_EVENTS.GAME_PAUSE_TOGGLE) {
          localRunnerRef.current.togglePause();
        }
      }
      return origEmit(event, ...args);
    };
  }, []);

  // Check start.ng player on mount
  useEffect(() => {
    fetchStartNgPlayer().then(({ user, isGuest: guest }) => {
      setIsGuest(guest);
      if (user) {
        setStartNgUser(user);
        setPlayerName(user.name);
        if (user.style?.primaryColor) {
          setPlayerColor(user.style.primaryColor);
        }
      }
    });

    socket.on('connect', () => setConnectionStatus('connected'));
    socket.on('disconnect', () => setConnectionStatus('disconnected'));

    socket.emit(SOCKET_EVENTS.HUB_LIST_GAMES, (list: GameMetadata[]) => {
      if (Array.isArray(list) && list.length > 0) setGames(list);
    });

    socket.on(SOCKET_EVENTS.ROOM_UPDATED, (room: RoomState<any>) => {
      setActiveRoom(room);
      if (room.status === 'ended') {
        SoundFX.playVictory();
        handleScoreSave(room);
      }
    });

    socket.on(SOCKET_EVENTS.GAME_STATE_TICK, (room: RoomState<any>) => {
      setActiveRoom({ ...room });
    });

    socket.on(SOCKET_EVENTS.ERROR_MESSAGE, (msg: string) => {
      showToast(`⚠️ ${msg}`);
    });

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off(SOCKET_EVENTS.ROOM_UPDATED);
      socket.off(SOCKET_EVENTS.GAME_STATE_TICK);
      socket.off(SOCKET_EVENTS.ERROR_MESSAGE);
    };
  }, [playerName]);

  const handleScoreSave = (room: RoomState<any>) => {
    const entries = Object.values<any>(room.gameData?.players || room.gameData?.units || room.gameData?.seats || {});
    const sorted = [...entries].sort((a, b) => (b.coinsCarried || b.score || 0) - (a.coinsCarried || a.score || 0));
    const winner = sorted[0];
    const isWinner = winner && winner.name === playerName;
    const finalScore = winner ? (winner.coinsCarried !== undefined ? winner.coinsCarried : winner.score || 0) : 0;
    saveStartNgScore(finalScore, isWinner ? 1 : 0);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    SoundFX.enabled = next;
    if (next) SoundFX.playCoinCollect();
  };

  const saveSettings = (name: string, color: string) => {
    const cleanName = name.trim() || 'Cyber_Striker';
    setPlayerName(cleanName);
    setPlayerColor(color);
    localStorage.setItem('arcade_player_name', cleanName);
    localStorage.setItem('arcade_player_color', color);
    showToast('⚙️ Profile Settings Saved!');
    setActiveModal('none');
  };

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch('http://localhost:4000/api/leaderboard');
      if (res.ok) {
        const data = await res.json();
        setLeaderboardData(data);
        return;
      }
    } catch {
      // Fallback
    }
  };

  const openLeaderboard = () => {
    fetchLeaderboard();
    setActiveModal('leaderboard');
  };

  const launchLocalGame = (gameId: GameId) => {
    if (localRunnerRef.current) localRunnerRef.current.stop();
    const session: PlayerSession = {
      socketId: socket.id || 'local_player',
      userId: startNgUser ? String(startNgUser.id) : 'guest_player',
      profile: {
        id: startNgUser ? String(startNgUser.id) : 'guest_player',
        displayName: playerName,
        favoriteColor: playerColor,
        avatarUrl: startNgUser?.face,
        level: 1
      },
      score: 0,
      isReady: true,
      connected: true
    };
    const runner = new LocalGameRunner(gameId, session, (room) => {
      setActiveRoom({ ...room });
      if (room.status === 'ended') {
        SoundFX.playVictory();
        handleScoreSave(room);
      }
    });
    localRunnerRef.current = runner;
    setActiveRoom(runner.getState());
    runner.start();
  };

  const handleQuickPlay = () => {
    SoundFX.playButton();
    if (connectionStatus === 'connected' && socket.connected) {
      socket.emit(
        SOCKET_EVENTS.HUB_CREATE_ROOM,
        { gameId: 'blob', customName: playerName },
        () => {}
      );
    } else {
      launchLocalGame('blob');
    }
  };

  const handleCreateRoom = (gameId: GameId) => {
    SoundFX.playButton();
    if (connectionStatus === 'connected' && socket.connected) {
      socket.emit(
        SOCKET_EVENTS.HUB_CREATE_ROOM,
        { gameId, customName: playerName },
        () => {}
      );
    } else {
      launchLocalGame(gameId);
    }
  };

  const handleJoinRoom = () => {
    if (!roomCodeInput.trim()) {
      showToast('⚠️ Please enter a 6-digit room code.');
      return;
    }
    SoundFX.playButton();
    socket.emit(
      SOCKET_EVENTS.HUB_JOIN_ROOM,
      { roomCode: roomCodeInput.trim().toUpperCase(), customName: playerName }
    );
  };

  const handleAddBot = () => {
    if (!activeRoom) return;
    SoundFX.playPowerup();
    socket.emit(SOCKET_EVENTS.HUB_ADD_BOT, { roomCode: activeRoom.roomCode });
    showToast('🤖 AI Rival Bot dispatched to lobby!');
  };

  const handleTogglePause = () => {
    if (!activeRoom) return;
    SoundFX.playButton();
    if (localRunnerRef.current) {
      localRunnerRef.current.togglePause();
    } else {
      socket.emit(SOCKET_EVENTS.GAME_PAUSE_TOGGLE, { roomCode: activeRoom.roomCode });
    }
  };

  const handleRematch = () => {
    if (!activeRoom) return;
    SoundFX.playButton();
    if (localRunnerRef.current) {
      launchLocalGame(activeRoom.gameId);
    } else {
      socket.emit(SOCKET_EVENTS.GAME_START, { roomCode: activeRoom.roomCode });
    }
  };

  const handleLeaveMatchConfirmed = () => {
    if (localRunnerRef.current) {
      localRunnerRef.current.stop();
      localRunnerRef.current = null;
    }
    if (activeRoom && socket.connected) {
      socket.emit(SOCKET_EVENTS.HUB_LEAVE_ROOM, { roomCode: activeRoom.roomCode });
    }
    setShowExitConfirm(false);
    setActiveRoom(null);
  };

  const filteredGames = games.filter(g => {
    if (activeCategory === 'all') return true;
    if (activeCategory === 'action') return g.category === 'Arena Action';
    if (activeCategory === 'strategy') return g.category === 'Tactical Strategy';
    if (activeCategory === 'puzzle') return g.category === 'Puzzle & Board';
    return true;
  });

  const neonColors = ['#00e5ff', '#ffe600', '#ff007f', '#10b981', '#8b5cf6', '#f97316'];

  // ----------------------------------------------------
  // RENDER: ACTIVE ROOM (LOBBY / PLAYING / PAUSED / ENDED)
  // ----------------------------------------------------
  if (activeRoom) {
    if (activeRoom.status === 'lobby') {
      return (
        <div style={containerStyle}>
          {/* Header */}
          <header style={headerStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 26 }}>🕹️</span>
              <div>
                <h2 style={{ margin: 0, color: '#00e5ff', letterSpacing: 1.5, fontSize: 20 }}>
                  TACTICAL LOBBY // {activeRoom.roomCode}
                </h2>
                <small style={{ color: '#94a3b8' }}>
                  Game Mode: <strong style={{ color: '#fff' }}>{activeRoom.gameId.toUpperCase()}</strong>
                </small>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={() => {
                  setManualGameTab(activeRoom.gameId);
                  setActiveModal('manual');
                }}
                style={iconBtnStyle}
              >
                📖 Rules & Controls
              </button>
              <button onClick={toggleSound} style={iconBtnStyle}>
                {soundEnabled ? '🔊 ON' : '🔇 OFF'}
              </button>
            </div>
          </header>

          <div style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
              <h3 style={{ margin: 0, color: '#fff', fontSize: 18 }}>
                Connected Operatives ({Object.keys(activeRoom.players).length})
              </h3>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <button
                  onClick={handleAddBot}
                  style={{
                    padding: '6px 14px',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 20,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: 'pointer',
                    boxShadow: '0 0 12px rgba(16, 185, 129, 0.4)'
                  }}
                >
                  ➕ Add AI Bot (Rival)
                </button>
                <span style={{ fontSize: 12, color: '#10b981', background: '#064e3b', padding: '4px 10px', borderRadius: 12, fontWeight: 700 }}>
                  ● Auto-Bots Enabled
                </span>
              </div>
            </div>

            {/* Operatives Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginBottom: 24 }}>
              {Object.values(activeRoom.players).map(p => (
                <div
                  key={p.socketId}
                  style={{
                    padding: 16,
                    background: '#090d16',
                    border: `2px solid ${p.profile.favoriteColor || '#00e5ff'}`,
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    boxShadow: `0 0 16px ${p.profile.favoriteColor || '#00e5ff'}22`
                  }}
                >
                  <div
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      background: p.profile.favoriteColor || '#00e5ff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 900,
                      color: '#000',
                      fontSize: 16,
                      boxShadow: `0 0 10px ${p.profile.favoriteColor || '#00e5ff'}`
                    }}
                  >
                    {p.isBot ? '🤖' : p.profile.displayName[0]?.toUpperCase() || 'O'}
                  </div>
                  <div>
                    <div style={{ fontWeight: 800, color: '#fff', fontSize: 14 }}>
                      {p.profile.displayName} {p.socketId === socket.id ? '(YOU)' : ''}
                    </div>
                    <small style={{ color: p.isBot ? '#ffe600' : '#94a3b8', fontSize: 12 }}>
                      {p.isBot ? 'Autonomous Combat AI' : `Platform Lv.${p.profile.level}`}
                    </small>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ background: '#090d16', padding: 16, borderRadius: 10, marginBottom: 24, border: '1px solid #1e293b' }}>
              <p style={{ margin: 0, fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
                💡 <strong>Solo or Co-op:</strong> When you press <strong>Launch Match</strong>, any empty player slots are automatically filled by autonomous AI bots to provide immediate high-intensity matches!
              </p>
            </div>

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <button
                onClick={() => socket.emit(SOCKET_EVENTS.GAME_START, { roomCode: activeRoom.roomCode })}
                style={glowPrimaryBtnStyle}
              >
                🚀 Launch Match Now
              </button>
              <button
                onClick={() => setShowExitConfirm(true)}
                style={secondaryBtnStyle}
              >
                Leave Lobby
              </button>
            </div>
          </div>

          {/* Render Manual if opened */}
          {activeModal === 'manual' && renderManualModal()}
          {showExitConfirm && renderExitConfirmModal()}
          {renderToast()}
        </div>
      );
    }

    // In-game / Paused / Ended
    const gameData = (activeRoom.gameData || {}) as any;
    const playerEntries = Object.values<any>(gameData.players || gameData.units || gameData.seats || {});
    const sortedPlayers = [...playerEntries].sort((a, b) => (b.coinsCarried || b.score || 0) - (a.coinsCarried || a.score || 0));
    const recentEvents = (gameData.events || []) as any[];
    const latestEvent = recentEvents.length > 0 ? recentEvents[recentEvents.length - 1] : null;

    return (
      <div style={{ ...containerStyle, maxWidth: 1120 }}>
        {/* Top In-Game Bar */}
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#111827',
            padding: '12px 20px',
            borderRadius: 12,
            border: '1px solid #1f2937',
            marginBottom: 16,
            flexWrap: 'wrap',
            gap: 12
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 16, color: '#00e5ff', fontWeight: 900, letterSpacing: 1 }}>
              ROOM: {activeRoom.roomCode}
            </span>
            <span style={{ color: '#94a3b8', fontSize: 13, textTransform: 'uppercase' }}>
              {activeRoom.gameId} ARENA
            </span>
            {activeRoom.status === 'paused' && (
              <span style={{ background: '#f59e0b', color: '#000', padding: '3px 8px', borderRadius: 6, fontWeight: 900, fontSize: 11 }}>
                PAUSED
              </span>
            )}
          </div>

          {/* Time Remaining Clock */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>MATCH CLOCK:</span>
            <span
              style={{
                fontSize: 22,
                fontWeight: 900,
                color: activeRoom.timeRemaining < 15 ? '#ef4444' : '#00e5ff',
                fontFamily: "'Orbitron', monospace",
                animation: activeRoom.timeRemaining < 10 ? 'pulse 0.5s infinite alternate' : 'none'
              }}
            >
              {Math.ceil(activeRoom.timeRemaining)}s
            </span>
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={handleTogglePause}
              style={{
                ...iconBtnStyle,
                background: activeRoom.status === 'paused' ? '#10b981' : '#334155',
                color: '#fff'
              }}
            >
              {activeRoom.status === 'paused' ? '▶️ Resume' : '⏸️ Pause'}
            </button>
            <button
              onClick={() => {
                setManualGameTab(activeRoom.gameId);
                setActiveModal('manual');
              }}
              style={iconBtnStyle}
            >
              📖 Rules
            </button>
            <button onClick={toggleSound} style={iconBtnStyle}>
              {soundEnabled ? '🔊' : '🔇'}
            </button>
            <button onClick={() => setShowExitConfirm(true)} style={secondaryBtnStyle}>
              Leave
            </button>
          </div>
        </header>

        {/* Live Combat Event Ticker */}
        {latestEvent && activeRoom.status === 'in_progress' && (
          <div
            style={{
              background: '#090d16',
              border: `1px solid ${latestEvent.color || '#00e5ff'}55`,
              color: latestEvent.color || '#00e5ff',
              padding: '8px 16px',
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 700,
              textAlign: 'center',
              marginBottom: 14,
              boxShadow: `0 0 16px ${latestEvent.color || '#00e5ff'}22`
            }}
          >
            ⚡ {latestEvent.text}
          </div>
        )}

        {/* Main Arena Layout: Canvas + Live Leaderboard */}
        <div style={{ display: 'flex', gap: 20, justifyContent: 'center', alignItems: 'flex-start', flexWrap: 'wrap' }}>
          {/* Game Canvas Container */}
          <div style={{ position: 'relative', maxWidth: '100%' }}>
            {activeRoom.gameId === 'blob' && <BlobBrawlCanvas socket={socket} room={activeRoom} />}
            {activeRoom.gameId === 'glowball' && <GlowballCanvas socket={socket} room={activeRoom} />}
            {activeRoom.gameId === 'accg' && <ACCGCanvas socket={socket} room={activeRoom} />}
            {activeRoom.gameId === 'mahjong' && <MahjongCanvas socket={socket} room={activeRoom} />}
            {activeRoom.gameId === 'mahjong-solitaire' && <MahjongSolitaireCanvas socket={socket} room={activeRoom} />}

            {/* Paused Overlay */}
            {activeRoom.status === 'paused' && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(9, 13, 22, 0.88)',
                  backdropFilter: 'blur(8px)',
                  borderRadius: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 24,
                  zIndex: 25
                }}
              >
                <div style={{ fontSize: 44, marginBottom: 8 }}>⏸️</div>
                <h2 style={{ fontSize: 28, color: '#f59e0b', margin: '0 0 10px', letterSpacing: 1.5 }}>
                  TACTICAL MATCH PAUSED
                </h2>
                <p style={{ color: '#cbd5e1', fontSize: 14, marginBottom: 24, textAlign: 'center', maxWidth: 400 }}>
                  Take a breather, review strategy, or inspect controls. The arena timer and authoritative physics are frozen.
                </p>
                <div style={{ display: 'flex', gap: 14 }}>
                  <button onClick={handleTogglePause} style={glowPrimaryBtnStyle}>
                    ▶️ Resume Match
                  </button>
                  <button
                    onClick={() => {
                      setManualGameTab(activeRoom.gameId);
                      setActiveModal('manual');
                    }}
                    style={secondaryBtnStyle}
                  >
                    📖 Read Manual
                  </button>
                  <button onClick={() => setShowExitConfirm(true)} style={secondaryBtnStyle}>
                    🚪 Exit Arena
                  </button>
                </div>
              </div>
            )}

            {/* End of Match Victory Overlay */}
            {activeRoom.status === 'ended' && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'rgba(9, 13, 22, 0.94)',
                  borderRadius: 16,
                  backdropFilter: 'blur(10px)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 24,
                  zIndex: 30
                }}
              >
                <div style={{ fontSize: 52, marginBottom: 8 }}>🏆</div>
                <h2 style={{ fontSize: 32, margin: 0, color: '#ffe600', textShadow: '0 0 20px rgba(255, 230, 0, 0.6)' }}>
                  MATCH COMPLETED!
                </h2>
                <p style={{ color: '#94a3b8', marginTop: 6, marginBottom: 20, fontSize: 15 }}>
                  Champion:{' '}
                  <strong style={{ color: sortedPlayers[0]?.color || '#00e5ff' }}>
                    {sortedPlayers[0]?.name || 'Combatant'}
                  </strong>{' '}
                  with {sortedPlayers[0]?.coinsCarried !== undefined ? `🪙 ${sortedPlayers[0].coinsCarried} coins` : `🏆 ${sortedPlayers[0]?.score || 0} pts`}!
                </p>

                {/* Podium Top 3 */}
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end', marginBottom: 24 }}>
                  {sortedPlayers.slice(0, 3).map((p, idx) => {
                    const medals = ['🥇 1ST', '🥈 2ND', '🥉 3RD'];
                    const heights = [120, 95, 75];
                    return (
                      <div
                        key={p.name}
                        style={{
                          width: 110,
                          height: heights[idx],
                          background: '#1e293b',
                          border: `2px solid ${idx === 0 ? '#ffe600' : idx === 1 ? '#cbd5e1' : '#b45309'}`,
                          borderRadius: 8,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 8,
                          boxShadow: idx === 0 ? '0 0 16px rgba(255, 230, 0, 0.4)' : 'none'
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 900, color: '#fff' }}>{medals[idx]}</span>
                        <div style={{ fontWeight: 800, fontSize: 12, color: p.color, margin: '4px 0' }}>
                          {p.name.slice(0, 10)}
                        </div>
                        <span style={{ fontSize: 12, color: '#ffe600', fontWeight: 800 }}>
                          {p.coinsCarried !== undefined ? `🪙 ${p.coinsCarried}` : `🏆 ${p.score || 0}`}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: 14 }}>
                  <button onClick={handleRematch} style={glowPrimaryBtnStyle}>
                    🔄 Play Again (Rematch)
                  </button>
                  <button onClick={() => setShowExitConfirm(true)} style={secondaryBtnStyle}>
                    Return to Hub
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Live In-Game Leaderboard Sidebar */}
          <div
            style={{
              width: 240,
              background: '#111827',
              border: '1px solid #1f2937',
              borderRadius: 14,
              padding: 16,
              alignSelf: 'flex-start',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)'
            }}
          >
            <h4 style={{ margin: '0 0 12px', color: '#00e5ff', fontSize: 13, letterSpacing: 1.5, fontWeight: 800 }}>
              🏆 ARENA STANDINGS
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sortedPlayers.map((p, idx) => (
                <div
                  key={p.name}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '8px 10px',
                    borderRadius: 8,
                    background: idx === 0 ? '#1e293b' : '#090d16',
                    border: idx === 0 ? '1px solid #ffe60066' : '1px solid #1e293b'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, overflow: 'hidden' }}>
                    <span style={{ fontSize: 12, color: idx === 0 ? '#ffe600' : '#94a3b8', fontWeight: 700 }}>
                      #{idx + 1}
                    </span>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: p.color || '#fff',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis'
                      }}
                    >
                      {p.name}
                    </span>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#ffe600' }}>
                    {p.coinsCarried !== undefined ? p.coinsCarried : p.score || 0}
                  </span>
                </div>
              ))}
            </div>

            {/* Quick Tips */}
            <div style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid #1f2937', fontSize: 12, color: '#94a3b8' }}>
              <div style={{ marginBottom: 6, color: '#fff', fontWeight: 700 }}>Game Controls:</div>
              <div>🖱️ <strong>Mouse/Touch:</strong> Steer / Select</div>
              <div>⚡ <strong>Space / Click:</strong> Dash / Action</div>
              <div>🛡️ <strong>Powerups:</strong> Speed / Magnet / Shield</div>
            </div>
          </div>
        </div>

        {/* Modals & Dialogs */}
        {activeModal === 'manual' && renderManualModal()}
        {showExitConfirm && renderExitConfirmModal()}
        {renderToast()}
      </div>
    );
  }

  // ----------------------------------------------------
  // RENDER: MAIN ARCADE HUB SELECTION SCREEN
  // ----------------------------------------------------
  return (
    <div style={containerStyle}>
      {/* Top Header */}
      <header style={headerStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 36 }}>🕹️</span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 24, color: '#00e5ff', letterSpacing: 2 }}>
                START.NG ARCADE HUB
              </h1>
              <span
                style={{
                  fontSize: 11,
                  padding: '3px 8px',
                  borderRadius: 12,
                  background: connectionStatus === 'connected' ? '#064e3b' : '#7f1d1d',
                  color: connectionStatus === 'connected' ? '#10b981' : '#f87171',
                  fontWeight: 800
                }}
              >
                ● {connectionStatus === 'connected' ? '20Hz LIVE' : 'OFFLINE'}
              </span>
            </div>
            <small style={{ color: '#94a3b8' }}>
              Multiplayer Arcade Ecosystem • 5 Verified Game Modes • AI Rival Bots
            </small>
          </div>
        </div>

        {/* start.ng Character Profile Card */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#1e293b', padding: '6px 14px', borderRadius: 999, border: '1px solid #334155' }}>
          {startNgUser?.face ? (
            <img src={startNgUser.face} alt={startNgUser.name} style={{ width: 32, height: 32, borderRadius: '50%' }} />
          ) : (
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: playerColor, color: '#000', fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
              {playerName[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <b style={{ display: 'block', fontSize: 13, color: '#fff' }}>{playerName}</b>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              {startNgUser?.account ? `@${startNgUser.account}` : 'Guest Player'}
            </span>
          </div>
          {isGuest && (
            <button
              onClick={triggerStartNgSignIn}
              style={{
                border: 0,
                borderRadius: 999,
                padding: '4px 10px',
                background: '#d8fd71',
                color: '#000',
                fontWeight: 800,
                fontSize: 11,
                cursor: 'pointer'
              }}
            >
              Sign in
            </button>
          )}
        </div>

        {/* Global Hub Navigation Controls */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => {
              setManualGameTab(selectedGame);
              setActiveModal('manual');
            }}
            style={iconBtnStyle}
          >
            📖 Manual & Rules
          </button>
          <button onClick={openLeaderboard} style={iconBtnStyle}>
            🏆 Leaderboard
          </button>
          <button onClick={() => setActiveModal('settings')} style={iconBtnStyle}>
            ⚙️ Operative: <strong style={{ color: playerColor }}>{playerName}</strong>
          </button>
          <button onClick={toggleSound} style={iconBtnStyle}>
            {soundEnabled ? '🔊 ON' : '🔇 OFF'}
          </button>
        </div>
      </header>

      {/* Featured Banner with Quick Play */}
      <div
        style={{
          background: 'linear-gradient(135deg, #1e1b4b 0%, #0f172a 100%)',
          border: '2px solid #6366f1',
          borderRadius: 16,
          padding: '24px 30px',
          marginBottom: 28,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 0 35px rgba(99, 102, 241, 0.3)',
          flexWrap: 'wrap',
          gap: 20
        }}
      >
        <div style={{ maxWidth: 540 }}>
          <span style={{ background: '#4f46e5', color: '#fff', padding: '4px 10px', borderRadius: 12, fontSize: 11, fontWeight: 900 }}>
            FEATURED QUICK BRAWL
          </span>
          <h2 style={{ margin: '8px 0 6px', fontSize: 26, color: '#fff' }}>💥 Blob Brawl Arena</h2>
          <p style={{ margin: 0, color: '#cbd5e1', fontSize: 14, lineHeight: 1.5 }}>
            Fast 60-second coin gathering frenzy! Bump slower opponents to steal coins, dodge smart AI bots, grab power-up crates, and survive 3-bump knockouts!
          </p>
        </div>
        <button
          onClick={handleQuickPlay}
          style={{ ...glowPrimaryBtnStyle, padding: '16px 30px', fontSize: 16 }}
        >
          ⚡ Quick Play with Bots!
        </button>
      </div>

      {/* Game Mode Filters */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <h3 style={{ color: '#fff', margin: 0, fontSize: 20 }}>Select Game Mode ({filteredGames.length})</h3>

        {/* Category Tabs */}
        <div style={{ display: 'flex', gap: 6, background: '#111827', padding: 4, borderRadius: 10, border: '1px solid #1f2937' }}>
          {(['all', 'action', 'strategy', 'puzzle'] as const).map(cat => {
            const labels = { all: 'All Games', action: 'Arena Action', strategy: 'Tactical Strategy', puzzle: 'Puzzle & Board' };
            const isActive = activeCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  padding: '6px 14px',
                  background: isActive ? '#00e5ff' : 'transparent',
                  color: isActive ? '#000' : '#94a3b8',
                  border: 'none',
                  borderRadius: 8,
                  fontWeight: 800,
                  fontSize: 12,
                  cursor: 'pointer',
                  transition: 'all 0.15s'
                }}
              >
                {labels[cat]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Game Catalog Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))', gap: 18, marginBottom: 32 }}>
        {filteredGames.map(g => {
          const isSel = selectedGame === g.id;
          const icon = g.id === 'blob' ? '💥' : g.id === 'glowball' ? '⚡' : g.id === 'accg' ? '🛡️' : g.id === 'mahjong' ? '🀄' : '🀆';
          return (
            <div
              key={g.id}
              onClick={() => setSelectedGame(g.id)}
              style={{
                padding: 22,
                borderRadius: 14,
                background: '#111827',
                border: isSel ? '2px solid #00e5ff' : '1px solid #1f2937',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: isSel ? '0 0 24px rgba(0, 229, 255, 0.25)' : 'none',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between'
              }}
            >
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 11, background: '#1e293b', color: '#00e5ff', padding: '3px 8px', borderRadius: 8, fontWeight: 700 }}>
                    {g.category}
                  </span>
                  <span style={{ fontSize: 26 }}>{icon}</span>
                </div>
                <h3 style={{ margin: '12px 0 6px', color: isSel ? '#00e5ff' : '#fff', fontSize: 18 }}>
                  {g.title}
                </h3>
                <p style={{ fontSize: 13, color: '#94a3b8', margin: '0 0 16px', minHeight: 48, lineHeight: 1.4 }}>
                  {g.description}
                </p>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 14 }}>
                  <span>👥 {g.minPlayers}–{g.maxPlayers} Players</span>
                  <span>⏱️ {g.durationSeconds}s Match</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCreateRoom(g.id);
                    }}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      background: isSel ? 'linear-gradient(135deg, #00e5ff, #3b82f6)' : '#1e293b',
                      color: isSel ? '#000' : '#fff',
                      border: 'none',
                      borderRadius: 8,
                      fontWeight: 800,
                      fontSize: 12,
                      cursor: 'pointer'
                    }}
                  >
                    Play Mode
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setManualGameTab(g.id);
                      setActiveModal('manual');
                    }}
                    style={{
                      padding: '8px 12px',
                      background: '#1f2937',
                      color: '#cbd5e1',
                      border: '1px solid #374151',
                      borderRadius: 8,
                      fontWeight: 700,
                      fontSize: 12,
                      cursor: 'pointer'
                    }}
                  >
                    📖 Rules
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Lobby Join / Create Controls */}
      <div
        style={{
          background: '#111827',
          border: '1px solid #1f2937',
          borderRadius: 14,
          padding: 24,
          display: 'flex',
          gap: 16,
          alignItems: 'center',
          flexWrap: 'wrap'
        }}
      >
        <button
          onClick={() => handleCreateRoom(selectedGame)}
          style={glowPrimaryBtnStyle}
        >
          ➕ Create Custom Arena
        </button>

        <div style={{ display: 'flex', gap: 10, flex: 1, minWidth: 260 }}>
          <input
            placeholder="ENTER 6-DIGIT ROOM CODE"
            value={roomCodeInput}
            onChange={e => setRoomCodeInput(e.target.value.toUpperCase())}
            maxLength={6}
            style={{
              flex: 1,
              padding: '12px 16px',
              borderRadius: 8,
              border: '1px solid #334155',
              background: '#090d16',
              color: '#fff',
              fontSize: 14,
              letterSpacing: 2,
              fontWeight: 800
            }}
          />
          <button
            onClick={handleJoinRoom}
            style={{ ...secondaryBtnStyle, background: '#3b82f6', color: '#fff', border: 'none' }}
          >
            Join Arena
          </button>
        </div>
      </div>

      {/* Modals & Dialogs */}
      {activeModal === 'manual' && renderManualModal()}
      {activeModal === 'leaderboard' && renderLeaderboardModal()}
      {activeModal === 'settings' && renderSettingsModal()}
      {renderToast()}
    </div>
  );

  // ----------------------------------------------------
  // SUB-RENDER: GAME MANUAL & HOW-TO-PLAY MODAL
  // ----------------------------------------------------
  function renderManualModal() {
    const manualContent: Record<GameId, {
      title: string;
      category: string;
      objective: string;
      controls: string[];
      rules: string[];
      powerups: string[];
      victory: string;
    }> = {
      blob: {
        title: 'Blob Brawl',
        category: 'Arena Action Brawler',
        objective: 'Score the highest points by gathering gold coins and knocking out rival blobs before the 60-second arena timer ends.',
        controls: [
          '🖱️ Mouse Steering / Touch: Guide your blob towards coins and away from hazards',
          '⚡ Spacebar / Click: Execute a burst dash to ram opponents and steal their coins'
        ],
        rules: [
          'Every blob starts with 3 Knockout Lives.',
          'Bumping into a smaller or equal-mass opponent steals 25% of their carried coins.',
          'Ramming someone 3 times triggers a temporary Knockout and scatters all their coins onto the field!',
          'Golden coins spawn continuously across the grid to keep the combat fast-paced.'
        ],
        powerups: [
          '⚡ Speed Boost: 200% movement velocity for 6 seconds',
          '🧲 Coin Magnet: Automatically pulls in coins within a 140px radius',
          '🛡️ Titanium Shield: Deflects enemy collisions without losing coins or lives'
        ],
        victory: 'The operative carrying the most coins when the timer expires wins 1st place on the Imperial Podium.'
      },
      glowball: {
        title: 'Glowball Overdrive',
        category: 'Neon Cyber Pong & Air Hockey',
        objective: 'Deflect the pulsating plasma glowball past your opponent’s goal line to rack up 5 match points.',
        controls: [
          '🖱️ Vertical Cursor / Touch Drag: Move your cyber paddle up and down along your defending goal line',
          '⚡ Angled Deflection: Hitting the ball near paddle edges adds high-velocity curvature and spins'
        ],
        rules: [
          'First player to reach 5 goals immediately claims match victory.',
          'Ball velocity increases by 5% on every clean paddle deflection.',
          'Special speed gates in the middle lane accelerate the ball to hypersonic speeds.'
        ],
        powerups: [
          '📏 Paddle Extender: Doubles paddle height for 8 seconds',
          '💥 Overcharge Blast: Launches the ball at 2.5x speed on next contact'
        ],
        victory: 'Score 5 goals against the opponent or hold the highest score when the 90-second match clock hits 0.'
      },
      accg: {
        title: 'ACCG Tactical Siege',
        category: 'Lane Defense & Card Strategy',
        objective: 'Deploy tactical battle cards from your deck to march down lanes and destroy the enemy Command Core.',
        controls: [
          '🖱️ Click to Select Card: Choose an operative from your tactical deck',
          '🖱️ Click Lane: Deploy selected operative into top, middle, or bottom assault lane'
        ],
        rules: [
          'Energy recharges at a rate of 1 Energy per second (maximum 10 Energy).',
          'Each card has an Energy Cost, Attack Power, Health, and Attack Speed.',
          'Units automatically march forward, engaging enemy units and defending defenses.'
        ],
        powerups: [
          '🛡️ Shield Drone: Protects ground troops with an energy absorption barrier',
          '⚡ EMP Strike: Stuns all enemy units in a lane for 4 seconds'
        ],
        victory: 'Destroy the enemy Command Tower or have higher remaining tower health at time expiration.'
      },
      mahjong: {
        title: 'Traditional 4-Player Mahjong (麻將)',
        category: 'Imperial Table Strategy',
        objective: 'Form a complete 14-tile winning hand composed of 4 Melds (Chow / Pung / Kong) plus 1 Pair (Eyes).',
        controls: [
          '🖱️ Left Click Tile: Select tile from hand (elevates tile)',
          '🖱️ Click Selected Tile Again: Discard tile onto the center table',
          '🔘 Action Buttons: Click 吃 (Chi), 碰 (Pong), 槓 (Kong), or 胡 (Hu) when offered'
        ],
        rules: [
          'Standard 136 ivory tiles: Characters (萬), Bamboo (條), Dots (筒), and Winds/Dragons (字牌).',
          '吃 CHI (Sequence): Complete 3 consecutive number tiles from the player to your left.',
          '碰 PONG (Triplet): Claim an identical 3rd tile discarded by any player.',
          '槓 KONG (Quad): Claim or declare 4 identical tiles and draw a replacement from the dead wall.',
          '胡 HU (Victory): Claim discarded winning tile or celebrate self-drawn win (ZIMO)!'
        ],
        powerups: [
          '🀄 Authentic ivory tile visuals with traditional red/green lacquer glyphs',
          '🤖 3 Autonomous AI table rivals that think and discard intelligently'
        ],
        victory: 'First player to declare HU or assemble 4 melds + 1 pair wins the table pot.'
      },
      'mahjong-solitaire': {
        title: 'Mahjong Solitaire Speed Match',
        category: 'Cyber Tile Puzzle',
        objective: 'Clear all 36 authentic ivory tiles by matching free pairs before the 90-second clock expires.',
        controls: [
          '🖱️ Click Free Tile: Selects tile (illuminates in bright golden border)',
          '🖱️ Click Matching Tile: If both tiles have the same glyph, both are matched and cleared!',
          '⚡ Special Powers: Click Lightning (⚡), Freeze (❄️), or Shuffle (🔀) buttons'
        ],
        rules: [
          'A tile is FREE only if its Left or Right side is unblocked, and no other tile sits on top.',
          'Matching pairs earns 100 points, plus combo multipliers for quick consecutive matches.'
        ],
        powerups: [
          '⚡ Lightning Zap: Instantly eliminates a random free matching pair (Cost: 1 Charge)',
          '❄️ Time Freeze: Freezes the match timer for 10 seconds (Cost: 1 Charge)',
          '🔀 Cosmic Shuffle: Re-arranges remaining tiles to guarantee open matching paths'
        ],
        victory: 'Clear all tiles from the board to achieve 100% board clearance and maximum bonus points.'
      }
    };

    const current = manualContent[manualGameTab] || manualContent.blob;

    return (
      <div style={modalBackdropStyle} onClick={() => setActiveModal('none')}>
        <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1f2937', paddingBottom: 16 }}>
            <div>
              <h2 style={{ margin: 0, color: '#00e5ff', fontSize: 22, letterSpacing: 1.5 }}>
                📖 GAME MANUAL & COMBAT RULES
              </h2>
              <small style={{ color: '#94a3b8' }}>Comprehensive rules, controls, and victory guidelines</small>
            </div>
            <button onClick={() => setActiveModal('none')} style={closeBtnStyle}>✕</button>
          </div>

          {/* Mode Tabs */}
          <div style={{ display: 'flex', gap: 8, margin: '18px 0', overflowX: 'auto', paddingBottom: 4 }}>
            {(Object.keys(manualContent) as GameId[]).map(id => (
              <button
                key={id}
                onClick={() => setManualGameTab(id)}
                style={{
                  padding: '8px 16px',
                  background: manualGameTab === id ? '#00e5ff' : '#111827',
                  color: manualGameTab === id ? '#000' : '#cbd5e1',
                  border: manualGameTab === id ? '1px solid #00e5ff' : '1px solid #1f2937',
                  borderRadius: 20,
                  fontWeight: 800,
                  fontSize: 13,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >
                {manualContent[id].title}
              </button>
            ))}
          </div>

          {/* Manual Body */}
          <div style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: 6 }}>
            <div style={{ background: '#090d16', padding: 18, borderRadius: 12, marginBottom: 16, border: '1px solid #1e293b' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h3 style={{ margin: 0, color: '#ffe600', fontSize: 18 }}>{current.title}</h3>
                <span style={{ fontSize: 12, background: '#1e293b', color: '#00e5ff', padding: '3px 10px', borderRadius: 10 }}>
                  {current.category}
                </span>
              </div>
              <p style={{ margin: 0, color: '#cbd5e1', fontSize: 14, lineHeight: 1.5 }}>
                {current.objective}
              </p>
            </div>

            {/* Controls */}
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ color: '#00e5ff', margin: '0 0 8px', fontSize: 14 }}>🎮 CONTROLS & ACTIONS</h4>
              <ul style={{ margin: 0, paddingLeft: 20, color: '#cbd5e1', fontSize: 13, lineHeight: 1.8 }}>
                {current.controls.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </div>

            {/* Rules */}
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ color: '#00e5ff', margin: '0 0 8px', fontSize: 14 }}>📜 RULES & MECHANICS</h4>
              <ul style={{ margin: 0, paddingLeft: 20, color: '#cbd5e1', fontSize: 13, lineHeight: 1.8 }}>
                {current.rules.map((r, i) => <li key={i}>{r}</li>)}
              </ul>
            </div>

            {/* Powerups */}
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ color: '#00e5ff', margin: '0 0 8px', fontSize: 14 }}>⚡ POWER-UPS & SPECIAL TACTICS</h4>
              <ul style={{ margin: 0, paddingLeft: 20, color: '#cbd5e1', fontSize: 13, lineHeight: 1.8 }}>
                {current.powerups.map((p, i) => <li key={i}>{p}</li>)}
              </ul>
            </div>

            {/* Victory Condition */}
            <div style={{ background: '#1e293b', padding: 14, borderRadius: 10, border: '1px solid #334155' }}>
              <h4 style={{ color: '#ffe600', margin: '0 0 4px', fontSize: 13 }}>🏆 VICTORY CONDITION</h4>
              <p style={{ margin: 0, color: '#fff', fontSize: 13 }}>{current.victory}</p>
            </div>
          </div>

          {/* Footer actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 20, borderTop: '1px solid #1f2937', paddingTop: 14 }}>
            {!activeRoom && (
              <button
                onClick={() => {
                  setActiveModal('none');
                  handleCreateRoom(manualGameTab);
                }}
                style={glowPrimaryBtnStyle}
              >
                🚀 Launch {current.title} Now
              </button>
            )}
            <button onClick={() => setActiveModal('none')} style={secondaryBtnStyle}>
              Close Manual
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // SUB-RENDER: IMPERIAL LEADERBOARD MODAL
  // ----------------------------------------------------
  function renderLeaderboardModal() {
    return (
      <div style={modalBackdropStyle} onClick={() => setActiveModal('none')}>
        <div style={modalContentStyle} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1f2937', paddingBottom: 16 }}>
            <div>
              <h2 style={{ margin: 0, color: '#ffe600', fontSize: 22, letterSpacing: 1.5 }}>
                🏆 IMPERIAL HALL OF FAME
              </h2>
              <small style={{ color: '#94a3b8' }}>Verified operative match records and platform rankings</small>
            </div>
            <button onClick={() => setActiveModal('none')} style={closeBtnStyle}>✕</button>
          </div>

          <div style={{ maxHeight: '60vh', overflowY: 'auto', marginTop: 18 }}>
            {leaderboardData.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8' }}>
                <div style={{ fontSize: 44, marginBottom: 10 }}>🏅</div>
                <p>No matches recorded yet. Complete an arena match to claim your spot!</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {leaderboardData.map((entry, idx) => {
                  const rankIcons = ['👑', '🥈', '🥉'];
                  return (
                    <div
                      key={entry.userId}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '14px 18px',
                        borderRadius: 10,
                        background: idx === 0 ? 'linear-gradient(135deg, #1e1b4b, #111827)' : '#090d16',
                        border: idx === 0 ? '1px solid #ffe600' : '1px solid #1f2937'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <span style={{ fontSize: 18, fontWeight: 900, color: idx === 0 ? '#ffe600' : '#94a3b8', minWidth: 32 }}>
                          {idx < 3 ? rankIcons[idx] : `#${idx + 1}`}
                        </span>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: entry.favoriteColor || '#00e5ff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#000',
                            fontWeight: 900,
                            fontSize: 13
                          }}
                        >
                          {entry.displayName[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontWeight: 800, color: '#fff', fontSize: 14 }}>{entry.displayName}</div>
                          <small style={{ color: '#94a3b8', fontSize: 12 }}>Platform Level {entry.level || 1}</small>
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: 20, textAlign: 'right' }}>
                        <div>
                          <small style={{ color: '#64748b', fontSize: 11, display: 'block' }}>MATCH WINS</small>
                          <strong style={{ color: '#10b981', fontSize: 15 }}>{entry.wins}</strong>
                        </div>
                        <div>
                          <small style={{ color: '#64748b', fontSize: 11, display: 'block' }}>TOTAL SCORE</small>
                          <strong style={{ color: '#ffe600', fontSize: 15 }}>{entry.totalScore.toLocaleString()}</strong>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 20, borderTop: '1px solid #1f2937', paddingTop: 14 }}>
            <button onClick={fetchLeaderboard} style={secondaryBtnStyle}>
              🔄 Refresh Standings
            </button>
            <button onClick={() => setActiveModal('none')} style={glowPrimaryBtnStyle}>
              Done
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // SUB-RENDER: OPERATIVE SETTINGS MODAL
  // ----------------------------------------------------
  function renderSettingsModal() {
    let tempName = playerName;
    let tempColor = playerColor;

    return (
      <div style={modalBackdropStyle} onClick={() => setActiveModal('none')}>
        <div style={{ ...modalContentStyle, maxWidth: 480 }} onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #1f2937', paddingBottom: 16 }}>
            <div>
              <h2 style={{ margin: 0, color: '#00e5ff', fontSize: 20, letterSpacing: 1.5 }}>
                ⚙️ OPERATIVE PROFILE SETTINGS
              </h2>
              <small style={{ color: '#94a3b8' }}>Customize your handle and cyber glow</small>
            </div>
            <button onClick={() => setActiveModal('none')} style={closeBtnStyle}>✕</button>
          </div>

          <div style={{ margin: '20px 0' }}>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              OPERATIVE CODENAME:
            </label>
            <input
              defaultValue={tempName}
              onChange={e => { tempName = e.target.value; }}
              maxLength={16}
              style={{
                width: '100%',
                padding: '12px 14px',
                borderRadius: 8,
                background: '#090d16',
                border: '1px solid #334155',
                color: '#fff',
                fontWeight: 700,
                fontSize: 14,
                boxSizing: 'border-box'
              }}
            />

            <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, margin: '20px 0 8px' }}>
              CYBER AURA COLOR:
            </label>
            <div style={{ display: 'flex', gap: 12 }}>
              {neonColors.map(c => (
                <button
                  key={c}
                  onClick={() => { tempColor = c; setPlayerColor(c); }}
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    background: c,
                    border: playerColor === c ? '3px solid #fff' : '2px solid transparent',
                    boxShadow: playerColor === c ? `0 0 16px ${c}` : 'none',
                    cursor: 'pointer',
                    transition: 'transform 0.1s'
                  }}
                />
              ))}
            </div>

            <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 700, margin: '20px 0 8px' }}>
              SOUND EFFECTS:
            </label>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={toggleSound}
                style={{ ...secondaryBtnStyle, flex: 1 }}
              >
                {soundEnabled ? '🔊 Sound Enabled' : '🔇 Sound Muted'}
              </button>
              <button
                onClick={() => SoundFX.playVictory()}
                style={{ ...secondaryBtnStyle, flex: 1 }}
              >
                🎵 Test FX
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, borderTop: '1px solid #1f2937', paddingTop: 14 }}>
            <button onClick={() => setActiveModal('none')} style={secondaryBtnStyle}>
              Cancel
            </button>
            <button
              onClick={() => saveSettings(tempName, tempColor)}
              style={glowPrimaryBtnStyle}
            >
              Save Profile
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // SUB-RENDER: EXIT CONFIRMATION DIALOG
  // ----------------------------------------------------
  function renderExitConfirmModal() {
    return (
      <div style={modalBackdropStyle} onClick={() => setShowExitConfirm(false)}>
        <div style={{ ...modalContentStyle, maxWidth: 440, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>⚠️</div>
          <h3 style={{ margin: '0 0 8px', color: '#f59e0b', fontSize: 20 }}>ABANDON CURRENT ARENA?</h3>
          <p style={{ color: '#cbd5e1', fontSize: 14, lineHeight: 1.5, margin: '0 0 24px' }}>
            Leaving an active arena or lobby returns you to the Arcade Hub. Unsaved score in this match will be lost.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center' }}>
            <button onClick={() => setShowExitConfirm(false)} style={glowPrimaryBtnStyle}>
              Stay & Continue
            </button>
            <button onClick={handleLeaveMatchConfirmed} style={{ ...secondaryBtnStyle, background: '#dc2626', color: '#fff', border: 'none' }}>
              Confirm Exit
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Toast notification
  function renderToast() {
    if (!toastMessage) return null;
    return (
      <div
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          background: '#090d16',
          border: '1px solid #00e5ff',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: 10,
          boxShadow: '0 0 20px rgba(0, 229, 255, 0.4)',
          zIndex: 100,
          fontSize: 14,
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          gap: 10
        }}
      >
        {toastMessage}
      </div>
    );
  }
};

// ----------------------------------------------------
// UI STYLES
// ----------------------------------------------------
const containerStyle: React.CSSProperties = {
  maxWidth: 1020,
  margin: '0 auto',
  padding: '24px 16px',
  fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  color: '#fff'
};

const headerStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: 24,
  flexWrap: 'wrap',
  gap: 16
};

const cardStyle: React.CSSProperties = {
  background: '#111827',
  border: '1px solid #1f2937',
  borderRadius: 14,
  padding: 24,
  boxShadow: '0 8px 30px rgba(0,0,0,0.5)'
};

const glowPrimaryBtnStyle: React.CSSProperties = {
  padding: '12px 22px',
  background: 'linear-gradient(135deg, #00e5ff, #3b82f6)',
  color: '#000',
  fontWeight: 900,
  fontSize: 14,
  border: 'none',
  borderRadius: 8,
  cursor: 'pointer',
  boxShadow: '0 0 18px rgba(0, 229, 255, 0.4)',
  transition: 'transform 0.1s'
};

const secondaryBtnStyle: React.CSSProperties = {
  padding: '12px 18px',
  background: '#1f2937',
  color: '#cbd5e1',
  fontWeight: 700,
  fontSize: 13,
  border: '1px solid #374151',
  borderRadius: 8,
  cursor: 'pointer'
};

const iconBtnStyle: React.CSSProperties = {
  padding: '8px 14px',
  background: '#1e293b',
  border: '1px solid #334155',
  color: '#cbd5e1',
  borderRadius: 20,
  fontSize: 12,
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'all 0.15s'
};

const modalBackdropStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(5, 8, 16, 0.85)',
  backdropFilter: 'blur(8px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
  padding: 16
};

const modalContentStyle: React.CSSProperties = {
  background: '#111827',
  border: '2px solid #00e5ff',
  borderRadius: 16,
  padding: 24,
  width: '100%',
  maxWidth: 720,
  boxShadow: '0 0 40px rgba(0, 229, 255, 0.35)',
  color: '#fff'
};

const closeBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: 'none',
  color: '#94a3b8',
  fontSize: 20,
  cursor: 'pointer',
  padding: '4px 8px'
};
