<script lang="ts">
	import { resolve } from '$app/paths';
	import type { Fragment, FragmentChoice, RoomState } from '$lib/types';

	const { data } = $props<{ data: { roomId: string } }>();
	const roomId = $derived(data.roomId);

	const packetSlots = Array.from({ length: 12 }, (_, i) => i);
	const lobbyNodes = ['CLIENT', 'ROUTER', 'BUFFER', 'ACK'];

	// ── state ────────────────────────────────────────────────────
	let room = $state<RoomState | null>(null);
	let playerId = $state('');
	let inbox = $state<Fragment | null>(null);
	let toasts = $state<{ id: number; text: string; kind: string }[]>([]);
	let submitCooldownUntil = $state(0);
	let choiceCooldownUntil = $state(0);
	let now = $state(Date.now());
	let wsReady = $state(false);
	let answerInput = $state('');
	let choices = $state<FragmentChoice[]>([]);
	let choiceFragId = $state('');
	let selectedChoiceId = $state('');
	let choiceExpired = $state(false);
	let kicked = $state(false);

	// Flash / reveal countdown
	let revealLeft = $state(0);
	let fragmentHidden = $state(false);
	let revealTimer: ReturnType<typeof setInterval> | null = null;

	let wsRef: WebSocket | null = null;

	// ── derived ──────────────────────────────────────────────────
	const me = $derived(room?.players.find((p) => p.id === playerId));
	const isHost = $derived(room?.hostId === playerId);
	const onlineCount = $derived(room?.players.filter((p) => p.isConnected).length ?? 0);
	const submitCooldownEnd = $derived(Math.max(submitCooldownUntil, room?.answerCooldownUntil ?? 0));
	const cooldownActive = $derived(submitCooldownEnd > now);
	const cooldownRemaining = $derived(Math.max(0, Math.ceil((submitCooldownEnd - now) / 1000)));
	const choiceCooldownActive = $derived(choiceCooldownUntil > Date.now());
	const armedCount = $derived(room?.players.filter((p) => p.isArmed).length ?? 0);
	const filledCount = $derived(room?.buffer.filter((b) => b !== null).length ?? 0);
	const restartCount = $derived(room?.players.filter((p) => p.wantsRestart).length ?? 0);
	const joinedNotes = $derived((room?.buffer ?? []).map((b) => b ?? '▢').join(''));
	const fragmentSlots = $derived(
		room ? Array.from({ length: room.totalFragments }, (_, i) => i) : []
	);
	const bufferProgress = $derived(
		room && room.totalFragments > 0 ? Math.round((filledCount / room.totalFragments) * 100) : 0
	);
	const ackProgress = $derived(
		room && room.players.length > 0 ? Math.round((armedCount / room.players.length) * 100) : 0
	);
	const phaseTitle = $derived(
		!room
			? 'CONNECTING'
			: room.phase === 'lobby'
				? 'LOBBY'
				: room.phase === 'inspect'
					? 'INSPECT'
					: room.phase === 'answer'
						? 'ANSWER'
						: 'COMPLETE'
	);
	const statusItems = $derived(
		room
			? [
					{ label: 'ROOM', value: room.roomId },
					{ label: 'ROUND', value: `${room.gameRound}/${room.maxRounds}` },
					{ label: 'BUFFER', value: `${filledCount}/${room.totalFragments || 0}` },
					{ label: 'ACK', value: `${armedCount}/${room.players.length}` }
				]
			: []
	);

	// ── WS lifecycle ─────────────────────────────────────────────
	$effect(() => {
		const tick = setInterval(() => {
			now = Date.now();
		}, 250);
		return () => clearInterval(tick);
	});

	$effect(() => {
		const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
		const storedPid = sessionStorage.getItem(`pid:${roomId}`);
		const url = `${proto}://${window.location.host}/ws/${roomId}${storedPid ? `?pid=${storedPid}` : ''}`;
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
				case 'kicked':
					kicked = true;
					sessionStorage.removeItem(`pid:${roomId}`);
					addToast('你已被房主移出房間', 'error');
					socket.close();
					break;
				case 'inbox':
					inbox = msg.fragment as Fragment;
					choices = [];
					choiceFragId = '';
					selectedChoiceId = '';
					choiceExpired = false;
					startReveal();
					break;
				case 'choice_set':
					choiceFragId = msg.fragId as string;
					choices = msg.choices as FragmentChoice[];
					break;
				case 'log_ok':
					selectedChoiceId = '';
					choices = [];
					choiceFragId = '';
					addToast('已寫入共享筆記 ✓', 'success');
					break;
				case 'log_reject':
					addToast('封包損毀，無法記錄', 'error');
					break;
				case 'toast':
					addToast(msg.text as string, msg.kind as string);
					break;
				case 'answer_wrong': {
					const penalty = msg.penalty as number;
					const cooldownUntil =
						typeof msg.cooldownUntil === 'number' ? msg.cooldownUntil : Date.now() + penalty;
					submitCooldownUntil = cooldownUntil;
					setTimeout(() => {
						submitCooldownUntil = 0;
					}, penalty);
					break;
				}
				case 'choice_wrong': {
					const penalty = msg.penalty as number;
					choiceCooldownUntil = Date.now() + penalty;
					selectedChoiceId = '';
					setTimeout(() => {
						choiceCooldownUntil = 0;
					}, penalty);
					break;
				}
				case 'choice_expired':
					choiceExpired = true;
					choices = [];
					choiceFragId = '';
					addToast('已逾時，卡片已消失', 'error');
					break;
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

	let knownInspectKey = $state('');
	$effect(() => {
		const key = room?.phase === 'inspect' ? `${room.gameRound}:${room.round}` : '';
		if (key && key !== knownInspectKey) {
			knownInspectKey = key;
			inbox = null;
			choices = [];
			choiceFragId = '';
			selectedChoiceId = '';
		}
		if (!key) knownInspectKey = '';
	});

	let knownAnswerKey = $state('');
	$effect(() => {
		const key = room?.phase === 'answer' ? `${room.gameRound}:${room.round}` : '';
		if (key && key !== knownAnswerKey) {
			knownAnswerKey = key;
			answerInput = '';
		}
		if (!key) knownAnswerKey = '';
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
	function armAck() {
		if (me?.isArmed) return;
		send({ type: 'arm_ack' });
	}
	function selectChoice(choiceId: string) {
		if (choiceCooldownActive || selectedChoiceId || me?.hasLogged) return;
		selectedChoiceId = choiceId;
		send({ type: 'select_fragment_choice', choiceId });
	}
	function submitAnswer() {
		if (cooldownActive || !answerInput.trim()) return;
		send({ type: 'submit_answer', text: answerInput.trim() });
	}
	function voteRestart() {
		if (me?.wantsRestart) return;
		send({ type: 'vote_restart' });
	}
	function kickPlayer(targetId: string) {
		const target = room?.players.find((p) => p.id === targetId);
		if (!isHost || !target || target.id === playerId) return;
		if (!confirm(`要將 ${target.name} 移出房間嗎？`)) return;
		send({ type: 'kick_player', playerId: target.id });
	}
	function onAnswerKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') submitAnswer();
	}
</script>

<svelte:head>
	<title>ROOM {roomId} | 封包掉包</title>
</svelte:head>

<main class="game-shell">
	<header class="topbar">
		<a class="brand" href={resolve('/')}>SITCON Camp 2026 / 封包掉包</a>
		<div class="link-state" class:online={wsReady}>{wsReady ? phaseTitle : 'CONNECTING'}</div>
	</header>

	{#if kicked}
		<section class="panel status-panel">
			<h2>已被移出房間</h2>
			<p class="muted">請向房主確認後再重新加入</p>
			<a href={resolve('/')} class="btn primary wide">回首頁</a>
		</section>
	{:else if !wsReady}
		<section class="panel status-panel">
			<div class="pulse-grid" aria-hidden="true">
				{#each packetSlots as slot (slot)}
					<span style="opacity:{0.2 + slot * 0.04}"></span>
				{/each}
			</div>
			<h2>連線 ws://.../{roomId}</h2>
			<p class="muted">等待 WebSocket channel 開啟</p>
		</section>
	{:else if !room}
		<section class="panel status-panel">
			<div class="pulse-grid" aria-hidden="true">
				{#each packetSlots as slot (slot)}
					<span style="opacity:{0.2 + slot * 0.04}"></span>
				{/each}
			</div>
			<h2>等待伺服器</h2>
			<p class="muted">同步房間狀態中</p>
		</section>
	{:else if room.phase === 'lobby'}
		<section class="panel">
			<div class="panel-head">
				<div>
					<div class="room-badge">ROOM {roomId}</div>
					<h2>等待玩家加入</h2>
				</div>
				<div class="mini-stat">
					<strong>{onlineCount}</strong>
					<span>online</span>
				</div>
			</div>

			<div class="route-visual" aria-hidden="true">
				{#each lobbyNodes as node, i (node)}
					<span class:active={i === 2}>{node}</span>
				{/each}
			</div>

			<ul class="player-list">
				{#each room.players as p (p.id)}
					<li class:me={p.id === playerId} class:offline={!p.isConnected}>
						<span class="dot" class:on={p.isConnected} class:offline={!p.isConnected}></span>
						<span>{p.name}</span>
						{#if p.id === room.hostId}<span class="host-tag">HOST</span>{/if}
						{#if p.id === playerId}<span class="you">you</span>{/if}
						{#if !p.isConnected}
							<span class="tag-offline">RECONNECTING</span>
						{:else}
							<span class="tag-online">ONLINE</span>
						{/if}
						{#if isHost && p.id !== playerId}
							<button class="kick-btn" type="button" onclick={() => kickPlayer(p.id)}>踢出</button>
						{/if}
					</li>
				{/each}
			</ul>

			<p class="muted center">等待管理員開始</p>
			<p class="hint">管理員開始後進入遊戲，共 {room.maxRounds} 題</p>
		</section>
	{:else if room.phase === 'inspect'}
		<section class="panel">
			<div class="panel-head">
				<div>
					<div class="room-badge">
						題目 {room.gameRound}/{room.maxRounds} / {room.questionType === 'clues'
							? '線索'
							: '句子'} / INSPECT
					</div>
					<h2>接收封包</h2>
				</div>
				<div class="mini-stat warn">
					<strong>{revealLeft}s</strong>
					<span>flash</span>
				</div>
			</div>

			<div class="status-strip">
				{#each statusItems as item (item.label)}
					<div>
						<span>{item.label}</span>
						<strong>{item.value}</strong>
					</div>
				{/each}
			</div>

			<div class="packet-window" class:corrupt={inbox?.isCorrupt} class:gone={fragmentHidden}>
				{#if inbox}
					{#if fragmentHidden}
						<span class="muted">封包已消失，請從選項找出正確片段</span>
					{:else}
						<span class="mono large">{inbox.content}</span>
						{#if inbox.isCorrupt}
							<span class="corrupt-hint">CORRUPT / ACK</span>
						{:else}
							<span class="countdown">{revealLeft}s</span>
						{/if}
					{/if}
				{:else}
					<span class="muted">接收封包中</span>
				{/if}
			</div>

			<div class="choice-panel">
				<div class="section-label">
					<span>片段辨識</span>
					<span>
						{#if inbox?.isCorrupt}
							請 ACK 重傳
						{:else if choiceExpired}
							已逾時
						{:else if me?.hasLogged}
							已記錄
						{:else if choices.length > 0}
							選出正確片段
						{:else if fragmentHidden}
							載入選項中
						{:else}
							記住封包
						{/if}
					</span>
				</div>
				{#if choiceExpired}
					<p class="choice-empty">已逾時，卡片已消失 — 請 ACK 重傳獲取新封包</p>
				{:else if inbox?.isCorrupt}
					<p class="choice-empty">封包損毀，無法辨識；請全員 ARM ACK 重傳。</p>
				{:else if choices.length > 0 && choiceFragId === inbox?.id}
					<div class="choice-grid">
						{#each choices as choice (choice.id)}
							<button
								class="choice-btn"
								class:selected={selectedChoiceId === choice.id}
								type="button"
								onclick={() => selectChoice(choice.id)}
								disabled={choiceCooldownActive || !!selectedChoiceId || !!me?.hasLogged}
							>
								{choice.text}
							</button>
						{/each}
					</div>
				{:else}
					<p class="choice-empty">
						{fragmentHidden ? '等待伺服器發送選項…' : '封包消失後會出現相似選項。'}
					</p>
				{/if}
			</div>

			<button class="btn ack wide" type="button" onclick={armAck} disabled={!!me?.isArmed}>
				{me?.isArmed ? 'ACK ✓ 等待全員' : 'ARM ACK'}
			</button>

			<div class="progress-block">
				<div class="section-label">
					<span>共享筆記 {filledCount}/{room.totalFragments}</span>
					<span>{bufferProgress}%</span>
				</div>
				<div class="buffer-row">
					{#each fragmentSlots as i (i)}
						<div class="buf-slot" class:filled={room.buffer[i] !== null}>
							{room.buffer[i] !== null ? '▓' : '░'}
						</div>
					{/each}
				</div>
			</div>

			<div class="progress-block">
				<div class="section-label">
					<span>ACK {armedCount}/{room.players.length}</span>
					<span>barrier</span>
				</div>
				<div class="ack-track">
					<div class="ack-fill" style="width:{ackProgress}%"></div>
				</div>
			</div>

			<ul class="player-mini">
				{#each room.players as p (p.id)}
					<li class:me={p.id === playerId} class:offline={!p.isConnected}>
						<span class="dot sm" class:on={p.isArmed} class:offline={!p.isConnected}></span>
						{p.name}
						{#if p.id === room.hostId}<span class="host-tag mini">HOST</span>{/if}
						{#if !p.isConnected}
							<span class="tag-offline">offline</span>
						{:else if p.hasLogged}
							<span class="tag-logged">logged</span>
						{/if}
						{#if isHost && p.id !== playerId}
							<button class="kick-btn mini" type="button" onclick={() => kickPlayer(p.id)}
								>踢出</button
							>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{:else if room.phase === 'answer'}
		<section class="panel">
			<div class="panel-head">
				<div>
					<div class="room-badge">題目 {room.gameRound}/{room.maxRounds} / ANSWER</div>
					<h2>回答問題</h2>
				</div>
				<div class="mini-stat">
					<strong>{filledCount}</strong>
					<span>notes</span>
				</div>
			</div>

			<div class="prompt-box">{room.prompt}</div>

			<div class="section-label">
				<span>共享筆記</span>
				<span>team buffer</span>
			</div>
			{#if room.questionType === 'sentence'}
				<div class="notes-joined mono">{joinedNotes}</div>
			{:else}
				<ul class="notes-list">
					{#each room.buffer as note, i (i)}
						<li class="mono">
							<span>{String(i + 1).padStart(2, '0')}</span>
							<strong>{note ?? '▢ （缺）'}</strong>
						</li>
					{/each}
				</ul>
			{/if}

			<div class="answer-row">
				<input
					class="answer-input"
					bind:value={answerInput}
					placeholder="輸入答案"
					autocomplete="off"
					autocapitalize="off"
					spellcheck={false}
					onkeydown={onAnswerKeydown}
				/>
				<button
					class="btn primary"
					type="button"
					onclick={submitAnswer}
					disabled={cooldownActive || !answerInput.trim()}
				>
					{cooldownActive ? `冷卻中 ${cooldownRemaining}s` : 'SUBMIT'}
				</button>
			</div>

			<button
				class="btn restart wide"
				type="button"
				onclick={voteRestart}
				disabled={!!me?.wantsRestart}
			>
				{me?.wantsRestart
					? `等待全員同意 ${restartCount}/${room.players.length}`
					: `重新開始本題 ${restartCount}/${room.players.length}`}
			</button>

			<ul class="player-mini spaced">
				{#each room.players as p (p.id)}
					<li class:me={p.id === playerId} class:offline={!p.isConnected}>
						{p.name}
						{#if p.id === room.hostId}<span class="host-tag mini">HOST</span>{/if}
						{#if !p.isConnected}
							<span class="tag-offline">offline</span>
						{:else if p.wantsRestart}
							<span class="tag-restart">restart</span>
						{/if}
						{#if isHost && p.id !== playerId}
							<button class="kick-btn mini" type="button" onclick={() => kickPlayer(p.id)}
								>踢出</button
							>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{:else if room.phase === 'complete'}
		<section class="panel complete">
			<div class="complete-icon">✓</div>
			<h2>任務完成</h2>
			<p class="complete-sub">隊伍完成 {room.maxRounds} 題協議重建</p>
			<a href={resolve('/')} class="btn primary wide">再玩一局</a>
		</section>
	{/if}
</main>

<div class="toast-stack">
	{#each toasts as t (t.id)}
		<div class="toast" class:ok={t.kind === 'success'} class:bad={t.kind === 'error'}>
			{t.text}
		</div>
	{/each}
</div>

<style>
	:global(*) {
		box-sizing: border-box;
	}

	:global(body) {
		margin: 0;
		font-family:
			ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Noto Sans TC',
			monospace;
		background:
			linear-gradient(rgba(73, 211, 255, 0.05) 1px, transparent 1px),
			linear-gradient(90deg, rgba(142, 230, 107, 0.04) 1px, transparent 1px), #071110;
		background-size: 42px 42px;
		color: #eef7f2;
		min-height: 100vh;
	}

	button,
	input {
		font: inherit;
	}

	.game-shell {
		width: min(920px, 100%);
		min-height: 100vh;
		margin: 0 auto;
		padding: 0.9rem;
		display: grid;
		grid-template-rows: auto 1fr;
		gap: 0.85rem;
	}

	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		border: 1px solid rgba(238, 247, 242, 0.14);
		border-radius: 8px;
		background: rgba(10, 20, 19, 0.9);
		padding: 0.65rem 0.8rem;
	}

	.brand {
		color: #eef7f2;
		text-decoration: none;
		font-weight: 900;
		font-size: 0.88rem;
	}

	.link-state {
		border: 1px solid rgba(255, 191, 87, 0.4);
		border-radius: 999px;
		color: #ffbf57;
		padding: 0.25rem 0.55rem;
		font-size: 0.72rem;
		font-weight: 800;
		white-space: nowrap;
	}

	.link-state.online {
		border-color: rgba(142, 230, 107, 0.45);
		color: #8ee66b;
	}

	.panel {
		align-self: start;
		width: 100%;
		border: 1px solid rgba(142, 230, 107, 0.22);
		border-radius: 8px;
		background: rgba(10, 20, 19, 0.94);
		box-shadow: 0 18px 60px rgba(0, 0, 0, 0.32);
		padding: 1rem;
	}

	.status-panel,
	.complete {
		align-self: center;
		text-align: center;
	}

	.panel-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 1rem;
	}

	h2 {
		margin: 0.15rem 0 0;
		font-size: 1.45rem;
		line-height: 1.2;
	}

	.room-badge {
		color: #49d3ff;
		font-size: 0.74rem;
		font-weight: 800;
	}

	.mini-stat {
		min-width: 74px;
		border: 1px solid rgba(238, 247, 242, 0.14);
		border-radius: 8px;
		background: #081312;
		padding: 0.5rem;
		text-align: right;
	}

	.mini-stat strong {
		display: block;
		color: #8ee66b;
		font-size: 1.25rem;
	}

	.mini-stat span {
		color: #8aa29d;
		font-size: 0.7rem;
	}

	.mini-stat.warn strong {
		color: #ffbf57;
	}

	.status-strip {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.5rem;
		margin-bottom: 0.85rem;
	}

	.status-strip div {
		min-height: 58px;
		border: 1px solid rgba(238, 247, 242, 0.13);
		border-radius: 8px;
		background: #081312;
		padding: 0.55rem;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
	}

	.status-strip span,
	.section-label {
		color: #8aa29d;
		font-size: 0.72rem;
	}

	.status-strip strong {
		color: #eef7f2;
		font-size: 0.92rem;
		overflow-wrap: anywhere;
	}

	.route-visual {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.55rem;
		margin-bottom: 1rem;
		padding: 0.75rem;
		border: 1px solid rgba(73, 211, 255, 0.18);
		border-radius: 8px;
		background:
			repeating-linear-gradient(90deg, rgba(73, 211, 255, 0.08) 0 12px, transparent 12px 24px),
			#081312;
	}

	.route-visual span {
		min-height: 42px;
		display: grid;
		place-items: center;
		border: 1px solid rgba(238, 247, 242, 0.14);
		border-radius: 6px;
		color: #b9cbc6;
		background: #0d1817;
		font-size: 0.72rem;
		font-weight: 900;
	}

	.route-visual span.active {
		border-color: #8ee66b;
		color: #06100f;
		background: #8ee66b;
	}

	.player-list {
		list-style: none;
		margin: 0 0 1rem;
		padding: 0;
		display: grid;
		gap: 0.45rem;
	}

	.player-list li,
	.player-mini li {
		display: flex;
		align-items: center;
		gap: 0.45rem;
	}

	.player-list li {
		min-height: 44px;
		border: 1px solid rgba(238, 247, 242, 0.1);
		border-radius: 8px;
		background: #081312;
		padding: 0.5rem 0.65rem;
	}

	.player-list li.me {
		border-color: rgba(73, 211, 255, 0.55);
	}

	.player-list li.offline,
	.player-mini li.offline {
		opacity: 0.58;
	}

	.you {
		color: #49d3ff;
		font-size: 0.68rem;
	}

	.host-tag {
		border: 1px solid rgba(73, 211, 255, 0.36);
		border-radius: 999px;
		color: #49d3ff;
		padding: 0.12rem 0.4rem;
		font-size: 0.64rem;
		font-weight: 900;
	}

	.host-tag.mini {
		padding: 0.05rem 0.3rem;
		font-size: 0.58rem;
	}

	.tag-online,
	.tag-offline {
		margin-left: auto;
		font-size: 0.68rem;
		font-weight: 800;
	}

	.tag-online {
		color: #8ee66b;
	}

	.tag-offline {
		color: #ffbf57;
	}

	.kick-btn {
		flex-shrink: 0;
		border: 1px solid rgba(255, 105, 97, 0.4);
		border-radius: 6px;
		color: #ff6961;
		cursor: pointer;
		background: rgba(255, 105, 97, 0.08);
		padding: 0.32rem 0.48rem;
		font-size: 0.68rem;
		font-weight: 900;
	}

	.kick-btn:not(:disabled):hover {
		border-color: #ff6961;
		background: rgba(255, 105, 97, 0.16);
	}

	.kick-btn.mini {
		padding: 0.12rem 0.32rem;
		font-size: 0.6rem;
	}

	.packet-window {
		position: relative;
		overflow: hidden;
		min-height: 118px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		margin-bottom: 0.75rem;
		border: 1px solid rgba(73, 211, 255, 0.24);
		border-radius: 8px;
		background:
			linear-gradient(90deg, rgba(73, 211, 255, 0.12), transparent 48%),
			repeating-linear-gradient(0deg, rgba(238, 247, 242, 0.05) 0 1px, transparent 1px 6px), #081312;
		padding: 1rem;
		word-break: break-word;
	}

	.packet-window.corrupt {
		border-color: rgba(255, 105, 97, 0.55);
		background:
			repeating-linear-gradient(90deg, rgba(255, 105, 97, 0.18) 0 10px, transparent 10px 18px),
			#140b0b;
	}

	.packet-window.gone {
		border-style: dashed;
		border-color: rgba(255, 191, 87, 0.36);
	}

	.corrupt-hint,
	.countdown {
		flex-shrink: 0;
		border-radius: 999px;
		padding: 0.25rem 0.55rem;
		font-size: 0.72rem;
		font-weight: 900;
	}

	.corrupt-hint {
		color: #ff6961;
		background: rgba(255, 105, 97, 0.12);
	}

	.countdown {
		color: #06100f;
		background: #ffbf57;
	}

	.large {
		font-size: 1.08rem;
		line-height: 1.55;
	}

	.answer-row {
		display: flex;
		gap: 0.6rem;
		margin-bottom: 0.75rem;
	}

	.answer-input {
		flex: 1;
		min-width: 0;
		border: 1px solid rgba(238, 247, 242, 0.16);
		border-radius: 8px;
		color: #eef7f2;
		background: #06100f;
		font-size: 0.95rem;
		padding: 0.72rem 0.85rem;
		outline: none;
		transition:
			border-color 0.12s ease,
			background 0.12s ease;
	}

	.answer-input:focus {
		border-color: #49d3ff;
		background: #081615;
	}

	.answer-input:disabled {
		opacity: 0.42;
	}

	.btn {
		border: 1px solid rgba(238, 247, 242, 0.16);
		border-radius: 8px;
		color: #eef7f2;
		cursor: pointer;
		background: #0d1817;
		font-weight: 900;
		padding: 0.7rem 0.95rem;
		transition:
			transform 0.12s ease,
			border-color 0.12s ease,
			background 0.12s ease,
			color 0.12s ease;
	}

	.btn:disabled {
		opacity: 0.42;
		cursor: not-allowed;
	}

	.btn:not(:disabled):hover {
		transform: translateY(-1px);
		border-color: #49d3ff;
	}

	.btn.primary {
		border-color: #8ee66b;
		color: #06100f;
		background: #8ee66b;
	}

	.btn.primary:not(:disabled):hover {
		background: #a8f27e;
	}

	.btn.ack {
		border-color: rgba(255, 191, 87, 0.62);
		color: #ffbf57;
		margin-bottom: 1rem;
	}

	.btn.restart {
		border-color: rgba(255, 111, 174, 0.45);
		color: #ff9bc6;
	}

	.btn.wide {
		width: 100%;
		text-align: center;
		text-decoration: none;
	}

	.progress-block {
		margin-bottom: 0.95rem;
	}

	.choice-panel {
		margin-bottom: 0.95rem;
	}

	.choice-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.55rem;
	}

	.choice-btn {
		min-height: 64px;
		border: 1px solid rgba(238, 247, 242, 0.14);
		border-radius: 8px;
		color: #eef7f2;
		cursor: pointer;
		background: #081312;
		padding: 0.7rem;
		text-align: left;
		font-weight: 800;
		line-height: 1.35;
		word-break: break-word;
		transition:
			transform 0.12s ease,
			border-color 0.12s ease,
			background 0.12s ease;
	}

	.choice-btn:not(:disabled):hover {
		transform: translateY(-1px);
		border-color: #49d3ff;
		background: #0d1c1a;
	}

	.choice-btn.selected {
		border-color: #8ee66b;
		background: rgba(142, 230, 107, 0.14);
	}

	.choice-btn:disabled {
		opacity: 0.62;
		cursor: not-allowed;
	}

	.choice-empty {
		margin: 0;
		border: 1px dashed rgba(73, 211, 255, 0.24);
		border-radius: 8px;
		color: #8aa29d;
		background: #06100f;
		padding: 0.8rem;
		font-size: 0.82rem;
		line-height: 1.5;
	}

	.section-label {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.4rem;
	}

	.buffer-row {
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
	}

	.buf-slot {
		color: #28413d;
		font-size: 1.05rem;
		line-height: 1;
	}

	.buf-slot.filled {
		color: #8ee66b;
	}

	.ack-track {
		height: 8px;
		overflow: hidden;
		border: 1px solid rgba(255, 191, 87, 0.22);
		border-radius: 999px;
		background: #06100f;
	}

	.ack-fill {
		height: 100%;
		border-radius: 999px;
		background: linear-gradient(90deg, #ffbf57, #8ee66b);
		transition: width 0.25s ease;
	}

	.player-mini {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.45rem 0.65rem;
	}

	.player-mini.spaced {
		margin-top: 1rem;
	}

	.player-mini li {
		color: #8aa29d;
		font-size: 0.76rem;
	}

	.player-mini li.me {
		color: #eef7f2;
	}

	.tag-logged,
	.tag-restart,
	.player-mini .tag-offline {
		color: #8ee66b;
		font-size: 0.66rem;
		margin-left: 0;
	}

	.tag-restart {
		color: #ff9bc6;
	}

	.player-mini .tag-offline {
		color: #ffbf57;
	}

	.prompt-box {
		border: 1px solid rgba(73, 211, 255, 0.24);
		border-radius: 8px;
		background: #081312;
		padding: 1rem;
		margin-bottom: 1rem;
		color: #eef7f2;
		font-size: 1.05rem;
		line-height: 1.55;
		text-align: center;
		word-break: break-word;
	}

	.notes-joined {
		border: 1px dashed rgba(73, 211, 255, 0.36);
		border-radius: 8px;
		background: #06100f;
		padding: 0.9rem;
		margin-bottom: 1rem;
		color: #49d3ff;
		line-height: 1.55;
		word-break: break-word;
	}

	.notes-list {
		list-style: none;
		margin: 0 0 1rem;
		padding: 0;
		display: grid;
		gap: 0.45rem;
	}

	.notes-list li {
		display: grid;
		grid-template-columns: 2.4rem minmax(0, 1fr);
		gap: 0.6rem;
		align-items: start;
		border: 1px solid rgba(238, 247, 242, 0.12);
		border-radius: 8px;
		background: #081312;
		padding: 0.6rem;
		word-break: break-word;
	}

	.notes-list span {
		color: #49d3ff;
		font-weight: 900;
	}

	.notes-list strong {
		color: #eef7f2;
		font-weight: 700;
	}

	.complete-icon {
		width: 74px;
		height: 74px;
		margin: 1.5rem auto 0.8rem;
		display: grid;
		place-items: center;
		border: 1px solid rgba(142, 230, 107, 0.55);
		border-radius: 8px;
		color: #06100f;
		background: #8ee66b;
		font-size: 2.7rem;
		font-weight: 900;
	}

	.complete-sub {
		color: #8aa29d;
		margin: 0 0 1.5rem;
	}

	.pulse-grid {
		display: grid;
		grid-template-columns: repeat(6, minmax(0, 1fr));
		gap: 0.4rem;
		margin-bottom: 1rem;
	}

	.pulse-grid span {
		height: 12px;
		border-radius: 3px;
		background: #49d3ff;
	}

	.toast-stack {
		position: fixed;
		right: 1rem;
		bottom: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		z-index: 20;
		pointer-events: none;
	}

	.toast {
		border: 1px solid rgba(238, 247, 242, 0.16);
		border-radius: 8px;
		background: #0d1817;
		padding: 0.6rem 0.8rem;
		font-size: 0.82rem;
		box-shadow: 0 12px 28px rgba(0, 0, 0, 0.28);
		animation: up 0.14s ease;
	}

	.toast.ok {
		border-color: rgba(142, 230, 107, 0.45);
		color: #8ee66b;
	}

	.toast.bad {
		border-color: rgba(255, 105, 97, 0.45);
		color: #ff6961;
	}

	.dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: #28413d;
		flex-shrink: 0;
	}

	.dot.sm {
		width: 7px;
		height: 7px;
	}

	.dot.on {
		background: #8ee66b;
		box-shadow: 0 0 12px rgba(142, 230, 107, 0.8);
	}

	.dot.offline,
	.dot.sm.offline {
		background: #ffbf57;
		box-shadow: none;
	}

	.dot.sm.on {
		background: #ffbf57;
		box-shadow: 0 0 12px rgba(255, 191, 87, 0.8);
	}

	.mono {
		font-family:
			ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Noto Sans TC',
			monospace;
	}

	.muted {
		color: #8aa29d;
	}

	.center {
		text-align: center;
	}

	.hint {
		margin: 0.8rem 0 0;
		color: #8aa29d;
		font-size: 0.78rem;
		text-align: center;
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

	@media (max-width: 640px) {
		.game-shell {
			padding: 0.65rem;
		}

		.topbar,
		.panel-head,
		.answer-row {
			flex-direction: column;
			align-items: stretch;
		}

		.brand {
			font-size: 0.82rem;
		}

		.status-strip {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.route-visual {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.mini-stat {
			text-align: left;
		}

		.packet-window {
			min-height: 132px;
			flex-direction: column;
			align-items: flex-start;
		}

		.choice-grid {
			grid-template-columns: 1fr;
		}

		.toast-stack {
			left: 0.65rem;
			right: 0.65rem;
		}
	}
</style>
