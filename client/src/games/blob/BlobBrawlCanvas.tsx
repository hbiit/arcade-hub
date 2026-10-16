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
        setTimeout(() => setDashAvailable(true), 2200);
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

      // Keep set size manageable
      if (processedEventsRef.current.size > 200) {
        processedEventsRef.current.clear();
      }

      // Trigger Floating Text
      floatingTextsRef.current.push({
        id: evt.id,
        x: evt.x,
        y: evt.y - 10,
        text: evt.text,
        color: evt.color || '#ffe600',
        alpha: 1.0,
        vy: -1.6
      });

      if (evt.type === 'coin') {
        SoundFX.playCoin();
        // Golden sparkle particles
        for (let i = 0; i < 7; i++) {
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
      } else if (evt.type === 'bump') {
        SoundFX.playBump();
        screenShakeRef.current = Math.max(screenShakeRef.current, 6);
        // Bump spark burst
        for (let i = 0; i < 10; i++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = Math.random() * 120 + 40;
          particlesRef.current.push({
            x: evt.x,
            y: evt.y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            size: Math.random() * 5 + 3,
            color: evt.color || '#f97316',
            alpha: 1.0,
            life: 0,
            maxLife: 0.45
          });
        }
      } else if (evt.type === 'knockout') {
        SoundFX.playKnockout();
        screenShakeRef.current = 14;
        // Giant Star Explosion
        for (let i = 0; i < 26; i++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = Math.random() * 180 + 60;
          particlesRef.current.push({
            x: evt.x,
            y: evt.y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            size: Math.random() * 8 + 4,
            color: ['#ef4444', '#f59e0b', '#ffe600', '#ec4899'][i % 4],
            alpha: 1.0,
            life: 0,
            maxLife: 0.8
          });
        }
      } else if (evt.type === 'powerup') {
        SoundFX.playPowerup();
        screenShakeRef.current = 4;
        for (let i = 0; i < 14; i++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = Math.random() * 100 + 40;
          particlesRef.current.push({
            x: evt.x,
            y: evt.y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            size: Math.random() * 5 + 3,
            color: evt.color || '#00e5ff',
            alpha: 1.0,
            life: 0,
            maxLife: 0.6
          });
        }
      }
    }
  }, [room.gameData?.events]);

  // 60 FPS Canvas Game Loop
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

      // Handle Screen Shake
      ctx.save();
      if (screenShakeRef.current > 0) {
        const shakeX = (Math.random() - 0.5) * screenShakeRef.current * 1.8;
        const shakeY = (Math.random() - 0.5) * screenShakeRef.current * 1.8;
        ctx.translate(shakeX, shakeY);
        screenShakeRef.current = Math.max(0, screenShakeRef.current - dt * 20);
      }

      // Draw Sci-Fi Cyber Grid Arena Background
      ctx.fillStyle = '#080c16';
      ctx.fillRect(0, 0, width, height);

      // Arena Grid Lines
      ctx.strokeStyle = '#121b2d';
      ctx.lineWidth = 1;
      const gridSize = 40;
      for (let x = 0; x < width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Arena Outer Neon Border
      ctx.strokeStyle = '#00e5ff33';
      ctx.lineWidth = 4;
      ctx.strokeRect(4, 4, width - 8, height - 8);

      const gameData = room.gameData;
      if (gameData) {
        // Draw Power-ups
        for (const pwr of gameData.powerups || []) {
          const pulse = Math.sin(time * 0.006) * 3;
          ctx.save();
          ctx.translate(pwr.x, pwr.y);

          // Glow halo
          const glowGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, 22 + pulse);
          const pwrColor = pwr.type === 'speed' ? '#00e5ff' : pwr.type === 'magnet' ? '#f59e0b' : '#10b981';
          glowGrad.addColorStop(0, pwrColor + 'aa');
          glowGrad.addColorStop(1, pwrColor + '00');
          ctx.fillStyle = glowGrad;
          ctx.beginPath();
          ctx.arc(0, 0, 24 + pulse, 0, Math.PI * 2);
          ctx.fill();

          // Hexagonal / Rounded Box
          ctx.fillStyle = '#0f172a';
          ctx.strokeStyle = pwrColor;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, 15, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();

          // Icon
          ctx.font = '14px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          const icon = pwr.type === 'speed' ? '⚡' : pwr.type === 'magnet' ? '🧲' : '🛡️';
          ctx.fillText(icon, 0, 1);
          ctx.restore();
        }

        // Draw Golden Coins with Spin Animation
        for (const coin of gameData.coins || []) {
          const wobble = Math.abs(Math.sin(time * 0.005 + coin.id)) * 0.4 + 0.6;
          ctx.save();
          ctx.translate(coin.x, coin.y);

          // Golden ambient glow
          ctx.fillStyle = '#ffe60022';
          ctx.beginPath();
          ctx.arc(0, 0, 14, 0, Math.PI * 2);
          ctx.fill();

          // Coin ellipse for 3D spin feel
          ctx.beginPath();
          ctx.ellipse(0, 0, 9 * wobble, 9, 0, 0, Math.PI * 2);
          const coinGrad = ctx.createLinearGradient(-9, -9, 9, 9);
          coinGrad.addColorStop(0, '#fff566');
          coinGrad.addColorStop(0.5, '#ffd700');
          coinGrad.addColorStop(1, '#d97706');
          ctx.fillStyle = coinGrad;
          ctx.fill();
          ctx.strokeStyle = '#b45309';
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Centered symbol
          if (wobble > 0.4) {
            ctx.fillStyle = '#78350f';
            ctx.font = 'bold 8px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('$', 0, 0);
          }
          ctx.restore();
        }

        // Find Current 1st Place Leader for Crown
        const playersList = Object.values<any>(gameData.players || {});
        let leader: any = null;
        let maxCoins = -1;
        for (const p of playersList) {
          if (p.coinsCarried > maxCoins && p.coinsCarried > 0) {
            maxCoins = p.coinsCarried;
            leader = p;
          }
        }

        // Draw Blobs (Jelly Physics + Googly Eyes + Effects)
        for (const p of playersList) {
          ctx.save();
          ctx.translate(p.x, p.y);

          // Calculate movement velocity & squash angle
          const speed = Math.hypot(p.vx, p.vy);
          const moveAngle = speed > 5 ? Math.atan2(p.vy, p.vx) : 0;
          const squash = Math.min(0.25, speed / 800); // dynamic squish factor

          // Dash trail / Speed Boost flames
          if ((p.dashTimer || 0) > 0 || p.activePowerup === 'speed') {
            const trailAngle = moveAngle + Math.PI;
            ctx.save();
            ctx.rotate(trailAngle);
            ctx.fillStyle = p.activePowerup === 'speed' ? '#00e5ff66' : p.color + '66';
            ctx.beginPath();
            ctx.moveTo(0, -10);
            ctx.lineTo(24, 0);
            ctx.lineTo(0, 10);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }

          // Active Powerup Auras
          if (p.activePowerup === 'shield') {
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, 26, 0, Math.PI * 2);
            ctx.stroke();
          } else if (p.activePowerup === 'magnet') {
            ctx.strokeStyle = '#f59e0b88';
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(0, 0, 28, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          // Jelly Blob Body (Squash & Stretch)
          ctx.rotate(moveAngle);
          ctx.scale(1 + squash, 1 - squash);

          // Radial Gradient 3D Shading
          const baseColor = p.isKnockedOut ? '#475569' : p.color || '#3b82f6';
          const blobGrad = ctx.createRadialGradient(-5, -6, 2, 0, 0, 20);
          blobGrad.addColorStop(0, '#ffffff88');
          blobGrad.addColorStop(0.3, baseColor);
          blobGrad.addColorStop(1, '#090d16');

          ctx.beginPath();
          ctx.arc(0, 0, 19, 0, Math.PI * 2);
          ctx.fillStyle = blobGrad;
          ctx.fill();
          ctx.strokeStyle = p.isKnockedOut ? '#334155' : '#ffffffcc';
          ctx.lineWidth = 2;
          ctx.stroke();

          // Reset squish scale for eyes
          ctx.scale(1 / (1 + squash), 1 / (1 - squash));

          // Draw Eyes
          if (p.isKnockedOut) {
            // Dizzy X X Eyes
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            [-6, 6].forEach(eyeX => {
              ctx.beginPath();
              ctx.moveTo(eyeX - 3, -4);
              ctx.lineTo(eyeX + 3, 2);
              ctx.moveTo(eyeX + 3, -4);
              ctx.lineTo(eyeX - 3, 2);
              ctx.stroke();
            });
          } else {
            // Animated Googly Eyes tracking movement
            const pupilOffsetX = Math.cos(0) * 2;
            const pupilOffsetY = Math.sin(0) * 2;

            [-6, 6].forEach(eyeX => {
              // White eyeball
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              ctx.arc(eyeX, -3, 5, 0, Math.PI * 2);
              ctx.fill();

              // Black pupil looking forward
              ctx.fillStyle = '#0f172a';
              ctx.beginPath();
              ctx.arc(eyeX + pupilOffsetX, -3 + pupilOffsetY, 2.5, 0, Math.PI * 2);
              ctx.fill();

              // Shiny eye highlight
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              ctx.arc(eyeX + pupilOffsetX - 1, -3 + pupilOffsetY - 1, 1, 0, Math.PI * 2);
              ctx.fill();
            });
          }

          ctx.restore(); // restore blob rotation

          // Overhead Elements (Rendered upright without rotation)
          ctx.save();
          ctx.translate(p.x, p.y);

          // 👑 1st Place Crown
          if (leader && leader.name === p.name && !p.isKnockedOut) {
            ctx.font = '16px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('👑', 0, -36);
          }

          // Nametag & Coins Badge
          ctx.font = 'bold 11px system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(-45, -26, 90, 16);
          ctx.strokeStyle = p.color || '#3b82f6';
          ctx.lineWidth = 1;
          ctx.strokeRect(-45, -26, 90, 16);

          ctx.fillStyle = '#ffffff';
          ctx.fillText(`${p.name.slice(0, 9)} 🪙${p.coinsCarried}`, 0, -14);

          // Knockout warning dots (1 or 2 bumps)
          if (!p.isKnockedOut && p.bumpsReceived > 0) {
            for (let b = 0; b < 2; b++) {
              ctx.fillStyle = b < p.bumpsReceived ? '#ef4444' : '#334155';
              ctx.beginPath();
              ctx.arc(-8 + b * 16, 26, 3.5, 0, Math.PI * 2);
              ctx.fill();
            }
          }

          // Dizzy stars when knocked out
          if (p.isKnockedOut) {
            const spin = time * 0.008;
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('💫', Math.cos(spin) * 16, -34 + Math.sin(spin) * 4);
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

      // Update & Render Floating Combat Texts
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
        ctx.fillStyle = '#000000';
        ctx.fillText(ft.text, ft.x + 1, ft.y + 1); // drop shadow
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

  // Touch / Mobile virtual directional control
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
    setTimeout(() => setDashAvailable(true), 2200);
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
            background: '#090d16',
            display: 'block'
          }}
        />

        {/* Dash Cooldown Indicator Overlay */}
        <div
          style={{
            position: 'absolute',
            bottom: 16,
            right: 16,
            display: 'flex',
            gap: 8,
            alignItems: 'center'
          }}
        >
          <button
            onClick={handleDashClick}
            disabled={!dashAvailable}
            style={{
              padding: '12px 20px',
              background: dashAvailable ? 'linear-gradient(135deg, #00e5ff, #3b82f6)' : '#334155',
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
            ⚡ {dashAvailable ? 'DASH (Space)' : 'COOLING DOWN...'}
          </button>
        </div>
      </div>

      {/* Touch D-Pad for Mobile or Quick Click */}
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
          💡 Controls: <strong>WASD / Arrow Keys</strong> to move • <strong>Spacebar</strong> to Dash • Bump opponents to steal coins!
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
