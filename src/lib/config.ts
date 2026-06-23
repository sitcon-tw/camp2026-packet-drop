// All timing params read from process.env at startup (game/server.ts context only)
const T_ACK_MS = parseInt(process.env["T_ACK"] ?? "3000");

export const CONFIG = {
        T_ack: T_ACK_MS,
        wrong_submit_penalty: parseInt(process.env["WRONG_PENALTY"] ?? "3000"),
        guarantee_first_corrupt: process.env["GUARANTEE_CORRUPT"] !== "false",
        corruption_chance: parseFloat(process.env["CORRUPTION_CHANCE"] ?? "0.4"),
        corrupt_chars: "▓░█▒■□▪▫●○◆◇✕✗",
        min_players: parseInt(process.env["MIN_PLAYERS"] ?? "5"),
        // How long a delivered fragment stays visible before it vanishes (client flash window)
        reveal_ms: parseInt(process.env["REVEAL_MS"] ?? "15000"),
};

// Only TWO questions per game: a sentence-memory round, then a logic-clue round.
export const MAX_ROUNDS = 2;

export type QuestionType = "sentence" | "clues";

// Q1: a sentence split into char fragments, flashed, transcribed from memory.
export interface SentenceQuestion {
        type: "sentence";
        sentence: string; // split into N fragments, distributed one per player
        prompt: string; // shown in answer phase (the sentence itself is NOT re-shown)
        answer: string; // expected answer (normalized compare)
}

// Q2: a logic puzzle whose CLUES are the fragments, flashed, transcribed from memory.
export interface CluesQuestion {
        type: "clues";
        clues: string[]; // each clue is one fragment, distributed across players
        prompt: string; // the deduction question, shown in answer phase
        answer: string; // expected answer (normalized compare)
}

export type Question = SentenceQuestion | CluesQuestion;

// ── Q1 pool: sentence reassembled from memory, then answered ───────────────
export const Q1_POOL: SentenceQuestion[] = [
        { type: "sentence", sentence: "WHAT FIXES LOST PACKETS IN TCP", prompt: "讀出你們記錄的題目句子，輸入答案", answer: "RETRANSMISSION" },
        { type: "sentence", sentence: "HOW MANY STEPS OPEN A TCP LINK", prompt: "讀出你們記錄的題目句子，輸入答案", answer: "THREE" },
        { type: "sentence", sentence: "WHAT LAYER HIDES NETWORK CHAOS", prompt: "讀出你們記錄的題目句子，輸入答案", answer: "TRANSPORT" },
        { type: "sentence", sentence: "WHO FORWARDS PACKETS HOP BY HOP", prompt: "讀出你們記錄的題目句子，輸入答案", answer: "ROUTER" },
        { type: "sentence", sentence: "WHAT CONFIRMS DATA WAS RECEIVED", prompt: "讀出你們記錄的題目句子，輸入答案", answer: "ACKNOWLEDGEMENT" },
        { type: "sentence", sentence: "WHAT FIELD DETECTS BIT ERRORS", prompt: "讀出你們記錄的題目句子，輸入答案", answer: "CHECKSUM" },
        { type: "sentence", sentence: "WHAT BREAKS DATA INTO SEGMENTS", prompt: "讀出你們記錄的題目句子，輸入答案", answer: "FRAGMENTATION" },
];

// ── Q2 pool: scattered logic clues, deduce the ordering ────────────────────
export const Q2_POOL: CluesQuestion[] = [
        {
                type: "clues",
                clues: [
                        "AO 在最左邊",
                        "SHIRO 在最右邊",
                        "AKA 緊鄰在 AO 右邊",
                        "KI 緊鄰在 SHIRO 左邊",
                        "MIDORI 在 AKA 和 KI 中間",
                ],
                prompt: "依線索，由左到右排出 5 個顏色（用空白分隔）",
                answer: "AO AKA MIDORI KI SHIRO",
        },
        {
                type: "clues",
                clues: [
                        "TCP 在 UDP 上面",
                        "IP 在最底層",
                        "HTTP 在最頂層",
                        "TCP 緊鄰在 HTTP 下面",
                        "UDP 緊鄰在 IP 上面",
                ],
                prompt: "依線索，由上到下排出 4 層（用空白分隔）",
                answer: "HTTP TCP UDP IP",
        },
        {
                type: "clues",
                clues: [
                        "ALICE 比 BOB 早送出封包",
                        "CAROL 最後一個送",
                        "DAVE 緊接在 ALICE 之後送",
                        "BOB 緊接在 DAVE 之後送",
                ],
                prompt: "依線索，排出送出封包的先後順序（用空白分隔）",
                answer: "ALICE DAVE BOB CAROL",
        },
];
