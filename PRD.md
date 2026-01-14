# Goops - Product Requirements Document

## Overview

**Goops** is a puzzle-action game where players operate as a tank maintenance technician, clearing colorful goop from a cylindrical pressure tank while managing equipment malfunctions. The game combines spatial puzzle-solving with time pressure and multi-tasking.

### Core Fantasy
You're a low-level operator at an industrial facility. Your job: peer through a periscope into a cylindrical tank, drop goop to seal pressure cracks, laser away excess goop, and keep the equipment running. It's mundane. It's stressful. The tank keeps filling. The equipment keeps breaking. You keep playing.

---

## Game Modes

### Console Mode
The main menu and meta-game layer. Players see a retro industrial control console (Homer Simpson at the nuclear plant aesthetic).

**Elements:**
- Operator Rank display
- Upgrade/power-up indicators
- Status lights and gauges
- Periscope (physical object that can be pulled down to start gameplay)
- Card swipe to restart after failure
- CRT screen for end-game recap

**Transitions:**
- Pull down periscope → Enter Periscope Mode
- Complication occurs → Forced exit to Console Mode (fix mini-game)
- Game over → CRT screen drops, shows recap

### Periscope Mode
The core gameplay. Players look into a cylindrical tank through a viewport showing ~33% of the tank at once.

**Core Loop:**
1. Pressure builds (timer counting up)
2. Cracks appear at the pressure line
3. Drop goop to build scaffolds toward cracks
4. Match colored goop to cracks
5. Laser/pop goop to seal cracks and clean tank
6. Rotate tank to manage off-screen situations
7. Handle complications when they occur

---

## Core Mechanics

### The Tank (Cylindrical Grid)

| Property | Value | Notes |
|----------|-------|-------|
| Total Width | 30 columns | Full cylinder circumference |
| Visible Width | 12 columns | ~33% visible at once |
| Visible Height | 16 rows | |
| Total Height | 19 rows | 3-row buffer above visible |
| Grid Type | Cylindrical wrap | X coordinates wrap (0-29) |

The tank is a cylinder. Players see a flat projection of ~33% of its surface. Rotating the tank (A/D keys or drag) changes which section is visible. The cylindrical nature means:
- Goop groups can wrap around the cylinder
- Off-screen events continue happening
- Spatial memory is required

### Goop Pieces

Goop pieces are shapes composed of colored units (similar to puzzle game pieces but with unique identity).

**Properties:**
- Shape: Standard shapes (I, J, L, O, S, T, Z patterns)
- Color: Single color per piece (initially), multi-color possible later
- Units: Each cell is a discrete unit for scoring/penalties
- Rotation: Q/E or scroll wheel rotates piece while held

**Future Enhancement:** Multi-colored goop (e.g., 3 red + 1 blue unit forming a T-shape)

### Goop Placement (Drag & Drop)

**Current State (v1 - Tetris-like):**
- Piece auto-falls from top center
- Left/right moves both piece and board together
- Space = hard drop

**Target State (v2 - Drag & Drop):**
- Player grabs current piece (mouse/touch)
- Piece held in screen-space, decoupled from tank
- Ghost shows: (1) drop position on tank surface, (2) final resting position after gravity
- Release = piece lerps to drop ghost position, then falls to rest position
- S key = slam (fast fall after drop)
- A/D = rotate tank independently while holding piece
- Q/E or scroll = rotate piece while holding
- Tank rotation changes WHERE on the cylinder the piece will land
- Piece can only be dropped within visible area

**Placement Rules:**
- Must drop within visible 12-column viewport
- Ghost snaps to valid grid positions
- Cannot cancel once grabbed (must place or swap)
- W = swap with stored piece (if unlocked)

### Goop Physics (Sticky Gravity)

When goop lands or goop is removed, physics applies:

1. **Group Detection:** Connected same-color units form a "goop" (group)
2. **Support Check:** A group is supported if ANY unit touches:
   - The floor (bottom row)
   - Another supported group
