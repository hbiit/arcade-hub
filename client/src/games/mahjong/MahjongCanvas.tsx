import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { RoomState, SOCKET_EVENTS } from '../../../../shared/src';
import { SoundFX } from '../../utils/soundEffects';

export interface MahjongTile {
  id: string;
  suit: 'wan' | 'tiao' | 'tong' | 'wind' | 'dragon';
  value: number;
  symbol: string;
  color: string;
}

export interface MahjongMeld {
  type: 'chow' | 'pung' | 'kong';
  tiles: MahjongTile[];
  claimedFrom: string;
}

export interface AvailableCalls {
  canHu: boolean;
  canPong: boolean;
  canKong: boolean;
  canChi: boolean;
  chiCombinations?: MahjongTile[][];
}

export interface PlayerSeatState {
  id: string;
  name: string;
  color: string;
  seatIndex: number;
  wind: 'East' | 'South' | 'West' | 'North';
  hand: MahjongTile[];
  drawnTile?: MahjongTile;
  melds: MahjongMeld[];
  discards: MahjongTile[];
  score: number;
  isBot: boolean;
  availableCalls?: AvailableCalls;
}

export interface TableMahjongState {
  seats: PlayerSeatState[];
  currentTurnSeat: number;
  wallCount: number;
  phase: 'draw' | 'discard' | 'waiting_calls' | 'ended';
  lastDiscard?: {
    tile: MahjongTile;
    fromSeat: number;
  };
  winnerSeat?: number;
  winType?: 'zimo' | 'ron';
  roundTimer: number;
  events: Array<{
    id: string;
    text: string;
    color: string;
    timestamp: number;
  }>;
}

