# 封包掉包遊戲 · Packet Drop

**Languages:** English · [繁體中文](README.zh-TW.md)

> **TL;DR** — A team of 6 players *becomes* one TCP connection. The game chops a puzzle into 6 numbered packets, scatters them across the players' phones in random order, and lets a facilitator "corrupt" some of them. To win, the team must **reassemble the packets in order** and **recover from packet loss together** — feeling, by hand, exactly how TCP delivers data reliably over an unreliable network.

Built for **SITCON Camp 2026**. Players just open a URL on their phone — no install. Up to 6 teams play in parallel.

---

## 🕹️ The core workflow (read this first)

> **TL;DR** — Every round: each player receives **1 of 6 puzzle fragments** → taps **Import** to drop it into the team's shared notes → the team **drag-sorts** the scrambled fragments back into order `01→06` → reads the reassembled puzzle → submits **one team answer**. Do this 3 times (3 puzzles). A packet-loss event can interrupt at any time (see below).

### What's actually happening

A puzzle is one "message" that is too big to send in a single packet. The server **splits it into 6 fragments**, each tagged with a sequence number (`封包 01/06` … `封包 06/06`), and **scatters one fragment to each of the 6 seats in random order**. No single player can see the whole puzzle — they must pool and reorder their fragments to rebuild it.

```
              SERVER  ── holds one 6-piece puzzle for this round
                 │
                 │  splits into 6 numbered fragments,
                 │  scatters ONE to each seat at random
                 ▼
   ┌────────┬────────┬────────┬────────┬────────┬────────┐
  Seat 1   Seat 2   Seat 3   Seat 4   Seat 5   Seat 6
  封包03   封包01   封包05   封包02   封包06   封包04      ← each phone sees only ITS fragment
   │        │        │        │        │        │
   └────────┴──── every player taps "Import" ───┴────────┘
                 │
                 ▼
        SHARED NOTES  ── fragments arrive SCRAMBLED (import order ≠ sequence order)
        03 · 01 · 05 · 02 · 06 · 04
                 │
                 │  the team DRAG-SORTS by sequence number
                 ▼
        01 · 02 · 03 · 04 · 05 · 06   ── message is now readable: intro → clues → question
                 │
                 ▼
        team SOLVES the puzzle together  →  submits ONE team answer  →  next round
```

### Step by step (one round)

| # | Step | Who | What happens on screen |
|---|------|-----|------------------------|
| 0 | **Distribute** | Server | When the round starts, the server hands each seat one fragment. Seat→fragment mapping is random *but stable* (a seeded shuffle), so it never reshuffles mid-round. |
| 1 | **Receive** | Each player | Your phone's **"My Packet"** card shows your one fragment, e.g. `【封包 03/06】線索二：袋子 B 是綠色`. You can't see anyone else's. |
| 2 | **Import** | Each player | Tap **Import to Shared Notes**. Your fragment is written into the team's shared note — now everyone on the team can see it. |
| 3 | **Reorder** | Whole team | As fragments are imported they appear in the shared notes in *import* order, i.e. scrambled. The team **drag-sorts** them into `01→06` using the `封包 NN/06` labels. The notes sync every 2s, so everyone sees the same order. |
| 4 | **Solve** | Whole team | Once ordered, the fragments read as a coherent message (intro → 4 clues → question). The team solves the logic puzzle and submits **one** answer for the whole team. |
| 5 | **Advance** | Facilitator | Facilitator clicks **Next** → the server loads the next puzzle and the loop repeats. After round 3, the team sees a completion screen. |

### Worked example — Round 1 「神秘顏色」

The puzzle: four bags A/B/C/D each hold a ball of a different color (red/blue/yellow/green). The 6 fragments are:

| Sequence | Fragment content |
|----------|------------------|
| `封包 01/06` | Intro: 4 bags, 4 colors, one each |
| `封包 02/06` | Clue 1: bag A is *not* red, *not* blue |
| `封包 03/06` | Clue 2: bag B *is* green |
| `封包 04/06` | Clue 3: bag C is *not* yellow |
| `封包 05/06` | Clue 4: bag D is *not* green, *not* yellow |
| `封包 06/06` | The question + answer format |

Each player gets one of these in random order. Only after the team imports all 6 and sorts them `01→06` does the chain of clues make sense — then they deduce **A=黃, B=綠, C=紅, D=藍** and submit it.

---

## ⚠️ The packet-loss event (the climax mechanic)

