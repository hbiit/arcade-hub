# Production & QA Lifecycle Testing Plan

## 1. Automated & Manual Verification Matrix
- [ ] **Platform API Fallback:** Start server with `USE_MOCK_PLATFORM=true` and verify deterministic mock profile generation.
- [ ] **Room Lifecycle:** Create room, join with 2–6 browser tabs via 6-character code, verify lobby ready-check and countdown transition.
- [ ] **Collision & Cooldowns (Blob Brawl):** Verify 1000ms pair-bump cooldown prevents instant triple-hit knockouts on a single collision frame.
- [ ] **Reconnection Grace Window:** Disconnect a client tab mid-match and verify 30-second session preservation.
- [ ] **Mobile Viewport & Touch:** Emulate mobile touch screen in DevTools; confirm virtual joystick and Dash button responsiveness at 60 FPS.