export const MahjongCanvas: React.FC<{ socket: Socket; room: RoomState<any> }> = ({ socket, room }) => {
  const gameData = (room.gameData || {}) as TableMahjongState;
  const seats: PlayerSeatState[] = gameData.seats || [];
  const currentTurnSeat: number = gameData.currentTurnSeat ?? 0;
  const wallCount: number = gameData.wallCount ?? 0;
  const lastDiscard = gameData.lastDiscard;
  const events = gameData.events || [];

  // Find human player seat (seatIndex 0)
  const mySeat: PlayerSeatState | undefined =
    seats.find((s) => s.id === socket.id) || seats[0];

  const isMyTurn = mySeat ? currentTurnSeat === mySeat.seatIndex : false;
  const canDiscard = isMyTurn && gameData.phase === 'discard';

  const [selectedTileId, setSelectedTileId] = useState<string | null>(null);

  // Trigger audio on game events
  useEffect(() => {
    if (events.length > 0) {
      const latest = events[events.length - 1];
      if (Date.now() - latest.timestamp < 1200) {
        if (latest.text.includes('HU') || latest.text.includes('WIN')) {
          SoundFX.playHu();
        } else if (latest.text.includes('PONG')) {
          SoundFX.playPowerup();
        } else if (latest.text.includes('CHI')) {
          SoundFX.playDash();
        } else if (latest.text.includes('discarded')) {
          SoundFX.playTileClick();
        }
      }
    }
  }, [events]);

  const handleTileClick = (tile: MahjongTile) => {
    if (!canDiscard) return;

    if (selectedTileId === tile.id) {
      // Confirm discard on second click
      executeDiscard(tile.id);
      setSelectedTileId(null);
    } else {
      setSelectedTileId(tile.id);
      SoundFX.playTileClick();
    }
  };

  const executeDiscard = (tileId: string) => {
    socket.emit(SOCKET_EVENTS.GAME_INPUT, {
      roomCode: room.roomCode,
      input: { action: 'discard', tileId }
    });
    SoundFX.playTileClick();
  };

  const handleCall = (action: 'hu' | 'pong' | 'kong' | 'chi' | 'pass') => {
    socket.emit(SOCKET_EVENTS.GAME_INPUT, {
      roomCode: room.roomCode,
      input: { action }
    });
    if (action === 'hu') SoundFX.playHu();
    else if (action === 'pong') SoundFX.playPowerup();
    else if (action === 'chi') SoundFX.playDash();
    else SoundFX.playTileClick();
  };

  if (!mySeat || seats.length < 4) {
    return (
      <div style={{ color: '#94a3b8', padding: 40, textAlign: 'center' }}>
        Loading Traditional Mahjong Table...
      </div>
    );
  }

  const rightOpponent = seats[1]; // East / Right
  const topOpponent = seats[2];   // West / Top
  const leftOpponent = seats[3];  // North / Left

  // Check if self-drawn win is possible on your turn
  const fullHand = mySeat.drawnTile ? [...mySeat.hand, mySeat.drawnTile] : mySeat.hand;
  const canSelfWin = isMyTurn && fullHand.length === 14;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        userSelect: 'none',
        maxWidth: 960,
        margin: '0 auto',
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}
    >
      {/* Table Status Bar */}
      <div
        style={{
          width: '100%',
          background: 'linear-gradient(135deg, #062822 0%, #031411 100%)',
          border: '1px solid #10b981',
          borderRadius: 12,
          padding: '10px 20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: '0 0 20px rgba(16, 185, 129, 0.25)',
          marginBottom: 12
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 24 }}>🀄</span>
          <div>
            <div style={{ fontWeight: 800, color: '#10b981', fontSize: 16 }}>
              TRADITIONAL 4-PLAYER MAHJONG (麻將)
            </div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              Standard 136 Tiles • 4 Melds (Chow / Pung / Kong) + 1 Pair (Eyes)
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <div>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>WALL TILES: </span>
            <strong style={{ color: '#ffe600', fontSize: 16 }}>{wallCount}</strong>
          </div>
          <div>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>TURN: </span>
            <strong style={{ color: seats[currentTurnSeat]?.color || '#00e5ff', fontSize: 15 }}>
              {seats[currentTurnSeat]?.name} {currentTurnSeat === mySeat.seatIndex ? '(YOU)' : ''}
            </strong>
          </div>
          <div>
            <span style={{ fontSize: 12, color: '#94a3b8' }}>SCORE: </span>
            <strong style={{ color: '#10b981', fontSize: 16 }}>{mySeat.score} pts</strong>
          </div>
        </div>
      </div>

      {/* Main 4-Player Green-Felt Mahjong Table */}
      <div style={{ maxWidth: '100%', overflowX: 'auto', padding: '4px 0', display: 'flex', justifyContent: 'center' }}>
        <div
          style={{
            position: 'relative',
            width: 920,
            minWidth: 920,
            height: 520,
            background: 'radial-gradient(circle at center, #074338 0%, #04251f 70%, #02120f 100%)',
            border: '4px solid #10b981',
            borderRadius: 20,
            boxShadow: 'inset 0 0 60px rgba(0,0,0,0.85), 0 0 35px rgba(16, 185, 129, 0.3)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            padding: '16px 20px',
            overflow: 'hidden'
          }}
        >
        {/* Table Felt Subtle Grid Overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.08,
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.15) 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            pointerEvents: 'none'
          }}
        />

        {/* TOP OPPONENT (North / West) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 5 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: topOpponent.color }}>
              {topOpponent.wind} • {topOpponent.name} ({topOpponent.score} pts)
            </span>
            {currentTurnSeat === topOpponent.seatIndex && (
              <span style={{ fontSize: 11, background: '#10b981', color: '#000', padding: '2px 6px', borderRadius: 4, fontWeight: 800 }}>
                THINKING...
              </span>
            )}
          </div>
          {/* Standing Tile Backs */}
          <div style={{ display: 'flex', gap: 2 }}>
            {topOpponent.hand.map((_, i) => (
              <div
                key={i}
                style={{
                  width: 22,
                  height: 32,
                  background: 'linear-gradient(180deg, #10b981 0%, #064e3b 100%)',
                  borderRadius: 3,
                  border: '1px solid #34d399',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.5)'
                }}
              />
            ))}
            {topOpponent.drawnTile && (
              <div
                style={{
                  width: 22,
                  height: 32,
                  marginLeft: 6,
                  background: 'linear-gradient(180deg, #10b981 0%, #064e3b 100%)',
                  borderRadius: 3,
                  border: '1px solid #ffe600',
                  boxShadow: '0 0 6px #ffe600'
                }}
              />
            )}
          </div>
          {/* Top Exposed Melds */}
          {topOpponent.melds.length > 0 && (
            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              {topOpponent.melds.map((meld, mIdx) => (
                <div key={mIdx} style={{ display: 'flex', gap: 2, background: 'rgba(0,0,0,0.3)', padding: 2, borderRadius: 4 }}>
                  {meld.tiles.map((t, tIdx) => (
                    <div key={tIdx} style={{ fontSize: 10, padding: '2px 4px', background: '#fff', color: t.color, borderRadius: 2, fontWeight: 800 }}>
                      {t.symbol}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* MIDDLE SECTION: LEFT OPPONENT + CENTER TABLE + RIGHT OPPONENT */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flex: 1, zIndex: 5 }}>
          {/* LEFT OPPONENT */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', width: 140 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: leftOpponent.color, marginBottom: 4 }}>
              {leftOpponent.wind} • {leftOpponent.name}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {leftOpponent.hand.slice(0, 10).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 32,
                    height: 16,
                    background: 'linear-gradient(90deg, #10b981 0%, #064e3b 100%)',
                    borderRadius: 3,
                    border: '1px solid #34d399'
                  }}
                />
              ))}
            </div>
          </div>

          {/* CENTER COMPASS & DISCARD POND */}
          <div
            style={{
              width: 380,
              height: 220,
              background: 'rgba(3, 20, 16, 0.88)',
              border: '2px solid rgba(16, 185, 129, 0.4)',
              borderRadius: 14,
              boxShadow: 'inset 0 0 20px rgba(0,0,0,0.8)',
              padding: 12,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            {/* Center Compass Wind Indicator */}
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 11, color: '#94a3b8' }}>
              <span>WIND: EAST (東風圈)</span>
              <span>ROUND TIMER: {Math.ceil(gameData.roundTimer)}s</span>
            </div>

            {/* Last Discarded Tile Highlight */}
            {lastDiscard ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: '#ffe600', fontWeight: 800, marginBottom: 4 }}>
                  LATEST DISCARD (FROM {seats[lastDiscard.fromSeat].name.toUpperCase()}):
                </div>
                <div style={{ display: 'inline-block' }}>
                  {renderIvoryTile(lastDiscard.tile, false, true)}
                </div>
              </div>
            ) : (
              <div style={{ color: '#64748b', fontSize: 13, fontStyle: 'italic' }}>
                Tiles will appear in the center pond as players discard...
              </div>
            )}

            {/* Turn Announcement */}
            <div style={{ fontSize: 12, color: '#cbd5e1' }}>
              {canDiscard ? (
                <strong style={{ color: '#00e5ff' }}>👉 YOUR TURN: SELECT A TILE TO DISCARD</strong>
              ) : gameData.phase === 'waiting_calls' ? (
                <strong style={{ color: '#f59e0b' }}>WAITING FOR CALLS (CHI / PONG / HU)...</strong>
              ) : (
                <span>Waiting for {seats[currentTurnSeat]?.name} to discard...</span>
              )}
            </div>
          </div>

          {/* RIGHT OPPONENT */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', width: 140 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: rightOpponent.color, marginBottom: 4 }}>
              {rightOpponent.wind} • {rightOpponent.name}
            </span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {rightOpponent.hand.slice(0, 10).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 32,
                    height: 16,
                    background: 'linear-gradient(90deg, #064e3b 0%, #10b981 100%)',
                    borderRadius: 3,
                    border: '1px solid #34d399'
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* BOTTOM SECTION: PLAYER'S 13 TILES + 14TH DRAWN TILE */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 10 }}>
          {/* Call Action Bar (PONG / CHI / KONG / HU / PASS) */}
          {mySeat.availableCalls && (
            <div
              style={{
                display: 'flex',
                gap: 12,
                background: 'rgba(9, 13, 22, 0.95)',
                border: '2px solid #ffe600',
                boxShadow: '0 0 25px rgba(255, 230, 0, 0.4)',
                borderRadius: 30,
                padding: '8px 24px',
                marginBottom: 10,
                animation: 'pulse 1s infinite alternate'
              }}
            >
              {mySeat.availableCalls.canHu && (
                <button
                  onClick={() => handleCall('hu')}
                  style={{
                    padding: '8px 20px',
                    background: 'linear-gradient(135deg, #dc2626, #b91c1c)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 20,
                    fontWeight: 900,
                    fontSize: 14,
                    cursor: 'pointer',
                    boxShadow: '0 0 15px rgba(220, 38, 38, 0.8)'
                  }}
                >
                  🀄 HU! (DECLARE WIN)
                </button>
              )}

              {mySeat.availableCalls.canPong && (
                <button
                  onClick={() => handleCall('pong')}
                  style={{
                    padding: '8px 18px',
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 20,
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: 'pointer'
                  }}
                >
                  碰 PONG! (TRIPLET)
                </button>
              )}

              {mySeat.availableCalls.canKong && (
                <button
                  onClick={() => handleCall('kong')}
                  style={{
                    padding: '8px 18px',
                    background: 'linear-gradient(135deg, #f59e0b, #d97706)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 20,
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: 'pointer'
                  }}
                >
                  槓 KONG! (QUAD)
                </button>
              )}

              {mySeat.availableCalls.canChi && (
                <button
                  onClick={() => handleCall('chi')}
                  style={{
                    padding: '8px 18px',
                    background: 'linear-gradient(135deg, #0284c7, #0369a1)',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 20,
                    fontWeight: 800,
                    fontSize: 13,
                    cursor: 'pointer'
                  }}
                >
                  吃 CHI! (SEQUENCE)
                </button>
              )}

              <button
                onClick={() => handleCall('pass')}
                style={{
                  padding: '8px 16px',
                  background: '#334155',
                  color: '#cbd5e1',
                  border: 'none',
                  borderRadius: 20,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer'
                }}
              >
                PASS
              </button>
            </div>
          )}

          {/* Self Drawn Win Trigger */}
          {canSelfWin && (
            <div style={{ marginBottom: 8 }}>
              <button
                onClick={() => handleCall('hu')}
                style={{
                  padding: '6px 20px',
                  background: 'linear-gradient(135deg, #ffe600, #f59e0b)',
                  color: '#000',
                  border: 'none',
                  borderRadius: 20,
                  fontWeight: 900,
                  fontSize: 13,
                  cursor: 'pointer',
                  boxShadow: '0 0 16px rgba(255, 230, 0, 0.7)'
                }}
              >
                🎉 SELF-DRAWN WIN (ZIMO / 自摸)!
              </button>
            </div>
          )}

          {/* Hand Tiles Row */}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4 }}>
            {mySeat.hand.map((tile) => (
              <div key={tile.id} onClick={() => handleTileClick(tile)}>
                {renderIvoryTile(tile, selectedTileId === tile.id)}
              </div>
            ))}

            {/* Separated 14th Drawn Tile */}
            {mySeat.drawnTile && (
              <div
                style={{ marginLeft: 16 }}
                onClick={() => handleTileClick(mySeat.drawnTile!)}
              >
                {renderIvoryTile(mySeat.drawnTile, selectedTileId === mySeat.drawnTile.id, false, true)}
              </div>
            )}
          </div>

          {/* Helper Instruction */}
          <div style={{ marginTop: 8, fontSize: 12, color: '#94a3b8' }}>
            {canDiscard
              ? 'Click a tile once to select, click again to discard into the table.'
              : 'Waiting for your turn to draw...'}
          </div>
        </div>
      </div>
    </div>
  </div>
  );

  // Sub-renderer for an authentic ivory tile
  function renderIvoryTile(tile: MahjongTile, isSelected = false, isLastDiscard = false, isDrawn = false) {
    const tileW = isLastDiscard ? 52 : 46;
    const tileH = isLastDiscard ? 68 : 62;

    return (
      <div
        style={{
          width: `${tileW}px`,
          height: `${tileH}px`,
          background: isSelected
            ? 'linear-gradient(180deg, #fffbeb 0%, #fef3c7 100%)'
            : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 50%, #e2e8f0 100%)',
          border: isSelected
            ? '2px solid #ffe600'
            : isDrawn
            ? '2px solid #00e5ff'
            : '1.5px solid #cbd5e1',
          borderRadius: 6,
          boxShadow: isSelected
            ? '0 0 16px rgba(255, 230, 0, 0.8), 2px 4px 6px rgba(0,0,0,0.5)'
            : isDrawn
            ? '0 0 12px rgba(0, 229, 255, 0.6), 2px 4px 6px rgba(0,0,0,0.4)'
            : '2px 4px 6px rgba(0,0,0,0.45)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          alignItems: 'center',
          cursor: canDiscard ? 'pointer' : 'default',
          transform: isSelected ? 'translateY(-10px)' : 'translateY(0)',
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          position: 'relative'
        }}
      >
        {/* Tile Chinese Glyph */}
        <div
          style={{
            fontSize: tile.suit === 'dragon' ? 22 : 18,
            fontWeight: 900,
            color: tile.color,
            lineHeight: 1.1
          }}
        >
          {tile.symbol}
        </div>

        {/* Small Subtitle */}
        <div
          style={{
            fontSize: 8,
            fontWeight: 700,
            color: '#64748b',
            marginTop: 2,
            letterSpacing: 0.5
          }}
        >
          {tile.suit.toUpperCase()}
        </div>
      </div>
    );
  }
};
