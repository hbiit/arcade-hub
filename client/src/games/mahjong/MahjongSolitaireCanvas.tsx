import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { RoomState, SOCKET_EVENTS } from '../../../../shared/src';
import { SoundFX } from '../../utils/soundEffects';

interface SolitaireTile {
  id: string;
  suit: 'wan' | 'tiao' | 'tong' | 'wind' | 'dragon' | 'flower' | 'season';
  value: number;
  symbol: string;
  subText: string;
  color: string;
  layer: number;
  row: number;
  col: number;
  isMatched: boolean;
  matchedBy?: string;
  isFree?: boolean;
}

interface SolitairePlayerState {
  id: string;
  name: string;
  color: string;
  score: number;
  combo: number;
  comboTimer: number;
  selectedTileId?: string;
  powerups: {
    lightning: number;
    freeze: number;
    shuffle: number;
  };
  frozenTimer: number;
}

interface MahjongSolitaireState {
  tiles: SolitaireTile[];
  players: Record<string, SolitairePlayerState>;
  remainingTiles: number;
  totalTiles: number;
  timeRemaining: number;
  freePairsCount: number;
  status: 'playing' | 'cleared' | 'time_up';
  lastMatch?: {
    tile1: SolitaireTile;
    tile2: SolitaireTile;
    playerName: string;
    points: number;
  };
  activeEffect?: {
    type: 'lightning' | 'freeze' | 'shuffle';
    targetPlayer?: string;
    timestamp: number;
  };
  events: Array<{
    id: string;
    text: string;
    color: string;
    timestamp: number;
  }>;
}

interface Props {
  socket: Socket;
  room: RoomState<MahjongSolitaireState>;
}

