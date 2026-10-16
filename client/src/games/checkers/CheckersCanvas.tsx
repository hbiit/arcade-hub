import React, { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import { RoomState, SOCKET_EVENTS } from '../../../../shared/src';
import { SoundFX } from '../../utils/soundEffects';

interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
  vy: number;
}

export const CheckersCanvas: React.FC<{ socket: Socket; room: RoomState<any> }> = ({ socket, room }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const processedEventsRef = useRef<Set<string>>(new Set());
  const roomRef = useRef<RoomState<any>>(room);

  const [selectedPieceId, setSelectedPieceId] = useState<number | undefined>(undefined);
  const [validMoves, setValidMoves] = useState<any[]>([]);

  useEffect(() => {
    roomRef.current = room;
    if (room.gameData) {
      setSelectedPieceId(room.gameData.selectedPieceId);
      setValidMoves(room.gameData.validMoves || []);
    }
  }, [room]);

  // Audio & Event handling
  useEffect(() => {
    const events = room.gameData?.events || [];
    for (const evt of events) {
      if (processedEventsRef.current.has(evt.id)) continue;
      processedEventsRef.current.add(evt.id);

      if (processedEventsRef.current.size > 200) processedEventsRef.current.clear();

      floatingTextsRef.current.push({
        id: evt.id,
        x: 350,
        y: 280,
        text: evt.text,
        color: evt.color || '#00e5ff',
        alpha: 1.0,
        vy: -1.4
      });

      if (evt.type === 'capture') {
        SoundFX.playKnockout();
      } else if (evt.type === 'king') {
        SoundFX.playVictory();
      } else if (evt.type === 'move') {
        SoundFX.playCoin();
      }
    }
  }, [room.gameData?.events]);

  // 60 FPS Render Loop
  useEffect(() => {
    let animationFrameId: number;

    const render = (time: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;
      const tileSize = width / 8;

      ctx.fillStyle = '#060913';
      ctx.fillRect(0, 0, width, height);

      const gameData = roomRef.current.gameData;
      const pieces = gameData?.pieces || [];
      const moves = roomRef.current.gameData?.validMoves || [];
      const selId = roomRef.current.gameData?.selectedPieceId;

      // 1. Draw 8x8 Cyber Checkered Board
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          const isDark = (r + c) % 2 === 1;
          ctx.fillStyle = isDark ? '#0f172a' : '#1e293b';
          ctx.fillRect(c * tileSize, r * tileSize, tileSize, tileSize);

          ctx.strokeStyle = '#334155';
          ctx.lineWidth = 0.5;
          ctx.strokeRect(c * tileSize, r * tileSize, tileSize, tileSize);
        }
      }

      // 2. Draw Valid Move Highlights (Glowing rings)
      for (const m of moves) {
        ctx.save();
        const centerX = m.toCol * tileSize + tileSize / 2;
        const centerY = m.toRow * tileSize + tileSize / 2;
        const pulse = Math.sin(time * 0.008) * 3;

        ctx.strokeStyle = m.jumpedPieceId ? '#f43f5e' : '#10b981';
        ctx.lineWidth = 3;
        ctx.shadowColor = m.jumpedPieceId ? '#f43f5e' : '#10b981';
        ctx.shadowBlur = 12;

        ctx.beginPath();
        ctx.arc(centerX, centerY, tileSize * 0.32 + pulse, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = m.jumpedPieceId ? 'rgba(244, 63, 94, 0.25)' : 'rgba(16, 185, 129, 0.25)';
        ctx.fill();
        ctx.restore();
      }

      // 3. Draw Checkers Pieces
      for (const p of pieces) {
        ctx.save();
        const centerX = p.col * tileSize + tileSize / 2;
        const centerY = p.row * tileSize + tileSize / 2;
        const isSelected = p.id === selId;
        const pColor = p.color === 'cyan' ? '#00e5ff' : '#f43f5e';
        const radius = tileSize * 0.38;

        if (isSelected) {
          ctx.shadowColor = '#ffe600';
          ctx.shadowBlur = 20;
          ctx.strokeStyle = '#ffe600';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(centerX, centerY, radius + 5, 0, Math.PI * 2);
          ctx.stroke();
        }

        // 3D Piece Cylinder Rim
        ctx.shadowColor = pColor;
        ctx.shadowBlur = 14;
        ctx.fillStyle = p.color === 'cyan' ? '#083344' : '#4c0519';
        ctx.beginPath();
        ctx.arc(centerX, centerY + 4, radius, 0, Math.PI * 2);
        ctx.fill();

        // Top Face
        const grad = ctx.createRadialGradient(centerX - 6, centerY - 6, 2, centerX, centerY, radius);
        grad.addColorStop(0, '#ffffff');
        grad.addColorStop(0.3, pColor);
        grad.addColorStop(1, p.color === 'cyan' ? '#083344' : '#4c0519');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // King Crown Insignia
        if (p.isKing) {
          ctx.fillStyle = '#ffe600';
          ctx.font = 'bold 22px system-ui';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('👑', centerX, centerY);
        }

        ctx.restore();
      }

      // 4. Draw Floating Texts
      for (let i = floatingTextsRef.current.length - 1; i >= 0; i--) {
        const ft = floatingTextsRef.current[i];
        ft.y += ft.vy;
        ft.alpha -= 0.016 * 0.8;

        if (ft.alpha <= 0) {
          floatingTextsRef.current.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = ft.alpha;
        ctx.font = 'bold 20px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        ctx.fillText(ft.text, ft.x + 2, ft.y + 2);
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  // Board Click Interaction
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;

    const tileSize = canvas.width / 8;
    const col = Math.floor(x / tileSize);
    const row = Math.floor(y / tileSize);

    const gameData = roomRef.current.gameData;
    if (!gameData || gameData.winner) return;

    // Check if clicked on a valid destination
    const valid = (gameData.validMoves || []).find((m: any) => m.toRow === row && m.toCol === col);
    if (valid) {
      socket.emit(SOCKET_EVENTS.GAME_INPUT, {
        roomCode: room.roomCode,
        input: {
          action: 'make_move',
          fromRow: valid.fromRow,
          fromCol: valid.fromCol,
          toRow: valid.toRow,
          toCol: valid.toCol
        }
      });
      SoundFX.playCoin();
      return;
    }

    // Otherwise check if clicked on one of player's own pieces
    const piece = (gameData.pieces || []).find((p: any) => p.row === row && p.col === col && p.color === 'cyan');
    if (piece) {
      socket.emit(SOCKET_EVENTS.GAME_INPUT, {
        roomCode: room.roomCode,
        input: {
          action: 'select_piece',
          pieceId: piece.id
        }
      });
      SoundFX.playTileClick();
    }
  };

  const gameData = room.gameData;
  const isPlayerTurn = gameData?.currentTurn === 'cyan';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', userSelect: 'none' }}>
      {/* Turn & Status Header */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 12, alignItems: 'center' }}>
        <div style={{ background: '#0f172a', padding: '8px 18px', borderRadius: 20, border: '1px solid #1e293b' }}>
          <span style={{ color: '#94a3b8', fontSize: 13 }}>TURN: </span>
          <span style={{ color: isPlayerTurn ? '#00e5ff' : '#f43f5e', fontWeight: 800, fontSize: 16 }}>
            {isPlayerTurn ? 'YOU (Cyan)' : '🤖 DEEP-NEON AI (Magenta)'}
          </span>
        </div>
        <div style={{ background: '#0f172a', padding: '8px 18px', borderRadius: 20, border: '1px solid #1e293b' }}>
          <span style={{ color: '#94a3b8', fontSize: 13 }}>TIMER: </span>
          <span style={{ color: '#ffe600', fontWeight: 800, fontSize: 16 }}>
            {Math.ceil(gameData?.turnTimer || 35)}s
          </span>
        </div>
        <div style={{ background: '#0f172a', padding: '8px 18px', borderRadius: 20, border: '1px solid #1e293b' }}>
          <span style={{ color: '#94a3b8', fontSize: 13 }}>CAPTURES: </span>
          <span style={{ color: '#10b981', fontWeight: 800, fontSize: 16 }}>
            Cyan: {gameData?.capturedMagenta || 0} • AI: {gameData?.capturedCyan || 0}
          </span>
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={640}
          height={640}
          onClick={handleCanvasClick}
          style={{
            maxWidth: '100%',
            height: 'auto',
            border: '3px solid #00e5ff',
            borderRadius: 12,
            boxShadow: '0 0 35px rgba(0, 229, 255, 0.3)',
            background: '#060913',
            display: 'block',
            cursor: 'pointer'
          }}
        />

        {gameData?.winner && (
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'rgba(15, 23, 42, 0.95)',
              border: '2px solid #00e5ff',
              borderRadius: 16,
              padding: '24px 36px',
              textAlign: 'center',
              boxShadow: '0 0 40px rgba(0, 229, 255, 0.6)'
            }}
          >
            <h2 style={{ fontSize: 26, margin: 0, color: gameData.winner === 'cyan' ? '#00e5ff' : '#f43f5e' }}>
              {gameData.winner === 'cyan' ? '🏆 VICTORY!' : '💀 DEFEAT!'}
            </h2>
            <p style={{ color: '#cbd5e1', marginTop: 8 }}>
              {gameData.winner === 'cyan' ? 'You conquered the cyber checkerboard!' : 'The AI outmaneuvered your defenses!'}
            </p>
          </div>
        )}
      </div>

      {/* Rules & Control Bar */}
      <div style={{ marginTop: 12, display: 'flex', gap: 14, alignItems: 'center', background: '#0f172a', padding: '10px 18px', borderRadius: 8, border: '1px solid #1e293b' }}>
        <span style={{ fontSize: 13, color: '#00e5ff', fontWeight: 'bold' }}>🎮 Instructions:</span>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>
          <strong>Click a Cyan piece</strong> to see valid moves • <strong>Click a Green/Red target ring</strong> to move or capture • Reach back row for <strong>👑 King Promotion</strong>!
        </span>
      </div>
    </div>
  );
};
