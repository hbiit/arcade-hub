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

export const BlobBrawlCanvas: React.FC<{ socket: Socket; room: RoomState<any> }> = ({ socket, room }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const screenShakeRef = useRef<number>(0);
  const processedEventsRef = useRef<Set<string>>(new Set());
  const [dashAvailable, setDashAvailable] = useState<boolean>(true);
  const roomRef = useRef<RoomState<any>>(room);

  // Pointer drag steering
  const isPointerDownRef = useRef<boolean>(false);
  const pointerPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    roomRef.current = room;
  }, [room]);

  // Keyboard controls & Continuous Input Loop
  useEffect(() => {
    const keys: Record<string, boolean> = {};

    const emitInput = (dash = false) => {
      let dx = (keys['ArrowRight'] || keys['KeyD'] ? 1 : 0) - (keys['ArrowLeft'] || keys['KeyA'] ? 1 : 0);
      let dy = (keys['ArrowDown'] || keys['KeyS'] ? 1 : 0) - (keys['ArrowUp'] || keys['KeyW'] ? 1 : 0);

      // If pointer is held down, steer towards pointer
      if (isPointerDownRef.current && pointerPosRef.current && canvasRef.current) {
        const myId = socket.id || 'local_player';
        const myPlayer = (myId ? roomRef.current.gameData?.players?.[myId] : undefined) || Object.values<any>(roomRef.current.gameData?.players || {})[0];
        if (myPlayer) {
          const toX = pointerPosRef.current.x - myPlayer.x;
          const toY = pointerPosRef.current.y - myPlayer.y;
          const dist = Math.hypot(toX, toY);
          if (dist > 16) {
            dx = toX / dist;
            dy = toY / dist;
          } else {
            dx = 0;
            dy = 0;
          }
        }
      }

      socket.emit(SOCKET_EVENTS.GAME_INPUT, {
        roomCode: room.roomCode,
        input: { dx, dy, dash }
      });

      if (dash) {
        SoundFX.playDash();
        setDashAvailable(false);
        setTimeout(() => setDashAvailable(true), 2000);
      }
    };

    const interval = setInterval(() => {
      emitInput(false);
    }, 50);

    const onKeyDown = (e: KeyboardEvent) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      keys[e.code] = true;
      if (e.code === 'Space') {
        emitInput(true);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keys[e.code] = false;
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      clearInterval(interval);
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
        color: evt.color || '#ffe600',
        alpha: 1.0,
        vy: -2.0
      });

      if (evt.type === 'coin') {
        SoundFX.playCoin();
        for (let i = 0; i < 6; i++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = Math.random() * 80 + 30;
          particlesRef.current.push({
            x: evt.x,
            y: evt.y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            size: Math.random() * 4 + 2,
            color: '#ffe600',
            alpha: 1.0,
            life: 0,
            maxLife: 0.4
          });
        }
      } else if (evt.type === 'combo') {
        SoundFX.playPowerup();
        screenShakeRef.current = Math.max(screenShakeRef.current, 8);
        for (let i = 0; i < 18; i++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = Math.random() * 160 + 50;
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
      } else if (evt.type === 'bump') {
        SoundFX.playBump();
        screenShakeRef.current = Math.max(screenShakeRef.current, 8);
        for (let i = 0; i < 14; i++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = Math.random() * 140 + 40;
          particlesRef.current.push({
            x: evt.x,
            y: evt.y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            size: Math.random() * 5 + 3,
            color: '#f59e0b',
            alpha: 1.0,
            life: 0,
            maxLife: 0.45
          });
        }
      } else if (evt.type === 'knockout') {
        SoundFX.playKnockout();
        screenShakeRef.current = 15;
        for (let i = 0; i < 30; i++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = Math.random() * 200 + 60;
          particlesRef.current.push({
            x: evt.x,
            y: evt.y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            size: Math.random() * 8 + 3,
            color: '#ef4444',
            alpha: 1.0,
            life: 0,
            maxLife: 0.7
          });
        }
      } else if (evt.type === 'powerup') {
        SoundFX.playPowerup();
        screenShakeRef.current = Math.max(screenShakeRef.current, 6);
        for (let i = 0; i < 16; i++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = Math.random() * 120 + 40;
          particlesRef.current.push({
            x: evt.x,
            y: evt.y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            size: Math.random() * 5 + 3,
            color: evt.color || '#00e5ff',
            alpha: 1.0,
            life: 0,
            maxLife: 0.5
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

      // Rich Cyber Arena Backdrop
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, width, height);

      // Grid Lines
      ctx.strokeStyle = '#1e293b44';
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

      // Glowing Arena Border
      ctx.strokeStyle = '#00e5ff55';
      ctx.lineWidth = 3;
      ctx.strokeRect(6, 6, width - 12, height - 12);

      const gameData = roomRef.current.gameData;
      if (gameData) {
        // Draw Powerups
        for (const pwr of gameData.powerups || []) {
          const pColor = pwr.type === 'speed' ? '#00e5ff' : pwr.type === 'magnet' ? '#f59e0b' : '#10b981';
          const pSymbol = pwr.type === 'speed' ? '⚡' : pwr.type === 'magnet' ? '🧲' : '🛡️';
          const pulse = Math.sin(time * 0.008 + pwr.id) * 3;

          ctx.save();
          ctx.translate(pwr.x, pwr.y);

          const glowGrad = ctx.createRadialGradient(0, 0, 2, 0, 0, 22 + pulse);
          glowGrad.addColorStop(0, pColor);
          glowGrad.addColorStop(0.6, `${pColor}55`);
          glowGrad.addColorStop(1, `${pColor}00`);
          ctx.fillStyle = glowGrad;
          ctx.beginPath();
          ctx.arc(0, 0, 22 + pulse, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(0, 0, 16, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = pColor;
          ctx.lineWidth = 2.5;
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = '14px system-ui';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(pSymbol, 0, 0);
          ctx.restore();
        }

        // Draw Golden Mega-Coin if active
        if (gameData.megaCoin) {
          const mc = gameData.megaCoin;
          const starPulse = Math.sin(time * 0.01) * 4;
          ctx.save();
          ctx.translate(mc.x, mc.y);

          const starGlow = ctx.createRadialGradient(0, 0, 4, 0, 0, 32 + starPulse);
          starGlow.addColorStop(0, '#ffe600');
          starGlow.addColorStop(0.5, 'rgba(255, 230, 0, 0.5)');
          starGlow.addColorStop(1, 'rgba(255, 230, 0, 0)');
          ctx.fillStyle = starGlow;
          ctx.beginPath();
          ctx.arc(0, 0, 32 + starPulse, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#ffe600';
          ctx.font = 'bold 24px Orbitron, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⭐', 0, 0);

          ctx.font = 'bold 11px Orbitron, sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.fillText('+3 COINS', 0, 24);
          ctx.restore();
        }

        // Draw Standard Coins
        for (const coin of gameData.coins || []) {
          const pulse = Math.sin(time * 0.006 + coin.id) * 1.5;
          ctx.save();
          ctx.translate(coin.x, coin.y);

          const coinGlow = ctx.createRadialGradient(0, 0, 2, 0, 0, 14 + pulse);
          coinGlow.addColorStop(0, '#ffe60088');
          coinGlow.addColorStop(1, '#ffe60000');
          ctx.fillStyle = coinGlow;
          ctx.beginPath();
          ctx.arc(0, 0, 14 + pulse, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#ffe600';
          ctx.beginPath();
          ctx.arc(0, 0, 10, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#d97706';
          ctx.beginPath();
          ctx.arc(0, 0, 8, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 9px Orbitron, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('$', 0, 0);

          ctx.restore();
        }

        // Draw Players with Squash & Stretch Wobble
        const players = gameData.players || {};
        for (const [id, p] of Object.entries<any>(players)) {
          ctx.save();
          ctx.translate(p.x, p.y);

          if (p.isKnockedOut) {
            ctx.globalAlpha = 0.35;
            ctx.font = 'bold 14px system-ui';
            ctx.fillStyle = '#ef4444';
            ctx.textAlign = 'center';
            ctx.fillText('KO (Respawning...)', 0, -28);
          }

          const spd = Math.hypot(p.vx, p.vy);
          const moveAngle = Math.atan2(p.vy, p.vx) || 0;
          ctx.rotate(moveAngle);

          // Squash & stretch based on velocity
          const stretch = Math.min(1.35, 1 + spd * 0.0006);
          const squash = 1 / stretch;
          ctx.scale(stretch, squash);

          // Active Shield Bubble
          if (p.activePowerup === 'shield') {
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, 28, 0, Math.PI * 2);
            ctx.stroke();
          }

          // Active Magnet Ring
          if (p.activePowerup === 'magnet') {
            ctx.strokeStyle = '#f59e0b88';
            ctx.lineWidth = 2;
            ctx.setLineDash([4, 4]);
            ctx.beginPath();
            ctx.arc(0, 0, 32, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          // Blob Aura Glow
          const auraGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, 26);
          auraGrad.addColorStop(0, `${p.color}88`);
          auraGrad.addColorStop(1, `${p.color}00`);
          ctx.fillStyle = auraGrad;
          ctx.beginPath();
          ctx.arc(0, 0, 26, 0, Math.PI * 2);
          ctx.fill();

          // Blob Body (Scales slightly with carried coins)
          const radius = Math.min(26, 18 + p.coinsCarried * 0.3);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(0, 0, radius, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.5;
          ctx.stroke();

          // Googly Expressive Eyes
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(6, -5, 5, 0, Math.PI * 2);
          ctx.arc(6, 5, 5, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#000000';
          ctx.beginPath();
          ctx.arc(8, -5, 2.5, 0, Math.PI * 2);
          ctx.arc(8, 5, 2.5, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();

          // Player Name & Coin Count
          ctx.save();
          ctx.font = 'bold 12px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#000000';
          ctx.fillText(`${p.name} (${p.coinsCarried}🪙)`, p.x + 1, p.y - 25);
          ctx.fillStyle = p.color;
          ctx.fillText(`${p.name} (${p.coinsCarried}🪙)`, p.x, p.y - 26);
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
        ctx.fillStyle = '#000000';
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

  // Pointer drag steering (mouse or touch directly on canvas)
  const getCanvasCoords = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const handlePointerDown = (e: any) => {
    isPointerDownRef.current = true;
    const coords = getCanvasCoords(e);
    if (coords) pointerPosRef.current = coords;
  };

  const handlePointerMove = (e: any) => {
    if (isPointerDownRef.current) {
      const coords = getCanvasCoords(e);
      if (coords) pointerPosRef.current = coords;
    }
  };

  const handlePointerUp = () => {
    isPointerDownRef.current = false;
    pointerPosRef.current = null;
  };

  const handleDashClick = () => {
    if (!dashAvailable) return;
    socket.emit(SOCKET_EVENTS.GAME_INPUT, {
      roomCode: room.roomCode,
      input: { dash: true }
    });
    SoundFX.playDash();
    setDashAvailable(false);
    setTimeout(() => setDashAvailable(true), 2000);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', userSelect: 'none' }}>
      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={800}
          height={600}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
          style={{
            maxWidth: '100%',
            height: 'auto',
            border: '2px solid #00e5ff',
            borderRadius: 12,
            boxShadow: '0 0 30px rgba(0, 229, 255, 0.28)',
            background: '#090d16',
            display: 'block',
            cursor: 'crosshair'
          }}
        />

        {/* Dash Button Overlay */}
        <div style={{ position: 'absolute', bottom: 16, right: 16 }}>
          <button
            onClick={handleDashClick}
            disabled={!dashAvailable}
            style={{
              padding: '12px 22px',
              background: dashAvailable ? 'linear-gradient(135deg, #00e5ff, #3b82f6)' : '#334155',
              color: dashAvailable ? '#000000' : '#94a3b8',
              border: 'none',
              borderRadius: 30,
              fontWeight: 800,
              fontSize: 14,
              cursor: dashAvailable ? 'pointer' : 'not-allowed',
              boxShadow: dashAvailable ? '0 0 18px rgba(0, 229, 255, 0.7)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            ⚡ {dashAvailable ? 'SUPER DASH [Space]' : 'RECHARGING...'}
          </button>
        </div>
      </div>

      {/* Controls & Tip Bar */}
      <div style={{ marginTop: 12, display: 'flex', gap: 14, alignItems: 'center', background: '#0f172a', padding: '10px 18px', borderRadius: 8, border: '1px solid #1e293b' }}>
        <span style={{ fontSize: 13, color: '#00e5ff', fontWeight: 'bold' }}>🎮 Pro Controls:</span>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>
          <strong>Drag Mouse or WASD</strong> to steer • <strong>Spacebar</strong> to Dash • Gather coins quickly for <strong>Combo Streaks</strong> • Brawl over the center <strong>Mega-Star ⭐</strong>!
        </span>
      </div>
    </div>
  );
};
