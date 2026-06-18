// All timing params read from process.env at startup (game/server.ts context only)
const T_ACK_MS = parseInt(process.env['T_ACK'] ?? '3000');

export const CONFIG = {
	T_ack: T_ACK_MS,
	T_afk: parseInt(process.env['T_AFK'] ?? String(T_ACK_MS * 2)),
	wrong_submit_penalty: parseInt(process.env['WRONG_PENALTY'] ?? '3000'),
	guarantee_first_corrupt: process.env['GUARANTEE_CORRUPT'] !== 'false',
	corruption_chance: parseFloat(process.env['CORRUPTION_CHANCE'] ?? '0.4'),
	corrupt_chars: '▓░█▒■□▪▫●○◆◇✕✗',
};

export interface MessageEntry {
	text: string;
}

// Aim: N*4 … N*8 chars so each chunk is a meaningful slice
export const MESSAGE_POOL: MessageEntry[] = [
	{ text: 'PACKET LOSS IS NOT A BUG' },
	{ text: 'ACKNOWLEDGE EVERY FRAGMENT' },
	{ text: 'RETRANSMIT UNTIL ALL ACK FIRE' },
	{ text: 'DROP PACKETS TEACH THE CLASS' },
	{ text: 'THREE WAY HANDSHAKE OPENS DOOR' },
	{ text: 'HEADERS WRAP THE PAYLOAD SAFE' },
	{ text: 'ROUTERS FORWARD HOP BY HOP PATH' },
	{ text: 'NETWORK STACK HIDES THE CHAOS' },
];