3. **Falling:** Unsupported groups fall as a unit (sticky gravity)
4. **Merging:** When groups of same color touch, they merge into one goop
5. **Timestamp Reset:** Merged groups get new timestamp (fill animation restarts)

This creates emergent behavior:
- Scaffolding structures can support multiple goop groups
- Removing a key piece causes chain collapses
- Strategic placement enables efficient cleanup

### Goop Filling Animation

After placement or merge, goop "fills" over time before it can be popped.

**Formula:**
```
fillDuration = groupSize * PER_BLOCK_DURATION (375ms per unit)
```

Fill animation progresses row-by-row from bottom to top of the group.

**Gameplay Impact:**
- Larger groups take longer to become poppable
- Strategic timing: place, wait, pop
- Creates tension between building big groups vs. quick cleanup

### Laser/Pop Mechanic

Tapping/clicking a filled goop destroys it.

**Requirements to Pop:**
1. Goop must be fully filled (animation complete)
2. Top of goop must be below pressure line (submerged)
3. Tap anywhere on the goop

**Results:**
- All connected same-color units destroyed
- Unsupported goop above falls
- Score awarded based on size, height, combo
- Pressure reduced based on size + tier bonuses
- If goop was covering a matching crack → crack sealed

**"Infused" Goop:**
When goop covers a matching-color crack, those units become "infused" (glowing). Popping infused goop awards bonus time recovery.

### Pressure System

Pressure represents time. It builds continuously and determines:
- Which goop can be popped (must be below pressure line)
- Where cracks spawn (at pressure line)
- Game over condition (100% pressure)

**Visual:** Water level rising from bottom. At 0% pressure, only bottom row is submerged. At 100%, entire tank is "underwater."

**Formula:**
```
pressureRatio = 1 - (timeLeft / maxTime)
waterHeightBlocks = 1 + (pressureRatio * (VISIBLE_HEIGHT - 1))
```

**Pressure Reduction (from popping):**
```
baseRecovery = 0ms (configurable)
unitRecovery = groupSize * 100ms
tierBonus = tier * 250ms (tier starts at 15+ units)
infusedBonus = infusedUnitCount * 3000ms
```

### Cracks (Goal Marks)

Cracks appear on the tank and must be sealed.

**Spawning:**
- Spawn at the current pressure line Y position
- One crack per color active at a time
- Spawn interval: 5000ms
- Random X position (empty cell)

**Sealing a Crack:**
1. Cover crack with matching-color goop
2. Pop the covering goop
3. Crack disappears, counts as sealed

**Uncovering:**
- If goop covering a crack is destroyed by scaffold collapse (not direct pop), crack remains
- Wrong-color goop covering a crack does nothing

**Win Condition Burst:**
When required cracks are sealed AND pressure < 90%:
- All remaining colors spawn cracks simultaneously
- Creates "overtime" bonus opportunity

### Win/Lose Conditions

**Win:** Seal X cracks before pressure reaches 100%
- X = palette.length + operatorRank (scales with progression)
- After winning, gameplay continues until pressure = 100%
- Bonus points for additional cracks sealed

**Lose:** Pressure reaches 100% with fewer than X cracks sealed

**End Game Scoring:**
- All remaining goop units: -50 points each (upgradeable)
- Bonus cracks sealed: +points (TBD)
- Rank bonus (if won): +5000 * operatorRank

---

## Console Mode & Complications

### Complications System

While in Periscope Mode, equipment malfunctions can occur.

**Triggers (examples, all tunable):**
- Total units popped reaches threshold → Blown Fuse
- Total units on board reaches threshold → Indicator Failure
- Random timer-based events
- Specific in-game actions

**Complication Effects:**
- Blown Fuse: Heavy vignette, reduced visibility
- Cracked Screen: Visual distortion
- Indicator Failure: Crack position indicators hidden
- (More TBD)

**Escalation:**
If a complication is not fixed, it progresses through stages:
- Stage 1: Initial effect
- Stage 2: Worse effect, harder fix
- Stage 3: Even worse, even harder fix

