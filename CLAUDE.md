# CLAUDE.md — 封包掉包遊戲

**Languages:** English · [繁體中文](CLAUDE.zh-TW.md)

> **TL;DR** — Camp 2026 multiplayer game teaching TCP packet concepts (fragmentation, reordering, packet loss, retransmission). 6 teams × 6 players. Each round, the server scatters a 6-fragment puzzle across the players; they import fragments into a shared note, drag-sort them into order, and submit one answer. The facilitator can corrupt fragments (packet loss), which all players must ACK to clear. Stack: Next.js 14 App Router + Prisma 5 + SQLite, synced by 2s polling.

For the gameplay/learning narrative, see [`README.md`](README.md). This file is the **developer reference**.

---

## Stack

> **TL;DR** — Next.js 14 (App Router, TS) + Prisma 5/SQLite + @dnd-kit for drag-sort + Tailwind. No WebSockets — everything syncs by 2s polling.

- **Framework**: Next.js 14 App Router, TypeScript
- **Database**: Prisma 5 + SQLite (`prisma/dev.db`)
- **Drag-sort**: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
- **Styling**: Tailwind CSS (UniFi-inspired dark theme, `net-*` palette)
- **Updates**: Polling every 2s — no WebSockets

---

## How the workflow works (data flow)

> **TL;DR** — A fragment is never stored "per player." The server *computes* which fragment a seat holds via a seeded shuffle. The player POSTs **import** → that writes a `NoteFragment` row into the team's shared note. **sort** updates each row's `position`. The **state** GET returns the ordered fragments to everyone, applying live corruption if a `PacketLossEvent` is active. Corruption is *computed*, never stored.

Trace one fragment through the system:

```
1. DISTRIBUTE (computed, not stored)
   game-logic.ts → getFragmentIndex(teamNumber, round, slot)
   seeded LCG shuffle of [0..5] → which puzzle fragment THIS seat holds.
   Same inputs always give the same fragment → no DB write, survives restarts.

2. RECEIVE
   GET /api/game/[teamNumber]/state?slot=N
   → resolves the seat's fragment index → returns that fragment's text as `myFragment`.

3. IMPORT
   POST /api/game/[teamNumber]/import { slot }
   → upserts a NoteFragment row (noteId, slot, origContent, position = next in line)
     into the team's TeamNote for the current round. Now it's in the SHARED note.

4. REORDER
   POST /api/game/[teamNumber]/sort { order: number[] }
   → rewrites the `position` field of each NoteFragment to match the new order.
   (Client is fire-and-forget; the 2s poll reconciles everyone.)

5. READ BACK
   GET /api/game/[teamNumber]/state?slot=N  (every 2s, all players)
   → returns notes.fragments ordered by `position`.
   → IF an unresolved PacketLossEvent exists for this round, each affected slot's
     text is run through corruptText() ON THE WAY OUT — corruption is computed at
     read time from (eventId, slot), never written to the DB.

6. ANSWER
   POST /api/game/[teamNumber]/answer { answer }
   → writes TeamNote.answer for the round (one answer per team).
```

**Packet-loss / ACK flow:**

```
TRIGGER  POST /api/admin/[teamNumber]/trigger-loss
         → creates a PacketLossEvent with affectedSlots = random 50–80% of joined slots,
           ackSlots = [], resolvedAt = null.

CORRUPT  Next state GET for each player shows affected fragments as garble
         (computed via corruptText, see step 5 above).

ACK      POST /api/game/[teamNumber]/ack { slot }
         → adds slot to ackSlots. When ackSlots ⊇ all joined player slots,
           sets resolvedAt = now().

CLEAR    Once resolvedAt is set, the event is no longer "active", so the next
         state GET returns clean (uncorrupted) text.
```

The key idea: **assignment and corruption are both pure functions of stable inputs**, so the only things actually persisted are players, imported fragments, their positions, the team answer, and the loss-event bookkeeping.

---

## Dev commands

> **TL;DR** — `pnpm install` → `npx prisma migrate dev --name init` → `pnpm dev`.

```bash
pnpm dev          # start dev server on http://localhost:3000
pnpm build        # production build
npx prisma migrate dev   # run DB migrations
npx prisma studio        # open DB GUI
```

After cloning:
```bash
pnpm install
npx prisma migrate dev --name init
pnpm dev
```

---

## Routes

> **TL;DR** — `/` = player join + lobby (one page, no redirect), `/game/[teamNumber]?slot=N` = gameplay, `/admin` = facilitator controls.

