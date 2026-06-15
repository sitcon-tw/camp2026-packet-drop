# CLAUDE.md — 封包掉包遊戲

**語言：** [English](CLAUDE.md) · 繁體中文

> **太長一句話** — Camp 2026 多人遊戲，教 TCP 封包概念（分片、重排、掉包、重傳）。6 隊 × 6 人。每回合伺服器把一道 6 片謎題撒給玩家；玩家把片段匯入共同筆記、拖曳排序、提交一個答案。主持人可損毀片段（掉包），需全員 ACK 才能清除。技術：Next.js 14 App Router + Prisma 5 + SQLite，以每 2 秒輪詢同步。

遊戲玩法／學習面的敘述見 [`README.md`](README.zh-TW.md)。本檔是**開發者參考**。

---

## 技術棧

> **太長一句話** — Next.js 14（App Router、TS）+ Prisma 5/SQLite + @dnd-kit 拖曳排序 + Tailwind。無 WebSocket——全靠每 2 秒輪詢。

- **框架**：Next.js 14 App Router、TypeScript
- **資料庫**：Prisma 5 + SQLite（`prisma/dev.db`）
- **拖曳排序**：`@dnd-kit/core`、`@dnd-kit/sortable`、`@dnd-kit/utilities`
- **樣式**：Tailwind CSS（UniFi 風深色主題，`net-*` 色盤）
- **更新**：每 2 秒輪詢——無 WebSocket

---

## 工作流程如何運作（資料流）

> **太長一句話** — 片段從不「按玩家儲存」。伺服器用種子洗牌**計算**某座位持有哪一段。玩家 POST **import** → 寫入一筆 `NoteFragment` 到該隊共同筆記。**sort** 更新每筆的 `position`。**state** GET 回傳排序後的片段給所有人，若有進行中的 `PacketLossEvent` 則套上即時損毀。損毀是**計算**出來的，從不儲存。

追蹤一個片段在系統中的流動：

```
1. 派發（計算，不儲存）
   game-logic.ts → getFragmentIndex(teamNumber, round, slot)
   對 [0..5] 做種子 LCG 洗牌 → 這個座位持有哪一個謎題片段。
   相同輸入永遠得到相同片段 → 不寫資料庫、重啟後仍一致。

2. 接收
   GET /api/game/[teamNumber]/state?slot=N
   → 算出該座位的片段索引 → 把該片段文字當成 `myFragment` 回傳。

3. 匯入
   POST /api/game/[teamNumber]/import { slot }
   → 在該隊當前回合的 TeamNote 底下 upsert 一筆 NoteFragment
     (noteId, slot, origContent, position = 排在最後)。此時它進入「共同」筆記。

4. 重排
   POST /api/game/[teamNumber]/sort { order: number[] }
   → 改寫每筆 NoteFragment 的 `position` 以符合新順序。
   （用戶端是 fire-and-forget；2 秒輪詢讓大家一致。）

5. 讀回
   GET /api/game/[teamNumber]/state?slot=N  （每 2 秒，所有玩家）
   → 回傳依 `position` 排序的 notes.fragments。
   → 若本回合存在未解決的 PacketLossEvent，受影響座位的文字會在「輸出時」
     經過 corruptText() ——損毀是在讀取時依 (eventId, slot) 計算，從不寫進資料庫。

6. 作答
   POST /api/game/[teamNumber]/answer { answer }
   → 寫入該回合的 TeamNote.answer（一隊一個答案）。
```

**掉包／ACK 流程：**

```
觸發  POST /api/admin/[teamNumber]/trigger-loss
      → 建立一筆 PacketLossEvent，affectedSlots = 已加入座位中隨機 50–80%，
        ackSlots = []、resolvedAt = null。

損毀  每位玩家的下一次 state GET 會把受影響片段顯示為亂碼
      （經由 corruptText 計算，見上面步驟 5）。

ACK   POST /api/game/[teamNumber]/ack { slot }
      → 把 slot 加進 ackSlots。當 ackSlots ⊇ 所有已加入的玩家座位時，
        設定 resolvedAt = now()。

清除  resolvedAt 一設定，事件就不再「進行中」，因此下一次 state GET
      回傳乾淨（未損毀）的文字。
```

核心觀念：**分派與損毀都是穩定輸入的純函式**，所以真正被持久化的只有：玩家、已匯入的片段、它們的位置、團隊答案，以及掉包事件的記錄。

---

## 開發指令

> **太長一句話** — `pnpm install` → `npx prisma migrate dev --name init` → `pnpm dev`。

```bash
pnpm dev          # 在 http://localhost:3000 啟動開發伺服器
pnpm build        # 正式環境建置
npx prisma migrate dev   # 執行資料庫遷移
npx prisma studio        # 開啟資料庫 GUI
```

複製專案後：
```bash
pnpm install
npx prisma migrate dev --name init
pnpm dev
```

---

## 路由

> **太長一句話** — `/` = 玩家加入＋大廳（同一頁，不跳轉）、`/game/[teamNumber]?slot=N` = 遊戲、`/admin` = 主持人控制。

