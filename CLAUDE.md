# CLAUDE.md — 封包掉包遊戲

Camp 2026 interactive multiplayer game teaching TCP packet concepts (fragmentation, reordering, packet loss, retransmission).

## Stack

- **Framework**: Next.js 14 App Router, TypeScript
- **Database**: Prisma 5 + SQLite (`prisma/dev.db`)
- **Drag-sort**: `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities`
- **Styling**: Tailwind CSS (UniFi-inspired dark theme)
- **Updates**: Polling every 2s — no WebSockets

## Dev commands

```bash
pnpm dev          # start dev server on http://localhost:3000
pnpm build        # production build
npx prisma migrate dev   # run DB migrations
npx prisma studio        # open DB GUI
```

After cloning, run:
```bash
pnpm install
npx prisma migrate dev --name init
pnpm dev
```

## Routes

| Path | Description |
|------|-------------|
| `/` | Join page — enter group number, auto-assigned seat, then waiting lobby |
| `/game/[teamNumber]?slot=N` | Game page — fragment card, shared drag-sort notes, answer input |
| `/admin` | Admin panel — start, trigger packet loss, next round, reset per group or all |

There is no separate lobby route — the join page handles group input → auto-join → waiting all on one URL.

## Game flow

1. **Lobby**: Players enter group number (1–6). System auto-assigns a seat (1–6). Wait until enough players join or force-start.
2. **Round 1–3**: Each round uses a different 6-fragment puzzle. Each player receives one fragment (deterministically assigned via seeded LCG shuffle in `lib/game-logic.ts`). Players import their fragment to shared collaborative notes, drag-sort into correct order, submit the answer.
3. **Packet loss event**: Admin triggers a `PacketLossEvent`. Affected players' fragments show as corrupted (deterministic — same seed = same corruption, no flicker). ALL players must press ACK to resolve.

## Key files

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

## Database schema (Prisma 5 / SQLite)

```
Team            — number (1–6), status (waiting|playing|finished), round (0–3)
Player          — teamId, slot (1–6) — unique(teamId, slot)
TeamNote        — teamId, round, answer — unique(teamId, round)
NoteFragment    — noteId, slot, origContent, position — unique(noteId, slot)
PacketLossEvent — teamId, round, affectedSlots (JSON), ackSlots (JSON), resolvedAt
```

## Performance notes

- `fetchingRef` guard prevents concurrent poll fetches
- `prevJsonRef` JSON comparison skips `setGameState()` when data unchanged — critical for DndKit (prevents DOM remeasure every 2s)
- No `backdrop-blur` in sticky headers (GPU paint cost)
- No infinite CSS animations (box-shadow flicker was root cause of GPU spike)
- Sort handler is fire-and-forget; import and ACK force-refresh via `prevJsonRef.current = ''`

## Prisma note

This project uses **Prisma 5** (not 7). Prisma 7 changed the SQLite config format and requires `prisma.config.ts` + libSQL adapter. Do not upgrade.
