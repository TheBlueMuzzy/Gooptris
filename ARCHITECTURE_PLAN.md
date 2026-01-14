# Goops Architecture Plan

This document outlines the phased approach to refactoring Goops from its current monolithic structure to a modular, extensible architecture that supports the full vision (Console Mode, Complications, Drag-Drop placement).

---

## Current State Assessment

### What Works Well
- **Pure function library** (`utils/gameLogic.ts`) - Grid operations, collision, scoring are already extracted
- **Type definitions** (`types.ts`) - Clear interfaces for game entities
- **Audio system** (`utils/audio.ts`) - Clean singleton pattern
- **Persistence** (`utils/storage.ts`) - Solid save/load with schema migration

### Problems to Solve

1. **Game.tsx Monolith** (~900 lines)
   - 20+ useState hooks
   - Manual `stateRef` synchronization pattern (fragile)
   - All game logic inline in one component
   - Hard to test, hard to extend

2. **Piece/Board Coupling**
   - Currently: piece.x moves when board rotates (to maintain visual position)
   - For drag-drop: piece should be in screen-space, decoupled from tank coordinates until dropped

3. **No Event System**
   - Audio calls scattered throughout code
   - No way to add complications triggers without touching game logic
   - No analytics hooks

4. **Duplicated Logic**
   - Pressure calculation in Game.tsx AND GameBoard.tsx
   - Goal consumption logic in hardDrop() AND gameLoop()

5. **Not Structured for Console Mode**
   - No game phase state machine
   - No way to pause tank simulation vs. pause everything
   - No transition system

---

## Target Architecture

```
goops/
├── core/                           # Framework-agnostic game engine
│   ├── state/
│   │   ├── GameState.ts            # Root state container
│   │   ├── TankState.ts            # Grid, goop groups
│   │   ├── PieceState.ts           # Held piece, queue, stored
│   │   ├── PressureState.ts        # Timer, water level
│   │   ├── CrackState.ts           # Goal marks
│   │   ├── ComplicationState.ts    # Active complications
│   │   └── SessionState.ts         # Score, stats, phase
│   │
│   ├── systems/                    # Pure functions operating on state
│   │   ├── GridSystem.ts           # (migrate from gameLogic.ts)
│   │   ├── PhysicsSystem.ts        # Gravity, falling blocks
│   │   ├── PressureSystem.ts       # Timer tick, water level calc
│   │   ├── CrackSystem.ts          # Spawn, seal, consume
│   │   ├── ScoringSystem.ts        # Points calculation
│   │   └── ComplicationSystem.ts   # Triggers, escalation
│   │
│   ├── commands/                   # State mutations (Command pattern)
│   │   ├── Command.ts              # Base interface
│   │   ├── DropPieceCommand.ts
│   │   ├── PopGoopCommand.ts
│   │   ├── RotateTankCommand.ts
│   │   ├── RotatePieceCommand.ts
│   │   ├── SwapPieceCommand.ts
│   │   ├── SlamPieceCommand.ts
│   │   └── ChangePhaseCommand.ts
│   │
│   ├── events/
│   │   ├── EventBus.ts             # Pub/sub for side effects
│   │   └── GameEvents.ts           # Event type definitions
│   │
│   └── GameEngine.ts               # Orchestrator (tick, execute commands)
│
├── react/                          # React-specific bindings
│   ├── hooks/
│   │   ├── useGameEngine.ts        # Main hook
│   │   ├── useAudioSubscription.ts
│   │   └── useComplicationTriggers.ts
│   └── contexts/
│       └── GameContext.tsx
│
├── components/
│   ├── PeriscopeMode/
│   │   ├── TankView.tsx            # Renamed from GameBoard
│   │   ├── HeldPiece.tsx           # Draggable piece in screen-space
│   │   ├── DropGhost.tsx           # Where piece will land
│   │   ├── FallGhost.tsx           # Where piece will rest
│   │   └── PeriscopeHUD.tsx
│   │
│   ├── ConsoleMode/
│   │   ├── ConsoleView.tsx         # Control panel UI
│   │   ├── PeriscopeHandle.tsx     # Draggable to enter game
│   │   ├── StatusPanel.tsx         # Rank, upgrades display
│   │   ├── CardSwipe.tsx           # Restart interaction
│   │   └── MiniGames/
│   │       ├── BlownFuse.tsx
│   │       └── ...
│   │
│   └── shared/
│       ├── CRTScreen.tsx
│       ├── Vignette.tsx
│       └── TransitionOverlay.tsx
│
├── utils/                          # Keep existing, add:
│   ├── audio.ts
│   ├── storage.ts
│   ├── progression.ts
│   └── coordinates.ts              # Screen ↔ Tank coordinate conversion
│
├── types.ts                        # Expand with new types
├── constants.ts
├── App.tsx
└── Game.tsx                        # Eventually becomes thin shell
```

