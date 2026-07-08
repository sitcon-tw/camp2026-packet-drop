import type {
	AdminRoomState,
	Fragment,
	FragmentChoice,
	Player,
	RoomState
} from '../src/lib/types.js';
import { CONFIG, MAX_ROUNDS, Q1_POOL, Q2_POOL, Q3_POOL, type Question } from '../src/lib/config.js';

interface InternalFrag {
	id: string;
	slot: number;
	cleanContent: string;
}

interface PlayerInbox {
	fragId: string;
	content: string;
	isCorrupt: boolean;
	slot: number;
	cleanContent: string;
	choices: FragmentChoice[];
	correctChoiceId: string | null;
	deliveredAt: number;
	choiceSent: boolean;
}

const NAME_SWAPS = [
	'Wolf',
	'WoIf',
	'W0lf',
	'Janice',
	'Jarnice',
	'Tang',
	'Teng',
	'CC',
	'C C',
	'64',
	'6A',
	'NT',
	'N T'
];
const CHINESE_SWAPS: [string, string[]][] = [
	['左手邊', ['右手邊', '左邊', '左手側']],
	['右手邊', ['左手邊', '右邊', '右手側']],
	['正對面', ['斜對面', '旁邊', '正前方']],
	['緊鄰', ['隔著一人', '靠近', '不相鄰']],
	['之前', ['之後', '前面', '後面']],
	['之後', ['之前', '後面', '前面']],
	['沒有', ['有', '不是', '不只']],
	['不是', ['是', '沒有', '不在']],
	['兩旁', ['對面', '左邊', '右邊']],
	['隔著一個人', ['緊鄰著', '隔著兩個人', '正對面']]
];
const CHAR_SWAPS: [string, string[]][] = [
	['問', ['間', '閃', '們']],
	['參', ['叁', '滲', '參加']],
	['營', ['螢', '贏', '營隊']],
	['辦', ['辨', '瓣', '辧']],
	['單', ['車', '軍', '單位']],
	['縮', ['宿', '索', '縮寫']],
	['什', ['甚', '件', '什麼']],
	['麼', ['麻', '麽', '嗎']],
	['左', ['右', '佐', '在']],
	['右', ['左', '佑', '又']]
];
const CHOICE_TOTAL = 4;

function corrupt(s: string): string {
	const c = CONFIG.corrupt_chars;
	const len = Math.max(s.length, 4);
	return Array.from({ length: len }, () => c[Math.floor(Math.random() * c.length)]).join('');
}

function splitText(text: string, n: number): string[] {
	const len = Math.ceil(text.length / n);
	return Array.from({ length: n }, (_, i) => text.slice(i * len, (i + 1) * len));
}

function shuffle<T>(arr: T[]): T[] {
	const a = [...arr];
	for (let i = a.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[a[i], a[j]] = [a[j], a[i]];
	}
	return a;
}

function normalize(s: string): string {
	return s.trim().replace(/\s+/g, ' ').toUpperCase();
}

function choiceTextKey(s: string): string {
	return s.normalize('NFKC').trim().replace(/\s+/g, ' ');
}

function choiceId(): string {
	return crypto.randomUUID();
}

function replaceFirstMatch(text: string, swaps: [string, string[]][]): string[] {
	const out = new Set<string>();
	for (const [from, replacements] of swaps) {
		if (!text.includes(from)) continue;
		for (const to of replacements) {
			out.add(text.replace(from, to));
		}
	}
	return [...out];
}

function mutateByName(text: string): string[] {
	const names = ['Wolf', 'Janice', 'CC', '家誠', '螢光', 'NT', '64', 'Tang', '金魚', '牛排'];
	const visibleNames = names.filter((name) => text.includes(name));
	const out = new Set<string>();
	for (const from of visibleNames) {
		for (const to of names) {
			if (from !== to) out.add(text.replace(from, to));
		}
	}
	for (const name of NAME_SWAPS) {
		if (text.includes('Wolf')) out.add(text.replace('Wolf', name));
		if (text.includes('Tang')) out.add(text.replace('Tang', name));
		if (text.includes('Janice')) out.add(text.replace('Janice', name));
	}
	return [...out];
}

