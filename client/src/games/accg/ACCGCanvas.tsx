import React, { useState, useEffect } from 'react';
import { Socket } from 'socket.io-client';
import { RoomState, SOCKET_EVENTS } from '../../../../shared/src';
import { SoundFX } from '../../utils/soundEffects';

type SelectedAbility = 'move' | 'laser' | 'emp' | 'shield';

export const ACCGCanvas: React.FC<{ socket: Socket; room: RoomState<any> }> = ({ socket, room }) => {
  const [selectedAbility, setSelectedAbility] = useState<SelectedAbility>('move');
  const [hoveredTile, setHoveredTile] = useState<{ r: number; c: number } | null>(null);

  const gridSize = room.gameData?.gridSize || 8;
  const units = room.gameData?.units || {};
  const cores = room.gameData?.cores || [];
  const events = room.gameData?.events || [];

  // Identify my unit
  const myUnit = (socket.id ? (units as Record<string, any>)[socket.id] : null) || Object.values<any>(units).find((u: any) => !u.isBot);

  // Sound triggers on events
  useEffect(() => {
    if (events.length > 0) {
      const latest = events[events.length - 1];
      if (Date.now() - latest.timestamp < 1000) {
        if (latest.type === 'laser') SoundFX.playDash();
        else if (latest.type === 'emp') SoundFX.playKnockout();
        else if (latest.type === 'shield') SoundFX.playPowerup();
        else if (latest.type === 'capture') SoundFX.playCoin();
      }
    }
  }, [events]);

  const handleTileClick = (r: number, c: number) => {
    if (!myUnit || myUnit.hp <= 0) return;

    if (selectedAbility === 'move') {
      socket.emit(SOCKET_EVENTS.GAME_INPUT, {
        roomCode: room.roomCode,
        input: { abilityId: 'move', targetRow: r, targetCol: c }
      });
      SoundFX.playCoin();
    } else if (selectedAbility === 'laser') {
      socket.emit(SOCKET_EVENTS.GAME_INPUT, {
        roomCode: room.roomCode,
        input: { abilityId: 'laser', targetRow: r, targetCol: c }
      });
      SoundFX.playDash();
    }
  };

  const handleEmpClick = () => {
    if (!myUnit || myUnit.hp <= 0 || myUnit.ap < 2) return;
    socket.emit(SOCKET_EVENTS.GAME_INPUT, {
      roomCode: room.roomCode,
      input: { abilityId: 'emp' }
    });
    SoundFX.playKnockout();
  };

  const handleShieldClick = () => {
    if (!myUnit || myUnit.hp <= 0 || myUnit.ap < 1) return;
    socket.emit(SOCKET_EVENTS.GAME_INPUT, {
      roomCode: room.roomCode,
      input: { abilityId: 'shield' }
    });
    SoundFX.playPowerup();
  };

  // Helper: Tile highlight states
  const isTargetable = (r: number, c: number) => {
    if (!myUnit || myUnit.hp <= 0) return false;
    if (selectedAbility === 'move') {
      const dist = Math.abs(myUnit.row - r) + Math.abs(myUnit.col - c);
      return dist === 1;
    }
    if (selectedAbility === 'laser') {
      const isSameRow = r === myUnit.row;
      const isSameCol = c === myUnit.col;
      const dist = Math.abs(r - myUnit.row) + Math.abs(c - myUnit.col);
      return (isSameRow || isSameCol) && dist >= 1 && dist <= 3;
    }
    return false;
  };

  const isEmpZone = (r: number, c: number) => {
    if (selectedAbility !== 'emp' || !myUnit) return false;
    const rd = Math.abs(r - myUnit.row);
    const cd = Math.abs(c - myUnit.col);
    return rd <= 1 && cd <= 1 && !(rd === 0 && cd === 0);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', userSelect: 'none' }}>
      {/* Tactical Status Banner */}
      {myUnit && (
        <div
          style={{
            display: 'flex',
            gap: 24,
            alignItems: 'center',
            background: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: 10,
            padding: '10px 20px',
            marginBottom: 14
          }}
        >
          <div>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>OPERATIVE: </span>
            <strong style={{ color: myUnit.color }}>{myUnit.name}</strong>
          </div>
          <div>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>HEALTH: </span>
            <strong style={{ color: myUnit.hp > 40 ? '#10b981' : '#ef4444' }}>{myUnit.hp}/100</strong>
          </div>
          <div>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>SHIELD: </span>
            <strong style={{ color: '#00e5ff' }}>🛡️ {myUnit.shield}</strong>
          </div>
          <div>
            <span style={{ fontSize: 13, color: '#94a3b8' }}>ACTION POINTS: </span>
            <strong style={{ color: '#ffe600' }}>⚡ {myUnit.ap}/3 AP</strong>
          </div>
        </div>
      )}

      {/* Cyber Grid */}
      <div
        style={{
          display: 'inline-grid',
          gridTemplateColumns: `repeat(${gridSize}, minmax(36px, 62px))`,
          gap: 5,
          background: '#090d16',
          padding: 12,
          borderRadius: 12,
          border: '2px solid #00e5ff',
          boxShadow: '0 0 25px rgba(0, 229, 255, 0.2)',
          maxWidth: '100%',
          overflowX: 'auto'
        }}
      >
        {Array.from({ length: gridSize * gridSize }).map((_, idx) => {
          const r = Math.floor(idx / gridSize);
          const c = idx % gridSize;
          const occupant = Object.values<any>(units).find(u => u.hp > 0 && u.row === r && u.col === c);
          const core = cores.find((cr: any) => cr.row === r && cr.col === c);
          const targetable = isTargetable(r, c);
          const inEmp = isEmpZone(r, c);

          let tileBg = '#0d1322';
          let border = '1px solid #1e293b';

          if (core) {
            tileBg = core.controlledBy ? '#1e293b' : '#1e1b4b';
            border = `2px dashed ${core.controlledBy ? '#00e5ff' : '#f59e0b'}`;
          }

          if (targetable) {
            tileBg = selectedAbility === 'laser' ? '#450a0a' : '#042f2e';
            border = selectedAbility === 'laser' ? '2px solid #ef4444' : '2px solid #14b8a6';
          } else if (inEmp) {
            tileBg = '#451a03';
            border = '2px solid #f97316';
          }

          return (
            <div
              key={idx}
              onClick={() => handleTileClick(r, c)}
              onMouseEnter={() => setHoveredTile({ r, c })}
              onMouseLeave={() => setHoveredTile(null)}
              style={{
                width: 'clamp(36px, 10vw, 62px)',
                height: 'clamp(36px, 10vw, 62px)',
                background: tileBg,
                border,
                borderRadius: 8,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative',
                cursor: targetable ? 'crosshair' : 'default',
                transition: 'all 0.15s'
              }}
            >
              {/* Data Core Icon */}
              {core && (
                <div
                  style={{
                    position: 'absolute',
                    top: 2,
                    right: 4,
                    fontSize: 10,
                    color: core.controlledBy ? '#00e5ff' : '#f59e0b',
                    fontWeight: 800
                  }}
                >
                  ⚡CORE
                </div>
              )}

              {/* Occupant Unit */}
              {occupant ? (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    width: '100%',
                    padding: '0 4px'
                  }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      background: occupant.color,
                      border: occupant.shield > 0 ? '2px solid #00e5ff' : '2px solid #fff',
                      boxShadow: `0 0 10px ${occupant.color}`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 13,
                      fontWeight: 800,
                      color: '#000'
                    }}
                  >
                    {occupant.name[0]}
                  </div>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#fff',
                      marginTop: 2,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      maxWidth: 60
                    }}
                  >
                    {occupant.name.slice(0, 7)}
                  </span>
                  {/* Miniature HP bar */}
                  <div style={{ width: '80%', height: 3, background: '#334155', borderRadius: 2, marginTop: 2 }}>
                    <div
                      style={{
                        width: `${Math.max(0, (occupant.hp / occupant.maxHp) * 100)}%`,
                        height: '100%',
                        background: occupant.hp > 40 ? '#10b981' : '#ef4444',
                        borderRadius: 2
                      }}
                    />
                  </div>
                </div>
              ) : (
                <span style={{ fontSize: 9, color: '#334155' }}>
                  {r},{c}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Action Command Bar */}
      <div
        style={{
          marginTop: 18,
          display: 'flex',
          gap: 12,
          background: '#0f172a',
          padding: 12,
          borderRadius: 12,
          border: '1px solid #1e293b'
        }}
      >
        <button
          onClick={() => setSelectedAbility('move')}
          style={{
            ...actionBtnStyle,
            background: selectedAbility === 'move' ? '#0d9488' : '#1e293b',
            border: selectedAbility === 'move' ? '2px solid #14b8a6' : '1px solid #334155'
          }}
        >
          🚶 Move (1 AP)
        </button>

        <button
          onClick={() => setSelectedAbility('laser')}
          style={{
            ...actionBtnStyle,
            background: selectedAbility === 'laser' ? '#b91c1c' : '#1e293b',
            border: selectedAbility === 'laser' ? '2px solid #ef4444' : '1px solid #334155'
          }}
        >
          ⚡ Laser Strike (2 AP)
        </button>

        <button
          onClick={handleEmpClick}
          disabled={!myUnit || myUnit.ap < 2}
          style={{
            ...actionBtnStyle,
            background: myUnit?.ap >= 2 ? '#c2410c' : '#334155',
            border: '1px solid #ea580c',
            cursor: myUnit?.ap >= 2 ? 'pointer' : 'not-allowed'
          }}
        >
          💣 Radial EMP (2 AP)
        </button>

        <button
          onClick={handleShieldClick}
          disabled={!myUnit || myUnit.ap < 1}
          style={{
            ...actionBtnStyle,
            background: myUnit?.ap >= 1 ? '#047857' : '#334155',
            border: '1px solid #10b981',
            cursor: myUnit?.ap >= 1 ? 'pointer' : 'not-allowed'
          }}
        >
          🛡️ Shield (+25) (1 AP)
        </button>
      </div>

      <div style={{ marginTop: 8, fontSize: 13, color: '#94a3b8' }}>
        {selectedAbility === 'move' && '👉 Click an adjacent tile (green) to step 1 tile and capture Data Cores.'}
        {selectedAbility === 'laser' && '👉 Click an enemy in straight line-of-sight (red) to fire a 35 DMG laser beam!'}
        {selectedAbility === 'emp' && '👉 Detonates an immediate shockwave hitting all 8 surrounding tiles for 25 DMG.'}
      </div>
    </div>
  );
};

const actionBtnStyle: React.CSSProperties = {
  padding: '10px 16px',
  color: '#fff',
  fontWeight: 700,
  fontSize: 13,
  borderRadius: 8,
  cursor: 'pointer',
  transition: 'all 0.15s'
};