**Fixing Complications:**
- Press Space to exit Periscope Mode → Console Mode
- Console presents a mini-game specific to the complication
- Complete mini-game → complication resolved
- Tank simulation CONTINUES while in Console Mode (tension!)

**Ignoring Complications:**
- Player can choose to not fix
- Complication persists and escalates
- Possible bonus points for completing run with active complications (TBD)

**Stacking:**
Multiple complications can be active simultaneously.

### Console Mini-Games

(TBD - to be designed)

Examples:
- Blown Fuse: Match wires, flip switches in sequence
- Cracked Screen: Trace crack lines to apply sealant
- Indicator Failure: Recalibrate by adjusting dials

Design goals:
- Quick (5-15 seconds)
- Require attention/skill
- Difficulty scales with complication stage

---

## Progression System

### Operator Rank

Players progress from Rank 1 to Rank 100.

**Rank determines:**
- Color palette (more colors = harder)
- Crack quota (more required to win)
- Starting junk (higher ranks start with goop already in tank)
- Complication types available
- Complication frequency/intensity

**Rank Progression:**
- XP = cumulative score across all runs
- Curve: ~5,000 XP for Rank 2, ~17,500,000 XP for Rank 100
- Formula: `XP = 5000 * (rank - 1)^1.8`

### Color Palette by Rank

| Rank | Colors |
|------|--------|
| 1+ | Red, Blue, Green, Yellow (4) |
| 2+ | + Teal (5) |
| 5+ | + White (6) |
| 8+ | + Orange (7) |

### Starting Junk by Rank

| Rank | Junk Columns |
|------|--------------|
| 1-2 | 0 |
| 3-5 | 5 (~15%) |
| 6-8 | 8 (~25%) |
| 9+ | 11 (~35%) |

### Power-Ups (Upgrades)

Purchased with Power Points (earned on rank-up).

**Existing:**
| ID | Name | Effect | Cost | Max |
|----|------|--------|------|-----|
| TIME_BONUS | Chrono-Dilation | +5s initial time per level | 1 | 10 |
| STABILITY | Viscosity Regulator | -5% fall speed per level | 1 | 10 |
| SCORE_BOOST | Catalyst Injector | +10% score per level | 2 | 10 |

**Planned:**
| ID | Name | Effect |
|----|------|--------|
| STORED_PIECE | Storage Bay | Unlock piece storage (W to swap) |
| NEXT_PREVIEW | Intake Scanner | See next piece in queue |
| PENALTY_REDUCE | Residue Tolerance | Reduce end-game goop penalty |
| TRANSITION_SPEED | Quick Reflexes | Faster periscope ↔ console transitions |
| COMPLICATION_DELAY | Maintenance Protocol | Slower complication escalation |

---

## Input Mapping

### Keyboard (Desktop)

| Key | Periscope Mode | Console Mode |
|-----|----------------|--------------|
| A / ← | Rotate tank left | Navigate |
| D / → | Rotate tank right | Navigate |
| Q | Rotate held piece CCW | - |
| E | Rotate held piece CW | - |
| W | Swap with stored piece | - |
| S | Slam (fast drop after release) | - |
| Space | Exit to Console Mode | Confirm / Exit mini-game |
| Esc | Pause | Pause |
| Scroll Up | Rotate piece CCW | - |
| Scroll Down | Rotate piece CW | - |

### Mouse (Desktop)

| Action | Periscope Mode | Console Mode |
|--------|----------------|--------------|
| Click + Drag | Hold/move piece | Interact with mini-game |
| Release | Drop piece at position | - |
| Click on goop | Pop goop (if ready) | - |
| Drag on tank | Rotate tank | - |

### Touch (Mobile - Future)

| Gesture | Action |
|---------|--------|
| Tap empty | Rotate piece? |
| Tap goop | Pop goop |
| Drag piece | Move held piece |
| Release | Drop piece |
| Two-finger drag | Rotate tank |
| Swipe down | Slam |
| Swipe up | Swap stored |

