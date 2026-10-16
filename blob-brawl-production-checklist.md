# Blob Brawl: Production Readiness Checklist (Agent Instructions)

## Purpose

You are verifying that the Blob Brawl game is ready for production on start.ng. Work through every check in this document in order. For each check:

1. Run the verification method described.
2. Compare the result to the pass criteria.
3. Record the result as `PASS`, `FAIL`, or `BLOCKED` (cannot test in the current environment).
4. For any `FAIL`, record the exact steps to reproduce, the observed result, and the expected result.

Do not mark an item `PASS` unless you ran the verification. If a check cannot be run, mark it `BLOCKED` and state what is missing (for example, "no live start.ng API credentials").

## Report Format

Produce a final report with this structure:

```
Blob Brawl Production Readiness Report
Build/commit: <id>
Date: <date>

Summary: <X> PASS, <Y> FAIL, <Z> BLOCKED
Release recommendation: GO | NO-GO | GO WITH KNOWN ISSUES

Failures (blocking):
- [ID] <title>: <reproduction steps>, expected <...>, observed <...>

Blocked items:
- [ID] <title>: <reason>

Warnings (non-blocking):
- [ID] <title>: <note>
```

**Release rule:** Recommend NO-GO if any check in sections 1 to 4 or 8 is `FAIL`. Otherwise, recommend GO WITH KNOWN ISSUES if any non-blocking check failed. Recommend GO only when all checks pass.

---

## 1. Gameplay and Rules

**G-01: Coin collection**
- Verify: Start a round with 2 players. Move a player onto a coin.
- Pass: The player's score increases by exactly 1. The coin is removed and a new coin spawns at a free position. The arena always has 12 coins.

**G-02: Simultaneous coin pickup**
- Verify: Place two players so both reach the same coin in the same server tick.
- Pass: Exactly one player receives the coin. Total coins in the arena stays at 12. The score is never incremented twice for one coin.

**G-03: Bump stealing**
- Verify: Have a faster player collide with a slower player repeatedly within one second.
- Pass: One coin transfers from the slower to the faster player at most once per second per pair. Coins never go negative.

**G-04: Knockout and respawn**
- Verify: Bump the same player three times.
- Pass: The player is knocked out, loses carried coins, and respawns after 3 seconds (within 100 ms tolerance) at a random free position. Health resets to full.

**G-05: Round timer**
- Verify: Start a round and time it with a server clock.
- Pass: The round lasts 60 seconds (within 1 second). Movement and scoring stop when the timer reaches 0.

**G-06: Winner determination**
- Verify: Finish rounds with (a) a clear winner, (b) a tie, (c) a single remaining player.
- Pass: Results match the scores exactly. Ties show all tied players as winners. Results display for 8 seconds, then the room returns to the lobby.

**G-07: Balance**
- Verify: Run 20 simulated rounds with bots of equal skill, with characters at levels 1 and 10.
- Pass: No character level wins more than 65% of rounds. Average round completion is between 50 and 60 seconds.

---

## 2. Multiplayer and Networking

**N-01: Server authority**
- Verify: Send modified input from a test client (for example, a speed of 10 instead of -1 to 1, or a fake score in the payload).
- Pass: The server clamps or rejects invalid input. Scores and positions are never accepted from the client.

**N-02: State sync**
- Verify: Connect 4 clients to one room. Apply 150 ms latency and 2% packet loss to 2 of them.
- Pass: All clients show the same coin count and round timer within 500 ms of the server state. No client shows a player in a position that differs from the server by more than 1 arena unit after interpolation.

**N-03: Reconnection**
- Verify: Disconnect a player for 5 seconds during a round, then reconnect with the same user ID.
- Pass: The player rejoins the same room with their score intact. The round continues without interruption for the others.

**N-04: Disconnect handling**
- Verify: Disconnect a player and do not reconnect within 30 seconds.
- Pass: The player is removed from the room. The round continues. The host role transfers if the host left.

**N-05: Room isolation**
- Verify: Create two rooms with different players. Inspect all messages sent to clients in room A.
- Pass: No message contains player IDs, coins, or state from room B.

**N-06: Room lifecycle**
- Verify: Create a room, leave all players, and wait 5 minutes.
- Pass: The empty room is deleted from memory. Joining with its code returns a "Room not found" response.

