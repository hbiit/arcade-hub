# OWE Arcade Hub — Stack & Best-Practices Review (GM Report)

> **Author:** GM (Game Architect & Developer)
> **Date:** 2026-10-16
> **Scope:** `arcade-hub-project` — server, client, shared
> **Method:** Read the live source (not the blueprint), ran the build and test suite, and
> benchmarked the stack against current vendor guidance. Every code claim below was verified
> against a file in this repo.

---

## 1. Verified baseline

| Check | Command | Result |
|---|---|---|
| Engine unit tests | `npm --prefix server test` | PASS (4 of 5 engines) |
| Server typecheck + build | `npm --prefix server run build` | PASS (exit 0) |
| Working tree | `git status` | clean, `main` |
| Node / npm runtime | `node -v` / `npm -v` | `v24.21.0` / `11.19.0` |

**Stack as installed**

| Layer | Package | Installed | Notes |
|---|---|---|---|
| Server | express | 4.19.2 | current 4.x patch is well ahead of this |
| Server | socket.io | 4.7.5 | 4.8.x available |
| Server | typescript | 5.4.5 | CJS, `tsc` build, `ts-node` dev |
| Client | react / react-dom | 18.3.1 | React 19 is the current major |
| Client | vite | 5.2.10 | Vite 7 is the current major |
| Client | @vitejs/plugin-react | 4.x | 5.x available |
| Shared | typescript | 5.4.5 | imported by relative path, not a real workspace dep |

Version numbers move fast — re-check the latest patch/minor at install time with
`npm view <pkg> version`. The *structural* recommendations below are version-independent and
are the ones that matter.

---

## 2. Priority matrix

### Adopt now — correctness / determinism / abuse-resistance