---

## Scoring

### Base Scoring (Pop)

```
perUnit = 10 + heightBonus + offscreenBonus
heightBonus = (TOTAL_HEIGHT - y) * 10
offscreenBonus = 50 (if unit is outside visible area)
comboMultiplier = 1 + (combo * 0.1)
adjacencyBonus = neighborCount * 5

totalScore = (sum of perUnit * comboMultiplier) + adjacencyBonus
```

### Drop Scoring

```
hardDropScore = distanceDropped * 2
```

### End Game

```
goopPenalty = remainingUnits * -50 (min 0 total)
winBonus = operatorRank * 5000 (if won)
bonusCracks = additionalCracksSealed * TBD
```

---

## Technical Architecture

### Current State

```
├── App.tsx              # View routing, save data management
├── Game.tsx             # MONOLITH (~900 lines) - all game logic
├── types.ts             # Type definitions
├── constants.ts         # Game constants
├── components/
│   ├── GameBoard.tsx    # Rendering + input (~985 lines)
│   ├── Controls.tsx     # HUD + game over
│   └── ...              # Menu screens
└── utils/
    ├── gameLogic.ts     # Pure functions (good)
    ├── audio.ts         # Web Audio wrapper
    ├── progression.ts   # Rank calculation
    └── storage.ts       # LocalStorage
```

**Issues:**
1. Game.tsx is monolithic with 20+ useState hooks
2. Manual state sync via `stateRef` pattern (fragile)
3. Piece movement coupled to board movement (bug)
4. No event system for cross-cutting concerns
5. Duplicated logic between Game.tsx and GameBoard.tsx
6. Not structured for Console Mode addition

### Target Architecture

```
├── core/                    # Framework-agnostic game engine
│   ├── state/
│   │   ├── TankState.ts     # Grid, goop, cracks
│   │   ├── PieceState.ts    # Held piece, queue, stored
│   │   ├── PressureState.ts # Timer, pressure level
│   │   ├── ComplicationState.ts
│   │   └── SessionState.ts  # Score, stats, phase
│   ├── systems/
│   │   ├── GridSystem.ts    # Existing pure functions
│   │   ├── PhysicsSystem.ts # Gravity, falling
│   │   ├── PressureSystem.ts
│   │   ├── CrackSystem.ts
│   │   ├── ComplicationSystem.ts
│   │   └── ScoringSystem.ts
│   ├── commands/
│   │   ├── DropPiece.ts
│   │   ├── PopGoop.ts
│   │   ├── RotateTank.ts
│   │   ├── RotatePiece.ts
│   │   ├── SwapPiece.ts
│   │   └── SlamPiece.ts
│   ├── events/
│   │   ├── EventBus.ts
│   │   └── GameEvents.ts
│   └── GameEngine.ts        # Orchestrator
├── react/
│   ├── hooks/
│   │   └── useGameEngine.ts
│   └── contexts/
│       └── GameContext.tsx
├── components/
│   ├── PeriscopeMode/
│   │   ├── TankView.tsx     # Renamed GameBoard
│   │   ├── PieceHolder.tsx  # Held piece UI
│   │   └── PeriscopeHUD.tsx
│   ├── ConsoleMode/
│   │   ├── ConsoleView.tsx
│   │   ├── Periscope.tsx    # Draggable periscope
│   │   ├── StatusPanel.tsx
│   │   └── MiniGames/
│   └── shared/
│       ├── CRTScreen.tsx
│       └── ...
└── utils/                   # Keep existing
```

### Key Architectural Changes

1. **Decouple piece from board movement**
   - Piece position in screen-space (viewport-relative)
   - Board offset is separate state
   - Ghost calculation uses viewport-to-tank coordinate mapping

2. **State machine for game phases**
   ```typescript
   type GamePhase =
     | 'CONSOLE_IDLE'
     | 'PERISCOPE_ACTIVE'
     | 'COMPLICATION_MINIGAME'
     | 'GAME_OVER_RECAP';
   ```

