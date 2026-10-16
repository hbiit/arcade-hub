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

export const GalaxyStrikeCanvas: React.FC<{ socket: Socket; room: RoomState<any> }> = ({ socket, room }) => {
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
        y: evt.y - 14,
        text: evt.text,
        color: evt.color || '#00e5ff',
        alpha: 1.0,
        vy: -2.0
      });

      if (evt.type === 'kill') {
        SoundFX.playBump();
        for (let i = 0; i < 10; i++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = Math.random() * 150 + 50;
          particlesRef.current.push({
            x: evt.x,
            y: evt.y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            size: Math.random() * 5 + 2,
            color: '#f59e0b',
            alpha: 1.0,
            life: 0,
            maxLife: 0.45
          });
        }
      } else if (evt.type === 'boss_spawn') {
        SoundFX.playVictory();
        screenShakeRef.current = 14;
      } else if (evt.type === 'powerup') {
        SoundFX.playPowerup();
      } else if (evt.type === 'player_hit') {
        SoundFX.playKnockout();
        screenShakeRef.current = 14;
      } else if (evt.type === 'wave_clear') {
        SoundFX.playPowerup();
      }
    }
  }, [room.gameData?.events]);

  // 60 FPS Render Loop
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

      // Space Nebula Background
      ctx.fillStyle = '#050711';
      ctx.fillRect(0, 0, width, height);

      // Moving Starfield
      ctx.fillStyle = '#ffffff';
      for (let s = 0; s < 45; s++) {
        const sx = ((s * 97 + time * 0.04) % width);
        const sy = ((s * 131 + time * 0.12) % height);
        const sSize = (s % 3 === 0) ? 2 : 1;
        ctx.fillRect(sx, sy, sSize, sSize);
      }

      // Arena Border
      ctx.strokeStyle = '#00e5ff55';
      ctx.lineWidth = 3;
      ctx.strokeRect(6, 6, width - 12, height - 12);

      const gameData = roomRef.current.gameData;
      if (gameData) {
        // Draw Powerup Drops
        for (const pwr of gameData.powerups || []) {
          ctx.save();
          ctx.translate(pwr.x, pwr.y);
          const pColor = pwr.type === 'spread' ? '#ffe600' : pwr.type === 'rapid' ? '#f43f5e' : '#10b981';
          const pText = pwr.type === 'spread' ? '⚡' : pwr.type === 'rapid' ? '🔥' : '🛡️';

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

        // Draw Player Lasers
        ctx.fillStyle = '#00e5ff';
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 12;
        for (const laser of gameData.lasers || []) {
          ctx.fillRect(laser.x - 2.5, laser.y - 12, 5, 20);
        }
        ctx.shadowBlur = 0;

        // Draw Enemy Plasma Bolts
        ctx.fillStyle = '#f43f5e';
        ctx.shadowColor = '#f43f5e';
        ctx.shadowBlur = 10;
        for (const bolt of gameData.enemyBolts || []) {
          ctx.beginPath();
          ctx.arc(bolt.x, bolt.y, 4.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.shadowBlur = 0;

        // Draw Enemies
        for (const enemy of gameData.enemies || []) {
          ctx.save();
          ctx.translate(enemy.x, enemy.y);

          if (enemy.type === 'boss') {
            // Giant Dreadnought Boss
            ctx.shadowColor = '#ef4444';
            ctx.shadowBlur = 24;

            // Wings
            ctx.fillStyle = '#1e1b4b';
            ctx.beginPath();
            ctx.moveTo(0, 45);
            ctx.lineTo(-65, -25);
            ctx.lineTo(-25, -45);
            ctx.lineTo(25, -45);
            ctx.lineTo(65, -25);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 3.5;
            ctx.stroke();

            // Core
            ctx.fillStyle = '#ef4444';
            ctx.beginPath();
            ctx.arc(0, 0, 18, 0, Math.PI * 2);
            ctx.fill();

            // Health Bar
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(-50, -60, 100, 7);
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(-50, -60, (enemy.hp / enemy.maxHp) * 100, 7);
          } else {
            // Drone / Cruiser
            const isCruiser = enemy.type === 'cruiser';
            const eColor = isCruiser ? '#a855f7' : '#f43f5e';

            ctx.shadowColor = eColor;
            ctx.shadowBlur = 12;

            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            ctx.moveTo(0, 16);
            ctx.lineTo(-18, -14);
            ctx.lineTo(0, -6);
            ctx.lineTo(18, -14);
            ctx.closePath();
            ctx.fill();

            ctx.strokeStyle = eColor;
            ctx.lineWidth = 2.5;
            ctx.stroke();

            ctx.fillStyle = eColor;
            ctx.beginPath();
            ctx.arc(0, -2, 5, 0, Math.PI * 2);
            ctx.fill();
          }

          ctx.restore();
        }

        // Draw Player Starfighter
        const p = gameData.player;
        if (p && p.lives > 0) {
          ctx.save();
          ctx.translate(p.x, p.y);

          // Shield Bubble
          if (p.powerup === 'shield') {
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 3;
            ctx.shadowColor = '#10b981';
            ctx.shadowBlur = 16;
            ctx.beginPath();
            ctx.arc(0, 0, 32, 0, Math.PI * 2);
            ctx.stroke();
          }

          // Invulnerable Flicker
          if (p.invulnerableTimer > 0 && Math.sin(time * 0.04) > 0) {
            ctx.globalAlpha = 0.4;
          }

          // Ship Chassis
          ctx.shadowColor = '#00e5ff';
          ctx.shadowBlur = 16;

          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.moveTo(0, -26);
          ctx.lineTo(-24, 18);
          ctx.lineTo(0, 8);
          ctx.lineTo(24, 18);
          ctx.closePath();
          ctx.fill();

          ctx.strokeStyle = '#00e5ff';
          ctx.lineWidth = 2.5;
          ctx.stroke();

          // Thruster Jet Exhaust
          ctx.fillStyle = '#ffe600';
          ctx.beginPath();
          ctx.moveTo(-8, 12);
          ctx.lineTo(0, 24 + Math.random() * 8);
          ctx.lineTo(8, 12);
          ctx.closePath();
          ctx.fill();

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

      ctx.restore();

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  const gameData = room.gameData;
  const p = gameData?.player;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', userSelect: 'none' }}>
      {/* Top HUD */}
      <div style={{ display: 'flex', gap: 20, marginBottom: 12, alignItems: 'center' }}>
        <div style={{ background: '#0f172a', padding: '6px 16px', borderRadius: 20, border: '1px solid #1e293b' }}>
          <span style={{ color: '#94a3b8', fontSize: 12 }}>SCORE: </span>
          <span style={{ color: '#00e5ff', fontWeight: 800, fontSize: 16 }}>{p?.score || 0}</span>
        </div>
        <div style={{ background: '#0f172a', padding: '6px 16px', borderRadius: 20, border: '1px solid #1e293b' }}>
          <span style={{ color: '#94a3b8', fontSize: 12 }}>WAVE: </span>
          <span style={{ color: '#ffe600', fontWeight: 800, fontSize: 16 }}>{gameData?.wave || 1}</span>
        </div>
        <div style={{ background: '#0f172a', padding: '6px 16px', borderRadius: 20, border: '1px solid #1e293b' }}>
          <span style={{ color: '#94a3b8', fontSize: 12 }}>SHIPS: </span>
          <span style={{ color: '#ef4444', fontWeight: 800, fontSize: 16 }}>
            {'🚀'.repeat(Math.max(0, p?.lives || 0))}
          </span>
        </div>
        {p?.powerup !== 'none' && (
          <div style={{ background: '#0f172a', padding: '6px 16px', borderRadius: 20, border: '1px solid #10b981' }}>
            <span style={{ color: '#10b981', fontWeight: 800, fontSize: 13 }}>
              {p?.powerup?.toUpperCase()} ACTIVE ({Math.ceil(p?.powerupTimer || 0)}s)
            </span>
          </div>
        )}
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
            background: '#050711',
            display: 'block',
            cursor: 'crosshair'
          }}
        />
      </div>

      {/* Controls Bar */}
      <div style={{ marginTop: 12, display: 'flex', gap: 14, alignItems: 'center', background: '#0f172a', padding: '10px 18px', borderRadius: 8, border: '1px solid #1e293b' }}>
        <span style={{ fontSize: 13, color: '#00e5ff', fontWeight: 'bold' }}>🎮 Controls:</span>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>
          <strong>Move Mouse or A/D</strong> to steer interceptor • <strong>Auto-Fire & Spacebar/Click</strong> for plasma lasers • Catch drops for <strong>Triple Cannons</strong>, <strong>Rapid Fire</strong> & <strong>Shields</strong>!
        </span>
      </div>
    </div>
  );
};
