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

interface TrailPoint {
  x: number;
  y: number;
  alpha: number;
}

export const GlowballCanvas: React.FC<{ socket: Socket; room: RoomState<any> }> = ({ socket, room }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const trailsRef = useRef<Map<string, TrailPoint[]>>(new Map());
  const screenShakeRef = useRef<number>(0);
  const processedEventsRef = useRef<Set<string>>(new Set());
  const [dashAvailable, setDashAvailable] = useState<boolean>(true);

  // Keyboard controls
  useEffect(() => {
    const keys: Record<string, boolean> = {};

    const emitInput = (dash = false) => {
      const dx = (keys['ArrowRight'] || keys['KeyD'] ? 1 : 0) - (keys['ArrowLeft'] || keys['KeyA'] ? 1 : 0);
      const dy = (keys['ArrowDown'] || keys['KeyS'] ? 1 : 0) - (keys['ArrowUp'] || keys['KeyW'] ? 1 : 0);
      socket.emit(SOCKET_EVENTS.GAME_INPUT, {
        roomCode: room.roomCode,
        input: { dx, dy, dash }
      });
      if (dash) {
        SoundFX.playDash();
        setDashAvailable(false);
        setTimeout(() => setDashAvailable(true), 2500);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      keys[e.code] = true;
      if (e.code === 'Space') {
        emitInput(true);
      } else {
        emitInput(false);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
      emitInput(false);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [socket, room.roomCode]);

  // Handle incoming server events for sound, screen shake, and visual particles
  useEffect(() => {
    const events = room.gameData?.events || [];
    for (const evt of events) {
      if (processedEventsRef.current.has(evt.id)) continue;
      processedEventsRef.current.add(evt.id);

      if (processedEventsRef.current.size > 200) {
        processedEventsRef.current.clear();
      }

      floatingTextsRef.current.push({
        id: evt.id,
        x: evt.x,
        y: evt.y - 12,
        text: evt.text,
        color: evt.color || '#00e5ff',
        alpha: 1.0,
        vy: -1.8
      });

      if (evt.type === 'orb') {
        SoundFX.playCoin();
        for (let i = 0; i < 6; i++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = Math.random() * 90 + 30;
          particlesRef.current.push({
            x: evt.x,
            y: evt.y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            size: Math.random() * 4 + 2,
            color: '#00e5ff',
            alpha: 1.0,
            life: 0,
            maxLife: 0.4
          });
        }
      } else if (evt.type === 'super_orb') {
        SoundFX.playPowerup();
        screenShakeRef.current = Math.max(screenShakeRef.current, 6);
        for (let i = 0; i < 16; i++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = Math.random() * 140 + 40;
          particlesRef.current.push({
            x: evt.x,
            y: evt.y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            size: Math.random() * 6 + 3,
            color: '#ffe600',
            alpha: 1.0,
            life: 0,
            maxLife: 0.6
          });
        }
      } else if (evt.type === 'steal') {
        SoundFX.playBump();
        screenShakeRef.current = 10;
        for (let i = 0; i < 18; i++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = Math.random() * 160 + 50;
          particlesRef.current.push({
            x: evt.x,
            y: evt.y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            size: Math.random() * 6 + 3,
            color: '#f59e0b',
            alpha: 1.0,
            life: 0,
            maxLife: 0.5
          });
        }
      } else if (evt.type === 'hazard') {
        SoundFX.playKnockout();
        screenShakeRef.current = 12;
        for (let i = 0; i < 20; i++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = Math.random() * 150 + 40;
          particlesRef.current.push({
            x: evt.x,
            y: evt.y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            size: Math.random() * 6 + 2,
            color: '#ef4444',
            alpha: 1.0,
            life: 0,
            maxLife: 0.6
          });
        }
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

      // Deep Neon Cyberpunk Backdrop
      ctx.fillStyle = '#060913';
      ctx.fillRect(0, 0, width, height);

      // Perspective Grid Lines
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

      // Outer Glowing Arena Border
      ctx.strokeStyle = '#00e5ff44';
      ctx.lineWidth = 3;
      ctx.strokeRect(6, 6, width - 12, height - 12);

      const gameData = room.gameData;
      if (gameData) {
        // Draw EMP Hazards
        for (const h of gameData.hazards || []) {
          const pulse = Math.sin(time * 0.008 + h.id) * 3;
          ctx.save();
          ctx.translate(h.x, h.y);

          // Danger Warning Radius
          const glowGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, h.radius + 14 + pulse);
          glowGrad.addColorStop(0, '#ef444455');
          glowGrad.addColorStop(1, '#ef444400');
          ctx.fillStyle = glowGrad;
          ctx.beginPath();
          ctx.arc(0, 0, h.radius + 14 + pulse, 0, Math.PI * 2);
          ctx.fill();

          // Vortex Core
          ctx.fillStyle = '#7f1d1d';
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, h.radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Hazard symbol
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⚠️', 0, 1);
          ctx.restore();
        }

        // Draw Energy Orbs
        for (const orb of gameData.orbs || []) {
          const isSuper = orb.type === 'super';
          const pulse = Math.sin(time * 0.006 + orb.id) * 2;
          const orbColor = isSuper ? '#ffe600' : '#00e5ff';

          ctx.save();
          ctx.translate(orb.x, orb.y);

          // Radiant aura
          const auraGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, (isSuper ? 18 : 12) + pulse);
          auraGrad.addColorStop(0, orbColor + 'cc');
          auraGrad.addColorStop(1, orbColor + '00');
          ctx.fillStyle = auraGrad;
          ctx.beginPath();
          ctx.arc(0, 0, (isSuper ? 18 : 12) + pulse, 0, Math.PI * 2);
          ctx.fill();

          // Core Sphere
          ctx.fillStyle = isSuper ? '#fffbeb' : '#e0f2fe';
          ctx.strokeStyle = orbColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, isSuper ? 10 : 6, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          ctx.restore();
        }

        // Identify leader for 👑
        const playersList = Object.values<any>(gameData.players || {});
        let leader: any = null;
        let maxScore = -1;
        for (const p of playersList) {
          if (p.score > maxScore && p.score > 0) {
            maxScore = p.score;
            leader = p;
          }
        }

        // Update & Draw Neon Ribbon Trails
        for (const p of playersList) {
          if (!trailsRef.current.has(p.name)) {
            trailsRef.current.set(p.name, []);
          }
          const trail = trailsRef.current.get(p.name)!;
          trail.push({ x: p.x, y: p.y, alpha: 1.0 });
          if (trail.length > 14) trail.shift();

          // Render Trail
          ctx.save();
          for (let t = 0; t < trail.length - 1; t++) {
            const pt1 = trail[t];
            const pt2 = trail[t + 1];
            const progress = t / trail.length;
            ctx.strokeStyle = p.color || '#00e5ff';
            ctx.globalAlpha = progress * 0.55;
            ctx.lineWidth = progress * (p.dashTimer > 0 ? 12 : 7);
            ctx.beginPath();
            ctx.moveTo(pt1.x, pt1.y);
            ctx.lineTo(pt2.x, pt2.y);
            ctx.stroke();
          }
          ctx.restore();
        }

        // Draw Glowball Racers
        for (const p of playersList) {
          const isDashing = (p.dashTimer || 0) > 0;
          const isStunned = (p.stunTimer || 0) > 0;

          ctx.save();
          ctx.translate(p.x, p.y);

          // Glow Halo
          const glowGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, isDashing ? 32 : 22);
          glowGrad.addColorStop(0, (isStunned ? '#ef4444' : p.color || '#00e5ff') + 'aa');
          glowGrad.addColorStop(1, (isStunned ? '#ef4444' : p.color || '#00e5ff') + '00');
          ctx.fillStyle = glowGrad;
          ctx.beginPath();
          ctx.arc(0, 0, isDashing ? 32 : 22, 0, Math.PI * 2);
          ctx.fill();

          // Main Orb Sphere
          ctx.beginPath();
          ctx.arc(0, 0, 16, 0, Math.PI * 2);
          const orbGrad = ctx.createRadialGradient(-4, -4, 2, 0, 0, 16);
          orbGrad.addColorStop(0, '#ffffff');
          orbGrad.addColorStop(0.4, isStunned ? '#dc2626' : p.color || '#00e5ff');
          orbGrad.addColorStop(1, '#090d16');
          ctx.fillStyle = orbGrad;
          ctx.fill();
          ctx.strokeStyle = isDashing ? '#ffffff' : (p.color || '#00e5ff');
          ctx.lineWidth = isDashing ? 3 : 2;
          ctx.stroke();

          // Overhead Nametag & Leader Crown
          if (leader && leader.name === p.name) {
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('👑', 0, -32);
          }

          ctx.font = 'bold 11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(-45, -24, 90, 16);
          ctx.strokeStyle = p.color || '#00e5ff';
          ctx.lineWidth = 1;
          ctx.strokeRect(-45, -24, 90, 16);

          ctx.fillStyle = '#ffffff';
          ctx.fillText(`${p.name.slice(0, 9)}: ${p.score}`, 0, -12);

          if (isStunned) {
            ctx.font = '13px sans-serif';
            ctx.fillText('⚡ SHOCKED!', 0, 30);
          }

          ctx.restore();
        }
      }

      // Update & Render Particles
      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const pt = particlesRef.current[i];
        pt.life += dt;
        if (pt.life >= pt.maxLife) {
          particlesRef.current.splice(i, 1);
          continue;
        }
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.alpha = 1 - pt.life / pt.maxLife;

        ctx.save();
        ctx.globalAlpha = Math.max(0, pt.alpha);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // Floating Combat Texts
      for (let i = floatingTextsRef.current.length - 1; i >= 0; i--) {
        const ft = floatingTextsRef.current[i];
        ft.y += ft.vy;
        ft.alpha -= dt * 1.3;
        if (ft.alpha <= 0) {
          floatingTextsRef.current.splice(i, 1);
          continue;
        }
        ctx.save();
        ctx.globalAlpha = Math.max(0, ft.alpha);
        ctx.font = 'bold 13px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#000';
        ctx.fillText(ft.text, ft.x + 1, ft.y + 1);
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      }

      ctx.restore(); // restore screen shake

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [room.gameData]);

  const handleVirtualMove = (dx: number, dy: number) => {
    socket.emit(SOCKET_EVENTS.GAME_INPUT, {
      roomCode: room.roomCode,
      input: { dx, dy }
    });
  };

  const handleDashClick = () => {
    if (!dashAvailable) return;
    socket.emit(SOCKET_EVENTS.GAME_INPUT, {
      roomCode: room.roomCode,
      input: { dash: true }
    });
    SoundFX.playDash();
    setDashAvailable(false);
    setTimeout(() => setDashAvailable(true), 2500);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', userSelect: 'none' }}>
      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={800}
          height={600}
          style={{
            maxWidth: '100%',
            height: 'auto',
            border: '2px solid #00e5ff',
            borderRadius: 12,
            boxShadow: '0 0 25px rgba(0, 229, 255, 0.25)',
            background: '#060913',
            display: 'block'
          }}
        />

        {/* Dash Button */}
        <div style={{ position: 'absolute', bottom: 16, right: 16 }}>
          <button
            onClick={handleDashClick}
            disabled={!dashAvailable}
            style={{
              padding: '12px 20px',
              background: dashAvailable ? 'linear-gradient(135deg, #00e5ff, #8b5cf6)' : '#334155',
              color: dashAvailable ? '#000' : '#94a3b8',
              border: 'none',
              borderRadius: 30,
              fontWeight: 800,
              fontSize: 14,
              cursor: dashAvailable ? 'pointer' : 'not-allowed',
              boxShadow: dashAvailable ? '0 0 16px rgba(0, 229, 255, 0.6)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            ⚡ {dashAvailable ? 'HYPER DASH (Space)' : 'COOLING DOWN...'}
          </button>
        </div>
      </div>

      {/* Touch D-Pad */}
      <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onMouseDown={() => handleVirtualMove(-1, 0)}
          onMouseUp={() => handleVirtualMove(0, 0)}
          onTouchStart={() => handleVirtualMove(-1, 0)}
          onTouchEnd={() => handleVirtualMove(0, 0)}
          style={touchBtnStyle}
        >
          ◀
        </button>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <button
            onMouseDown={() => handleVirtualMove(0, -1)}
            onMouseUp={() => handleVirtualMove(0, 0)}
            onTouchStart={() => handleVirtualMove(0, -1)}
            onTouchEnd={() => handleVirtualMove(0, 0)}
            style={touchBtnStyle}
          >
            ▲
          </button>
          <button
            onMouseDown={() => handleVirtualMove(0, 1)}
            onMouseUp={() => handleVirtualMove(0, 0)}
            onTouchStart={() => handleVirtualMove(0, 1)}
            onTouchEnd={() => handleVirtualMove(0, 0)}
            style={touchBtnStyle}
          >
            ▼
          </button>
        </div>
        <button
          onMouseDown={() => handleVirtualMove(1, 0)}
          onMouseUp={() => handleVirtualMove(0, 0)}
          onTouchStart={() => handleVirtualMove(1, 0)}
          onTouchEnd={() => handleVirtualMove(0, 0)}
          style={touchBtnStyle}
        >
          ▶
        </button>
        <span style={{ fontSize: 13, color: '#94a3b8', marginLeft: 16 }}>
          💡 Controls: <strong>WASD / Arrow Keys</strong> to steer • <strong>Spacebar</strong> to Hyper Dash • Dash through rivals to steal points!
        </span>
      </div>
    </div>
  );
};

const touchBtnStyle: React.CSSProperties = {
  width: 44,
  height: 44,
  background: '#1e293b',
  border: '1px solid #475569',
  color: '#00e5ff',
  borderRadius: 8,
  fontSize: 16,
  fontWeight: 'bold',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center'
};