function mutateByChars(text: string): string[] {
	const out = new Set<string>();
	out.add(...replaceFirstMatch(text, CHAR_SWAPS));
	out.add(...replaceFirstMatch(text, CHINESE_SWAPS));

	if (text.length > 2) {
		const mid = Math.max(1, Math.floor(text.length / 2) - 1);
		out.add(text.slice(0, mid) + text.slice(mid + 1));
		if (mid + 1 < text.length) {
			out.add(text.slice(0, mid) + text[mid + 1] + text[mid] + text.slice(mid + 2));
		}
	}
	if (text.includes('？')) out.add(text.replace('？', '。'));
	if (text.includes('。')) out.add(text.replace('。', '？'));
	if (text.includes('的')) out.add(text.replace('的', '得'));
	if (text.includes('得')) out.add(text.replace('得', '的'));
	return [...out];
}

function buildChoiceTexts(correct: string, allFragments: InternalFrag[]): string[] {
	const choices = new Set<string>();
	const choiceKeys = new Set<string>([choiceTextKey(correct)]);
	const add = (value: unknown) => {
		if (typeof value !== 'string') return;
		const text = value.trim();
		const key = choiceTextKey(text);
		if (text && !choiceKeys.has(key)) {
			choices.add(text);
			choiceKeys.add(key);
		}
	};

	mutateByName(correct).forEach(add);
	mutateByChars(correct).forEach(add);
	allFragments
		.filter((frag) => frag.cleanContent !== correct)
		.flatMap((frag) => [
			frag.cleanContent,
			...mutateByName(frag.cleanContent).slice(0, 2),
			...mutateByChars(frag.cleanContent).slice(0, 2)
		])
		.forEach(add);

	let fallbackIndex = 1;
	while (choices.size < CHOICE_TOTAL - 1) {
		add(`${correct} ${fallbackIndex}`);
		fallbackIndex++;
	}

	return shuffle([...choices]).slice(0, CHOICE_TOTAL - 1);
}

function buildChoices(
	correct: string,
	allFragments: InternalFrag[]
): {
	choices: FragmentChoice[];
	correctChoiceId: string;
} {
	const correctChoice = { id: choiceId(), text: correct };
	const uniqueTexts = new Set<string>([choiceTextKey(correct)]);
	const distractors = buildChoiceTexts(correct, allFragments)
		.filter((text) => {
			const key = choiceTextKey(text);
			if (uniqueTexts.has(key)) return false;
			uniqueTexts.add(key);
			return true;
		})
		.slice(0, CHOICE_TOTAL - 1)
		.map((text) => ({
			id: choiceId(),
			text
		}));
	return {
		choices: shuffle([correctChoice, ...distractors]),
		correctChoiceId: correctChoice.id
	};
}

type WS = { send(data: string): void; readyState: number };

export class Room {
	state: RoomState;
	private onStateChange: () => void;
	private questions: Question[] = [];
	private currentMessage: Question | null = null;
	private internalFrags: InternalFrag[] = [];
	private playerInboxes = new Map<string, PlayerInbox>();
	private wsMap = new Map<string, WS>();
	private choiceCooldown = new Map<string, number>();
	private armTime = new Map<string, number>();
	private disarmTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private choiceTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private choiceAfkTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private playerRemovalTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private redistTimer: ReturnType<typeof setTimeout> | null = null;
	private roundTimer: ReturnType<typeof setTimeout> | null = null;
	private roomResetTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(roomId: string, onStateChange: () => void = () => {}) {
		this.onStateChange = onStateChange;
		this.state = this.freshState(roomId);
	}

	// ── Public API ────────────────────────────────────────────────

