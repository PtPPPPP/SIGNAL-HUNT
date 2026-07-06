# AGENTS.md

# SIGNAL HUNT Agent Engineering Guide

This file defines mandatory engineering rules for all coding agents working on the SIGNAL HUNT repository.

Read this file before modifying code.

---

## 1. Project Mission

SIGNAL HUNT is a trade-show interactive lottery platform designed for a scientific instrumentation company.

The primary interaction is:

```text
Visitor touches screen
→ draw result is securely committed
→ scientific signal scanning animation plays
→ peak is detected
→ prize result is revealed
→ system automatically resets
```

This is a trade-show kiosk application.

It is NOT:

* an annual-party lottery
* a casino game
* a lucky wheel
* a slot machine
* a cyberpunk demo
* a generic particle showcase

The visual language must feel:

* scientific
* precise
* calm
* premium
* measurement-oriented
* instrument-inspired

---

## 2. Core Product Model

The current visitor is drawing a prize.

The system is NOT selecting a winner from a rolling name list.

Primary domain objects:

```text
Event
Prize
DrawRule
DrawSession
DrawRecord
Participant
Inventory
Settings
```

---

## 3. Absolute Priority Order

When making implementation decisions, use this order:

```text
1. Correct draw result
2. Inventory correctness
3. Recovery after refresh/crash
4. Offline reliability
5. Touch responsiveness
6. Long-running kiosk stability
7. Visual quality
8. Developer convenience
9. Visual experimentation
```

Never sacrifice domain correctness for animation.

---

## 4. Required Architecture

Use:

```text
React
TypeScript
Vite
```

Preferred libraries:

```text
Zustand
Dexie
Zod
GSAP
Vitest
React Testing Library
Playwright
```

Optional:

```text
Three.js
XState
Papa Parse
```

Do not introduce a new major dependency without clear justification.

---

## 5. Local-First Requirement

The application must remain functional without internet access.

Core draw operations must not require:

* cloud APIs
* remote databases
* authentication servers
* analytics endpoints
* CDN runtime availability

All critical assets required for exhibition operation must be available locally.

---

## 6. Draw Result Rule

The real prize result must be decided and committed BEFORE the reveal animation.

Required order:

```text
touch
→ eligibility validation
→ active prize pool calculation
→ secure random selection
→ inventory reservation
→ DrawRecord commit
→ result lock
→ animation
→ reveal
```

Never use this order:

```text
touch
→ animation
→ random result at final frame
```

---

## 7. Randomness Rule

Do not use:

```ts
Math.random()
```

for real prize selection.

Use a secure browser random source based on:

```ts
crypto.getRandomValues()
```

`Math.random()` may only be used for non-critical visual effects such as:

* decorative noise
* fake measurement data
* particle positions
* wave variation

The visual random system and business random system must remain separate.

---

## 8. Inventory Rule

A prize with:

```text
inventoryRemaining <= 0
```

must not appear in the active draw pool.

Inventory operations must be treated as domain logic.

Do not mutate inventory directly inside React components.

Bad:

```ts
setPrize({
  ...prize,
  inventoryRemaining: prize.inventoryRemaining - 1
})
```

Good:

```ts
await drawService.commitDraw(...)
```

---

## 9. Draw Recovery Rule

If a result has already been committed and the application:

* refreshes
* crashes
* restarts during animation

the application must recover the existing committed result.

It must not generate a second prize.

On boot:

```text
check active DrawSession
→ if committed but unfinished
→ recover same result
```

---

## 10. Interaction Lock Rule

One physical interaction must create at most one draw.

Immediately after first accepted input:

```text
interactionLocked = true
```

Ignore additional:

* pointerdown
* pointerup
* click
* touchstart
* touchend
* keypress

until the session resets.

---

## 11. State Machine Rule

Do not represent the main draw lifecycle using unrelated booleans such as:

```ts
isScanning
isLoading
isWinner
isAnimating
isDone
```

Use an explicit state:

