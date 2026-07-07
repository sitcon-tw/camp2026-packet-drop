---
name: project-state
description: camp2026-packet-drop ACK! game build status and architecture
metadata:
  type: project
---

# ACK! 遊戲 MVP 進度

**Why:** Camp 2026 展示用，教導網路協議（封包、ACK、重傳）的多人遊戲。

## Architecture

- SvelteKit (Svelte 5 runes) — frontend, port 5173 dev
- Bun WS server — `game/server.ts`, port 8080
- 兩 process 開發模式；prod 可合併為單一 Bun.serve

## Dev 執行方式

```bash
# Terminal 1
bun run dev:game   # WS server port 8080

# Terminal 2
bun run dev        # SvelteKit port 5173
```

## 完成項目 (i1-i3, s1-s11, c1-c9 部分)

- `src/lib/types.ts` — shared types (RoomState, Fragment, Phase, Player, ClientMsg, ServerMsg)
- `src/lib/config.ts` — CONFIG + MESSAGE_POOL
- `game/room.ts` — Room state machine (lobby→inspect→assemble→win)
- `game/server.ts` — Bun.serve WebSocket server
- `src/routes/+page.svelte` — join/create room UI
- `src/routes/game/[roomId]/+page.ts` — route load
- `src/routes/game/[roomId]/+page.svelte` — main game UI (all phases + drag DnD + toast)

## 遊戲流程

1. Lobby: N 玩家 join → 全按 Ready → 自動開始
2. Inspect: 每輪各玩家收到 1 fragment（可能 corrupt）→ Log → ARM ACK
3. 全員 ACK 後 → 下一輪（buffer 未滿）或 Assemble（buffer 滿）
4. Assemble: 拖曳排列 fragment chips → Submit
5. Win: 第一個正確提交者勝

## 待做

- c9: 分數顯示（目前只顯示勝者名稱）
- c10: Toast 已實作
- 重連 resync 機制已實作
- 生產部署: 合併為單一 Bun server

**How to apply:** 繼續開發時從上述路由結構繼續；不需要額外資料庫（純 in-memory game state）。
