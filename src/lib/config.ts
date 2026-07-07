// All timing params read from process.env at startup (game/server.ts context only)
const T_ACK_MS = parseInt(process.env['T_ACK'] ?? '3000');

export const CONFIG = {
	T_ack: T_ACK_MS,
	wrong_submit_penalty: parseInt(process.env['WRONG_PENALTY'] ?? '3000'),
	guarantee_first_corrupt: process.env['GUARANTEE_CORRUPT'] !== 'false',
	corruption_chance: parseFloat(process.env['CORRUPTION_CHANCE'] ?? '0.4'),
	corrupt_chars: '▓░█▒■□▪▫●○◆◇✕✗',
	// How long a delivered fragment stays visible before it vanishes (client flash window)
	reveal_ms: parseInt(process.env['REVEAL_MS'] ?? '15000'),
	choice_count: parseInt(process.env['CHOICE_COUNT'] ?? '8'),
	choice_wrong_penalty: parseInt(process.env['CHOICE_WRONG_PENALTY'] ?? '1200'),
	// How long to keep a disconnected player slot for browser refresh/reconnect.
	reconnect_grace_ms: parseInt(process.env['RECONNECT_GRACE_MS'] ?? '5000')
};

// Only TWO questions per game: a sentence-memory round, then a logic-clue round.
export const MAX_ROUNDS = 2;

export type QuestionType = 'sentence' | 'clues';

// Q1: a sentence split into char fragments, flashed, then recognized from choices.
export interface SentenceQuestion {
	type: 'sentence';
	sentence: string; // split into N fragments, distributed one per player
	prompt: string; // shown in answer phase (the sentence itself is NOT re-shown)
	answer: string; // expected answer (normalized compare)
}

// Q2: a logic puzzle whose CLUES are the fragments, flashed, then recognized from choices.
export interface CluesQuestion {
	type: 'clues';
	clues: string[]; // each clue is one fragment, distributed across players
	prompt: string; // the deduction question, shown in answer phase
	answer: string; // expected answer (normalized compare)
}

export type Question = SentenceQuestion | CluesQuestion;

// ── Q1 pool: sentence reassembled from memory, then answered ───────────────
export const Q1_POOL: SentenceQuestion[] = [
	{
		type: 'sentence',
		sentence: '請問你參加的夏令營的主辦單位英文縮寫是什麼？',
		prompt: '讀出你們記錄的題目句子，輸入答案',
		answer: 'SITCON'
	}
];

// ── Q2 pool: scattered logic clues, deduce the ordering ────────────────────
export const Q2_POOL: CluesQuestion[] = [
	{
		type: 'clues',
		clues: [
			'Wolf 坐在 Janice 的正對面。',
			'牛排 的右手邊緊鄰著 Wolf。',
			'CC 坐在 家誠 的正對面。',
			'螢光 就在 家誠 的左手邊。',
			'NT 坐在 螢光 的正對面。',
			'64 的右手邊緊鄰著 Janice。',
			'Tang 坐在 金魚 的正對面。',
			'金魚 的右手邊緊鄰著 牛排。',
			'CC 的兩旁（鄰座）沒有 Wolf，也沒有 64。',
			'圓桌總共有十個人。',
			'64 坐在 牛排 的正對面。',
			'Wolf 的右手邊緊鄰著 NT。',
			'Janice 和 CC 不是鄰座。',
			'家誠 和 Janice 之間正好隔著一個人。',
			'如果從 Wolf 開始順時針依序數過去，螢光 會在 64 之前出現。',
			'NT 就在 CC 的左手邊。',
			'Tang 就在 64 的左手邊。'
		],
		prompt: 'CC 的右手邊是誰？',
		answer: 'Tang'
	}
];