---

## Implementation Phases

### Phase 0: Stabilization (No Architecture Changes)

**Goal:** Fix critical bugs without restructuring.

**Tasks:**
- [ ] Clarify piece/board coupling behavior (see open question below)
- [ ] Fix any collision edge cases
- [ ] Ensure current gameplay is stable baseline

**Open Question:** When rotating tank, should piece:
- A) Stay at same screen position (current behavior - piece.x changes to compensate)
- B) Move with tank visually (piece.x stays constant, appears to rotate with tank)

For target drag-drop model, A is correct (piece in screen-space).
For current auto-fall model, B might feel more natural.

**Decision needed before proceeding.**

---

### Phase 1: Event Bus + Command Pattern

**Goal:** Decouple side effects from game logic.

**Tasks:**
1. Create `core/events/EventBus.ts`
   ```typescript
   type Listener<T> = (payload: T) => void;

   class EventBus {
     private listeners = new Map<string, Set<Listener<any>>>();

     on<T>(event: string, listener: Listener<T>): () => void;
     emit<T>(event: string, payload: T): void;
   }
   ```

2. Create `core/events/GameEvents.ts`
   ```typescript
   enum GameEventType {
     PIECE_DROPPED = 'PIECE_DROPPED',
     GOOP_POPPED = 'GOOP_POPPED',
     CRACK_SEALED = 'CRACK_SEALED',
     CRACK_SPAWNED = 'CRACK_SPAWNED',
     PRESSURE_CHANGED = 'PRESSURE_CHANGED',
     PHASE_CHANGED = 'PHASE_CHANGED',
     // ...
   }
   ```

3. Create `core/commands/Command.ts`
   ```typescript
   interface Command {
     type: string;
     execute(state: GameState, eventBus: EventBus): GameState;
   }
   ```

4. Move audio calls to event subscriptions
   - Game logic emits events
   - Audio system subscribes to events
   - No audio imports in Game.tsx

**Verification:** Game plays identically, but audio is now event-driven.

---

### Phase 2: Extract Core State

**Goal:** Separate game state from React state.

**Tasks:**
1. Create `core/state/GameState.ts`
   ```typescript
   interface CoreGameState {
     tank: TankState;
     piece: PieceState;
     pressure: PressureState;
     cracks: CrackState;
     session: SessionState;
     phase: GamePhase;
   }

   type GamePhase =
     | 'COUNTDOWN'
     | 'PLAYING'
     | 'PAUSED'
     | 'GAME_OVER';
   ```

2. Create `core/GameEngine.ts`
   ```typescript
   class GameEngine {
     private state: CoreGameState;
     private eventBus: EventBus;

     tick(deltaMs: number): void;
     execute(command: Command): void;
     getState(): CoreGameState;
     subscribe(listener: (state: CoreGameState) => void): () => void;
   }
   ```

3. Create `react/hooks/useGameEngine.ts`
   ```typescript
   function useGameEngine(config: GameConfig): {
     state: CoreGameState;
     dispatch: (command: Command) => void;
   }
   ```

4. Refactor Game.tsx to use `useGameEngine`
   - Remove 20+ useState hooks
   - Remove stateRef pattern
   - Component becomes thin UI shell

**Verification:** Game plays identically, but state is managed by GameEngine.

---

### Phase 3: Decouple Piece from Board

**Goal:** Prepare for drag-drop placement.

**Tasks:**
1. Add screen-space piece position to state
   ```typescript
   interface PieceState {
     heldPiece: PieceDefinition | null;
     screenPosition: { x: number, y: number } | null;  // NEW
     tankPosition: { x: number, y: number } | null;    // Calculated from screen
     storedPiece: PieceDefinition | null;
     rotation: number;
   }
   ```