	addPlayer(playerId: string, ws: WS): void {
		this.cancelRoomReset();
		this.cancelPlayerRemoval(playerId);
		this.wsMap.set(playerId, ws);
		const existing = this.state.players.find((p) => p.id === playerId);
		if (existing) {
			existing.isConnected = true;
			this.resync(playerId);
			this.broadcastState();
			return;
		}
		if (this.state.phase !== 'lobby') {
			this.send(playerId, { type: 'error', message: 'Game already in progress' });
			this.send(playerId, { type: 'state', room: this.state });
			return;
		}
		const name = this.nextPlayerName();
		this.state.players.push({
			id: playerId,
			name,
			isConnected: true,
			hasLogged: false,
			isArmed: false,
			wantsRestart: false
		});
		this.broadcastState();
	}

	startByAdmin(): { ok: true } | { ok: false; message: string } {
		if (this.state.phase !== 'lobby') {
			return { ok: false, message: '隊伍已經開始或已完成' };
		}
		if (!this.state.players.some((p) => p.isConnected)) {
			return { ok: false, message: '至少需要 1 位已連線玩家才能開始' };
		}
		this.startGame();
		return { ok: true };
	}

	forceCompleteByAdmin(): void {
		this.completeGame(true);
	}

	clearRecordByAdmin(): { ok: true } | { ok: false; message: string } {
		if (this.state.phase !== 'complete') {
			return { ok: false, message: '只有完成後的隊伍可以刪除紀錄' };
		}
		const players = this.state.players.map((p) => ({
			...p,
			isConnected: this.wsMap.has(p.id),
			hasLogged: false,
			isArmed: false,
			wantsRestart: false
		}));
		this.resetRoom();
		this.state.players = players;
		this.broadcastState();
		return { ok: true };
	}

	kickPlayerByAdmin(targetId: string): void {
		const target = this.findPlayer(targetId);
		if (!target) return;
		this.send(targetId, { type: 'kicked', roomId: this.state.roomId });
		this.removePlayerNow(targetId);
		this.broadcastAll({
			type: 'toast',
			text: `${target.name} 已被管理員移出房間`,
			kind: 'info'
		});
		this.broadcastState();
	}

	logFragment(playerId: string, text: string): void {
		void text;
		this.send(playerId, { type: 'error', message: '請使用選項寫入共享筆記' });
	}

	selectFragmentChoice(playerId: string, choiceId: string): void {
		if (this.state.phase !== 'inspect') return;
		const p = this.findPlayer(playerId);
		if (!p) return;

		const coolUntil = this.choiceCooldown.get(playerId) ?? 0;
		if (Date.now() < coolUntil) {
			this.send(playerId, { type: 'error', message: '選項冷卻中' });
			return;
		}

		const inbox = this.playerInboxes.get(playerId);
		if (!inbox) return;

		if (inbox.isCorrupt) {
			this.send(playerId, { type: 'log_reject', reason: 'CORRUPT' });
			this.send(playerId, {
				type: 'toast',
				text: '封包損毀，無法選擇 — 請 ACK 重傳',
				kind: 'error'
			});
			return;
		}

		if (!inbox.correctChoiceId || choiceId !== inbox.correctChoiceId) {
			this.choiceCooldown.set(playerId, Date.now() + CONFIG.choice_wrong_penalty);
			this.send(playerId, { type: 'choice_wrong', penalty: CONFIG.choice_wrong_penalty });
			this.send(playerId, { type: 'toast', text: '選項錯誤，重新辨識中…', kind: 'error' });
			return;
		}

		p.hasLogged = true;
		this.clearChoiceAfkTimer(playerId);
		this.state.buffer[inbox.slot] = inbox.cleanContent;
		this.send(playerId, { type: 'log_ok' });
		this.send(playerId, { type: 'toast', text: '選對了，已寫入共享筆記 ✓', kind: 'success' });

		if (this.filledCount() >= this.state.totalFragments) {
			this.enterAnswer();
		} else {
			this.broadcastState();
		}
	}

	armAck(playerId: string): void {
		if (this.state.phase !== 'inspect') return;
		const p = this.findPlayer(playerId);
		if (!p || p.isArmed) return;

		p.isArmed = true;
		const now = Date.now();
		this.armTime.set(playerId, now);

		const t = setTimeout(() => {
			if (this.armTime.get(playerId) === now) {
				p.isArmed = false;
				this.armTime.delete(playerId);
				this.disarmTimers.delete(playerId);
				this.broadcastState();
			}
		}, CONFIG.T_ack);
		this.disarmTimers.set(playerId, t);

		if (this.checkAllOverlapping(now)) {
			this.clearDisarmTimers();
			this.fireAckBarrier();
		} else {
			this.broadcastState();
		}
	}

