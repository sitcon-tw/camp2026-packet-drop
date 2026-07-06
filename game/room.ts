import type { Fragment, Player, RoomState } from '../src/lib/types.js';
import { CONFIG, MAX_ROUNDS, Q1_POOL, Q2_POOL, type Question } from '../src/lib/config.js';

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
}

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

type WS = { send(data: string): void; readyState: number };

export class Room {
	state: RoomState;
	private questions: Question[] = [];
	private currentMessage: Question | null = null;
	private internalFrags: InternalFrag[] = [];
	private playerInboxes = new Map<string, PlayerInbox>();
	private wsMap = new Map<string, WS>();
	private submitCooldown = new Map<string, number>();
	private armTime = new Map<string, number>();
	private disarmTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private redistTimer: ReturnType<typeof setTimeout> | null = null;
	private roundTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(roomId: string) {
		this.state = this.freshState(roomId);
	}

	// ── Public API ────────────────────────────────────────────────

	addPlayer(playerId: string, ws: WS): void {
		this.wsMap.set(playerId, ws);
		const existing = this.state.players.find((p) => p.id === playerId);
		if (existing) {
			this.resync(playerId);
			return;
		}
		if (this.state.phase !== 'lobby') {
			this.send(playerId, { type: 'error', message: 'Game already in progress' });
			this.send(playerId, { type: 'state', room: this.state });
			return;
		}
		const name = `P${this.state.players.length + 1}`;
		this.state.players.push({
			id: playerId,
			name,
			isReady: false,
			hasLogged: false,
			isArmed: false,
			wantsRestart: false
		});
		this.broadcastState();
	}

	setReady(playerId: string): void {
		if (this.state.phase !== 'lobby') return;
		const p = this.findPlayer(playerId);
		if (!p) return;
		p.isReady = true;
		const n = this.state.players.length;
		if (n >= CONFIG.min_players && this.state.players.every((pl) => pl.isReady)) {
			this.startGame();
		} else {
			this.broadcastState();
		}
	}

	// Player transcribes the fragment they (briefly) saw into the shared notes.
	// Content is NOT validated — it's a collaborative scratchpad. Only corrupt
	// fragments are rejected, since the player literally cannot read them.
	logFragment(playerId: string, text: string): void {
		if (this.state.phase !== 'inspect') return;
		const p = this.findPlayer(playerId);
		if (!p) return;

		const inbox = this.playerInboxes.get(playerId);
		if (!inbox) return;

		if (inbox.isCorrupt) {
			this.send(playerId, { type: 'log_reject', reason: 'CORRUPT' });
			this.send(playerId, {
				type: 'toast',
				text: '封包損毀，無法記錄 — 請 ACK 重傳',
				kind: 'error'
			});
			return;
		}

		const note = text.trim();
		if (!note) {
			this.send(playerId, { type: 'error', message: '請先輸入內容' });
			return;
		}

		p.hasLogged = true;
		this.state.buffer[inbox.slot] = note;
		this.send(playerId, { type: 'log_ok' });
		this.send(playerId, { type: 'toast', text: '已記錄到共享筆記 ✓', kind: 'success' });

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
		const coolUntil = this.submitCooldown.get(playerId) ?? 0;
		if (Date.now() < coolUntil) {
			this.send(playerId, { type: 'error', message: '提交冷卻中' });
			return;
		}

		if (normalize(text) === normalize(this.currentMessage.answer)) {
			this.broadcastAll({ type: 'toast', text: `✓ 答對了！`, kind: 'success' });
			if (this.state.gameRound >= MAX_ROUNDS) {
				this.state.phase = 'complete';
				this.broadcastAll({ type: 'complete' });
				this.broadcastState();
			} else {
				this.roundTimer = setTimeout(() => {
					this.roundTimer = null;
					this.startGameRound();
				}, 1500);
			}
		} else {
			this.submitCooldown.set(playerId, Date.now() + CONFIG.wrong_submit_penalty);
			this.send(playerId, { type: 'answer_wrong', penalty: CONFIG.wrong_submit_penalty });
			this.send(playerId, { type: 'toast', text: '答案錯誤，冷卻中…', kind: 'error' });
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
		if (this.state.phase === 'lobby') {
			this.state.players = this.state.players.filter((p) => p.id !== playerId);
		}
		// Reset to lobby when no one is connected (room reuse between sessions)
		if (this.wsMap.size === 0) {
			this.state = this.freshState(this.state.roomId);
			this.questions = [];
			this.currentMessage = null;
			this.internalFrags = [];
			this.playerInboxes.clear();
			this.submitCooldown.clear();
			this.armTime.clear();
			this.clearDisarmTimers();
			if (this.redistTimer) {
				clearTimeout(this.redistTimer);
				this.redistTimer = null;
			}
			if (this.roundTimer) {
				clearTimeout(this.roundTimer);
				this.roundTimer = null;
			}
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
			minPlayers: CONFIG.min_players,
			players: [],
			buffer: [],
			totalFragments: 0,
			revealMs: CONFIG.reveal_ms,
			questionType: null,
			prompt: null
		};
	}

	private startGame(): void {
		const q1 = shuffle([...Q1_POOL])[0];
		const q2 = shuffle([...Q2_POOL])[0];
		this.questions = [q1, q2];
		this.state.gameRound = 0;
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
		this.submitCooldown.clear();
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
		this.submitCooldown.clear();
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
		this.armTime.clear();

		const unfilled = shuffle(this.internalFrags.filter((f) => !filledSlots.has(f.slot)));

		this.state.players.forEach((player, i) => {
			const frag = unfilled[i % unfilled.length];
			const isCorrupt =
				(CONFIG.guarantee_first_corrupt && this.state.round === 1 && i === 0) ||
				Math.random() < CONFIG.corruption_chance;

			this.playerInboxes.set(player.id, {
				fragId: frag.id,
				content: isCorrupt ? corrupt(frag.cleanContent) : frag.cleanContent,
				isCorrupt,
				slot: frag.slot
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
		this.state.phase = 'answer';
		this.state.prompt = this.currentMessage?.prompt ?? null;
		this.state.players.forEach((p) => (p.wantsRestart = false));
		this.submitCooldown.clear();
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
	}
}