export const MahjongSolitaireCanvas: React.FC<Props> = ({ socket, room }) => {
  const gameState = room.gameData;
  const myPlayer = (socket.id ? gameState?.players?.[socket.id] : undefined) || Object.values(gameState?.players || {})[0];
  const [hoveredTileId, setHoveredTileId] = useState<string | null>(null);
  const [animatingMatch, setAnimatingMatch] = useState<{
    t1: SolitaireTile;
    t2: SolitaireTile;
    points: number;
  } | null>(null);

  // Trigger match animations and sounds when lastMatch updates
  useEffect(() => {
    if (gameState?.lastMatch) {
      SoundFX.playTileMatch();
      setAnimatingMatch({
        t1: gameState.lastMatch.tile1,
        t2: gameState.lastMatch.tile2,
        points: gameState.lastMatch.points
      });
      const timer = setTimeout(() => {
        setAnimatingMatch(null);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [gameState?.lastMatch]);

  // Trigger sound when powerup active effect updates
  useEffect(() => {
    if (gameState?.activeEffect) {
      if (gameState.activeEffect.type === 'freeze') {
        SoundFX.playFreeze();
      } else if (gameState.activeEffect.type === 'lightning') {
        SoundFX.playPowerup();
      } else if (gameState.activeEffect.type === 'shuffle') {
        SoundFX.playDash();
      }
    }
  }, [gameState?.activeEffect]);

  const handleTileClick = (tile: SolitaireTile) => {
    if (tile.isMatched) return;
    if (!tile.isFree) {
      // Shake or play click sound
      SoundFX.playBump();
      return;
    }

    SoundFX.playTileClick();
    socket.emit(SOCKET_EVENTS.GAME_INPUT, {
      roomCode: room.roomCode,
      input: { action: 'selectTile', tileId: tile.id }
    });
  };

  const handlePowerup = (powerupId: 'lightning' | 'freeze' | 'shuffle') => {
    socket.emit(SOCKET_EVENTS.GAME_INPUT, {
      roomCode: room.roomCode,
      input: { action: 'powerup', powerupId }
    });
  };

  if (!gameState || !gameState.tiles) {
    return (
      <div style={{ color: '#fff', textAlign: 'center', padding: 40 }}>
        Loading Shanghai Pyramid...
      </div>
    );
  }

  // Calculate layout bounds: standard tile dimensions
  const TILE_WIDTH = 46;
  const TILE_HEIGHT = 60;
  const COL_STEP = 23; // each col is half tile width
  const ROW_STEP = 30; // each row is half tile height
  const LAYER_OFFSET_X = -4;
  const LAYER_OFFSET_Y = -6;

  // Find bounds to center board
  const boardWidth = 28 * COL_STEP + TILE_WIDTH + 60;
  const boardHeight = 12 * ROW_STEP + TILE_HEIGHT + 60;

  // Sort tiles so higher layers are rendered later (on top of lower layers)
  const sortedTiles = [...gameState.tiles].sort((a, b) => {
    if (a.layer !== b.layer) return a.layer - b.layer;
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  });

  const isFrozen = (myPlayer?.frozenTimer || 0) > 0;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        userSelect: 'none',
        position: 'relative'
      }}
    >
      {/* Top Solitaire Status & Multiplier Header */}
      <div
        style={{
          width: '100%',
          maxWidth: 820,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: 'linear-gradient(180deg, #090d16 0%, #111827 100%)',
          border: '1px solid #1f2937',
          borderRadius: 12,
          padding: '10px 18px',
          marginBottom: 14,
          boxShadow: '0 4px 16px rgba(0,0,0,0.5)'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 24 }}>🀆</span>
          <div>
            <div style={{ fontWeight: 800, color: '#00e5ff', fontSize: 15, letterSpacing: 1 }}>
              MAHJONG SOLITAIRE // SHANGHAI RUSH
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              Free lateral rule: Click matching unblocked tiles to clear
            </div>
          </div>
        </div>

        {/* Counters & Combo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              background: '#042f2e',
              border: '1px solid #0d9488',
              color: '#2dd4bf',
              fontSize: 13,
              fontWeight: 700
            }}
          >
            🀄 Remaining: {gameState.remainingTiles} / {gameState.totalTiles}
          </div>

          <div
            style={{
              padding: '6px 14px',
              borderRadius: 8,
              background: gameState.freePairsCount > 0 ? '#1e1b4b' : '#450a0a',
              border: `1px solid ${gameState.freePairsCount > 0 ? '#6366f1' : '#ef4444'}`,
              color: gameState.freePairsCount > 0 ? '#a5b4fc' : '#fca5a5',
              fontSize: 13,
              fontWeight: 700
            }}
          >
            🎯 Available: {gameState.freePairsCount} pairs
          </div>

          {/* Combo Multiplier */}
          {myPlayer && myPlayer.combo > 1 && (
            <div
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                background: 'linear-gradient(135deg, #f59e0b 0%, #ef4444 100%)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 900,
                boxShadow: '0 0 14px rgba(245, 158, 11, 0.5)',
                animation: 'pulse 0.4s infinite alternate'
              }}
            >
              🔥 {myPlayer.combo}x COMBO! ({myPlayer.comboTimer.toFixed(1)}s)
            </div>
          )}
        </div>
      </div>

      {/* Main 3D Solitaire Table Surface */}
      <div style={{ maxWidth: '100%', overflowX: 'auto', padding: '4px 0', display: 'flex', justifyContent: 'center' }}>
        <div
          style={{
            width: boardWidth,
            height: boardHeight,
            minWidth: boardWidth,
            background: 'radial-gradient(ellipse at center, #064e3b 0%, #022c22 65%, #01140e 100%)',
          border: '3px solid #059669',
          borderRadius: 20,
          position: 'relative',
          overflow: 'hidden',
          boxShadow: 'inset 0 0 40px rgba(0,0,0,0.8), 0 10px 30px rgba(0,0,0,0.7)',
          perspective: 800
        }}
      >
        {/* Subtle Chinese Dragon watermark in center */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontSize: 140,
            opacity: 0.04,
            pointerEvents: 'none',
            color: '#10b981',
            fontWeight: 900
          }}
        >
          龍
        </div>

        {/* Frozen Alert Overlay if player is affected by rival Frost Wind */}
        {isFrozen && (
          <div
            style={{
              position: 'absolute',
              top: 20,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(14, 165, 233, 0.9)',
              color: '#fff',
              padding: '8px 24px',
              borderRadius: 20,
              fontSize: 14,
              fontWeight: 800,
              zIndex: 999,
              boxShadow: '0 0 20px #38bdf8'
            }}
          >
            ❄️ FROZEN BY RIVAL! ({myPlayer?.frozenTimer.toFixed(1)}s)
          </div>
        )}

        {/* Solitaire Tiles Stack */}
        {sortedTiles.map(tile => {
          if (tile.isMatched) return null;

          const isSelected = myPlayer?.selectedTileId === tile.id;
          const isFree = !!tile.isFree;
          const isHovered = hoveredTileId === tile.id;

          // Compute absolute 3D position
          const x = 30 + tile.col * COL_STEP + tile.layer * LAYER_OFFSET_X;
          const y = 30 + tile.row * ROW_STEP + tile.layer * LAYER_OFFSET_Y;

          // Shadow based on elevation
          const shadowDepth = (tile.layer + 1) * 3;
          const shadowBlur = (tile.layer + 1) * 4;

          return (
            <div
              key={tile.id}
              onClick={() => handleTileClick(tile)}
              onMouseEnter={() => isFree && setHoveredTileId(tile.id)}
              onMouseLeave={() => setHoveredTileId(null)}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: TILE_WIDTH,
                height: TILE_HEIGHT,
                zIndex: tile.layer * 20 + tile.row,
                cursor: isFree ? 'pointer' : 'not-allowed',
                transform: isSelected
                  ? 'translateY(-8px) scale(1.08)'
                  : isHovered && isFree
                  ? 'translateY(-4px) scale(1.04)'
                  : 'none',
                transition: 'transform 0.15s ease, box-shadow 0.15s ease, filter 0.2s',
                filter: isFree ? 'brightness(1)' : 'brightness(0.65) contrast(0.85)'
              }}
            >
              {/* Tile Body (Ivory front + Bamboo backing) */}
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: 6,
                  background: isSelected
                    ? 'linear-gradient(135deg, #fffbeb 0%, #fef3c7 100%)'
                    : isFree
                    ? 'linear-gradient(135deg, #ffffff 0%, #f8fafc 50%, #e2e8f0 100%)'
                    : 'linear-gradient(135deg, #94a3b8 0%, #64748b 100%)',
                  borderTop: isSelected ? '2px solid #00e5ff' : '2px solid #f1f5f9',
                  borderLeft: isSelected ? '2px solid #00e5ff' : '2px solid #e2e8f0',
                  borderRight: isSelected ? '4px solid #0891b2' : '4px solid #166534', // Green bamboo side
                  borderBottom: isSelected ? '5px solid #0e7490' : '5px solid #15803d', // Green bamboo bottom
                  boxShadow: isSelected
                    ? '0 0 18px #00e5ff, 0 10px 20px rgba(0,0,0,0.6)'
                    : `2px ${shadowDepth}px ${shadowBlur}px rgba(0,0,0,${0.35 + tile.layer * 0.1})`,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2px 0'
                }}
              >
                {/* Traditional Chinese Character / Number */}
                <div
                  style={{
                    fontSize: tile.suit === 'dragon' ? 18 : 16,
                    fontWeight: 900,
                    color: tile.color,
                    lineHeight: 1.1,
                    textShadow: '0 1px 1px rgba(0,0,0,0.2)'
                  }}
                >
                  {tile.symbol}
                </div>

                {/* Subtext (Wan / Dots / Bamboo / Wind) */}
                <div
                  style={{
                    fontSize: 8,
                    fontWeight: 800,
                    color: '#64748b',
                    letterSpacing: 0.5,
                    marginTop: 2
                  }}
                >
                  {tile.subText}
                </div>

                {/* Selected Indicator Ring */}
                {isSelected && (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 2,
                      border: '2px solid #00e5ff',
                      borderRadius: 4,
                      pointerEvents: 'none'
                    }}
                  />
                )}

                {/* Locked / Blocked Padlock Overlay if blocked */}
                {!isFree && (
                  <div
                    style={{
                      position: 'absolute',
                      top: 2,
                      right: 3,
                      fontSize: 8,
                      opacity: 0.6
                    }}
                  >
                    🔒
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Floating Particle / Score Animation on Match */}
        {animatingMatch && (
          <div
            style={{
              position: 'absolute',
              top: '40%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              color: '#fff',
              padding: '12px 28px',
              borderRadius: 30,
              fontSize: 20,
              fontWeight: 900,
              boxShadow: '0 0 30px #10b981',
              zIndex: 9999,
              animation: 'bounce 0.6s ease'
            }}
          >
            ✨ MATCH! +{animatingMatch.points} PTS!
          </div>
        )}
        </div>
      </div>

      {/* Arcade Power-Up & Action Bar */}
      <div
        style={{
          width: '100%',
          maxWidth: 820,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 14,
          background: '#090d16',
          border: '1px solid #1f2937',
          borderRadius: 12,
          padding: '12px 20px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 700 }}>
            ARCADE POWER-UPS:
          </span>

          {/* Lightning Jade Button */}
          <button
            onClick={() => handlePowerup('lightning')}
            disabled={!myPlayer || myPlayer.powerups.lightning <= 0 || isFrozen}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              background: (myPlayer?.powerups.lightning || 0) > 0 ? '#0284c7' : '#334155',
              color: '#fff',
              border: 'none',
              fontWeight: 800,
              fontSize: 13,
              cursor: (myPlayer?.powerups.lightning || 0) > 0 ? 'pointer' : 'not-allowed',
              boxShadow: (myPlayer?.powerups.lightning || 0) > 0 ? '0 0 12px rgba(2, 132, 199, 0.4)' : 'none'
            }}
          >
            <span>⚡ Lightning Jade</span>
            <span
              style={{
                background: '#0369a1',
                padding: '2px 8px',
                borderRadius: 12,
                fontSize: 11
              }}
            >
              x{myPlayer?.powerups.lightning || 0}
            </span>
          </button>

          {/* Frost Wind Button */}
          <button
            onClick={() => handlePowerup('freeze')}
            disabled={!myPlayer || myPlayer.powerups.freeze <= 0 || isFrozen}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              background: (myPlayer?.powerups.freeze || 0) > 0 ? '#0891b2' : '#334155',
              color: '#fff',
              border: 'none',
              fontWeight: 800,
              fontSize: 13,
              cursor: (myPlayer?.powerups.freeze || 0) > 0 ? 'pointer' : 'not-allowed',
              boxShadow: (myPlayer?.powerups.freeze || 0) > 0 ? '0 0 12px rgba(8, 145, 178, 0.4)' : 'none'
            }}
          >
            <span>❄️ Frost Wind</span>
            <span
              style={{
                background: '#0e7490',
                padding: '2px 8px',
                borderRadius: 12,
                fontSize: 11
              }}
            >
              x{myPlayer?.powerups.freeze || 0}
            </span>
          </button>

          {/* Astral Shuffle Button */}
          <button
            onClick={() => handlePowerup('shuffle')}
            disabled={!myPlayer || myPlayer.powerups.shuffle <= 0 || isFrozen}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              borderRadius: 8,
              background: (myPlayer?.powerups.shuffle || 0) > 0 ? '#7c3aed' : '#334155',
              color: '#fff',
              border: 'none',
              fontWeight: 800,
              fontSize: 13,
              cursor: (myPlayer?.powerups.shuffle || 0) > 0 ? 'pointer' : 'not-allowed',
              boxShadow: (myPlayer?.powerups.shuffle || 0) > 0 ? '0 0 12px rgba(124, 58, 237, 0.4)' : 'none'
            }}
          >
            <span>🔀 Astral Shuffle</span>
            <span
              style={{
                background: '#6d28d9',
                padding: '2px 8px',
                borderRadius: 12,
                fontSize: 11
              }}
            >
              x{myPlayer?.powerups.shuffle || 0}
            </span>
          </button>
        </div>

        {/* Current Score Display */}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 11, color: '#94a3b8' }}>MY SCORE</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: '#ffe600' }}>
            {myPlayer?.score || 0}
          </div>
        </div>
      </div>
    </div>
  );
};
