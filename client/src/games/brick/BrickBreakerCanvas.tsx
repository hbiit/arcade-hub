import React, { useEffect, useRef, useState } from 'react';
import { Socket } from 'socket.io-client';
import { RoomState, SOCKET_EVENTS } from '../../../../shared/src';
import { SoundFX } from '../../utils/soundEffects';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  life: number;
  maxLife: number;
}

interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
  vy: number;
}

export const BrickBreakerCanvas: React.FC<{ socket: Socket; room: RoomState<any> }> = ({ socket, room }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const screenShakeRef = useRef<number>(0);
  const processedEventsRef = useRef<Set<string>>(new Set());
  const roomRef = useRef<RoomState<any>>(room);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  // Pointer & Keyboard Controls
  useEffect(() => {
    const keys: Record<string, boolean> = {};

    const emitMove = (targetX?: number, dx?: number, fire?: boolean) => {
      socket.emit(SOCKET_EVENTS.GAME_INPUT, {
        roomCode: room.roomCode,
        input: { targetX, dx, fire }
      });
    };

    const onMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const x = (e.clientX - rect.left) * scaleX;
      emitMove(x);
    };

    const onTouchMove = (e: TouchEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || !e.touches[0]) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const x = (e.touches[0].clientX - rect.left) * scaleX;
      emitMove(x);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (['Space', 'ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(e.code)) {
        e.preventDefault();
      }
      keys[e.code] = true;
      if (e.code === 'Space') {
        emitMove(undefined, undefined, true);
        SoundFX.playDash();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
    };

    const interval = setInterval(() => {
      const dx = (keys['ArrowRight'] || keys['KeyD'] ? 1 : 0) - (keys['ArrowLeft'] || keys['KeyA'] ? 1 : 0);
      if (dx !== 0) emitMove(undefined, dx);
    }, 40);

    const canvas = canvasRef.current;
    if (canvas) {
      canvas.addEventListener('mousemove', onMouseMove);
      canvas.addEventListener('touchmove', onTouchMove, { passive: true });
      canvas.addEventListener('click', () => {
        emitMove(undefined, undefined, true);
        SoundFX.playDash();
      });
    }

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      clearInterval(interval);
      if (canvas) {
        canvas.removeEventListener('mousemove', onMouseMove);
        canvas.removeEventListener('touchmove', onTouchMove);
      }
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [socket, room.roomCode]);

  // Audio & Visual Event Triggering
  useEffect(() => {
    const events = room.gameData?.events || [];
    for (const evt of events) {
      if (processedEventsRef.current.has(evt.id)) continue;
      processedEventsRef.current.add(evt.id);

      if (processedEventsRef.current.size > 200) processedEventsRef.current.clear();

      floatingTextsRef.current.push({
        id: evt.id,
        x: evt.x,
        y: evt.y - 10,
        text: evt.text,
        color: evt.color || '#00e5ff',
        alpha: 1.0,
        vy: -2.0
      });

      if (evt.type === 'brick_destroyed') {
        SoundFX.playCoin();
        for (let i = 0; i < 8; i++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = Math.random() * 140 + 40;
          particlesRef.current.push({
            x: evt.x,
            y: evt.y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            size: Math.random() * 4 + 2,
            color: evt.color || '#00e5ff',
            alpha: 1.0,
            life: 0,
            maxLife: 0.45
          });
        }
      } else if (evt.type === 'combo') {
        SoundFX.playPowerup();
        screenShakeRef.current = Math.max(screenShakeRef.current, 8);
        for (let i = 0; i < 18; i++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = Math.random() * 180 + 50;
          particlesRef.current.push({
            x: evt.x,
            y: evt.y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            size: Math.random() * 6 + 3,
            color: evt.color || '#ffe600',
            alpha: 1.0,
            life: 0,
            maxLife: 0.6
          });
        }
      } else if (evt.type === 'powerup_collect') {
        SoundFX.playPowerup();
      } else if (evt.type === 'laser_fire') {
        SoundFX.playBump();
      } else if (evt.type === 'life_lost') {
        SoundFX.playKnockout();
        screenShakeRef.current = 14;
      }
    }
  }, [room.gameData?.events]);

  // 60 FPS Canvas Render Loop
  useEffect(() => {
    let animationFrameId: number;
    let lastTime = performance.now();

    const render = (time: number) => {
      const dt = Math.min(0.1, (time - lastTime) / 1000);
      lastTime = time;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = canvas.width;
      const height = canvas.height;

      ctx.save();
      if (screenShakeRef.current > 0) {
        const shakeX = (Math.random() - 0.5) * screenShakeRef.current * 1.8;
        const shakeY = (Math.random() - 0.5) * screenShakeRef.current * 1.8;
        ctx.translate(shakeX, shakeY);
        screenShakeRef.current = Math.max(0, screenShakeRef.current - dt * 20);
      }

      // Backdrop
      ctx.fillStyle = '#060913';
      ctx.fillRect(0, 0, width, height);

      // Cyber Grid
      ctx.strokeStyle = '#0e172a';
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Border
      ctx.strokeStyle = '#00e5ff55';
      ctx.lineWidth = 3;
      ctx.strokeRect(6, 6, width - 12, height - 12);

      const gameData = roomRef.current.gameData;
      if (gameData) {
        // Draw Shield Floor if active
        if (gameData.paddle?.hasShield) {
          ctx.strokeStyle = '#10b981';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(12, height - 14);
          ctx.lineTo(width - 12, height - 14);
          ctx.stroke();
          ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
          ctx.fillRect(12, height - 18, width - 24, 8);
        }

        // Draw Bricks
        for (const brick of gameData.bricks || []) {
          ctx.save();
          ctx.translate(brick.x, brick.y);

          // Glow
          ctx.shadowColor = brick.color;
          ctx.shadowBlur = brick.hp < brick.maxHp ? 4 : 12;

          ctx.fillStyle = brick.color;
          ctx.fillRect(0, 0, brick.width, brick.height);

          ctx.shadowBlur = 0;
          ctx.strokeStyle = '#ffffff88';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(0, 0, brick.width, brick.height);

          // Brick Type Icon / Label
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 10px Orbitron, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          if (brick.type === 'explosive') ctx.fillText('💣 BLAST', brick.width / 2, brick.height / 2);
          else if (brick.type === 'multiball') ctx.fillText('⚡ MULTI', brick.width / 2, brick.height / 2);
          else if (brick.type === 'laser') ctx.fillText('🔥 LASER', brick.width / 2, brick.height / 2);
          else if (brick.type === 'shield') ctx.fillText('🛡️ SHIELD', brick.width / 2, brick.height / 2);
          else if (brick.type === 'armor') ctx.fillText(brick.hp === 2 ? '🛡️ 2' : '💥 1', brick.width / 2, brick.height / 2);

          ctx.restore();
        }

        // Draw Lasers
        ctx.fillStyle = '#ff007f';
        ctx.shadowColor = '#ff007f';
        ctx.shadowBlur = 10;
        for (const laser of gameData.lasers || []) {
          ctx.fillRect(laser.x - 2, laser.y - 12, 4, 18);
        }
        ctx.shadowBlur = 0;

        // Draw Powerup Drops
        for (const pwr of gameData.powerups || []) {
          ctx.save();
          ctx.translate(pwr.x, pwr.y);
          const pColor = pwr.type === 'multiball' ? '#ffe600' : pwr.type === 'laser' ? '#ff007f' : '#10b981';
          const pText = pwr.type === 'multiball' ? '⚡' : pwr.type === 'laser' ? '🔥' : '🛡️';

          ctx.shadowColor = pColor;
          ctx.shadowBlur = 12;
          ctx.fillStyle = pColor;
          ctx.beginPath();
          ctx.arc(0, 0, 14, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#000000';
          ctx.font = '12px system-ui';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(pText, 0, 0);
          ctx.restore();
        }

        // Draw Paddle
        const p = gameData.paddle;
        if (p) {
          ctx.save();
          ctx.translate(p.x, p.y);

          const paddleGlow = p.hasLaser ? '#ff007f' : p.hasShield ? '#10b981' : '#00e5ff';
          ctx.shadowColor = paddleGlow;
          ctx.shadowBlur = 16;

          // Paddle body
          const grad = ctx.createLinearGradient(-p.width / 2, 0, p.width / 2, 0);
          grad.addColorStop(0, '#0f172a');
          grad.addColorStop(0.5, paddleGlow);
          grad.addColorStop(1, '#0f172a');
          ctx.fillStyle = grad;
          ctx.fillRect(-p.width / 2, -p.height / 2, p.width, p.height);

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.strokeRect(-p.width / 2, -p.height / 2, p.width, p.height);

          ctx.restore();
        }

        // Draw Balls with glowing trails
        for (const ball of gameData.balls || []) {
          ctx.save();
          ctx.translate(ball.x, ball.y);

          ctx.shadowColor = '#00e5ff';
          ctx.shadowBlur = 16;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, 0, ball.radius, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#00e5ff';
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        }
      }

      // Draw Floating Texts
      for (let i = floatingTextsRef.current.length - 1; i >= 0; i--) {
        const ft = floatingTextsRef.current[i];
        ft.y += ft.vy;
        ft.alpha -= dt * 1.3;

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

      // Draw Particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const pt = particlesRef.current[i];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.life += dt;
        pt.alpha = Math.max(0, 1 - pt.life / pt.maxLife);

        if (pt.life >= pt.maxLife) {
          particlesRef.current.splice(i, 1);
          continue;
        }

        ctx.save();
        ctx.globalAlpha = pt.alpha;
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      ctx.restore(); // restore screen shake

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  const handleLaunchClick = () => {
    socket.emit(SOCKET_EVENTS.GAME_INPUT, {
      roomCode: room.roomCode,
      input: { fire: true, dash: true }
    });
    SoundFX.playDash();
  };

  const gameData = room.gameData;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', userSelect: 'none' }}>
      {/* Top HUD */}
      <div style={{ display: 'flex', gap: 24, marginBottom: 12, alignItems: 'center' }}>
        <div style={{ background: '#0f172a', padding: '6px 16px', borderRadius: 20, border: '1px solid #1e293b' }}>
          <span style={{ color: '#94a3b8', fontSize: 12 }}>SCORE: </span>
          <span style={{ color: '#00e5ff', fontWeight: 800, fontSize: 16 }}>{gameData?.score || 0}</span>
        </div>
        <div style={{ background: '#0f172a', padding: '6px 16px', borderRadius: 20, border: '1px solid #1e293b' }}>
          <span style={{ color: '#94a3b8', fontSize: 12 }}>LEVEL: </span>
          <span style={{ color: '#ffe600', fontWeight: 800, fontSize: 16 }}>{gameData?.level || 1}</span>
        </div>
        <div style={{ background: '#0f172a', padding: '6px 16px', borderRadius: 20, border: '1px solid #1e293b' }}>
          <span style={{ color: '#94a3b8', fontSize: 12 }}>LIVES: </span>
          <span style={{ color: '#ef4444', fontWeight: 800, fontSize: 16 }}>
            {'❤️'.repeat(Math.max(0, gameData?.lives || 0))}
          </span>
        </div>
        <div style={{ background: '#0f172a', padding: '6px 16px', borderRadius: 20, border: '1px solid #1e293b' }}>
          <span style={{ color: '#94a3b8', fontSize: 12 }}>COMBO: </span>
          <span style={{ color: '#a855f7', fontWeight: 800, fontSize: 16 }}>x{gameData?.combo || 0}</span>
        </div>
      </div>

      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={800}
          height={650}
          style={{
            maxWidth: '100%',
            height: 'auto',
            border: '2px solid #00e5ff',
            borderRadius: 12,
            boxShadow: '0 0 30px rgba(0, 229, 255, 0.28)',
            background: '#060913',
            display: 'block',
            cursor: 'ew-resize'
          }}
        />

        {gameData?.ballAttached && (
          <div style={{ position: 'absolute', bottom: 70, left: '50%', transform: 'translateX(-50%)' }}>
            <button
              onClick={handleLaunchClick}
              style={{
                padding: '12px 24px',
                background: 'linear-gradient(135deg, #00e5ff, #8b5cf6)',
                color: '#000',
                border: 'none',
                borderRadius: 30,
                fontWeight: 900,
                fontSize: 15,
                cursor: 'pointer',
                boxShadow: '0 0 20px rgba(0, 229, 255, 0.8)'
              }}
            >
              🚀 LAUNCH BALL [Space / Click]
            </button>
          </div>
        )}
      </div>

      {/* Control Tips */}
      <div style={{ marginTop: 12, display: 'flex', gap: 14, alignItems: 'center', background: '#0f172a', padding: '10px 18px', borderRadius: 8, border: '1px solid #1e293b' }}>
        <span style={{ fontSize: 13, color: '#00e5ff', fontWeight: 'bold' }}>🎮 Controls:</span>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>
          <strong>Move Mouse or A/D</strong> to slide paddle • <strong>Click / Spacebar</strong> to Launch & Fire Lasers • Catch powerups for <strong>Multi-Ball</strong>, <strong>Twin Lasers</strong> & <strong>Floor Shield</strong>!
        </span>
      </div>
    </div>
  );
};
