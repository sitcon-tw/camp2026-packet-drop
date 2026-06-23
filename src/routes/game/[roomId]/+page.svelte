<script lang="ts">
	import type { RoomState, Fragment } from '$lib/types';

	const { data } = $props<{ data: { roomId: string } }>();
	const roomId = $derived(data.roomId);

	// ── state ────────────────────────────────────────────────────
	let room = $state<RoomState | null>(null);
	let playerId = $state('');
	let inbox = $state<Fragment | null>(null);
	let toasts = $state<{ id: number; text: string; kind: string }[]>([]);
	let submitCooldownUntil = $state(0);
	let wsReady = $state(false);
	let answerInput = $state('');
	let noteInput = $state('');

	// Flash / reveal countdown
	let revealLeft = $state(0);
	let fragmentHidden = $state(false);
	let revealTimer: ReturnType<typeof setInterval> | null = null;

	let wsRef: WebSocket | null = null;

	// ── derived ──────────────────────────────────────────────────
	const me = $derived(room?.players.find((p) => p.id === playerId));
	const cooldownActive = $derived(submitCooldownUntil > Date.now());
	const armedCount = $derived(room?.players.filter((p) => p.isArmed).length ?? 0);
	const filledCount = $derived(room?.buffer.filter((b) => b !== null).length ?? 0);
	const restartCount = $derived(room?.players.filter((p) => p.wantsRestart).length ?? 0);
	// For sentence questions the notes joined back reconstruct the hidden question.
	const joinedNotes = $derived(
		(room?.buffer ?? []).map((b) => b ?? '▢').join('')
	);

	// ── WS lifecycle ─────────────────────────────────────────────
	$effect(() => {
		const host = window.location.hostname;
		const storedPid = sessionStorage.getItem(`pid:${roomId}`);
		const url = `ws://${host}:8080/ws/${roomId}${storedPid ? `?pid=${storedPid}` : ''}`;
		const socket = new WebSocket(url);
		wsRef = socket;

		socket.onopen = () => {
			wsReady = true;
		};

		socket.onmessage = (e: MessageEvent) => {
			const msg = JSON.parse(e.data as string) as { type: string; [k: string]: unknown };
			switch (msg.type) {
				case 'welcome':
					playerId = msg.playerId as string;
					sessionStorage.setItem(`pid:${roomId}`, playerId);
					socket.send(JSON.stringify({ type: 'join' }));
					break;
				case 'state':
					room = msg.room as RoomState;
					break;
				case 'inbox':
					inbox = msg.fragment as Fragment;
					noteInput = '';
					startReveal();
					break;
				case 'log_ok':
					addToast('已記錄到共享筆記 ✓', 'success');
					break;
				case 'log_reject':
					addToast('封包損毀，無法記錄', 'error');
					break;
				case 'toast':
					addToast(msg.text as string, msg.kind as string);
					break;
				case 'answer_wrong': {
					const penalty = msg.penalty as number;
					submitCooldownUntil = Date.now() + penalty;
					setTimeout(() => { submitCooldownUntil = 0; }, penalty);
					break;
				}
				case 'complete':
					addToast('任務完成！', 'success');
					break;
			}
		};

		socket.onclose = () => {
			wsReady = false;
			wsRef = null;
		};

		return () => {
			if (revealTimer) clearInterval(revealTimer);
			socket.close();
		};
	});

	// Reset inbox/note when entering a new inspect round
	let knownRound = $state(0);
	$effect(() => {
		if (room && room.phase === 'inspect' && room.round !== knownRound) {
			knownRound = room.round;
			inbox = null;
			noteInput = '';
		}
	});

	// Reset answer input when entering answer phase
	$effect(() => {
		if (room?.phase === 'answer') {
			answerInput = '';
		}
	});

	// ── helpers ──────────────────────────────────────────────────
	function send(msg: object) {
		wsRef?.send(JSON.stringify(msg));
	}

	function startReveal() {
		const secs = Math.ceil((room?.revealMs ?? 15000) / 1000);
		revealLeft = secs;
		fragmentHidden = false;
		if (revealTimer) clearInterval(revealTimer);
		revealTimer = setInterval(() => {
			revealLeft -= 1;
			if (revealLeft <= 0) {
				fragmentHidden = true;
				if (revealTimer) clearInterval(revealTimer);
				revealTimer = null;
			}
		}, 1000);
	}

	function addToast(text: string, kind: string) {
		const id = Date.now() + Math.random();
		toasts = [...toasts, { id, text, kind }];
		setTimeout(() => {
			toasts = toasts.filter((t) => t.id !== id);
		}, 3000);
	}

	// ── actions ──────────────────────────────────────────────────
	function ready() {
		send({ type: 'ready' });
	}
	function logFragment() {
		if (!noteInput.trim()) return;
		send({ type: 'log_fragment', text: noteInput.trim() });
	}
	function armAck() {
		if (me?.isArmed) return;
		send({ type: 'arm_ack' });
	}
	function submitAnswer() {
		if (cooldownActive || !answerInput.trim()) return;
		send({ type: 'submit_answer', text: answerInput.trim() });
	}
	function voteRestart() {
		if (me?.wantsRestart) return;
		send({ type: 'vote_restart' });
	}
	function onAnswerKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') submitAnswer();
	}
	function onNoteKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') logFragment();
	}