> **TL;DR** — The facilitator can "drop" packets on a team mid-round. Random fragments turn into garbage characters and the puzzle becomes unreadable. A red banner appears for **everyone**, and **every single player must tap ACK** before the data retransmits and the corruption clears. One person not ACKing blocks the whole team.

What happens, in order:

1. **Trigger.** The facilitator clicks **Loss** on a team. The server marks a random **50–80% of seats** as "affected."
2. **Corruption appears.** On the next 2s sync, the affected fragments — both in the player's "My Packet" card *and* in the shared notes — turn into noise like `█▓▒░乱?#`. The clues are now unreadable, so the puzzle can't be solved.
3. **Everyone must ACK.** A red banner pops up **for the whole team** (not just affected players), showing live progress like `3/6 acknowledged`. It is **unanimous** — every joined player must press **ACK**.
4. **Retransmit.** When the *last* player ACKs, the server resolves the event. On the next sync the corruption clears and the clean fragments come back.

This is the emotional core: the team feels that **a connection stalls until everyone acknowledges**, and that recovery is a *group* responsibility, not just the affected players'.

---

## 🎯 What players learn

> **TL;DR** — Four TCP ideas, felt rather than memorized: data is **fragmented**, packets arrive **out of order**, packets can be **lost/corrupted**, and recovery needs **acknowledgement (ACK)**. The hidden lesson: *reliability costs coordination.*

| TCP concept | The matching game mechanic |
|-------------|----------------------------|
| **Fragmentation** | The puzzle is too big for one packet, so it's split into 6. No one can solve it alone. |
| **Out-of-order delivery** | Fragments arrive at random seats; the shared notes start scrambled and must be **reordered by sequence number** — exactly a TCP receiver's job. |
| **Packet loss & corruption** | The facilitator drops packets; affected fragments become unreadable garbage. |
| **ACK & retransmission** | Recovery requires **every** player to ACK before the data re-sends — TCP's "no progress without acknowledgement," made unanimous and physical. |

**Why the analogy holds:**

- **Sequence numbers** = the `封包 NN/06` labels. Reordering only works *because* each fragment is numbered — just like TCP byte sequence numbers.
- **Random delivery** = the network gives no ordering guarantee; restoring order is the receiver's job.
- **Shared notes** = the **receive buffer** where segments collect before being delivered in order to the "application" (the team's brain).
- **Unanimous ACK** = a deliberately strict version of acknowledgement so the coordination cost is *felt*. Real ACKs are per-segment, but the principle — no progress without an ACK — is identical.
- **Deterministic corruption** = corruption is computed from a fixed seed, so a dropped packet stays *stably* broken (no flicker) until retransmitted.

---

## 🚀 Running it

> **TL;DR** — `pnpm install` → `npx prisma migrate dev` → `pnpm dev`, then players open `/` and the facilitator opens `/admin`.

```bash
pnpm install
npx prisma migrate dev --name init   # create the SQLite DB
pnpm dev                             # http://localhost:3000
```

| Route | Who | Purpose |
|-------|-----|---------|
| `/` | Players | Enter group number → auto-assigned seat → waiting lobby → start |
| `/game/[teamNumber]?slot=N` | Players | Gameplay: your packet, the shared notes, the answer box, the ACK banner |
| `/admin` | Facilitator | Start games, trigger packet loss, advance rounds, reset a team or all teams |

### Facilitator playbook
1. Project `/admin` on the screen.
2. Each table picks a group number; players join on their phones (seats auto-assign).
3. Hit **Start** for a team once everyone's in.
4. Let them **import → reorder → solve** round 1.
5. **Trigger a packet loss** mid-round to teach the ACK mechanic — watch them realize they *all* have to press ACK.
6. **Next** to advance rounds. **Reset** (or **Reset All**) between sessions.

---

## 🛠️ For developers

> **TL;DR** — Next.js 14 + Prisma 5 + SQLite. State syncs by 2s polling (no WebSockets). Fragment assignment and corruption are both deterministic (seeded), so nothing about who-gets-what needs to be stored. Full architecture is in [`CLAUDE.md`](CLAUDE.md).

- **No WebSockets** — clients poll every 2s with a skip-if-unchanged guard, so re-renders (and drag-sort DOM remeasures) only happen when the data actually changes.
- **Stateless fragment assignment** — which seat gets which fragment is derived from a seeded shuffle of `(teamNumber, round, slot)`, so it's reproducible without storing it.
- See [`CLAUDE.md`](CLAUDE.md) for the architecture, file map, API list, and database schema.

---

*Puzzle content is in Traditional Chinese (繁體中文); UI labels are bilingual. A Chinese version of this document is at [README.zh-TW.md](README.zh-TW.md).*
