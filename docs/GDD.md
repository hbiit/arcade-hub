# Game Design Document (GDD) — OWE & start.ng Arcade Hub

## 1. Executive Summary
* **Project Title:** OWE / start.ng Multiplayer Arcade Hub
* **Core Concept:** An extensible multiplayer game hub integrating `start.ng` character profiles across three launch titles (*Arena Clash: Cyber Grid*, *Glowball Arena*, and *Blob Brawl*) with a plug-and-play architecture for future game additions.
* **Target Platforms:** Desktop and Mobile Web Browsers (HTML5 Canvas / WebGL + WebSockets).
* **Target Audience:** Competitive casual and mid-core community players on `start.ng`.

## 2. Launch Game Catalog (`game list`)

### Game 1: [ACCG] Arena Clash: Cyber Grid
* **Genre:** Turn-Based / Simultaneous Lock-In Tactical Grid Brawler (2–4 Players).
* **Core Loop:** Spawn on an 8x8 cybernetic grid -> Lock in movement & ability vectors -> Resolve collisions and lane attacks -> Last cipher standing wins.
* **Narrative Lore:** In the Neo-Nexus mainframe, rival data-architects deploy their custom Avatars onto the Cyber Grid to claim high-bandwidth nodes.

### Game 2: [Glowball] Glowball Arena
* **Genre:** Real-Time High-Speed Energy Collector (2–6 Players).
* **Core Loop:** Navigate a neon arena -> Collect radiant energy orbs -> Trigger high-velocity dashes to outmaneuver rivals -> Highest score at 90–120s wins.
* **Narrative Lore:** Deep inside the Lumina Reactor, synthetic pilots harvest unstable photon spheres before the containment cycle resets.

### Game 3: [blob] Blob Brawl
* **Genre:** Fast-Paced Physics Brawler & Coin Collector (2–6 Players, 60s Rounds).
* **Core Loop:** Collect 12 active arena coins -> Build velocity based on `start.ng` profile level -> Bump slower opponents to steal coins -> 3 bumps trigger a 3s knockout and coin scatter.

## 3. Character & Platform Integration (`start.ng` Adapter)
* **Display Name:** Rendered dynamically as the overhead HUD nametag.
* **Avatar Image:** Loaded into the player's sprite shader or clipped inside a vector crest.
* **Favorite Color:** Tints the character's primary aura, trail renderer, and grid tiles.
* **Platform Level:** Grants balanced passive stat modifiers (e.g., +2% movement speed per level in *Blob Brawl*).