</script>

{#if !wsReady}
	<div class="fullscreen-msg">連線 ws://…/{roomId} 中…</div>
{:else if !room}
	<div class="fullscreen-msg">等待伺服器…</div>

{:else if room.phase === 'lobby'}
	<!-- ── LOBBY ── -->
	<div class="panel">
		<div class="room-badge">ROOM {roomId}</div>
		<h2>等待玩家加入</h2>

		<ul class="player-list">
			{#each room.players as p (p.id)}
				<li class:me={p.id === playerId}>
					<span class="dot" class:on={p.isReady}></span>
					<span>{p.name}</span>
					{#if p.id === playerId}<span class="you">you</span>{/if}
					{#if p.isReady}<span class="tag-ready">READY</span>{/if}
				</li>
			{/each}
		</ul>

		{#if !me?.isReady}
			<button class="btn primary wide" onclick={ready}>READY</button>
		{:else}
			<p class="muted center">等待其他玩家就緒…</p>
		{/if}
		<p class="hint">需要 ≥{room.minPlayers} 位玩家，共 {room.maxRounds} 題</p>
	</div>

{:else if room.phase === 'inspect'}
	<!-- ── INSPECT ── -->
	<div class="panel">
		<div class="room-badge">
			題目 {room.gameRound}/{room.maxRounds} · {room.questionType === 'clues' ? '線索' : '句子'} · INSPECT
		</div>
		<h2>接收封包（限時記憶）</h2>
		<p class="sub">封包只顯示 {Math.ceil((room.revealMs ?? 15000) / 1000)} 秒，記下後用 input 輸入</p>

		<div class="inbox-box" class:corrupt={inbox?.isCorrupt} class:gone={fragmentHidden}>
			{#if inbox}
				{#if fragmentHidden}
					<span class="muted">封包已消失，請憑記憶輸入</span>
				{:else}
					<span class="mono large">{inbox.content}</span>
					{#if inbox.isCorrupt}
						<span class="corrupt-hint">∴ CORRUPT — ACK 重傳</span>
					{:else}
						<span class="countdown">{revealLeft}s</span>
					{/if}
				{/if}
			{:else}
				<span class="muted">接收封包中…</span>
			{/if}
		</div>

		<div class="note-row">
			<input
				class="answer-input"
				bind:value={noteInput}
				placeholder={inbox?.isCorrupt ? '封包損毀，無法記錄' : '輸入你看到的片段…'}
				disabled={!inbox || inbox.isCorrupt}
				onkeydown={onNoteKeydown}
			/>
			<button class="btn log" onclick={logFragment} disabled={!noteInput.trim()}>
				記錄
			</button>
		</div>

		<div class="actions-single">
			<button class="btn ack" onclick={armAck} disabled={!!me?.isArmed}>
				{me?.isArmed ? 'ACK ✓（等待全員）' : 'ARM ACK（重傳）'}
			</button>
		</div>

		<div class="section-label">共享筆記 {filledCount}/{room.totalFragments}</div>
		<div class="buffer-row">
			{#each Array(room.totalFragments) as _, i (i)}
				<div class="buf-slot" class:filled={room.buffer[i] !== null}>
					{room.buffer[i] !== null ? '▓' : '░'}
				</div>
			{/each}
		</div>

		<div class="section-label">
			ACK {armedCount}/{room.players.length}
			<span class="hint-inline">（同時按下才觸發重傳）</span>
		</div>
		<div class="ack-track">
			<div
				class="ack-fill"
				style="width:{room.players.length > 0 ? (armedCount / room.players.length) * 100 : 0}%"
			></div>
		</div>

		<ul class="player-mini">
			{#each room.players as p (p.id)}
				<li class:me={p.id === playerId}>
					<span class="dot sm" class:on={p.isArmed}></span>
					{p.name}
{#if p.hasLogged}<span class="tag-logged">logged</span>{/if}
				</li>
			{/each}
		</ul>
	</div>

{:else if room.phase === 'answer'}
	<!-- ── ANSWER ── -->
	<div class="panel">
		<div class="room-badge">題目 {room.gameRound}/{room.maxRounds} · ANSWER</div>
		<h2>回答問題</h2>

		<div class="prompt-box">{room.prompt}</div>

		<div class="section-label">共享筆記（隊伍記錄，未必正確）</div>
		{#if room.questionType === 'sentence'}
			<div class="notes-joined mono">{joinedNotes}</div>
		{:else}
			<ul class="notes-list">
				{#each room.buffer as note, i (i)}
					<li class="mono">{note ?? '▢ （缺）'}</li>
				{/each}
			</ul>
		{/if}

		<div class="answer-row">
			<input
				class="answer-input"
				bind:value={answerInput}
				placeholder="輸入答案…"
				onkeydown={onAnswerKeydown}
			/>
			<button class="btn primary" onclick={submitAnswer} disabled={cooldownActive || !answerInput.trim()}>
				{cooldownActive ? '冷卻中…' : 'SUBMIT'}
			</button>
		</div>

		<button class="btn restart wide" onclick={voteRestart} disabled={!!me?.wantsRestart}>
			{me?.wantsRestart ? `等待全員同意 ${restartCount}/${room.players.length}` : `重新開始本題（${restartCount}/${room.players.length}）`}
		</button>

		<ul class="player-mini" style="margin-top:1.25rem">
			{#each room.players as p (p.id)}
				<li class:me={p.id === playerId}>
					{p.name}
					{#if p.wantsRestart}<span class="tag-afk">↻</span>{/if}
				</li>
			{/each}
		</ul>
	</div>

{:else if room.phase === 'complete'}
	<!-- ── COMPLETE ── -->
	<div class="panel complete">
		<div class="complete-icon">✓</div>
		<h2>任務完成！</h2>
		<p class="complete-sub">隊伍完成 {room.maxRounds} 題協議重建</p>
		<a href="/" class="btn primary wide" style="text-align:center;text-decoration:none">
			再玩一局
		</a>
	</div>
{/if}

<!-- Toast stack -->
<div class="toast-stack">
	{#each toasts as t (t.id)}
		<div class="toast" class:ok={t.kind === 'success'} class:bad={t.kind === 'error'}>
			{t.text}
		</div>
	{/each}
</div>

<style>
	:global(body) {
		margin: 0;
		font-family: 'Courier New', monospace;
		background: #08080e;
		color: #dde;
		min-height: 100vh;
	}

	/* Layout */
	.fullscreen-msg {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		color: #445;
	}
	.panel {
		max-width: 480px;
		margin: 0 auto;
		padding: 1.5rem 1rem 3rem;
	}
	.complete {
		text-align: center;
		padding-top: 5rem;
	}

	/* Header */
	h2 {
		margin: 0.2rem 0 1.25rem;
		font-size: 1.35rem;
		color: #ccf;
	}
	.room-badge {
		font-size: 0.7rem;
		color: #7af;
		letter-spacing: 0.12em;
		margin-bottom: 0.2rem;
	}
	.sub {
		margin: -0.8rem 0 1rem;
		font-size: 0.8rem;
		color: #556;
	}

	/* Player list */
	.player-list {
		list-style: none;
		margin: 0 0 1.5rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.player-list li {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: #10101a;
		border: 1px solid transparent;
		border-radius: 6px;
	}
	.player-list li.me {
		border-color: #2a2a4a;
	}
	.you {
		font-size: 0.65rem;
		color: #7af;
	}
	.tag-ready {
		margin-left: auto;
		font-size: 0.65rem;
		color: #4e4;
	}

	/* Inbox */
	.inbox-box {
		background: #0c0c16;
		border: 1px solid #252535;
		border-radius: 8px;
		padding: 1.25rem;
		min-height: 72px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.75rem;
		word-break: break-all;
	}
	.inbox-box.corrupt {
		border-color: #5a2020;
		background: #0e0808;
	}
	.inbox-box.gone {
		border-style: dashed;
		border-color: #1e1e30;
	}
	.corrupt-hint {
		font-size: 0.65rem;
		color: #a44;
		flex-shrink: 0;
	}
	.countdown {
		font-size: 0.9rem;
		color: #fb9;
		flex-shrink: 0;
	}
	.large {
		font-size: 1.05rem;
		line-height: 1.4;
	}

	/* Prompt box */
	.prompt-box {
		background: #0c1020;
		border: 1px solid #2a3a6a;
		border-radius: 8px;
		padding: 1.25rem;
		margin-bottom: 1.25rem;
		text-align: center;
		color: #ccf;
		word-break: break-all;
	}

	/* Notes */
	.notes-joined {
		background: #060610;
		border: 1px dashed #1e1e30;
		border-radius: 6px;
		padding: 0.85rem;
		margin-bottom: 1.25rem;
		color: #7af;
		word-break: break-all;
		letter-spacing: 0.04em;
	}
	.notes-list {
		list-style: none;
		margin: 0 0 1.25rem;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.notes-list li {
		background: #0c0c16;
		border: 1px solid #1e1e30;
		border-radius: 6px;
		padding: 0.5rem 0.7rem;
		font-size: 0.9rem;
		word-break: break-all;
	}

	/* Note input row */
	.note-row {
		display: flex;
		gap: 0.6rem;
		margin-bottom: 0.75rem;
	}

	/* Answer input */
	.answer-row {
		display: flex;
		gap: 0.6rem;
		margin-bottom: 0.75rem;
	}
	.answer-input {
		flex: 1;
		background: #0a0a0f;
		border: 1px solid #2a2a4a;
		border-radius: 6px;
		color: #dde;
		font-family: inherit;
		font-size: 0.95rem;
		padding: 0.65rem 0.9rem;
		outline: none;
		transition: border-color 0.15s;
	}
	.answer-input:focus {
		border-color: #7af;
	}
	.answer-input:disabled {
		opacity: 0.4;
	}

	/* Actions */
	.actions-single {
		margin-bottom: 1.25rem;
	}

	/* Buttons */
	.btn {
		background: #12121e;
		border: 1px solid #2a2a4a;
		border-radius: 6px;
		color: #dde;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.9rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		padding: 0.65rem 1rem;
		transition: background 0.12s, border-color 0.12s;
	}
	.btn:disabled {
		opacity: 0.38;
		cursor: not-allowed;
	}
	.btn:not(:disabled):hover {
		background: #1a1a2e;
	}
	.btn.log {
		border-color: #335;
		flex-shrink: 0;
	}
	.btn.ack {
		border-color: #743;
		color: #fb9;
		width: 100%;
	}
	.btn.restart {
		border-color: #543;
		color: #db9;
	}
	.btn.primary {
		background: #6af;
		border-color: #6af;
		color: #000;
		font-weight: 700;
	}
	.btn.primary:not(:disabled):hover {
		background: #8cf;
		border-color: #8cf;
	}
	.btn.wide {
		width: 100%;
		padding: 0.75rem;
		font-size: 1rem;
	}

	/* Buffer */
	.section-label {
		font-size: 0.72rem;
		color: #556;
		margin-bottom: 0.4rem;
	}
	.hint-inline {
		color: #444;
	}
	.buffer-row {
		display: flex;
		gap: 4px;
		margin-bottom: 1rem;
	}
	.buf-slot {
		color: #2a2a3a;
		font-size: 1.1rem;
	}
	.buf-slot.filled {
		color: #4e4;
	}

	/* ACK bar */
	.ack-track {
		height: 3px;
		background: #141424;
		border-radius: 2px;
		margin-bottom: 1rem;
	}
	.ack-fill {
		height: 100%;
		background: #fb9;
		border-radius: 2px;
		transition: width 0.25s;
	}

	/* Mini player list */
	.player-mini {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
	}
	.player-mini li {
		font-size: 0.72rem;
		color: #445;
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.player-mini li.me {
		color: #99b;
	}
	.tag-afk {
		color: #944;
		font-size: 0.6rem;
	}
	.tag-logged {
		color: #4a7;
		font-size: 0.6rem;
	}

	/* Complete */
	.complete-icon {
		font-size: 4rem;
		color: #4e4;
		margin-bottom: 0.5rem;
		font-family: monospace;
	}
	.complete-sub {
		color: #556;
		font-size: 0.9rem;
		margin: 0 0 2rem;
	}

	/* Toasts */
	.toast-stack {
		position: fixed;
		bottom: 1.5rem;
		right: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		z-index: 100;
		pointer-events: none;
	}
	.toast {
		background: #12121e;
		border: 1px solid #2a2a4a;
		border-radius: 6px;
		padding: 0.55rem 0.9rem;
		font-size: 0.82rem;
		animation: up 0.14s ease;
	}
	.toast.ok {
		border-color: #2a5a3a;
		color: #5d5;
	}
	.toast.bad {
		border-color: #5a2a2a;
		color: #d66;
	}

	/* Shared */
	.mono {
		font-family: 'Courier New', monospace;
	}
	.muted {
		color: #445;
	}
	.center {
		text-align: center;
	}
	.hint {
		color: #334;
		font-size: 0.72rem;
		margin-top: 0.75rem;
		text-align: center;
	}

	/* Dots */
	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: #223;
		flex-shrink: 0;
	}
	.dot.sm {
		width: 6px;
		height: 6px;
	}
	.dot.on {
		background: #4e4;
	}
	.dot.sm.on {
		background: #fb9;
	}

	@keyframes up {
		from {
			opacity: 0;
			transform: translateY(6px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
