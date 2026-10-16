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

export const CyberSlitherCanvas: React.FC<{ socket: Socket; room: RoomState<any> }> = ({ socket, room }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const processedEventsRef = useRef<Set<string>>(new Set());
  const roomRef = useRef<RoomState<any>>(room);
  const [isBoosting, setIsBoosting] = useState(false);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  // Pointer & Keyboard Controls
  useEffect(() => {
    let boostActive = false;

    const emitMove = (targetX: number, targetY: number, boost: boolean) => {
      socket.emit(SOCKET_EVENTS.GAME_INPUT, {
        roomCode: room.roomCode,
        input: { targetX, targetY, dash: boost, boost }
      });
    };

    const onMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      emitMove(x, y, boostActive);
    };

    const onTouchMove = (e: TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || !e.touches[0]) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const x = (e.touches[0].clientX - rect.left) * scaleX;
      const y = (e.touches[0].clientY - rect.top) * scaleY;
      emitMove(x, y, boostActive);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        boostActive = true;
        setIsBoosting(true);
        SoundFX.playDash();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        boostActive = false;
        setIsBoosting(false);
      }
    };

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('mousemove', onMouseMove);
      canvas.addEventListener('touchmove', onTouchMove, { passive: true });
      canvas.addEventListener('mousedown', (e) => {
        if (e.button === 0 || e.button === 2) {
          boostActive = true;
          setIsBoosting(true);
          SoundFX.playDash();
        }
      });
      canvas.addEventListener('mouseup', () => {
        boostActive = false;
        setIsBoosting(false);
      });
      canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      if (canvas) {
        canvas.removeEventListener('mousemove', onMouseMove);
        canvas.removeEventListener('touchmove', onTouchMove);
      }
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [socket, room.roomCode]);

  // Audio & Event handling
  useEffect(() => {
    const events = room.gameData?.events || [];
    for (const evt of events) {
      if (processedEventsRef.current.has(evt.id)) continue;
      processedEventsRef.current.add(evt.id);

      if (processedEventsRef.current.size > 200) processedEventsRef.current.clear();

      floatingTextsRef.current.push({
        id: evt.id,
        x: evt.x,
        y: evt.y - 12,
        text: evt.text,
        color: evt.color || '#ffe600',
        alpha: 1.0,
        vy: -1.8
      });

      if (evt.type === 'crash') {
        SoundFX.playKnockout();
      } else if (evt.type === 'boost') {
        SoundFX.playPowerup();
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

      // Deep Space Arena
      ctx.fillStyle = '#060913';
      ctx.fillRect(0, 0, width, height);

      // Grid
      ctx.strokeStyle = '#0e172a';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 45) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 45) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Border
      ctx.strokeStyle = '#00e5ff66';
      ctx.lineWidth = 3;
      ctx.strokeRect(6, 6, width - 12, height - 12);

      const gameData = roomRef.current.gameData;
      if (gameData) {
        // Draw Pellets
        for (const pellet of gameData.pellets || []) {
          ctx.save();
          ctx.translate(pellet.x, pellet.y);

          const pGlow = ctx.createRadialGradient(0, 0, 1, 0, 0, 10);
          pGlow.addColorStop(0, pellet.color);
          pGlow.addColorStop(0.5, `${pellet.color}66`);
          pGlow.addColorStop(1, `${pellet.color}00`);
          ctx.fillStyle = pGlow;
          ctx.beginPath();
          ctx.arc(0, 0, 10, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, 0, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Draw Snakes
        const snakes = Object.values<any>(gameData.snakes || {});
        for (const snake of snakes) {
          if (snake.isDead || !snake.segments || snake.segments.length === 0) continue;

          // Draw Body Segments (from tail to neck)
          for (let i = snake.segments.length - 1; i > 0; i--) {
            const seg = snake.segments[i];
            const size = Math.min(13, 8 + (1 - i / snake.segments.length) * 4);

            ctx.save();
            ctx.fillStyle = snake.color;
            ctx.shadowColor = snake.color;
            ctx.shadowBlur = snake.isBoosting ? 14 : 6;
            ctx.beginPath();
            ctx.arc(seg.x, seg.y, size, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = '#ffffff55';
            ctx.lineWidth = 1;
            ctx.stroke();
            ctx.restore();
          }

          // Draw Head with Eyes & Jaw
          const head = snake.segments[0];
          ctx.save();
          ctx.translate(head.x, head.y);
          ctx.rotate(snake.angle);

          ctx.shadowColor = snake.color;
          ctx.shadowBlur = snake.isBoosting ? 20 : 10;

          // Head Body
          ctx.fillStyle = snake.color;
          ctx.beginPath();
          ctx.arc(0, 0, 14, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();

          // Eyes
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(6, -6, 4, 0, Math.PI * 2);
          ctx.arc(6, 6, 4, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#000000';
          ctx.beginPath();
          ctx.arc(8, -6, 2, 0, Math.PI * 2);
          ctx.arc(8, 6, 2, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();

          // Snake Name Tag
          ctx.save();
          ctx.font = 'bold 12px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#000';
          ctx.fillText(`${snake.name} (${snake.score})`, head.x + 1, head.y - 21);
          ctx.fillStyle = snake.color;
          ctx.fillText(`${snake.name} (${snake.score})`, head.x, head.y - 22);
          ctx.restore();
        }
      }

      // Draw Floating Texts
      for (let i = floatingTextsRef.current.length - 1; i >= 0; i--) {
        const ft = floatingTextsRef.current[i];
        ft.y += ft.vy;
        ft.alpha -= 0.016 * 1.1;

        if (ft.alpha <= 0) {
          floatingTextsRef.current.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = ft.alpha;
        ctx.font = 'bold 14px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  const handleBoostToggle = () => {
    const next = !isBoosting;
    setIsBoosting(next);
    socket.emit(SOCKET_EVENTS.GAME_INPUT, {
      roomCode: room.roomCode,
      input: { dash: next, boost: next }
    });
    if (next) SoundFX.playDash();
  };

  const gameData = room.gameData;
  const sortedSnakes = Object.values<any>(gameData?.snakes || {}).sort((a, b) => (b.score || 0) - (a.score || 0));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', userSelect: 'none' }}>
      {/* Live Leaderboard Strip */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 12, alignItems: 'center' }}>
        {sortedSnakes.slice(0, 4).map((s, idx) => (
          <div key={s.id} style={{ background: '#0f172a', padding: '6px 14px', borderRadius: 16, border: '1px solid #1e293b' }}>
            <span style={{ color: '#94a3b8', fontSize: 12 }}>#{idx + 1} </span>
            <span style={{ color: s.color, fontWeight: 700, fontSize: 13 }}>{s.name}: </span>
            <span style={{ color: '#ffffff', fontWeight: 800, fontSize: 13 }}>{s.score} pts</span>
          </div>
        ))}
      </div>

      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={900}
          height={650}
          style={{
            maxWidth: '100%',
            height: 'auto',
            border: '2px solid #00e5ff',
            borderRadius: 12,
            boxShadow: '0 0 30px rgba(0, 229, 255, 0.28)',
            background: '#060913',
            display: 'block',
            cursor: 'crosshair'
          }}
        />

        {/* Boost Button */}
        <div style={{ position: 'absolute', bottom: 16, right: 16 }}>
          <button
            onClick={handleBoostToggle}
            style={{
              padding: '12px 22px',
              background: isBoosting ? 'linear-gradient(135deg, #ffe600, #ff007f)' : 'linear-gradient(135deg, #00e5ff, #8b5cf6)',
              color: '#000',
              border: 'none',
              borderRadius: 30,
              fontWeight: 900,
              fontSize: 14,
              cursor: 'pointer',
              boxShadow: isBoosting ? '0 0 20px rgba(255, 230, 0, 0.8)' : '0 0 16px rgba(0, 229, 255, 0.6)'
            }}
          >
            ⚡ {isBoosting ? 'SPRINT ACTIVE!' : 'SPRINT BOOST [Space/Click]'}
          </button>
        </div>
      </div>

      {/* Rules */}
      <div style={{ marginTop: 12, display: 'flex', gap: 14, alignItems: 'center', background: '#0f172a', padding: '10px 18px', borderRadius: 8, border: '1px solid #1e293b' }}>
        <span style={{ fontSize: 13, color: '#00e5ff', fontWeight: 'bold' }}>🎮 Controls:</span>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>
          <strong>Move Mouse</strong> to steer snake • <strong>Spacebar or Hold Left/Right Click</strong> to Sprint Boost • Cut in front of rivals to crash them into glowing energy!
        </span>
      </div>
    </div>
  );
};
