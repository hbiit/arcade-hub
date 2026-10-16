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
  color: string;
}

export const GlowballCanvas: React.FC<{ socket: Socket; room: RoomState<any> }> = ({ socket, room }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const trailsRef = useRef<Map<string, TrailPoint[]>>(new Map());
  const puckTrailRef = useRef<TrailPoint[]>([]);
  const screenShakeRef = useRef<number>(0);
  const processedEventsRef = useRef<Set<string>>(new Set());
  const [dashAvailable, setDashAvailable] = useState<boolean>(true);
  const [overdrivePercent, setOverdrivePercent] = useState<number>(0);
  const [isOverdriving, setIsOverdriving] = useState<boolean>(false);
  const roomRef = useRef<RoomState<any>>(room);

  // Pointer tracking for mouse / touch drag steering
  const isPointerDownRef = useRef<boolean>(false);
  const pointerPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    roomRef.current = room;
    const myId = socket.id || 'local_player';
    const myPlayer = (myId ? room.gameData?.players?.[myId] : undefined) || Object.values<any>(room.gameData?.players || {})[0];
    if (myPlayer) {
      setOverdrivePercent(Math.floor(myPlayer.overdriveMeter || 0));
      setIsOverdriving(!!myPlayer.isOverdriveActive);
    }
  }, [room, socket.id]);

  // Keyboard controls & Continuous Input Loop
  useEffect(() => {
    const keys: Record<string, boolean> = {};

    const emitInput = (dash = false, overdrive = false) => {
      let dx = (keys['ArrowRight'] || keys['KeyD'] ? 1 : 0) - (keys['ArrowLeft'] || keys['KeyA'] ? 1 : 0);
      let dy = (keys['ArrowDown'] || keys['KeyS'] ? 1 : 0) - (keys['ArrowUp'] || keys['KeyW'] ? 1 : 0);

      // If pointer is held down, steer towards cursor
      if (isPointerDownRef.current && pointerPosRef.current && canvasRef.current) {
        const myId = socket.id || 'local_player';
        const myPlayer = (myId ? roomRef.current.gameData?.players?.[myId] : undefined) || Object.values<any>(roomRef.current.gameData?.players || {})[0];
        if (myPlayer) {
          const toX = pointerPosRef.current.x - myPlayer.x;
          const toY = pointerPosRef.current.y - myPlayer.y;
          const dist = Math.hypot(toX, toY);
          if (dist > 18) {
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
        input: { dx, dy, dash, overdrive }
      });

      if (dash) {
        SoundFX.playDash();
        setDashAvailable(false);
        setTimeout(() => setDashAvailable(true), 2500);
      }

      if (overdrive) {
        SoundFX.playPowerup();
      }
    };

    const interval = setInterval(() => {
      emitInput(false, false);
    }, 50);

    const onKeyDown = (e: KeyboardEvent) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyE'].includes(e.code)) {
        e.preventDefault();
      }
      keys[e.code] = true;
      if (e.code === 'Space') {
        emitInput(true, false);
      } else if (e.code === 'KeyE') {
        emitInput(false, true);
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

  // Handle incoming server events for audio, screen shake, and particles
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
        vy: -2.0
      });

      if (evt.type === 'orb') {
        SoundFX.playCoin();
        for (let i = 0; i < 7; i++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = Math.random() * 100 + 40;
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
          const spd = Math.random() * 150 + 50;
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
      } else if (evt.type === 'puck_hit') {
        SoundFX.playBump();
        screenShakeRef.current = Math.max(screenShakeRef.current, 8);
        for (let i = 0; i < 14; i++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = Math.random() * 180 + 60;
          particlesRef.current.push({
            x: evt.x,
            y: evt.y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            size: Math.random() * 5 + 3,
            color: evt.color || '#00e5ff',
            alpha: 1.0,
            life: 0,
            maxLife: 0.45
          });
        }
      } else if (evt.type === 'gate_boost') {
        SoundFX.playPowerup();
        screenShakeRef.current = Math.max(screenShakeRef.current, 12);
        for (let i = 0; i < 22; i++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = Math.random() * 220 + 80;
          particlesRef.current.push({
            x: evt.x,
            y: evt.y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            size: Math.random() * 7 + 4,
            color: '#00e5ff',
            alpha: 1.0,
            life: 0,
            maxLife: 0.6
          });
        }
      } else if (evt.type === 'overdrive') {
        SoundFX.playVictory();
        screenShakeRef.current = 15;
        for (let i = 0; i < 35; i++) {
          const angle = Math.random() * Math.PI * 2;
          const spd = Math.random() * 260 + 90;
          particlesRef.current.push({
            x: evt.x,
            y: evt.y,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            size: Math.random() * 8 + 4,
            color: '#ffe600',
            alpha: 1.0,
            life: 0,
            maxLife: 0.75
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

      // Deep Neon Cyberpunk Arena Backdrop
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

      // Center Rink Line & Circle (Air Hockey Arena Style)
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.2)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 8]);
      ctx.beginPath();
      ctx.moveTo(width / 2, 0);
      ctx.lineTo(width / 2, height);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, 85, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // Outer Glowing Arena Border
      ctx.strokeStyle = '#00e5ff55';
      ctx.lineWidth = 3;
      ctx.strokeRect(6, 6, width - 12, height - 12);

      const gameData = roomRef.current.gameData;
      if (gameData) {
        // Draw Speed Gates
        for (const gate of gameData.gates || []) {
          ctx.save();
          ctx.translate(gate.x, gate.y);
          const gatePulse = Math.sin(time * 0.006 + gate.id) * 0.3 + 0.7;

          // Gate Glow
          const gateGrad = ctx.createLinearGradient(0, -gate.height / 2, 0, gate.height / 2);
          gateGrad.addColorStop(0, `rgba(0, 229, 255, ${0.4 * gatePulse})`);
          gateGrad.addColorStop(0.5, `rgba(139, 92, 246, ${0.6 * gatePulse})`);
          gateGrad.addColorStop(1, `rgba(0, 229, 255, ${0.4 * gatePulse})`);

          ctx.fillStyle = gateGrad;
          ctx.fillRect(-gate.width / 2, -gate.height / 2, gate.width, gate.height);

          ctx.strokeStyle = '#00e5ff';
          ctx.lineWidth = 2;
          ctx.strokeRect(-gate.width / 2, -gate.height / 2, gate.width, gate.height);

          // Arrow Chevrons
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 10px Orbitron, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText('⚡ BOOST', 0, 4);

          ctx.restore();
        }

        // Draw EMP Hazards
        for (const h of gameData.hazards || []) {
          const pulse = Math.sin(time * 0.008 + h.id) * 3;
          ctx.save();
          ctx.translate(h.x, h.y);

          const glowGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, h.radius + 14 + pulse);
          glowGrad.addColorStop(0, '#ef444455');
          glowGrad.addColorStop(1, '#ef444400');
          ctx.fillStyle = glowGrad;
          ctx.beginPath();
          ctx.arc(0, 0, h.radius + 14 + pulse, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(0, 0, h.radius, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.font = '14px Orbitron, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⚠️', 0, 0);
          ctx.restore();
        }

        // Draw Energy Orbs
        for (const orb of gameData.orbs || []) {
          const isSuper = orb.type === 'super';
          const orbColor = isSuper ? '#ffe600' : '#00e5ff';
          const pulse = Math.sin(time * 0.006 + orb.id) * 2;
          const r = isSuper ? 13 + pulse : 8 + pulse;

          ctx.save();
          ctx.translate(orb.x, orb.y);

          const orbGlow = ctx.createRadialGradient(0, 0, 2, 0, 0, r + 8);
          orbGlow.addColorStop(0, orbColor);
          orbGlow.addColorStop(0.6, `${orbColor}55`);
          orbGlow.addColorStop(1, `${orbColor}00`);
          ctx.fillStyle = orbGlow;
          ctx.beginPath();
          ctx.arc(0, 0, r + 8, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = orbColor;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(-r * 0.3, -r * 0.3, r * 0.35, 0, Math.PI * 2);
          ctx.fill();

          ctx.restore();
        }

        // Draw Glowball Puck with Neon Reflection Trail
        const puck = gameData.puck;
        if (puck) {
          // Add puck trail
          puckTrailRef.current.push({
            x: puck.x,
            y: puck.y,
            alpha: 1.0,
            color: puck.isOverdrive ? '#ffe600' : puck.lastHitColor || '#00e5ff'
          });
          if (puckTrailRef.current.length > 25) puckTrailRef.current.shift();

          // Render puck trail
          for (let i = 0; i < puckTrailRef.current.length; i++) {
            const pt = puckTrailRef.current[i];
            const size = (i / puckTrailRef.current.length) * (puck.radius + 2);
            ctx.save();
            ctx.globalAlpha = (i / puckTrailRef.current.length) * 0.55;
            ctx.fillStyle = pt.color;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }

          // Render Puck Core
          ctx.save();
          ctx.translate(puck.x, puck.y);

          const puckPulse = Math.sin(time * 0.012) * 2.5;
          const puckRad = puck.radius + (puck.isOverdrive ? puckPulse : 0);
          const pColor = puck.isOverdrive ? '#ffe600' : puck.lastHitColor || '#ffffff';

          // Outer Glow
          const puckGlow = ctx.createRadialGradient(0, 0, 4, 0, 0, puckRad + 16);
          puckGlow.addColorStop(0, pColor);
          puckGlow.addColorStop(0.5, `${pColor}66`);
          puckGlow.addColorStop(1, `${pColor}00`);
          ctx.fillStyle = puckGlow;
          ctx.beginPath();
          ctx.arc(0, 0, puckRad + 16, 0, Math.PI * 2);
          ctx.fill();

          // Puck Body
          ctx.fillStyle = puck.isOverdrive ? '#fffbeb' : '#ffffff';
          ctx.beginPath();
          ctx.arc(0, 0, puckRad, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = pColor;
          ctx.lineWidth = 3.5;
          ctx.stroke();

          // Core insignia
          ctx.fillStyle = pColor;
          ctx.font = 'bold 12px Orbitron, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('⚡', 0, 0);

          ctx.restore();
        }

        // Draw Players (Gliders) with High-Tech Rings & Trails
        const players = gameData.players || {};
        for (const [id, p] of Object.entries<any>(players)) {
          // Trail
          let pTrail = trailsRef.current.get(id);
          if (!pTrail) {
            pTrail = [];
            trailsRef.current.set(id, pTrail);
          }
          pTrail.push({ x: p.x, y: p.y, alpha: 1.0, color: p.color });
          if (pTrail.length > 18) pTrail.shift();

          for (let i = 0; i < pTrail.length; i++) {
            const pt = pTrail[i];
            const size = (i / pTrail.length) * 16;
            ctx.save();
            ctx.globalAlpha = (i / pTrail.length) * 0.45;
            ctx.fillStyle = p.isOverdriveActive ? '#ffe600' : pt.color;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, size, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          }

          ctx.save();
          ctx.translate(p.x, p.y);

          // Stunned glitch effect
          if ((p.stunTimer || 0) > 0) {
            ctx.translate((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
          }

          const isDashing = (p.dashTimer || 0) > 0;
          const isOverdrive = !!p.isOverdriveActive;
          const gliderColor = isOverdrive ? '#ffe600' : p.color;

          // Glider Aura
          const auraGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, 28);
          auraGrad.addColorStop(0, `${gliderColor}77`);
          auraGrad.addColorStop(1, `${gliderColor}00`);
          ctx.fillStyle = auraGrad;
          ctx.beginPath();
          ctx.arc(0, 0, 28, 0, Math.PI * 2);
          ctx.fill();

          // Facing Angle based on velocity
          const moveAngle = Math.atan2(p.vy, p.vx) || 0;
          ctx.rotate(moveAngle);

          // High-Tech Cyber Puck Chassis
          ctx.fillStyle = '#0f172a';
          ctx.beginPath();
          ctx.arc(0, 0, 20, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = gliderColor;
          ctx.lineWidth = isDashing || isOverdrive ? 4 : 2.5;
          ctx.beginPath();
          ctx.arc(0, 0, 20, 0, Math.PI * 2);
          ctx.stroke();

          // Forward Facing Thruster Nozzle
          ctx.fillStyle = gliderColor;
          ctx.beginPath();
          ctx.moveTo(18, 0);
          ctx.lineTo(8, -8);
          ctx.lineTo(8, 8);
          ctx.closePath();
          ctx.fill();

          ctx.restore();

          // Player Name & Score Tag
          ctx.save();
          ctx.font = 'bold 12px Inter, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#000000';
          ctx.fillText(`${p.name} (${p.score})`, p.x + 1, p.y - 27);
          ctx.fillStyle = gliderColor;
          ctx.fillText(`${p.name} (${p.score})`, p.x, p.y - 28);

          // Dash or Overdrive Indicator Bar
          if (p.overdriveMeter > 0) {
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(p.x - 22, p.y - 24, 44, 4);
            ctx.fillStyle = p.isOverdriveActive ? '#ffe600' : '#00e5ff';
            ctx.fillRect(p.x - 22, p.y - 24, (p.overdriveMeter / 100) * 44, 4);
          }

          ctx.restore();
        }
      }

      // Update and Draw Floating Combat Texts
      for (let i = floatingTextsRef.current.length - 1; i >= 0; i--) {
        const ft = floatingTextsRef.current[i];
        ft.y += ft.vy;
        ft.alpha -= dt * 1.2;

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

  // Pointer interactions (Mouse / Touch Drag-to-Steer)
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
    setTimeout(() => setDashAvailable(true), 2500);
  };

  const handleOverdriveClick = () => {
    if (overdrivePercent < 80) return;
    socket.emit(SOCKET_EVENTS.GAME_INPUT, {
      roomCode: room.roomCode,
      input: { action: 'overdrive', overdrive: true }
    });
    SoundFX.playPowerup();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', userSelect: 'none' }}>
      <div style={{ position: 'relative' }}>
        <canvas
          ref={canvasRef}
          width={900}
          height={650}
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
            background: '#060913',
            display: 'block',
            cursor: 'crosshair'
          }}
        />

        {/* Action Controls Overlay */}
        <div style={{ position: 'absolute', bottom: 16, right: 16, display: 'flex', gap: 10 }}>
          <button
            onClick={handleOverdriveClick}
            disabled={overdrivePercent < 80}
            style={{
              padding: '12px 18px',
              background: overdrivePercent >= 80 ? 'linear-gradient(135deg, #ffe600, #ff007f)' : '#334155',
              color: overdrivePercent >= 80 ? '#000000' : '#94a3b8',
              border: 'none',
              borderRadius: 30,
              fontWeight: 800,
              fontSize: 13,
              cursor: overdrivePercent >= 80 ? 'pointer' : 'not-allowed',
              boxShadow: overdrivePercent >= 80 ? '0 0 20px rgba(255, 230, 0, 0.8)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            💥 {isOverdriving ? 'OVERDRIVE ACTIVE!' : `NOVA BLAST (${overdrivePercent}%) [E]`}
          </button>

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
              fontSize: 13,
              cursor: dashAvailable ? 'pointer' : 'not-allowed',
              boxShadow: dashAvailable ? '0 0 16px rgba(0, 229, 255, 0.6)' : 'none',
              transition: 'all 0.2s'
            }}
          >
            ⚡ {dashAvailable ? 'HYPER DASH [Space]' : 'RECHARGING...'}
          </button>
        </div>
      </div>

      {/* Helpful Instructions & Controls Bar */}
      <div style={{ marginTop: 12, display: 'flex', gap: 14, alignItems: 'center', background: '#0f172a', padding: '10px 18px', borderRadius: 8, border: '1px solid #1e293b' }}>
        <span style={{ fontSize: 13, color: '#00e5ff', fontWeight: 'bold' }}>🎮 Pro Controls:</span>
        <span style={{ fontSize: 13, color: '#94a3b8' }}>
          <strong>Drag Mouse or WASD</strong> to Glide • <strong>Hit the Glowball Puck</strong> to smash orbs & rivals • <strong>Speed Gates</strong> ignite 2.5x speed • <strong>Space</strong> to Dash • <strong>E</strong> for Overdrive Nova
        </span>
      </div>
    </div>
  );
};
