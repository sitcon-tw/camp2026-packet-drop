# 封包掉包遊戲 · Packet Drop

> A multiplayer classroom game that turns a team of 6 players into a **TCP connection** — they *become* the packets, feel what happens when packets arrive out of order or get corrupted, and physically perform the retransmission handshake that makes TCP reliable.

Built for **SITCON Camp 2026**. Next.js 14 + Prisma 5 + SQLite. Phone-friendly, no install for players (just a URL).

---

## 🎯 What players are meant to learn

The whole game is a hands-on analogy for **how TCP delivers data reliably over an unreliable network**. By the end, players should *feel* — not just memorize — these four ideas:

| TCP concept | How the game makes them feel it |
|-------------|--------------------------------|
| **Fragmentation / Segmentation** | A single message (the puzzle) is too big to send at once, so it's split into **6 packets**. No single player can solve the puzzle alone — each only holds one fragment. They must combine fragments to reconstruct the original message. |
| **Out-of-order delivery** | Each player receives a *random* fragment (packet `03/06` might reach you before `01/06`). The shared notes start scrambled. Players must **reorder by sequence number** to rebuild the message correctly — exactly what a TCP receiver does with sequence numbers. |
| **Packet loss & corruption** | The facilitator can "drop" packets mid-game. Affected fragments turn into garbled noise (`█▓▒░乱?#`). The data is now unreliable and unreadable. |
| **Acknowledgement & retransmission (ACK)** | To recover a corrupted packet, **every player must press ACK**. Only when the whole team acknowledges does the data retransmit cleanly. This mirrors TCP's positive-acknowledgement-with-retransmission: the sender won't move on until it hears back. |

The deeper takeaway: **reliability isn't free.** TCP achieves it through coordination overhead — sequence numbers, acknowledgements, and re-sends. The game makes that overhead something players do with their own hands and have to agree on as a group.

---

## 🕹️ Game flow

### Setup
1. A facilitator opens the **admin panel** (`/admin`) on a projector.
2. Players open the game URL on their phones and **enter their group number (1–6)**.
3. Each player is **auto-assigned a seat (1–6)** — this is their "node" in the connection.
4. Once enough players have joined, anyone can hit **Start** (or the facilitator force-starts).

> 💡 A group is a TCP connection. The 6 seats are the byte-stream positions. There are up to 6 groups playing in parallel, each an independent connection.

### Each round = one puzzle = one "message" being transmitted

The game has **3 rounds**, each a self-contained logic puzzle split into 6 packets:

| Round | Puzzle | What they reconstruct |
|-------|--------|----------------------|
| **1 · 神秘顏色** | Deduce which color ball is in bags A/B/C/D | 1 intro packet + 4 clue packets + 1 question packet |
| **2 · 神秘數字** | Find the mystery 3-digit number from clues | same 6-packet structure |
| **3 · 職業推理** | Work out each person's profession | same 6-packet structure |

Within a round, the loop is:

```
1. RECEIVE   Each player is handed ONE of the 6 fragments (randomly assigned).
             → "My Packet" card shows e.g. 【封包 03/06】線索二：袋子 B 是綠色

2. IMPORT    Each player taps "Import to Shared Notes".
             → Their fragment joins the team's shared, collaborative note.
             (Like packets arriving in the receive buffer.)

3. REORDER   The shared notes arrive SCRAMBLED. The team drag-sorts the
             fragments into correct order using the 封包 NN/06 sequence numbers.
             → This rebuilds the original message: intro → clues → question.

4. SOLVE     With the message reassembled, the team reads the full puzzle,
             solves the logic problem together, and submits ONE team answer.

5. ADVANCE   Facilitator moves the group to the next round (new puzzle).
```

### ⚠️ The packet-loss event (the climax mechanic)

At any point during a round, the facilitator can **trigger a packet loss** on a group from the admin panel:

1. **Corruption hits.** A random 50–80% of the team's fragments turn into garbage characters. The puzzle becomes unsolvable — you literally can't read the corrupted clues.
2. **A red ACK banner appears** for everyone, showing each player's ACK status.
3. **Everyone must press ACK.** The banner tracks progress (`3/6 acknowledged`). It is **unanimous** — one player who hasn't ACKed blocks the whole retransmission.
4. **Once all players ACK, the data retransmits** — corruption clears on the next sync, and the clean fragments come back.

This is the emotional core of the game: the team experiences that **a connection stalls until everyone acknowledges**, and that recovery requires the whole group, not just the affected players.

### Finishing
After round 3 is submitted and the facilitator advances, the group sees a **completion screen**. Every group runs independently, so faster teams can finish while others are still mid-round.

---

## 🧩 Why the design choices map to real TCP

- **Sequence numbers** → the `封包 NN/06` labels. Reordering is only possible *because* each fragment is numbered, just as TCP uses byte sequence numbers to reassemble a stream.
- **Random fragment delivery** → models the fact that the network gives **no ordering guarantee**; order is the receiver's job to restore.
- **Shared collaborative notes** → the **receive buffer** where segments accumulate before being delivered "in order" to the application (the team's brain).
- **Unanimous ACK** → an exaggerated, deliberately strict version of acknowledgement to make the coordination cost visceral. Real TCP ACKs are per-segment, but the *principle* — no progress without acknowledgement — is identical.
- **Deterministic corruption** → corruption is computed from a seed, not re-randomized each poll, so a corrupted clue looks *stably* broken (not flickering). Pedagogically this matters: a dropped packet stays dropped until retransmitted.

---

## 🚀 Running it

```bash
pnpm install
npx prisma migrate dev --name init   # create the SQLite DB
pnpm dev                             # http://localhost:3000
```

| Route | Who | Purpose |
|-------|-----|---------|
| `/` | Players | Enter group number → auto-join → waiting lobby → start |
| `/game/[teamNumber]?slot=N` | Players | The actual gameplay (fragment, notes, answer, ACK) |
| `/admin` | Facilitator | Start games, trigger packet loss, advance rounds, reset |

### Facilitator playbook
1. Project `/admin`.
2. Have each table pick a group number; players join on their phones.
3. Hit **Start** per group once everyone's in.
4. Let them import → reorder → solve round 1.
5. **Trigger a packet loss** on a group mid-round to teach the ACK mechanic — watch them realize they all have to press ACK.
6. **Next** to advance rounds. **Reset** (or **Reset All**) between sessions.

---

## 🛠️ Tech notes

- **No WebSockets** — clients poll every 2s with a skip-if-unchanged guard, so re-renders (and drag-sort DOM remeasures) only happen when data actually changes.
- **Stateless fragment assignment** — which seat gets which fragment is derived from a seeded shuffle (`teamNumber`, `round`, `slot`), so it's reproducible without storing assignments.
- See [`CLAUDE.md`](CLAUDE.md) for the full architecture, file map, and database schema.

---

*Language: Traditional Chinese (繁體中文). UI chrome is bilingual; puzzle content is Chinese.*