**N-07: Load capacity**
- Verify: Create rooms of 6 players until server CPU reaches 80% or tick rate drops below 60 ticks per second. Record the number of rooms.
- Pass: The server supports the target number of rooms set in the deployment spec with tick rate still at 60 per second. Record the measured limit.

---

## 3. Platform API and Characters

**P-01: Live profile fetch**
- Verify: With live credentials, join with a real start.ng account.
- Pass: The character shows the correct display name, avatar, and color that match the profile.

**P-02: Fallback on API failure**
- Verify: Point `PLATFORM_API_BASE_URL` to an invalid host. Join a room.
- Pass: The player joins with a default character. The error is logged. The game does not crash or block the join.

**P-03: Timeout handling**
- Verify: Simulate a 10-second API response delay.
- Pass: The adapter times out within 3 seconds and uses the fallback character.

**P-04: Expired or invalid token**
- Verify: Use an invalid `PLATFORM_API_KEY`.
- Pass: The server logs an authentication error without exposing the key. The game uses the fallback character.

**P-05: Missing fields**
- Verify: Mock a profile with no avatar, no color, and no level.
- Pass: Avatar falls back to a generated circle with the first letter of the name. Color comes from the default palette by hashing the user ID. Level defaults to 1.

**P-06: Data minimization**
- Verify: Inspect the outgoing profile request and all client-facing messages.
- Pass: Only the fields listed in the design doc are requested. No email, phone, or token appears in any client message or log.

**P-07: Avatar safety**
- Verify: Provide avatar URLs that are oversized (over 2 MB), non-image, or non-HTTPS.
- Pass: Each is rejected and replaced by the fallback. No raw HTML or script executes.

---

## 4. Security

**S-01: Input validation**
- Verify: Send malformed messages: missing fields, wrong types, strings over 1 KB, and room codes with special characters.
- Pass: Each is rejected with an error event. The server does not crash.

**S-02: Rate limiting**
- Verify: Send 100 join requests per second from one IP, and 200 input messages per second from one client.
- Pass: Excess requests are throttled or dropped. Legitimate play at 20 inputs per second is unaffected.

**S-03: Secrets handling**
- Verify: Search the repository, built client bundle, and logs for the API key and any `.env` values.
- Pass: No secret appears in any of them. `.env` is listed in `.gitignore`.

**S-04: XSS protection**
- Verify: Set a display name to `<img src=x onerror=alert(1)>` and `<script>alert(1)</script>`.
- Pass: The name renders as plain text. No script runs.

**S-05: Dependency vulnerabilities**
- Verify: Run `npm audit` on the project.
- Pass: No high or critical vulnerabilities. Any moderate findings are documented with a plan.

**S-06: Transport security**
- Verify: Access the production URL and the WebSocket endpoint.
- Pass: Both use HTTPS and WSS. HTTP requests redirect to HTTPS.

---

## 5. Performance

**F-01: Frame rate, desktop**
- Verify: Run a full round with 6 players on a desktop browser. Record FPS.
- Pass: Average 60 FPS, with no sustained drop below 50 FPS.

**F-02: Frame rate, mobile**
- Verify: Run a full round with 6 players on a mid-range Android device (for example, 4 GB RAM, Android 11 or later).
- Pass: Average at least 30 FPS, with no sustained drop below 24 FPS.

**F-03: Memory stability**
- Verify: Play 10 consecutive rounds in the same browser tab and monitor memory.
- Pass: Memory after round 10 is within 20% of memory after round 1.

**F-04: Asset size**
- Verify: Measure the total download size of the client on first load.
- Pass: Under 2 MB total, with images compressed and no unused assets.

**F-05: Server resources**
- Verify: Run the load test from N-07 for 30 minutes.
- Pass: Memory grows less than 10% over the 30 minutes. CPU stays under 80%.

---

## 6. Compatibility and Devices

**C-01: Desktop browsers**
- Verify: Run a full round on the latest Chrome, Firefox, Safari, and Edge.
- Pass: The game runs with no console errors and correct rendering on each.

**C-02: Mobile browsers**
- Verify: Run a full round on Android Chrome and iOS Safari.
- Pass: Controls respond correctly. Page does not scroll, zoom, or bounce during play.