| Path | Description |
|------|-------------|
| `/` | Join page — enter group number, auto-assigned seat, then waiting lobby |
| `/game/[teamNumber]?slot=N` | Game page — fragment card, shared drag-sort notes, answer input |
| `/admin` | Admin panel — start, trigger packet loss, next round, reset per group or all |

There is no separate lobby route — the join page handles group input → auto-join → waiting all on one URL. (`/lobby/[teamNumber]` still exists from an earlier iteration but the main flow no longer navigates to it.)

---

## Game lifecycle

> **TL;DR** — `waiting` (lobby) → `playing` rounds 1→3 → `finished`. The admin advances rounds and can fire packet-loss events during any round.

1. **Lobby** (`status: waiting`, `round: 0`): Players enter group number (1–6). System auto-assigns a seat (1–6). Wait until enough players join, or force-start.
2. **Rounds 1–3** (`status: playing`): Each round uses a different 6-fragment puzzle. Each player receives one fragment (seeded shuffle in `lib/game-logic.ts`). Players import → drag-sort → submit answer.
3. **Packet-loss event** (any time during a round): Admin triggers a `PacketLossEvent`. Affected fragments show corrupted (deterministic — same seed = same corruption, no flicker). ALL players must ACK to resolve.
4. **Finished** (`status: finished`): After round 3 advances, players see the completion screen.

---

## Key files

> **TL;DR** — `lib/` holds the deterministic logic + puzzles + types; `app/api/` holds the route handlers grouped as team / game / admin; `components/` holds the three gameplay widgets.

```
lib/
  db.ts            — Prisma client singleton (globalThis pattern for hot reload)
  game-logic.ts    — getFragmentIndex() seeded shuffle, corruptText() deterministic corruption
  puzzles.ts       — 3 puzzles × 6 fragments each (Traditional Chinese)
  types.ts         — GameStateData, FragmentData, NoteFragmentData, ActiveAckData

app/api/
  team/join/                  — POST: join with specific slot (legacy)
  team/[teamNumber]/
    state/                    — GET: team state (used by lobby polling)
    auto-join/                — POST: auto-assign next free slot and join
    start/                    — POST: start game (status → playing, round → 1)
  game/[teamNumber]/
    state/                    — GET ?slot=N: full GameStateData for a player
    import/                   — POST: import my fragment to shared notes
    sort/                     — POST: reorder note fragments
    ack/                      — POST: add my slot to PacketLossEvent.ackSlots
    answer/                   — POST: submit team answer for current round
  admin/
    [teamNumber]/
      trigger-loss/           — POST: create PacketLossEvent (50–80% slots affected)
      next-round/             — POST: advance round or set finished
      reset/                  — POST: reset one group to waiting/round 0
    reset-all/                — POST: reset all 6 groups

components/
  FragmentCard.tsx    — "My Packet" card with header bar, content, import button
  SortableNotes.tsx   — DndKit drag-sort list (TouchSensor 200ms delay for mobile)
  AckBanner.tsx       — Fixed bottom banner during active PacketLossEvent
```

---

## Database schema (Prisma 5 / SQLite)

> **TL;DR** — `Team` has many `Player`s, `TeamNote`s (one per round), and `PacketLossEvent`s. A `TeamNote` has many `NoteFragment`s (the imported, sortable fragments). `affectedSlots`/`ackSlots` are JSON arrays.

```
Team            — number (1–6), status (waiting|playing|finished), round (0–3)
Player          — teamId, slot (1–6) — unique(teamId, slot)
TeamNote        — teamId, round, answer — unique(teamId, round)
NoteFragment    — noteId, slot, origContent, position — unique(noteId, slot)
PacketLossEvent — teamId, round, affectedSlots (JSON), ackSlots (JSON), resolvedAt
```

---

## Performance notes

> **TL;DR** — The GPU-spike bug came from re-rendering on every poll (DndKit remeasured the DOM every 2s) plus infinite CSS animations. Fixed by skipping `setState` when polled JSON is unchanged, and removing animated box-shadows / backdrop-blur.

- `fetchingRef` guard prevents concurrent poll fetches
- `prevJsonRef` JSON comparison skips `setGameState()` when data unchanged — critical for DndKit (prevents DOM remeasure every 2s)
- No `backdrop-blur` in sticky headers (GPU paint cost)
- No infinite CSS animations (box-shadow flicker was the root cause of the GPU spike)
- Sort handler is fire-and-forget; import and ACK force-refresh via `prevJsonRef.current = ''`

---

## Prisma note

> **TL;DR** — Stay on Prisma 5. Do not upgrade to 7.

This project uses **Prisma 5** (not 7). Prisma 7 changed the SQLite config format and requires `prisma.config.ts` + a libSQL adapter. Do not upgrade.