	// Submit text answer → if correct, advance question or complete
	submitAnswer(playerId: string, text: string): void {
		if (this.state.phase !== 'answer' || !this.currentMessage) return;
		if (this.roundTimer) return;
		const coolUntil = this.state.answerCooldownUntil;
		if (Date.now() < coolUntil) {
			this.send(playerId, { type: 'error', message: '提交冷卻中' });
			return;
		}

		if (normalize(text) === normalize(this.currentMessage.answer)) {
			this.broadcastAll({ type: 'toast', text: `✓ 答對了！`, kind: 'success' });
			if (this.state.gameRound >= MAX_ROUNDS) {
				this.completeGame(false);
			} else {
				this.roundTimer = setTimeout(() => {
					this.roundTimer = null;
					this.startGameRound();
				}, 1500);
			}
		} else {
			this.state.answerCooldownUntil = Date.now() + CONFIG.wrong_submit_penalty;
			this.broadcastAll({
				type: 'answer_wrong',
				penalty: CONFIG.wrong_submit_penalty,
				cooldownUntil: this.state.answerCooldownUntil
			});
			this.broadcastAll({ type: 'toast', text: '答案錯誤，整隊冷卻中…', kind: 'error' });
			this.broadcastState();
		}
	}

	// Restart the CURRENT question — requires every player to agree.
	voteRestart(playerId: string): void {
		if (this.state.phase !== 'answer') return;
		const p = this.findPlayer(playerId);
		if (!p) return;
		p.wantsRestart = true;
		if (this.state.players.length > 0 && this.state.players.every((pl) => pl.wantsRestart)) {
			this.restartQuestion();
		} else {
			this.broadcastState();
		}
	}

	removePlayer(playerId: string, ws: WS): void {
		// Guard against stale close events: if a newer WS already replaced this one, skip.
		if (this.wsMap.get(playerId) !== ws) return;
		this.wsMap.delete(playerId);
		const p = this.findPlayer(playerId);
		if (p) {
			p.isConnected = false;
			p.isArmed = false;
		}
		this.clearPlayerRuntime(playerId);

		if (this.state.phase === 'lobby') {
			this.schedulePlayerRemoval(playerId);
		}
		if (this.wsMap.size === 0) {
			if (this.state.phase !== 'complete') this.scheduleRoomReset();
			return;
		}
		this.broadcastState();
	}

	resync(playerId: string): void {
		this.send(playerId, { type: 'state', room: this.state });
		const inbox = this.playerInboxes.get(playerId);
		if (inbox && this.state.phase === 'inspect') {
			this.send(playerId, {
				type: 'inbox',
				fragment: {
					id: inbox.fragId,
					content: inbox.content,
					isCorrupt: inbox.isCorrupt
				} satisfies Fragment
			});
			this.scheduleOrSendChoices(playerId, inbox);
		}
	}

	// ── Private ───────────────────────────────────────────────────

	private freshState(roomId: string): RoomState {
		return {
			roomId,
			phase: 'lobby',
			round: 0,
			gameRound: 0,
			maxRounds: MAX_ROUNDS,
			players: [],
			buffer: [],
			totalFragments: 0,
			revealMs: CONFIG.reveal_ms,
			answerCooldownUntil: 0,
			questionType: null,
			prompt: null,
			startedAt: null,
			completedAt: null,
			forcedComplete: false
		};
	}

	private startGame(): void {
		this.cancelRoomReset();
		const q1 = shuffle([...Q1_POOL])[0];
		const q2 = shuffle([...Q2_POOL])[0];
		const q3 = shuffle([...Q3_POOL])[0];
		this.questions = [q1, q2, q3];
		this.state.gameRound = 0;
		this.state.startedAt = Date.now();
		this.state.completedAt = null;
		this.state.forcedComplete = false;
		this.startGameRound();
	}