| 路徑 | 說明 |
|------|------|
| `/` | 加入頁——輸入組別、自動分配座位、然後候場大廳 |
| `/game/[teamNumber]?slot=N` | 遊戲頁——封包卡片、共同拖曳排序筆記、作答輸入 |
| `/admin` | 管理面板——開始、觸發掉包、下一關、單隊或全部重置 |

沒有獨立的大廳路由——加入頁在同一個網址上處理「輸入組別 → 自動加入 → 候場」。（`/lobby/[teamNumber]` 是早期版本的遺留，主流程已不再導向它。）

---

## 遊戲生命週期

> **太長一句話** — `waiting`（大廳）→ `playing` 第 1→3 關 → `finished`。管理員推進關卡，並可在任一回合中發動掉包事件。

1. **大廳**（`status: waiting`、`round: 0`）：玩家輸入組別（1–6）。系統自動分配座位（1–6）。等到人夠了，或強制開始。
2. **第 1–3 關**（`status: playing`）：每關用不同的 6 片謎題。每位玩家收到一個片段（`lib/game-logic.ts` 的種子洗牌）。玩家匯入 → 拖曳排序 → 提交答案。
3. **掉包事件**（回合中隨時）：管理員觸發 `PacketLossEvent`。受影響片段顯示損毀（可重現——相同種子＝相同損毀，不閃爍）。需全員 ACK 才解決。
4. **完成**（`status: finished`）：第 3 關推進後，玩家看到完成畫面。

---

## 重要檔案

> **太長一句話** — `lib/` 放可重現邏輯＋謎題＋型別；`app/api/` 放路由處理器，分成 team／game／admin；`components/` 放三個遊戲小元件。

```
lib/
  db.ts            — Prisma client 單例（globalThis 模式，供熱重載）
  game-logic.ts    — getFragmentIndex() 種子洗牌、corruptText() 可重現損毀
  puzzles.ts       — 3 道謎題 × 各 6 片段（繁體中文）
  types.ts         — GameStateData、FragmentData、NoteFragmentData、ActiveAckData

app/api/
  team/join/                  — POST：以指定座位加入（舊版）
  team/[teamNumber]/
    state/                    — GET：隊伍狀態（大廳輪詢用）
    auto-join/                — POST：自動分配下一個空位並加入
    start/                    — POST：開始遊戲（status → playing、round → 1）
  game/[teamNumber]/
    state/                    — GET ?slot=N：玩家的完整 GameStateData
    import/                   — POST：把我的片段匯入共同筆記
    sort/                     — POST：重排筆記片段
    ack/                      — POST：把我的座位加進 PacketLossEvent.ackSlots
    answer/                   — POST：提交本回合團隊答案
  admin/
    [teamNumber]/
      trigger-loss/           — POST：建立 PacketLossEvent（50–80% 座位受影響）
      next-round/             — POST：推進關卡或設為 finished
      reset/                  — POST：把單隊重置為 waiting/round 0
    reset-all/                — POST：重置全部 6 隊

components/
  FragmentCard.tsx    — 「我的封包」卡片：標題列、內容、匯入鈕
  SortableNotes.tsx   — DndKit 拖曳排序清單（TouchSensor 行動裝置延遲 200ms）
  AckBanner.tsx       — 掉包事件進行中時固定於底部的橫幅
```

---

## 資料庫結構（Prisma 5 / SQLite）

> **太長一句話** — `Team` 底下有多個 `Player`、多個 `TeamNote`（每回合一個）與多個 `PacketLossEvent`。一個 `TeamNote` 底下有多個 `NoteFragment`（已匯入、可排序的片段）。`affectedSlots`／`ackSlots` 是 JSON 陣列。

```
Team            — number (1–6)、status (waiting|playing|finished)、round (0–3)
Player          — teamId、slot (1–6) — unique(teamId, slot)
TeamNote        — teamId、round、answer — unique(teamId, round)
NoteFragment    — noteId、slot、origContent、position — unique(noteId, slot)
PacketLossEvent — teamId、round、affectedSlots (JSON)、ackSlots (JSON)、resolvedAt
```

---

## 效能筆記

> **太長一句話** — GPU 飆高的 bug 來自每次輪詢都重新渲染（DndKit 每 2 秒重新量測 DOM）加上無限 CSS 動畫。修法：輪詢到的 JSON 沒變就跳過 `setState`，並移除動畫 box-shadow／backdrop-blur。

- `fetchingRef` 守衛避免並發的輪詢請求
- `prevJsonRef` 以 JSON 比對，在資料未變時跳過 `setGameState()`——對 DndKit 至關重要（避免每 2 秒重新量測 DOM）
- 固定式標題列不用 `backdrop-blur`（GPU 繪製成本）
- 不用無限 CSS 動畫（box-shadow 閃爍是 GPU 飆高的根因）
- 排序處理器是 fire-and-forget；匯入與 ACK 透過 `prevJsonRef.current = ''` 強制刷新

---

## Prisma 注意事項

> **太長一句話** — 維持 Prisma 5。不要升級到 7。

本專案使用 **Prisma 5**（非 7）。Prisma 7 改了 SQLite 的設定格式，需要 `prisma.config.ts` ＋ libSQL 介面卡。不要升級。
