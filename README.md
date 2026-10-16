# OWE Arcade Hub — start.ng Multiplayer Arcade Platform

Engineered by **GM (The Game Master — Game Architect & Developer)**.

The **OWE Arcade Hub** is a multi-genre, high-performance multiplayer arcade ecosystem built with an authoritative 20Hz Node.js + Socket.io backend, responsive React + Vite frontend, shared TypeScript data contracts, and automated AI rival bot simulation.

---

## 🎮 Available Game Modes (5 Modes)

1. **💥 Blob Brawl (`blob`) — Arena Action Brawler**
   - 60-second fast coin gathering frenzy! Bump slower opponents to steal coins, dodge smart AI bots, grab power-up crates (Speed, Magnet, Shield), and survive 3-bump knockouts.
2. **⚡ Glowball Overdrive (`glowball`) — Neon Cyber Pong & Air Hockey**
   - Deflect the pulsating plasma glowball past your opponent's goal line to score 5 match points with spin curves and speed gates.
3. **🛡️ ACCG Tactical Siege (`accg`) — Lane Defense & Card Strategy**
   - Deploy tactical battle cards from your deck to march down lanes, engage enemy units, and destroy the enemy Command Core.
4. **🀄 Traditional 4-Player Mahjong (`mahjong`) — Imperial Table Strategy**
   - Standard 136 ivory tiles with Characters, Bamboo, Dots, and Winds. Full support for 吃 (Chi / Sequence), 碰 (Pong / Triplet), 槓 (Kong / Quad), and 胡 (Hu / Win) with 3 intelligent AI table opponents.
5. **🀆 Mahjong Solitaire Speed Match (`mahjong-solitaire`) — Cyber Tile Puzzle**
   - Authentic multi-layered 3D ivory tile pyramid layout. Match free matching pairs, build combo streaks, and activate special tactical powers (⚡ Lightning Zap, ❄️ Time Freeze, 🔀 Cosmic Shuffle).

---

## 🚀 Quick Start (Local Development)

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

### 1. Root Monorepo Commands
From the project root:
```bash
# Install dependencies across monorepo
npm install
npm --prefix shared install
npm --prefix server install
npm --prefix client install

# Build shared types, server, and client
npm run build

# Run server engine test suite
npm test
```

### 2. Starting the Servers
In two separate terminals:

**Terminal 1 (Authoritative Backend Server & Static Host):**
```bash
cd server
npm run dev
# Server listens on http://localhost:4000
# Health check: http://localhost:4000/health
# Leaderboard API: http://localhost:4000/api/leaderboard
```

**Terminal 2 (Frontend Client Development Server):**
```bash
cd client
npm run dev
# Client runs on http://localhost:5173
```

---

## 🐳 Docker Deployment
Run the complete containerized stack:
```bash
docker-compose up --build -d
```
Access the application at `http://localhost:4000`.

---

## 🧪 Automated Testing
Run the comprehensive test suites:
```bash
# Unit & Engine tests
npm --prefix server run test

# Full 5-Mode End-to-End WebSocket Integration Test
node scratch/verify_all_five_modes.js
```