	private startGameRound(): void {
		this.state.gameRound++;
		this.currentMessage = this.questions[this.state.gameRound - 1];
		const q = this.currentMessage;
		const n = this.state.players.length;

		// Build the fragments to distribute (ephemeral, transcribed from memory).
		const parts = q.type === 'sentence' ? splitText(q.sentence, n) : [...q.clues];
		this.internalFrags = parts.map((cleanContent, slot) => ({
			id: crypto.randomUUID(),
			slot,
			cleanContent
		}));

		this.state.totalFragments = parts.length;
		this.state.buffer = Array(parts.length).fill(null);
		this.state.questionType = q.type;
		this.state.prompt = null;
		this.state.round = 0;
		this.state.players.forEach((p) => (p.wantsRestart = false));
		this.state.answerCooldownUntil = 0;
		this.choiceCooldown.clear();
		this.distributeFragments();
	}

	// Re-run the current question from scratch (all players agreed).
	private restartQuestion(): void {
		if (!this.currentMessage) return;
		if (this.roundTimer) {
			clearTimeout(this.roundTimer);
			this.roundTimer = null;
		}
		if (this.redistTimer) {
			clearTimeout(this.redistTimer);
			this.redistTimer = null;
		}
		// Re-roll fresh fragment ids so the new flash is a clean slate.
		this.internalFrags = this.internalFrags.map((f) => ({ ...f, id: crypto.randomUUID() }));
		this.state.buffer = Array(this.state.totalFragments).fill(null);
		this.state.prompt = null;
		this.state.players.forEach((p) => (p.wantsRestart = false));
		this.state.answerCooldownUntil = 0;
		this.choiceCooldown.clear();
		this.broadcastAll({ type: 'toast', text: '全員同意，重新開始本題 ↻', kind: 'info' });
		this.distributeFragments();
	}

	private distributeFragments(): void {
		const filledSlots = new Set(this.state.buffer.flatMap((v, i) => (v !== null ? [i] : [])));
		if (filledSlots.size >= this.state.totalFragments) {
			this.enterAnswer();
			return;
		}
		this.state.round++;
		this.state.phase = 'inspect';
		this.state.players.forEach((p) => {
			p.hasLogged = false;
			p.isArmed = false;
		});
		this.clearDisarmTimers();
		this.clearChoiceTimers();
		this.armTime.clear();

		const unfilled = shuffle(this.internalFrags.filter((f) => !filledSlots.has(f.slot)));
		const now = Date.now();

		this.state.players.forEach((player, i) => {
			const frag = unfilled[i % unfilled.length];
			const isCorrupt =
				(CONFIG.guarantee_first_corrupt && this.state.round === 1 && i === 0) ||
				Math.random() < CONFIG.corruption_chance;
			const generated = isCorrupt
				? { choices: [], correctChoiceId: null }
				: buildChoices(frag.cleanContent, this.internalFrags);

			this.playerInboxes.set(player.id, {
				fragId: frag.id,
				content: isCorrupt ? corrupt(frag.cleanContent) : frag.cleanContent,
				isCorrupt,
				slot: frag.slot,
				cleanContent: frag.cleanContent,
				choices: generated.choices,
				correctChoiceId: generated.correctChoiceId,
				deliveredAt: now,
				choiceSent: false
			});
		});

		this.broadcastState();
		this.state.players.forEach((p) => {
			const inbox = this.playerInboxes.get(p.id)!;
			this.send(p.id, {
				type: 'inbox',
				fragment: {
					id: inbox.fragId,
					content: inbox.content,
					isCorrupt: inbox.isCorrupt
				} satisfies Fragment
			});
			this.scheduleOrSendChoices(p.id, inbox);
		});
	}

	private checkAllOverlapping(now: number): boolean {
		return this.state.players.every((p) => {
			if (!p.isArmed) return false;
			const t = this.armTime.get(p.id);
			return t !== undefined && now - t < CONFIG.T_ack;
		});
	}

