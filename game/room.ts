import type { Fragment, Player, RoomState, BufferItem } from '../src/lib/types.js';
import { CONFIG, MESSAGE_POOL, type MessageEntry } from '../src/lib/config.js';

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
	return [...s].map(() => c[Math.floor(Math.random() * c.length)]).join('');
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

type WS = { send(data: string): void; readyState: number };

export class Room {
	state: RoomState;
	private roundMessages: MessageEntry[] = [];
	private currentMessage: MessageEntry = { text: '', answer: '' };
	private internalFrags: InternalFrag[] = [];
	private playerInboxes = new Map<string, PlayerInbox>();
	private wsMap = new Map<string, WS>();
	private submitCooldown = new Map<string, number>();
	private armTime = new Map<string, number>();
	private disarmTimers = new Map<string, ReturnType<typeof setTimeout>>();
	private afkTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(roomId: string) {
		this.state = {
			roomId,
			phase: 'lobby',
			round: 0,
			gameRound: 0,
			maxRounds: CONFIG.max_rounds,
			players: [],
			buffer: [],
			totalFragments: 0,
			assemblyOrder: [],
			currentQuestion: null,
		};
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
			isAfk: false,
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

	logFragment(playerId: string): void {
		if (this.state.phase !== 'inspect') return;
		const p = this.findPlayer(playerId);
		if (!p || p.hasLogged) return;
		p.hasLogged = true;

		const inbox = this.playerInboxes.get(playerId);
		if (!inbox) return;

		if (inbox.isCorrupt) {
			this.send(playerId, { type: 'log_reject', reason: 'CORRUPT' });
			this.send(playerId, { type: 'toast', text: '封包損毀，已拒絕', kind: 'error' });
		} else {
			if (!this.state.buffer.find((b) => b.id === inbox.fragId)) {
				this.state.buffer.push({ id: inbox.fragId, content: inbox.content });
			}
			this.send(playerId, { type: 'log_ok' });
			this.send(playerId, { type: 'toast', text: '封包已記錄 ✓', kind: 'success' });
		}

		if (this.state.buffer.length >= this.state.totalFragments) {
			this.enterAssemble();
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

		if (!p.isAfk) {
			const t = setTimeout(() => {
				if (this.armTime.get(playerId) === now) {
					p.isArmed = false;
					this.armTime.delete(playerId);
					this.disarmTimers.delete(playerId);
					this.broadcastState();
				}
			}, CONFIG.T_ack);
			this.disarmTimers.set(playerId, t);
		}

		if (this.checkAllOverlapping(now)) {
			this.clearDisarmTimers();
			this.fireAckBarrier();
		} else {
			this.broadcastState();
		}
	}

	setOrder(playerId: string, order: string[]): void {
		if (this.state.phase !== 'assemble') return;
		const ids = new Set(this.state.buffer.map((b) => b.id));
		if (order.length !== ids.size || !order.every((id) => ids.has(id))) return;
		this.state.assemblyOrder = order;
		this.broadcastState();
	}

	// Submit sorted order → if correct, move to answer phase
	submitOrder(playerId: string): void {
		if (this.state.phase !== 'assemble') return;
		const coolUntil = this.submitCooldown.get(playerId) ?? 0;
		if (Date.now() < coolUntil) {
			this.send(playerId, { type: 'error', message: '提交冷卻中' });
			return;
		}

		const reconstructed = this.state.assemblyOrder
			.map((id) => this.state.buffer.find((b) => b.id === id)?.content ?? '')
			.join('');

		if (reconstructed === this.currentMessage.text) {
			this.enterAnswer();
		} else {
			this.submitCooldown.set(playerId, Date.now() + CONFIG.wrong_submit_penalty);
			this.send(playerId, { type: 'answer_wrong', penalty: CONFIG.wrong_submit_penalty });
			this.send(playerId, { type: 'toast', text: '排列順序錯誤，冷卻中…', kind: 'error' });
		}
	}

	// Submit text answer → if correct, advance round or complete
	submitAnswer(playerId: string, text: string): void {
		if (this.state.phase !== 'answer') return;
		const coolUntil = this.submitCooldown.get(playerId) ?? 0;
		if (Date.now() < coolUntil) {
			this.send(playerId, { type: 'error', message: '提交冷卻中' });
			return;
		}

		const normalized = text.trim().toUpperCase();
		const expected = this.currentMessage.answer.toUpperCase();

		if (normalized === expected) {
			this.broadcastAll({ type: 'toast', text: `✓ 答對了！`, kind: 'success' });
			if (this.state.gameRound >= this.state.maxRounds) {
				this.state.phase = 'complete';
				this.broadcastAll({ type: 'complete' });
				this.broadcastState();
			} else {
				setTimeout(() => this.startGameRound(), 1500);
			}
		} else {
			this.submitCooldown.set(playerId, Date.now() + CONFIG.wrong_submit_penalty);
			this.send(playerId, { type: 'answer_wrong', penalty: CONFIG.wrong_submit_penalty });
			this.send(playerId, { type: 'toast', text: '答案錯誤，冷卻中…', kind: 'error' });
		}
	}

	removePlayer(playerId: string): void {
		this.wsMap.delete(playerId);
		if (this.state.phase === 'lobby') {
			this.state.players = this.state.players.filter((p) => p.id !== playerId);
		}
		// Reset to lobby when no one is connected (room reuse between sessions)
		if (this.wsMap.size === 0) {
			this.state = {
				roomId: this.state.roomId,
				phase: 'lobby',
				round: 0,
				gameRound: 0,
				maxRounds: CONFIG.max_rounds,
				players: [],
				buffer: [],
				totalFragments: 0,
				assemblyOrder: [],
				currentQuestion: null,
			};
			this.roundMessages = [];
			this.playerInboxes.clear();
			this.submitCooldown.clear();
			this.armTime.clear();
			this.clearDisarmTimers();
			if (this.afkTimer) { clearTimeout(this.afkTimer); this.afkTimer = null; }
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
					isCorrupt: inbox.isCorrupt,
				} satisfies Fragment,
			});
		}
	}

	// ── Private ───────────────────────────────────────────────────

	private startGame(): void {
		const pool = shuffle([...MESSAGE_POOL]);
		this.roundMessages = pool.slice(0, CONFIG.max_rounds);
		this.state.gameRound = 0;
		this.startGameRound();
	}

	private startGameRound(): void {
		this.state.gameRound++;
		this.currentMessage = this.roundMessages[this.state.gameRound - 1];
		const n = this.state.players.length;
		const parts = splitText(this.currentMessage.text, n);
		this.internalFrags = parts.map((cleanContent, slot) => ({
			id: crypto.randomUUID(),
			slot,
			cleanContent,
		}));
		this.state.totalFragments = n;
		this.state.buffer = [];
		this.state.assemblyOrder = [];
		this.state.currentQuestion = null;
		this.submitCooldown.clear();
		this.distributeFragments();
	}

	private distributeFragments(): void {
		this.state.round++;
		this.state.phase = 'inspect';
		this.state.players.forEach((p) => {
			p.hasLogged = false;
			p.isArmed = false;
			p.isAfk = false;
		});
		this.clearDisarmTimers();
		this.armTime.clear();

		const filledIds = new Set(this.state.buffer.map((b) => b.id));
		const unfilled = shuffle(this.internalFrags.filter((f) => !filledIds.has(f.id)));

		this.state.players.forEach((player, i) => {
			const frag = unfilled[i % unfilled.length];
			const isCorrupt =
				(CONFIG.guarantee_first_corrupt && this.state.round === 1 && i === 0) ||
				Math.random() < CONFIG.corruption_chance;

			this.playerInboxes.set(player.id, {
				fragId: frag.id,
				content: isCorrupt ? corrupt(frag.cleanContent) : frag.cleanContent,
				isCorrupt,
				slot: frag.slot,
			});
		});

		if (this.afkTimer) clearTimeout(this.afkTimer);
		this.afkTimer = setTimeout(() => {
			const now = Date.now();
			let changed = false;
			this.state.players.forEach((p) => {
				if (!p.isArmed) {
					p.isAfk = true;
					p.isArmed = true;
					this.armTime.set(p.id, now);
					changed = true;
				}
			});
			if (changed && this.checkAllOverlapping(now)) {
				this.clearDisarmTimers();
				this.fireAckBarrier();
			} else if (changed) {
				this.broadcastState();
			}
		}, CONFIG.T_afk);

		this.broadcastState();
		this.state.players.forEach((p) => {
			const inbox = this.playerInboxes.get(p.id)!;
			this.send(p.id, {
				type: 'inbox',
				fragment: {
					id: inbox.fragId,
					content: inbox.content,
					isCorrupt: inbox.isCorrupt,
				} satisfies Fragment,
			});
		});
	}

	private checkAllOverlapping(now: number): boolean {
		return this.state.players.every((p) => {
			if (!p.isArmed) return false;
			if (p.isAfk) return true;
			const t = this.armTime.get(p.id);
			return t !== undefined && now - t < CONFIG.T_ack;
		});
	}

	private fireAckBarrier(): void {
		if (this.afkTimer) {
			clearTimeout(this.afkTimer);
			this.afkTimer = null;
		}
		this.state.players.forEach((p) => {
			p.isArmed = false;
			p.isAfk = false;
		});
		this.armTime.clear();

		if (this.state.buffer.length >= this.state.totalFragments) {
			this.enterAssemble();
		} else {
			this.broadcastState();
			setTimeout(() => this.distributeFragments(), 600);
		}
	}

	private enterAssemble(): void {
		if (this.afkTimer) {
			clearTimeout(this.afkTimer);
			this.afkTimer = null;
		}
		this.state.phase = 'assemble';
		this.state.assemblyOrder = shuffle(this.state.buffer.map((b) => b.id));
		this.broadcastState();
	}

	private enterAnswer(): void {
		this.state.phase = 'answer';
		this.state.currentQuestion = this.currentMessage.text;
		this.submitCooldown.clear();
		this.broadcastAll({ type: 'toast', text: '排列正確！回答問題', kind: 'success' });
		this.broadcastState();
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
