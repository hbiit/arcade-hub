# System & Multiplayer Architecture

## 1. High-Level Topology
* **Client Layer:** React 18 + TypeScript + HTML5 Canvas2D/WebGL + Socket.io-client. Includes client-side prediction, entity interpolation, and responsive dual-input (WASD/Arrows + Mobile Virtual Joystick).
* **Transport Layer:** Node.js + Socket.io WebSocket rooms with 20Hz authoritative server tick broadcasts and delta compression.
* **Engine Layer:** Abstract `BaseGameEngine` class managed by a central `GameRegistry` factory, allowing drop-in expansion for future games.
* **Integration Layer:** `PlatformAdapter` singleton with 3-second timeout circuit breaking and deterministic mock profile fallback.

## 2. State Synchronization & Anti-Cheat
* Clients transmit **Input Intents** (`dx`, `dy`, `dash`, `gridAction`) rather than raw coordinates.
* The server's `PhysicsEngine` and active `BaseGameEngine` validate movement bounds, cooldown timers, and collision distances before mutating state.