	private fireAckBarrier(): void {
		this.state.players.forEach((p) => {
			p.isArmed = false;
		});
		this.armTime.clear();

		if (this.filledCount() >= this.state.totalFragments) {
			this.enterAnswer();
		} else {
			this.broadcastState();
			this.redistTimer = setTimeout(() => {
				this.redistTimer = null;
				this.distributeFragments();
			}, 600);
		}
	}

	private enterAnswer(): void {
		this.clearChoiceTimers();
		this.state.phase = 'answer';
		this.state.prompt = this.currentMessage?.prompt ?? null;
		this.state.players.forEach((p) => (p.wantsRestart = false));
		this.state.answerCooldownUntil = 0;
		this.broadcastAll({ type: 'toast', text: '筆記收集完成，開始作答', kind: 'success' });
		this.broadcastState();
	}

	private filledCount(): number {
		return this.state.buffer.reduce((acc, v) => acc + (v !== null ? 1 : 0), 0);
	}

	private clearDisarmTimers(): void {
		this.disarmTimers.forEach((t) => clearTimeout(t));
		this.disarmTimers.clear();
	}

	private clearChoiceTimers(): void {
		this.choiceTimers.forEach((t) => clearTimeout(t));
		this.choiceTimers.clear();
		this.choiceAfkTimers.forEach((t) => clearTimeout(t));
		this.choiceAfkTimers.clear();
	}

	private clearChoiceAfkTimer(playerId: string): void {
		const t = this.choiceAfkTimers.get(playerId);
		if (t) {
			clearTimeout(t);
			this.choiceAfkTimers.delete(playerId);
		}
	}

	private scheduleOrSendChoices(playerId: string, inbox: PlayerInbox): void {
		if (inbox.isCorrupt || inbox.choiceSent || this.state.phase !== 'inspect') return;
		const remaining = Math.max(0, CONFIG.reveal_ms - (Date.now() - inbox.deliveredAt));
		if (remaining === 0) {
			this.sendChoiceSet(playerId, inbox.fragId);
			return;
		}
		const existing = this.choiceTimers.get(playerId);
		if (existing) clearTimeout(existing);
		const timer = setTimeout(() => {
			this.choiceTimers.delete(playerId);
			this.sendChoiceSet(playerId, inbox.fragId);
		}, remaining);
		this.choiceTimers.set(playerId, timer);
	}

	private sendChoiceSet(playerId: string, fragId: string): void {
		const inbox = this.playerInboxes.get(playerId);
		if (!inbox || inbox.fragId !== fragId || inbox.isCorrupt || this.state.phase !== 'inspect')
			return;
		inbox.choiceSent = true;
		this.send(playerId, { type: 'choice_set', fragId: inbox.fragId, choices: inbox.choices });
		if (CONFIG.choice_afk_ms > 0 && this.state.questionType === 'clues') {
			this.clearChoiceAfkTimer(playerId);
			const afkTimer = setTimeout(() => {
				this.choiceAfkTimers.delete(playerId);
				this.send(playerId, { type: 'choice_expired' });
			}, CONFIG.choice_afk_ms);
			this.choiceAfkTimers.set(playerId, afkTimer);
		}
	}

	private schedulePlayerRemoval(playerId: string): void {
		this.cancelPlayerRemoval(playerId);
		const timer = setTimeout(() => {
			this.playerRemovalTimers.delete(playerId);
			if (this.wsMap.has(playerId) || this.state.phase !== 'lobby') return;
			this.removePlayerNow(playerId);
			this.broadcastState();
		}, CONFIG.reconnect_grace_ms);
		this.playerRemovalTimers.set(playerId, timer);
	}

	private removePlayerNow(playerId: string): void {
		this.wsMap.delete(playerId);
		this.state.players = this.state.players.filter((p) => p.id !== playerId);
		this.clearPlayerRuntime(playerId);
		this.cancelPlayerRemoval(playerId);
		if (this.state.players.length === 0 && this.state.phase !== 'complete') {
			this.scheduleRoomReset();
		}
	}