**C-03: Screen sizes**
- Verify: Test at 360×640, 390×844, 768×1024, and 1920×1080.
- Pass: All screens are fully visible. No text is cut off. The arena scales to fit.

**C-04: Slow networks**
- Verify: Throttle the connection to 3G speed (about 750 Kbps, 300 ms latency).
- Pass: The game loads within 15 seconds and plays with no more than 1 second of visible delay.

---

## 7. User Experience

**U-01: Onboarding**
- Verify: Have a first-time tester play one round with no instructions beyond the game screen.
- Pass: The tester can state the goal and the controls after the round.

**U-02: Readability**
- Verify: Check all screens at the smallest tested size.
- Pass: Body text is at least 14 px. Nametags are readable at normal play distance.

**U-03: Error messages**
- Verify: Trigger a room-not-found error, a full room, and a disconnect.
- Pass: Each message is plain language and tells the player what to do next.

**U-04: Accessibility**
- Verify: Run an automated contrast check. Navigate the lobby with only the keyboard.
- Pass: Text contrast is at least 4.5:1. All lobby actions are reachable by keyboard.

**U-05: Sound**
- Verify: Mute and unmute audio. Turn on the device's silent mode.
- Pass: Mute works immediately. No audio plays when muted.

---

## 8. Reliability and Monitoring

**R-01: Error capture**
- Verify: Force an exception on the server and on the client.
- Pass: Each is logged with a stack trace and room/user context, with no personal data.

**R-02: Health check**
- Verify: Request the health endpoint while the server is up, then stop the server.
- Pass: The endpoint returns 200 when up. An external monitor alerts within 2 minutes of downtime.

**R-03: Graceful shutdown**
- Verify: Send a shutdown signal during an active round.
- Pass: The round finishes or players receive a "server restarting, please rejoin" message before disconnect.

**R-04: Rollback**
- Verify: Deploy a build, then roll back to the previous build.
- Pass: The rollback completes in under 5 minutes and the previous version runs correctly.

---

## 9. Testing

**T-01: Unit tests**
- Verify: Run the unit test suite.
- Pass: All tests pass. Physics, scoring, and coin logic have coverage of at least 80%.

**T-02: Integration tests**
- Verify: Run the Socket.IO integration tests for join, leave, and round flow.
- Pass: All tests pass with no flaky failures across 5 consecutive runs.

**T-03: End-to-end test**
- Verify: Run a simulated round with 6 bot clients from join through results.
- Pass: The round completes, scores are consistent across all clients, and the room returns to the lobby.

**T-04: Regression suite**
- Verify: Run the full test suite on the release candidate.
- Pass: No test that passed on the previous release now fails.

**T-05: Playtest**
- Verify: Have at least 5 real users play for 15 minutes each and collect feedback.
- Pass: No blocking bug is reported. At least 70% of testers say they would play again. Record all issues found.

---

## 10. Legal, Content, and Operations

**L-01: Policies**
- Verify: Confirm the terms of service and privacy policy are published and linked from the game.
- Pass: Both documents exist, are accessible, and describe the data the game uses.

**L-02: Licensed assets**
- Verify: List all fonts, images, and sounds with their license.
- Pass: Every asset has a license that permits commercial use. Each is recorded in an asset list.

**L-03: Moderation**
- Verify: Submit display names containing profanity from a test list.
- Pass: Flagged names are blocked or replaced by the fallback name.

**L-04: Platform compliance**
- Verify: Check the start.ng game submission requirements against the build.
- Pass: Every listed requirement is met, including age rating and content rules.

**L-05: Support channel**
- Verify: Confirm a support contact is visible in the game and works.
- Pass: The contact is displayed on the lobby screen. A test message receives a response from the support owner.

**L-06: Analytics**
- Verify: Play one full round and check the analytics dashboard.
- Pass: Session start, round start, round completion, and crash events each appear within 5 minutes.

**L-07: Staging parity**
- Verify: Compare staging and production configuration.
- Pass: Only environment variables differ. Code artifacts are identical.

**L-08: Release sign-off**
- Verify: Check the sign-off record for this release.
- Pass: A reviewer who did not build the release has approved it in writing.
