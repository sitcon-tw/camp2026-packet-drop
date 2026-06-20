// All timing params read from process.env at startup (game/server.ts context only)
const T_ACK_MS = parseInt(process.env["T_ACK"] ?? "3000");

export const CONFIG = {
        T_ack: T_ACK_MS,
        T_afk: parseInt(process.env["T_AFK"] ?? String(T_ACK_MS * 2)),
        wrong_submit_penalty: parseInt(process.env["WRONG_PENALTY"] ?? "3000"),
        guarantee_first_corrupt: process.env["GUARANTEE_CORRUPT"] !== "false",
        corruption_chance: parseFloat(process.env["CORRUPTION_CHANCE"] ?? "0.4"),
        corrupt_chars: "▓░█▒■□▪▫●○◆◇✕✗",
        min_players: parseInt(process.env["MIN_PLAYERS"] ?? "3"),
        max_rounds: parseInt(process.env["MAX_ROUNDS"] ?? "3"),
};

export interface MessageEntry {
        text: string; // the question spelled out by sorted fragments
        answer: string; // expected answer (case-insensitive compare)
}

// text = question spelled out by reassembled fragments; answer = correct response
export const MESSAGE_POOL: MessageEntry[] = [
        { text: "WHAT FIXES LOST PACKETS IN TCP", answer: "RETRANSMISSION" },
        { text: "HOW MANY STEPS OPEN A TCP LINK", answer: "THREE" },
        { text: "WHAT LAYER HIDES NETWORK CHAOS", answer: "TRANSPORT" },
        { text: "WHO FORWARDS PACKETS HOP BY HOP", answer: "ROUTER" },
        { text: "WHAT CONFIRMS DATA WAS RECEIVED", answer: "ACKNOWLEDGEMENT" },
        { text: "WHAT FIELD DETECTS BIT ERRORS", answer: "CHECKSUM" },
        { text: "WHAT BREAKS DATA INTO SEGMENTS", answer: "FRAGMENTATION" },
        { text: "WHAT WRAPS DATA WITH METADATA", answer: "header" },
        { text: "WHAT PREVENTS DUPLICATE PACKETS", answer: "SEQUENCE NUMBER" },
        { text: "WHAT PROTOCOL IS CONNECTIONLESS", answer: "UDP" },
];
