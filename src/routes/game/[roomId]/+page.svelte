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

	// Optimistic assembly order (mirrors server; updated immediately on drag)
	let localOrder = $state<string[]>([]);
	let dragFrom = $state<number | null>(null);

	let wsRef: WebSocket | null = null;

	// ── derived ──────────────────────────────────────────────────
	const me = $derived(room?.players.find((p) => p.id === playerId));
	const cooldownActive = $derived(submitCooldownUntil > Date.now());
	const armedCount = $derived(room?.players.filter((p) => p.isArmed).length ?? 0);
	// Use local order if set (optimistic), otherwise fall back to server's order
	const displayOrder = $derived(localOrder.length > 0 ? localOrder : (room?.assemblyOrder ?? []));
	const assembled = $derived(
		displayOrder.map((id) => room?.buffer.find((b) => b.id === id)?.content ?? '?').join('')
	);

	// ── WS lifecycle ─────────────────────────────────────────────
	$effect(() => {
		const name = localStorage.getItem('ack_player_name') ?? 'Player';
		const host = window.location.hostname;
		const url = `ws://${host}:8080/ws/${roomId}`;
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
					socket.send(JSON.stringify({ type: 'join', playerName: name }));
					break;
				case 'state': {
					const r = msg.room as RoomState;
					room = r;
					// Sync local order from server when entering assemble fresh
					if (r.phase === 'assemble' && localOrder.length === 0) {
						localOrder = [...r.assemblyOrder];
					}
					// Clear local order when leaving assemble
					if (r.phase !== 'assemble') {
						localOrder = [];
					}
					break;
				}
				case 'inbox':
					inbox = msg.fragment as Fragment;
					break;
				case 'log_ok':
					addToast('封包已記錄 ✓', 'success');
					break;
				case 'log_reject':
					addToast('封包損毀，已拒絕', 'error');
					break;
				case 'toast':
					addToast(msg.text as string, msg.kind as string);
					break;
				case 'submit_wrong':
					submitCooldownUntil = Date.now() + (msg.penalty as number);
					addToast('答案錯誤！冷卻中…', 'error');
					break;
				case 'win':
					addToast(`✓ 正確！`, 'success');
					break;
			}
		};

		socket.onclose = () => {
			wsReady = false;
			wsRef = null;
		};

		return () => socket.close();
	});

	// Reset inbox only when round number advances (not on every room update)
	let knownRound = $state(0);
	$effect(() => {
		if (room && room.phase === 'inspect' && room.round !== knownRound) {
			knownRound = room.round;
			inbox = null;
		}
	});

	// ── helpers ──────────────────────────────────────────────────
	function send(msg: object) {
		wsRef?.send(JSON.stringify(msg));
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
		if (!inbox || me?.hasLogged) return;
		send({ type: 'log_fragment' });
	}
	function armAck() {
		if (me?.isArmed) return;
		send({ type: 'arm_ack' });
	}
	function submitAnswer() {
		if (cooldownActive) return;
		send({ type: 'submit' });
	}

	// ── drag & drop ──────────────────────────────────────────────
	function ondragstart(e: DragEvent, index: number) {
		dragFrom = index;
		e.dataTransfer!.effectAllowed = 'move';
	}
	function ondragover(e: DragEvent) {
		e.preventDefault();
		e.dataTransfer!.dropEffect = 'move';
	}
	function ondrop(e: DragEvent, index: number) {
		e.preventDefault();
		if (dragFrom === null || dragFrom === index) return;
		const next = [...displayOrder];
		[next[dragFrom], next[index]] = [next[index], next[dragFrom]];
		dragFrom = null;
		localOrder = next; // optimistic update
		send({ type: 'set_order', order: next }); // sync to server + others
	}
	function ondragend() {
		dragFrom = null;
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
			{#each room.players as p}
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
		<p class="hint">需要 ≥2 位玩家</p>
	</div>

{:else if room.phase === 'inspect'}
	<!-- ── INSPECT ── -->
	<div class="panel">
		<div class="room-badge">ROUND {room.round}</div>
		<h2>Inspect Inbox</h2>

		<div class="inbox-box" class:corrupt={inbox?.isCorrupt}>
			{#if inbox}
				<span class="mono large">{inbox.content}</span>
				{#if inbox.isCorrupt}
					<span class="corrupt-hint">∴ CORRUPT?</span>
				{/if}
			{:else}
				<span class="muted">接收封包中…</span>
			{/if}
		</div>

		<div class="actions">
			<button class="btn log" onclick={logFragment} disabled={!inbox || !!me?.hasLogged}>
				{me?.hasLogged ? '已記錄' : 'Log Fragment'}
			</button>
			<button class="btn ack" onclick={armAck} disabled={!!me?.isArmed}>
				{me?.isArmed ? 'ACK ✓' : 'ARM ACK'}
			</button>
		</div>

		<!-- Buffer -->
		<div class="section-label">Buffer {room.buffer.length}/{room.totalFragments}</div>
		<div class="buffer-row">
			{#each Array(room.totalFragments) as _, i}
				<div class="buf-slot" class:filled={!!room.buffer[i]}>
					{room.buffer[i] ? '▓' : '░'}
				</div>
			{/each}
		</div>

		<!-- ACK bar -->
		<div class="section-label">
			ACK {armedCount}/{room.players.length}
			<span class="hint-inline">（3 秒 window，同時按下才觸發）</span>
		</div>
		<div class="ack-track">
			<div
				class="ack-fill"
				style="width:{room.players.length > 0 ? (armedCount / room.players.length) * 100 : 0}%"
			></div>
		</div>

		<!-- Player list -->
		<ul class="player-mini">
			{#each room.players as p}
				<li class:me={p.id === playerId}>
					<span class="dot sm" class:on={p.isArmed}></span>
					{p.name}
					{#if p.isAfk}<span class="tag-afk">AFK</span>{/if}
					{#if p.hasLogged}<span class="tag-logged">logged</span>{/if}
				</li>
			{/each}
		</ul>
	</div>

{:else if room.phase === 'assemble'}
	<!-- ── ASSEMBLE ── -->
	<div class="panel">
		<h2>Assemble</h2>
		<p class="sub">拖曳排列封包 → 重組訊息</p>

		<div class="frag-list">
			{#each displayOrder as id, i}
				{@const b = room.buffer.find((buf) => buf.id === id)}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="frag-chip"
					class:dragging={dragFrom === i}
					draggable="true"
					ondragstart={(e) => ondragstart(e, i)}
					ondragover={ondragover}
					ondrop={(e) => ondrop(e, i)}
					ondragend={ondragend}
				>
					<span class="chip-n">{i + 1}</span>
					<span class="chip-content mono">{b?.content ?? '?'}</span>
					<span class="drag-handle">⠿</span>
				</div>
			{/each}
		</div>

		<div class="preview-box">
			<span class="muted-sm">預覽：</span>
			<span class="mono preview-text">{assembled}</span>
		</div>

		<button class="btn primary wide" onclick={submitAnswer} disabled={cooldownActive}>
			{cooldownActive ? '冷卻中…' : 'SUBMIT'}
		</button>

		<ul class="player-mini" style="margin-top:1rem">
			{#each room.players as p}
				<li class:me={p.id === playerId}>{p.name}</li>
			{/each}
		</ul>
	</div>

{:else if room.phase === 'win'}
	<!-- ── WIN ── -->
	<div class="panel win">
		<div class="trophy">🏆</div>
		<h2>{room.winnerName} 獲勝！</h2>
		{#if room.winnerName === me?.name}
			<p class="you-won">你贏了！</p>
		{/if}
		<p class="answer mono">{room.buffer.map((b) => b.content).join('')}</p>
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
	.win {
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
		margin-bottom: 1rem;
		word-break: break-all;
	}
	.inbox-box.corrupt {
		border-color: #5a2020;
		background: #0e0808;
	}
	.corrupt-hint {
		font-size: 0.65rem;
		color: #a44;
		flex-shrink: 0;
	}
	.large {
		font-size: 1.05rem;
		line-height: 1.4;
	}

	/* Actions */
	.actions {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
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
	}
	.btn.ack {
		border-color: #743;
		color: #fb9;
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

	/* Assemble */
	.frag-list {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		margin-bottom: 0.75rem;
	}
	.frag-chip {
		background: #10101a;
		border: 1px solid #222232;
		border-radius: 6px;
		padding: 0.55rem 0.8rem;
		cursor: grab;
		display: flex;
		align-items: center;
		gap: 0.7rem;
		user-select: none;
		transition: background 0.1s, border-color 0.1s;
	}
	.frag-chip:hover {
		background: #181828;
		border-color: #3a3a6a;
	}
	.frag-chip.dragging {
		opacity: 0.38;
	}
	.chip-n {
		font-size: 0.65rem;
		color: #445;
		width: 18px;
		flex-shrink: 0;
		text-align: right;
	}
	.chip-content {
		flex: 1;
		word-break: break-all;
		font-size: 0.95rem;
	}
	.drag-handle {
		color: #334;
		font-size: 0.8rem;
		flex-shrink: 0;
	}
	.preview-box {
		background: #060610;
		border: 1px dashed #1e1e30;
		border-radius: 6px;
		padding: 0.75rem;
		margin-bottom: 0.75rem;
		word-break: break-all;
	}
	.preview-text {
		color: #7af;
	}

	/* Win */
	.trophy {
		font-size: 4rem;
		margin-bottom: 0.5rem;
	}
	.you-won {
		color: #7f7;
		font-size: 1rem;
		margin: 0 0 0.5rem;
	}
	.answer {
		color: #7af;
		font-size: 1.05rem;
		margin: 0.5rem 0 2rem;
		word-break: break-all;
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
	.muted-sm {
		font-size: 0.72rem;
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