2. Create coordinate conversion utilities
   ```typescript
   // utils/coordinates.ts
   function screenToTank(screenX: number, boardOffset: number): number;
   function tankToScreen(tankX: number, boardOffset: number): number;
   ```

3. Separate `RotateTankCommand` from piece movement
   - Tank rotation only changes `boardOffset`
   - Piece `screenPosition` unchanged
   - Ghost recalculates based on new boardOffset

4. Update rendering to use screen position for held piece

**Verification:**
- Piece visually stays in place when tank rotates
- Ghost updates to show new landing position
- Collision still works correctly

---

### Phase 4: Drag-Drop Placement

**Goal:** Implement target placement mechanic.

**Tasks:**
1. Add mouse/touch tracking for piece position
2. Implement drop ghost (lerp target)
3. Implement fall ghost (final resting position)
4. Create `DropPieceCommand` - piece lerps to drop position, then falls
5. Create `SlamPieceCommand` - fast fall after drop
6. Remove auto-fall gravity for held piece
7. Add scroll wheel / Q/E for piece rotation while held

**Verification:**
- Can drag piece anywhere in visible area
- Ghost shows correctly
- Drop + fall animation works
- Slam (S key) speeds up fall

---

### Phase 5: Game Phase State Machine

**Goal:** Support Console Mode transitions.

**Tasks:**
1. Expand GamePhase
   ```typescript
   type GamePhase =
     | 'CONSOLE_IDLE'
     | 'PERISCOPE_ENTERING'
     | 'PERISCOPE_ACTIVE'
     | 'PERISCOPE_EXITING'
     | 'COMPLICATION_MINIGAME'
     | 'GAME_OVER_RECAP';
   ```

2. Create `ChangePhaseCommand`
3. Implement transition animations
4. Tank simulation continues in COMPLICATION_MINIGAME phase
5. Space bar triggers PERISCOPE_ACTIVE → CONSOLE_IDLE

**Verification:**
- Can transition between phases
- Tank keeps running during console mode
- Transitions are animated

---

### Phase 6: Console Mode UI

**Goal:** Build the console interface.

**Tasks:**
1. Create ConsoleView component
2. Create PeriscopeHandle with drag interaction
3. Create StatusPanel (rank, upgrades)
4. Create CardSwipe for restart
5. Style as retro industrial control panel

---

### Phase 7: Complications System

**Goal:** Implement equipment malfunctions.

**Tasks:**
1. Create ComplicationState
2. Create complication trigger system (event-based)
3. Implement escalation stages
4. Create first mini-game (Blown Fuse)
5. Wire up PERISCOPE_ACTIVE → COMPLICATION_MINIGAME flow

---

## Testing Strategy

### Unit Tests (core/)
- All systems are pure functions → easy to test
- Commands are deterministic → test state transitions
- No React, no DOM dependencies

### Integration Tests
- GameEngine tick behavior
- Event emission sequences
- Command execution order

### Manual Testing Checklist
After each phase:
- [ ] Piece collision works
- [ ] Ghost displays correctly
- [ ] Goop merging works
- [ ] Sticky gravity works
- [ ] Popping works (timing, pressure gate)
- [ ] Cracks spawn and seal correctly
- [ ] Score calculates correctly
- [ ] Pressure/timer works
- [ ] Win/lose conditions work
- [ ] Audio plays at right times

---

## Risk Mitigation

1. **Regression Risk**
   - Keep original Game.tsx until new architecture is verified
   - Feature flag to switch between old/new
   - Automated tests for critical paths

2. **Scope Creep**
   - Each phase is a complete, working state
   - Don't move to next phase until current phase verified
   - PRD defines scope boundaries

3. **Performance**
   - Profile after Phase 2 (state extraction)
   - Event bus is synchronous (no async overhead)
   - React re-renders minimized by proper memoization

---

## Open Questions for User

1. **Phase 0:** Confirm piece/board coupling desired behavior for current prototype
2. **Phase 4:** Should piece auto-grab on spawn, or require explicit grab action?
3. **Phase 5:** How long should transitions take? (Tunable via upgrades later)
4. **Phase 7:** First complication to implement?

---

*Document Version: 1.0*
*Last Updated: January 2026*