	private clearPlayerRuntime(playerId: string): void {
		this.playerInboxes.delete(playerId);
		this.choiceCooldown.delete(playerId);
		this.armTime.delete(playerId);
		const disarmTimer = this.disarmTimers.get(playerId);
		if (disarmTimer) clearTimeout(disarmTimer);
		this.disarmTimers.delete(playerId);
		const choiceTimer = this.choiceTimers.get(playerId);
		if (choiceTimer) clearTimeout(choiceTimer);
		this.choiceTimers.delete(playerId);
		this.clearChoiceAfkTimer(playerId);
	}

	private cancelPlayerRemoval(playerId: string): void {
		const timer = this.playerRemovalTimers.get(playerId);
		if (!timer) return;
		clearTimeout(timer);
		this.playerRemovalTimers.delete(playerId);
	}

	private clearPlayerRemovalTimers(): void {
		this.playerRemovalTimers.forEach((t) => clearTimeout(t));
		this.playerRemovalTimers.clear();
	}

	private scheduleRoomReset(): void {
		if (this.roomResetTimer) return;
		this.roomResetTimer = setTimeout(() => {
			this.roomResetTimer = null;
			if (this.wsMap.size > 0) return;
			this.resetRoom();
		}, CONFIG.reconnect_grace_ms);
	}

	private cancelRoomReset(): void {
		if (!this.roomResetTimer) return;
		clearTimeout(this.roomResetTimer);
		this.roomResetTimer = null;
	}

	private resetRoom(): void {
		this.state = this.freshState(this.state.roomId);
		this.questions = [];
		this.currentMessage = null;
		this.internalFrags = [];
		this.playerInboxes.clear();
		this.choiceCooldown.clear();
		this.armTime.clear();
		this.clearDisarmTimers();
		this.clearChoiceTimers();
		this.clearPlayerRemovalTimers();
		if (this.redistTimer) {
			clearTimeout(this.redistTimer);
			this.redistTimer = null;
		}
		if (this.roundTimer) {
			clearTimeout(this.roundTimer);
			this.roundTimer = null;
		}
		this.onStateChange();
	}

	getAdminState(): AdminRoomState {
		return {
			roomId: this.state.roomId,
			phase: this.state.phase,
			round: this.state.round,
			gameRound: this.state.gameRound,
			maxRounds: this.state.maxRounds,
			players: this.state.players,
			bufferFilled: this.filledCount(),
			totalFragments: this.state.totalFragments,
			questionType: this.state.questionType,
			prompt: this.state.prompt,
			startedAt: this.state.startedAt,
			completedAt: this.state.completedAt,
			forcedComplete: this.state.forcedComplete
		};
	}

	private completeGame(forcedComplete: boolean): void {
		if (this.redistTimer) {
			clearTimeout(this.redistTimer);
			this.redistTimer = null;
		}
		if (this.roundTimer) {
			clearTimeout(this.roundTimer);
			this.roundTimer = null;
		}
		this.clearDisarmTimers();
		this.clearChoiceTimers();
		this.armTime.clear();
		this.state.players.forEach((p) => {
			p.isArmed = false;
			p.wantsRestart = false;
		});
		this.state.phase = 'complete';
		this.state.startedAt ??= Date.now();
		this.state.completedAt ??= Date.now();
		this.state.forcedComplete = forcedComplete;
		this.broadcastAll({ type: 'complete' });
		this.broadcastState();
	}

	private nextPlayerName(): string {
		const used = new Set(this.state.players.map((p) => p.name));
		for (let i = 1; ; i++) {
			const name = `P${i}`;
			if (!used.has(name)) return name;
		}
	}

	private findPlayer(id: string): Player | undefined {
		return this.state.players.find((p) => p.id === id);
	}

	private send(playerId: string, msg: unknown): void {
		const ws = this.wsMap.get(playerId);
		if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
	}

	private broadcastAll(msg: unknown): void {
		const data = JSON.stringify(msg);
		this.wsMap.forEach((ws) => {
			if (ws.readyState === 1) ws.send(data);
		});
	}

	private broadcastState(): void {
		this.broadcastAll({ type: 'state', room: this.state });
		this.onStateChange();
	}
}