3. **Event bus for side effects**
   - Audio subscribes to: GOOP_POPPED, CRACK_SEALED, PIECE_DROPPED
   - Analytics subscribes to same events
   - Complications triggered by events

4. **Command pattern for inputs**
   - All mutations go through commands
   - Enables: replay, undo (future), AI training (future)

5. **Separation of concerns**
   - Core engine: no React, no DOM, pure TypeScript
   - React layer: thin binding, UI components only
   - Enables: C# port, unit testing, deterministic replays

---

## Implementation Phases

### Phase 0: Bug Fixes (Current)
- [ ] Fix piece/board coupling (piece should NOT move when board rotates)
- [ ] Stabilize existing gameplay

### Phase 1: Architecture Refactor
- [ ] Extract pure game state from Game.tsx
- [ ] Implement event bus
- [ ] Create command pattern for inputs
- [ ] Move all game logic to core/ (framework-agnostic)
- [ ] Create thin React binding (useGameEngine hook)
- [ ] Verify identical behavior to current

### Phase 2: Drag & Drop Piece Placement
- [ ] Implement held piece state (screen-space position)
- [ ] Implement drop ghost + fall ghost
- [ ] Mouse drag to move piece
- [ ] Click to drop
- [ ] Decouple board rotation from piece position
- [ ] Q/E and scroll wheel for piece rotation
- [ ] S for slam (fast fall)
- [ ] W for swap

### Phase 3: Console Mode Shell
- [ ] Create ConsoleView component
- [ ] Implement periscope pull-down interaction
- [ ] Add game phase state machine
- [ ] Space to exit periscope → console
- [ ] Tank simulation continues during console mode
- [ ] Transition animations

### Phase 4: Complications System
- [ ] Define complication types and effects
- [ ] Implement trigger system (event-based thresholds)
- [ ] Implement escalation stages
- [ ] Create first mini-game (blown fuse)
- [ ] Wire up complication → console → mini-game flow

### Phase 5: Polish & Balance
- [ ] Console visual design
- [ ] Sound design for console mode
- [ ] Complication balancing
- [ ] Additional mini-games
- [ ] New power-ups
- [ ] Mobile touch controls

### Phase 6: Future (Post-MVP)
- [ ] Soft-body shader rendering for goop
- [ ] Multi-colored goop pieces
- [ ] Control remapping
- [ ] C# / Unity port

---

## Open Questions

1. **Complication mini-game designs** - What are the specific interactions?
2. **Bonus crack scoring** - How many points per bonus crack?
3. **Complication ignore bonus** - Points for completing with active complications?
4. **Queue visibility** - How many upcoming pieces shown (with upgrade)?
5. **Mobile control scheme** - How to handle two-hand interactions on phone?
6. **Difficulty curve** - How aggressively do complications/cracks scale with rank?

---

## Appendix: Current Constants

```typescript
// Grid
VISIBLE_WIDTH = 12
TOTAL_WIDTH = 30
VISIBLE_HEIGHT = 16
TOTAL_HEIGHT = 19
BUFFER_HEIGHT = 3

// Timing
INITIAL_TIME_MS = 60000
PER_BLOCK_DURATION = 375
LOCK_DELAY_MS = 500
GOAL_SPAWN_INTERVAL = 5000

// Scoring
COMBO_BONUS = 50

// Pressure Recovery
PRESSURE_RECOVERY_BASE_MS = 0
PRESSURE_RECOVERY_PER_UNIT_MS = 100
PRESSURE_TIER_THRESHOLD = 15
PRESSURE_TIER_STEP = 10
PRESSURE_TIER_BONUS_MS = 250

// Speeds
INITIAL_SPEED = 800 (ms per row)
MIN_SPEED = 100
SOFT_DROP_FACTOR = 20
```

---

*Document Version: 1.0*
*Last Updated: January 2026*