| # | Change | Why it matters here | Evidence in repo |
|---|---|---|---|
| A1 | **Fixed timestep on the server** | The loop passes a *measured* delta into physics, so identical inputs produce different outcomes per run. Blocks trustworthy balance tests (G-07) and any replay. | [roomManager.ts](../server/src/hub/roomManager.ts) `dt = (now - lastTick) / 1000` → `engine.tick(dt)` |
| A2 | **Validate + rate-limit socket input** | `handleInput` forwards the raw client payload straight into the engine. TypeScript types do not validate a hostile runtime payload. | [roomManager.ts](../server/src/hub/roomManager.ts) `handleInput`; [index.ts](../server/src/index.ts) `GAME_INPUT` handler |
| A3 | **Cap `maxHttpBufferSize`** | Default is **1 MB** per message; game inputs need ~8–16 KiB. | [index.ts](../server/src/index.ts) `new Server(server, { cors })` — no options set |
| A4 | **Volatile broadcast for state snapshots** | Full room state is emitted every tick as a *reliable* packet; a superseded snapshot never needs to be retransmitted on a slow link. | [roomManager.ts](../server/src/hub/roomManager.ts) `io.to(roomCode).emit(GAME_STATE_TICK, …)` |
| A5 | **Fix the Node engine target** | `engines.node >= 20.0.0` and README "v18+" now point at **EOL runtimes** (Node 20 EOL 2026-04-30). | [package.json](../package.json) `engines`; [README.md](../README.md) prerequisites |
| A6 | **Read client config from `import.meta.env`** | The server URL and leaderboard URL are hardcoded to `localhost:4000`, so a production bundle cannot be pointed anywhere else without a code edit. | [App.tsx](../client/src/App.tsx) `socketUrl`, `fetch('http://localhost:4000/api/leaderboard')` |
| A7 | **Handle `visibilitychange` in the client loops** | rAF genuinely pauses in background tabs; on resume the first `dt` is huge, causing a visible jump/catch-up. No visibility handling exists. | [BlobBrawlCanvas.tsx](../client/src/games/blob/BlobBrawlCanvas.tsx#L514) — loop has no visibility guard |

### Adopt next — operability / lifecycle

| # | Change | Why |
|---|---|---|
| B1 | **Structured logs (pino) + request/room context** | Only `console.log` exists. Needed for R-01 (error capture with room/user context, no PII). |
| B2 | **Graceful shutdown on SIGTERM** | No signal handling at all. `io.close()` disconnects clients *and* closes the HTTP server; a drain path is required for R-03. |
| B3 | **Split liveness vs readiness** | `/health` is liveness only. Add readiness that reports not-ready during drain or an unhealthy tick loop (R-02). |
| B4 | **`helmet` + `express-rate-limit` on HTTP** | CORS is configured but the security headers and IP-level throttling are absent (S-02). Note: HTTP rate limiting does **not** protect individual socket messages. |
| B5 | **Validate env at startup (zod)** | Config falls back silently on missing vars; a bad deploy looks healthy. |
| B6 | **Real test framework (`node:test`)** | `test` is a hand-rolled script that calls `process.exit()`, which can mask async work and gives no coverage. See §5 for the untested engine. |
| B7 | **CI (GitHub Actions)** | No CI exists. First gates: install → typecheck → build → test. |
| B8 | **devicePixelRatio backing-store scaling** | Canvas is not DPR-scaled, so it renders soft on HiDPI/retina (U-02 readability). |

### Watch — defer until measured

- **Socket.IO Redis adapter / horizontal scale.** Your room state is an in-memory `Map`, and the default adapter is process-local. Adding Redis is **not** sufficient: it routes messages but does not replicate game state or elect a single authoritative simulator. Scaling requires room ownership partitioning first. The classic Redis adapter also **does not support connection-state recovery**.
- **MessagePack / custom parser.** Numeric-heavy snapshots may shrink, but it must be configured on *both* sides and is a debuggability tax. Measure current payload size before adopting.
- **`perMessageDeflate`.** Off by default since Socket.IO 3.0 for good reason (CPU + memory). Leave off.
- **`socket.io` 4.6+ `connectionStateRecovery`.** This is the *right* fix for reconnect (B-tier, arguably A-tier) — but it conflicts with the Redis adapter, so decide the scaling story first. Your current hand-rolled 30 s `setTimeout` grace works and can stay until then.
- **OffscreenCanvas / Web Workers.** Only after profiling shows the sim starves the main thread.
- **npm workspaces.** `shared/` is imported by relative path (`../../../shared/src`) from both server and client, including `localGameRunner.ts` reaching into `server/src`. A workspace symlink + real package dependency removes that fragility.
- **Express 5 / React 19 / Vite 7 / TS 5.9+ strict flags.** All worthwhile, all requiring a compatibility pass. Do them as separate, verified steps.

---

## 3. Server: authoritative loop and broadcast

### 3.1 Fixed timestep (A1)

Node's timer docs are explicit that callbacks run "as close as possible" to the requested time, not
at it. Treating `setInterval(…, 50)` as a metronome and feeding the *measured* gap into physics
means the simulation step is a random variable. That is the root cause of non-reproducible
gameplay, and it silently breaks any balance/soak test that assumes determinism.

Adopt: simulation step is a **constant** (`1/20` s), the clock is only a wake-up signal, and
elapsed time is consumed in bounded fixed steps.

```ts
const STEP_MS = 50;          // fixed, authoritative
const MAX_ELAPSED_MS = 250;  // clamp after a stall
const MAX_CATCHUP_STEPS = 3; // bound catch-up work

// accumulate performance.now() deltas, consume whole STEP_MS steps,
// call engine.tick(STEP_MS / 1000) with a constant dt
```

Two follow-on wins:

- **One scheduler for active rooms** instead of a `setInterval` per room. Tick due rooms in
  bounded batches; never create a timer for a lobby/empty room.
- **Decide the overload policy explicitly.** Discarding backlog means simulation time *slows*
  under load. For a competitive game, surface that (metric + alert) rather than hiding it.

Determinism also lets you keep `timeRemaining` as a decrement of exactly `0.05` per tick instead
of accumulating floating-point wall-clock diffs — which is what G-05 ("within 1 second") is
really testing.

*Sources:* [Node timers](https://github.com/nodejs/node/blob/v20.11.1/doc/api/timers.md),
[perf_hooks](https://github.com/nodejs/node/blob/v20.11.1/doc/api/perf_hooks.md),
[worker_threads](https://github.com/nodejs/node/blob/v20.11.1/doc/api/worker_threads.md)

### 3.2 Volatile snapshots (A4)

`ROOM_UPDATED` is a discrete, must-apply event — keep it reliable. `GAME_STATE_TICK` is a
replaceable snapshot: a dropped one is superseded ~50 ms later. Use
`io.to(room).volatile.emit(...)` for the tick only.

Also: never `JSON.stringify` a payload before emitting — Socket.IO serializes for you.

*Sources:* [Emitting events](https://socket.io/docs/v4/emitting-events/),
[Server options](https://socket.io/docs/v4/server-options/),
[Custom parser](https://socket.io/docs/v4/custom-parser/)

### 3.3 Input trust boundary (A2, A3)

`handleInput(socketId, roomCode, payload)` currently hands the client object to the engine
unchanged. Adopt a three-layer boundary:

1. **Shape/bounds:** a zod schema per event (finite numbers, `dx`/`dy` in `[-1, 1]`, enum
   `action`, max string/array lengths). Reject, don't coerce.
2. **Rate:** a per-socket token bucket via `socket.use(...)` — separate limits for `GAME_INPUT`
   vs `HUB_*`. Note middleware runs **once per connection** with `io.use`, **per packet** with
   `socket.use`.
3. **Transport:** `maxHttpBufferSize: 8 * 1024` (verify against your legitimate maximum).

Keep the client sending **intent** only. The server must continue to own position, score, and
collision outcomes — which the engines already do; the gap is purely the validation layer.

*Sources:* [Middlewares](https://socket.io/docs/v4/middlewares/),
[Socket instance](https://socket.io/docs/v4/server-socket-instance/),
[Server options](https://socket.io/docs/v4/server-options/), [Zod 4](https://zod.dev/v4)

### 3.4 Lifecycle and observability (B1–B3)

- **Logs:** pino with `roomId`, `tick`, `userId` (internal id), event name, disconnect reason.
  Never log the platform token or dump every input. Sample tick diagnostics — do not emit one
  line per tick per room. Run log transport (if any) off the main thread; pino transports
  support worker threads since v7.
- **Shutdown:** on SIGTERM → readiness `false` → stop accepting joins → finish or abort the
  match per policy → flush the leaderboard write (see below) → `io.close()`. Make it idempotent
  with a forced-exit deadline.
- **Health:** keep `/health` as liveness; add `/ready` that fails during drain and when the tick
  scheduler is starved.

**Leaderboard I/O:** `recordMatchResult` does a synchronous `fs.writeFileSync` on match end.
Keep filesystem work out of the tick path and out of the request path — queue it and flush on
the drain deadline. It happens once per match, so today's risk is low, but it is a real
event-loop stall on a busy deployment (F-05).

*Sources:* [Pino](https://github.com/pinojs/pino), [Pino transports](https://github.com/pinojs/pino/blob/main/docs/transports.md),
[Socket.IO `close()`](https://socket.io/docs/v4/server-api/)

---

## 4. Client: rendering and React

### 4.1 What is already right

The canvas loops correctly live in `useEffect`/`useRef` and own their `cancelAnimationFrame`
cleanup ([BlobBrawlCanvas.tsx:514-517](../client/src/games/blob/BlobBrawlCanvas.tsx#L514)). Frame
state is kept in refs, not React state. That is exactly the recommended architecture: React
renders the shell, the engine owns the frame. Do not "fix" this by moving positions into state.

### 4.2 Gaps to close

- **Visibility (A7):** add `visibilitychange` — pause on hidden, and on resume reset the
  previous-timestamp/accumulator so the hidden interval is not simulated in one lurch.
- **DPR (B8):** set the canvas backing store to CSS size × `devicePixelRatio`, scale the 2D
  context, and re-apply on resize/zoom. Cap the ratio (e.g. 2) to bound fill cost.
- **Config (A6):** move `socketUrl` and the leaderboard URL to `import.meta.env.VITE_*`. Only
  `VITE_`-prefixed vars are inlined, and **they are public** — never a secret.
- **StrictMode:** keep it on (`main.tsx`). The double setup→cleanup→setup cycle is a cleanup test;
  a loop that cancels properly passes it. Don't add "run once" ref guards.

### 4.3 Defer

Vite 7 sets a new default browser target (Baseline Widely Available), so treat it as an explicit
compatibility decision, not a free upgrade. React 19 is the current major; upgrade when the
plugin and type packages line up. A UI state library (Zustand et al.) is only justified for UI
state — **never** as the per-frame game model.

*Sources:* [React `useRef`](https://react.dev/reference/react/useRef),
[React `useEffect`](https://react.dev/reference/react/useEffect),
[React `StrictMode`](https://react.dev/reference/react/StrictMode),
[MDN rAF](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame),
[MDN devicePixelRatio](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio),
[MDN Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API),
[MDN OffscreenCanvas](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas),
[Vite 7](https://vite.dev/blog/announcing-vite7), [Vite env](https://vite.dev/guide/env-and-mode)

---

## 5. Toolchain, tests, and process

| Item | Current | Recommendation |
|---|---|---|
| Production build | `tsc` → `node dist/...` | **Keep.** Correct and boring. `ts-node`/`tsx`/native stripping are *not* production compilers. |
| Dev runner | `ts-node src/index.ts` | Optional: `tsx watch` for lighter execution. Keep `tsc --noEmit` as the real type gate. |
| Module system | CJS server, ESM client | Keep CJS server (working, no compelling reason to migrate). Make `"type"` explicit. New Node-only code → ESM + `moduleResolution: NodeNext`. |
| Tests | hand-rolled script, `process.exit()` | `node:test` + `node:assert/strict` (stable since Node 20). Add `--experimental-test-coverage` for visibility. |
| Node target | `>=20.0.0`, README v18+ | **Node 24 LTS** (`engines`), Node 22 as a compatibility-matrix entry. Node 26 enters LTS 2026-10-28 — re-check then. |
| Env loading | `dotenv` with `path: '../.env'` | Works; Node's built-in `--env-file` is an alternative. Either way, **validate** the parsed env (B5) — `--env-file` does not. |
| Monorepo | `npm --prefix` | Fine at this size. npm workspaces is the low-disruption next step (and fixes the relative-path `shared/` import). |
| CI | none | GitHub Actions: `npm ci` per package, cache both lockfiles via `cache-dependency-path`, then typecheck → build → test. |

**Test coverage gap (verified).** [engine.test.ts](../server/src/tests/engine.test.ts) exercises
BlobBrawl, Glowball, ACCG, and MahjongSolitaire — **`MahjongEngine` (Traditional Table Mahjong)
is never instantiated in tests**, even though it is the largest engine and is registered in
`gameRegistry` and imported by the client's `localGameRunner`. That is a T-01 coverage hole and
the single highest-value test to add.

*Sources:* [Node TypeScript](https://nodejs.org/api/typescript.html),
[Node test runner](https://nodejs.org/api/test.html),
[Node coverage](https://nodejs.org/learn/test-runner/collecting-code-coverage),
[Vitest](https://vitest.dev/guide/), [Node release schedule](https://github.com/nodejs/Release/blob/main/schedule.json),
[Node 20.6.0 `--env-file`](https://nodejs.org/en/blog/release/v20.6.0),
[npm workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces/),
[setup-node](https://github.com/actions/setup-node),
[TS moduleResolution](https://www.typescriptlang.org/tsconfig/moduleResolution.html)

### TypeScript strictness (client + shared)

`strict: true` is on; add, in this order, verifying between each:

1. `noImplicitOverride` — free.
2. `verbatimModuleSyntax` — makes type-only imports explicit; catches real bundling bugs.
3. `noUncheckedIndexedAccess` — the important one for game code: `players[id]`, `arena[i]`,
   `tiles[i]` become `T | undefined`, which is *true* for a `Record` lookup.
4. `exactOptionalPropertyTypes` — highest migration cost; do last.

Keep `moduleResolution: "bundler"` on the client (Vite) but do **not** copy it to the server.

---

## 6. Repository hygiene

- **Build artifacts are committed:** `dist/`, `assets/`, and `client/dist/` are tracked in git.
  They should be built by CI/Docker instead. `.gitignore` currently lists only `node_modules/`,
  `.env`, `*.log`, `.DS_Store`, `*.zip`, and `leaderboard.mock.json` — it does **not** cover
  `dist/`, so add it before the next commit (`git rm -r --cached` the outputs).
- **Duplicate assets** at repo root (`assets/`, `dist/`, `cover.png`, `cover.jpg`) mirror the
  client output — a stale-copy hazard.
- **Secrets:** `.env` exists locally and is gitignored — correct. Re-run the S-03 sweep over the
  *built bundle* before release, since `App.tsx` currently hardcodes endpoints.

---

## 7. Recommended sequence

1. **A5 + A6** (engine target, env config) — smallest diffs, unblock deployment.
2. **A1** (fixed timestep) — then re-run the balance/soak checks, which only become meaningful now.
3. **A2 + A3** (input validation, buffer cap) — closes the highest-severity abuse surface (S-01/S-02, N-01).
4. **A4 + A7 + B8** (volatile broadcast, visibility, DPR) — perceived-quality and bandwidth.
5. **B1–B7** (observability, lifecycle, tests, CI) — operability for a real launch.
6. **§5 strictness flags** and **§4.3 / §2 Watch** upgrades — one at a time, each verified.

---

## 8. Verification limits

- Version numbers are points-in-time; re-check at install. Some researched pages carried a
  2025 cutoff, so confirm current patch/minor rather than trusting the table verbatim.
- No live `start.ng` credentials were available, so P-01/P-04/P-06 remain **BLOCKED**.
- Nothing in this report was verified under 6-player load, on mobile, or behind a proxy —
  N-02, N-03, N-07, F-01–F-05 stay **UNVERIFIED** for the purposes of the production checklist.
- This is an engineering review, not legal or security certification.