```ts
type DrawState =
  | 'BOOT'
  | 'ATTRACT'
  | 'ARMING'
  | 'COMMITTING'
  | 'SCANNING'
  | 'SEARCHING'
  | 'PEAK_DETECTED'
  | 'LOCKING'
  | 'REVEALING'
  | 'RESULT'
  | 'RESETTING'
  | 'PAUSED'
  | 'ERROR'
```

State transitions must be deterministic.

---

## 12. React Rendering Rule

Do not drive 60 FPS animations through React state.

Forbidden pattern:

```ts
setState(...)
```

on every animation frame.

React manages:

* application state
* configuration
* draw lifecycle
* result UI
* admin UI

Canvas or animation engines manage:

* waveform
* scan cursor
* high-frequency noise
* particles
* per-frame visual calculations

---

## 13. Visual Engine Rule

Default visual renderer:

```text
Canvas 2D
```

Use Canvas 2D for:

* signal waveforms
* grid
* scan cursor
* peak detection
* measurement noise

Three.js is optional enhancement only.

The application must still work if enhanced WebGL visuals are disabled.

---

## 14. Design Language Rules

Must feel like:

* scientific measurement
* signal analysis
* precision instrumentation
* research technology

Do not create:

* neon cyberpunk overload
* hacker terminals
* military targeting HUD
* casino gold
* slot machine reels
* lucky wheels
* red envelope rain
* fireworks
* coin explosions
* gaming loot boxes

---

## 15. Motion Rules

Preferred narrative:

```text
activate
→ scan
→ search
→ detect
→ lock
→ reveal
```

Target draw animation:

```text
5–8 seconds
```

Do not exceed 12 seconds without an explicit product requirement.

Initial touch feedback should be visible immediately.

---

## 16. Component Boundaries

Pages:

```text
src/pages/
```

Business features:

```text
src/features/
```

Domain logic:

```text
src/domain/
```

Persistence:

```text
src/db/
```

Visual engines:

```text
src/visual/
```

Shared UI:

```text
src/components/ui/
```

Do not put draw algorithms inside:

```text
DisplayPage.tsx
```

Do not put Canvas rendering logic inside:

```text
PrizeService.ts
```

Keep layers separate.

---

## 17. Recommended Repository Structure

```text
src/
├── app/
├── pages/
├── features/
├── components/
├── visual/
├── state/
├── db/
├── domain/
├── lib/
└── styles/
```

Prefer feature-oriented modules over a flat folder full of unrelated files.

---

## 18. TypeScript Rules

Use strict TypeScript.

Do not use:

```ts
any
```

unless unavoidable and documented.

Prefer:

```ts
unknown
```

plus validation.

All external/imported data must be validated.

Use Zod schemas for:

* JSON backup
* imported settings
* prize config
* event config
* participant import

---

## 19. Database Rules

Critical records use IndexedDB.

Recommended wrapper:

```text
Dexie
```

Critical data:

* prize inventory
* draw records
* active sessions
* event settings

must not rely only on LocalStorage.

LocalStorage may be used for:

* non-critical UI preference
* theme preference
* minor local flags

---

## 20. Migration Rule

Any persistent schema change requires a migration.

Never silently break existing exhibition data.

Database changes must specify:

```text
old version
new version
migration logic
fallback behavior
```

---

## 21. Error Handling

Do not show stack traces to exhibition visitors.

Visitor-facing errors must be understandable.

Example:

```text
系统需要工作人员处理
请联系现场工作人员
```

Technical diagnostics belong in:

```text
/diagnostics
```

Log enough context to investigate failures.

---

## 22. Logging

Use structured logs for critical operations.

Examples:

```text
DRAW_REQUESTED
DRAW_COMMITTED
DRAW_RECOVERED
DRAW_REVEALED
INVENTORY_RESERVED
DRAW_VOIDED
DATABASE_ERROR
```

Never log unnecessary personal data.

---

## 23. Privacy

If participant information exists:

* minimize collection
* mask phone numbers on display screens
* never expose full personal information in public UI
* provide data deletion/export controls
* avoid logging raw sensitive information

---

## 24. Touch-First UX

Primary interaction target:

```text
touch screen
```

Mouse is secondary.

Rules:

* large hit targets
* no hover-only functionality
* no tiny controls
* prevent accidental text selection
* prevent image dragging
* account for rapid repeated tapping

---

## 25. Responsive Scope

Primary:

```text
1920×1080
```

Also support:

```text
2560×1440
3840×2160
```

Do not optimize the public display UI primarily for mobile.

Admin interfaces may support tablet/laptop sizes.

---

## 26. Accessibility

Respect:

```text
prefers-reduced-motion
```

Provide a reduced visual mode.

Do not rely only on color to communicate:

* ready
* error
* winner
* paused

Maintain readable contrast.

---

## 27. Performance

Target:

```text
60 FPS
```

Avoid:

* per-frame allocation of large arrays
* repeated DOM creation during animation
* React rerender loops
* unbounded particle counts
* leaked event listeners
* multiple active requestAnimationFrame loops

Every animation loop must have a clear lifecycle.

---

## 28. Long-Running Kiosk Stability

Assume the application may run:

```text
8–12 hours continuously
```

Before merging visual features, consider:

* memory growth
* timer cleanup
* RAF cleanup
* audio cleanup
* Canvas resize behavior
* route transitions
* visibility changes

---

## 29. Testing Requirements

Any draw algorithm change requires tests.

Mandatory categories:

### Unit

* weighted selection
* zero inventory exclusion
* time rule filtering
* reserved inventory
* random boundary values

### Integration

* commit draw
* decrement inventory
* create record
* recover session

### E2E

* touch starts one draw
* repeated tap does not duplicate
* refresh preserves committed result
* paused mode blocks draw
* result resets correctly

---

## 30. Required Adversarial Tests

Agents must explicitly consider:

```text
10 rapid taps
```

```text
refresh during SCANNING
```

```text
refresh during REVEALING
```

```text
inventory reaches zero
```

```text
IndexedDB temporary error
```

```text
offline mode
```

```text
500 sequential draws
```

---

## 31. UI Copy Rule

Public copy should be concise.

Preferred:

```text
发现你的幸运信号
```

```text
触碰屏幕 · 开始捕获
```

```text
正在扫描信号
```

```text
检测到峰值
```

```text
幸运信号已锁定
```

Avoid long scientific explanations on the main screen.

---

## 32. Brand Asset Rule

Do not invent or redraw company logos.

Use only approved provided assets.

Do not guess exact corporate colors if no official brand guide is present.

Represent colors as configurable design tokens.

---

## 33. Dependency Rule

Before installing a dependency:

1. Check whether the platform already solves the problem.
2. Check whether an existing project dependency solves it.
3. Estimate bundle impact.
4. Consider offline operation.
5. Consider maintenance cost.

Do not install a dependency merely to save ten lines of code.

---

## 34. Change Discipline

For every significant change:

1. Understand current architecture.
2. Identify domain impact.
3. Make the smallest coherent change.
4. Add or update tests.
5. Run relevant checks.
6. Report exactly what changed.

Do not perform unrelated refactors.

---

## 35. Commands

Agents should inspect `package.json` first.

Expected commands may include:

```bash
npm install
npm run dev
npm run build
npm run lint
npm run typecheck
npm run test
npm run test:e2e
```

Do not assume commands exist before inspecting the repository.

---

## 36. Completion Checklist

Before claiming a task is complete, verify:

* [ ] TypeScript passes
* [ ] Build passes
* [ ] Relevant unit tests pass
* [ ] Relevant E2E tests pass
* [ ] No duplicate draw path introduced
* [ ] Inventory semantics remain correct
* [ ] Refresh recovery remains correct
* [ ] Offline path remains viable
* [ ] Touch interaction still works
* [ ] No visual style violation introduced

---

## 37. Final Rule

This project is a production exhibition tool, not a visual coding demo.

When forced to choose:

```text
stable and precise
```

always wins over:

```text
flashy and fragile
```
