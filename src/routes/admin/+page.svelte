<script lang="ts">
	import { resolve } from '$app/paths';
	import type { AdminRankingEntry, AdminRoomState } from '$lib/types';

	const TEAM_COUNT = 10;
	const teams = Array.from({ length: TEAM_COUNT }, (_, i) => String(i + 1).padStart(2, '0'));

	let token = $state('');
	let teamA = $state('01');
	let teamB = $state('02');
	let connected = $state(false);
	let authorized = $state(false);
	let errorText = $state('');
	let rooms = $state<AdminRoomState[]>([]);
	let ranking = $state<AdminRankingEntry[]>([]);
	let wsRef: WebSocket | null = null;
	let initialized = false;

	const selectedRooms = $derived(Array.from(new Set([teamA, teamB])));
	const roomA = $derived(findRoom(teamA));
	const roomB = $derived(findRoom(teamB));
	const panelRooms = $derived([roomA, roomB]);
	const firstComplete = $derived(
		ranking.find((entry) => selectedRooms.includes(entry.roomId)) ?? null
	);

	$effect(() => {
		if (initialized) return;
		initialized = true;
		const stored = sessionStorage.getItem('admin-token') ?? '';
		token = stored;
		if (stored) connect(stored);
	});

	$effect(() => {
		if (!connected) return;
		sendSubscribe();
	});

	function makeEmptyRoom(roomId: string): AdminRoomState {
		return {
			roomId,
			hostId: null,
			phase: 'lobby',
			round: 0,
			gameRound: 0,
			maxRounds: 2,
			players: [],
			bufferFilled: 0,
			totalFragments: 0,
			questionType: null,
			prompt: null,
			startedAt: null,
			completedAt: null,
			forcedComplete: false
		};
	}

	function findRoom(roomId: string): AdminRoomState {
		return rooms.find((room) => room.roomId === roomId) ?? makeEmptyRoom(roomId);
	}

	function connect(nextToken = token.trim()) {
		if (!nextToken) {
			errorText = '請輸入管理員 token';
			return;
		}
		wsRef?.close();
		errorText = '';
		const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
		const socket = new WebSocket(
			`${proto}://${window.location.host}/ws/admin?token=${encodeURIComponent(nextToken)}`
		);
		wsRef = socket;

		socket.onopen = () => {
			connected = true;
			authorized = true;
			sessionStorage.setItem('admin-token', nextToken);
			sendSubscribe();
		};

		socket.onmessage = (event: MessageEvent) => {
			const msg = JSON.parse(event.data as string) as { type: string; [key: string]: unknown };
			switch (msg.type) {
				case 'admin_state':
					rooms = msg.rooms as AdminRoomState[];
					ranking = msg.ranking as AdminRankingEntry[];
					break;
				case 'admin_error':
					errorText = String(msg.message ?? '管理員操作失敗');
					break;
			}
		};

		socket.onerror = () => {
			errorText = '無法連線管理員 channel，請確認 token 與 game server';
		};

		socket.onclose = () => {
			connected = false;
			wsRef = null;
		};
	}

	function sendSubscribe() {
		wsRef?.send(JSON.stringify({ type: 'admin_subscribe', roomIds: selectedRooms }));
	}

	function startRoom(roomId: string) {
		errorText = '';
		wsRef?.send(JSON.stringify({ type: 'admin_start', roomId }));
	}

	function forceComplete(roomId: string) {
		errorText = '';
		wsRef?.send(JSON.stringify({ type: 'admin_force_complete', roomId }));
	}

	function clearRecord(roomId: string) {
		errorText = '';
		wsRef?.send(JSON.stringify({ type: 'admin_clear_record', roomId }));
	}

	function formatTime(value: number | null) {
		if (!value) return '-';
		return new Intl.DateTimeFormat('zh-TW', {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		}).format(value);
	}

	function phaseLabel(room: AdminRoomState) {
		if (room.phase === 'lobby') return '等待開始';
		if (room.phase === 'inspect') return '接收封包';
		if (room.phase === 'answer') return '作答中';
		return room.forcedComplete ? '強制完成' : '已完成';
	}

	function progressPercent(room: AdminRoomState) {
		if (room.totalFragments <= 0) return 0;
		return Math.round((room.bufferFilled / room.totalFragments) * 100);
	}
</script>

<svelte:head>
	<title>ADMIN | 封包掉包</title>
</svelte:head>

<main class="admin-shell">
	<header class="topbar">
		<a class="brand" href={resolve('/')}>SITCON Camp 2026 / ADMIN</a>
		<div class="link-state" class:online={connected}>{connected ? 'CONNECTED' : 'OFFLINE'}</div>
	</header>

	<section class="panel auth-panel">
		<div>
			<div class="room-badge">CONTROL CHANNEL</div>
			<h1>管理員控制台</h1>
		</div>
		<div class="auth-row">
			<input
				class="input"
				type="password"
				bind:value={token}
				placeholder="ADMIN_TOKEN"
				autocomplete="current-password"
			/>
			<button class="btn primary" type="button" onclick={() => connect()}>連線</button>
		</div>
		{#if errorText}
			<p class="error-line">{errorText}</p>
		{/if}
	</section>

	<section class="selector-row">
		<label>
			<span>隊伍 A</span>
			<select bind:value={teamA} disabled={!authorized}>
				{#each teams as team (team)}
					<option value={team}>{team}</option>
				{/each}
			</select>
		</label>
		<label>
			<span>隊伍 B</span>
			<select bind:value={teamB} disabled={!authorized}>
				{#each teams as team (team)}
					<option value={team}>{team}</option>
				{/each}
			</select>
		</label>
		<div class="winner-box">
			<span>先完成</span>
			<strong>{firstComplete ? `ROOM ${firstComplete.roomId}` : '-'}</strong>
		</div>
	</section>

	<section class="rooms-grid">
		{#each panelRooms as room, index (`${room.roomId}:${index}`)}
			<article class="panel room-panel">
				<div class="panel-head">
					<div>
						<div class="room-badge">ROOM {room.roomId}</div>
						<h2>{phaseLabel(room)}</h2>
					</div>
					<div class="mini-stat">
						<strong>{room.players.filter((player) => player.isConnected).length}</strong>
						<span>online</span>
					</div>
				</div>

				<div class="status-strip">
					<div>
						<span>ROUND</span>
						<strong>{room.gameRound}/{room.maxRounds}</strong>
					</div>
					<div>
						<span>RETX</span>
						<strong>{room.round}</strong>
					</div>
					<div>
						<span>BUFFER</span>
						<strong>{room.bufferFilled}/{room.totalFragments}</strong>
					</div>
					<div>
						<span>DONE</span>
						<strong>{formatTime(room.completedAt)}</strong>
					</div>
				</div>

				<div class="progress-block">
					<div class="section-label">
						<span>段站狀況</span>
						<span>{progressPercent(room)}%</span>
					</div>
					<div class="progress-track">
						<div class="progress-fill" style="width:{progressPercent(room)}%"></div>
					</div>
				</div>

				<div class="actions">
					<button
						class="btn primary"
						type="button"
						onclick={() => startRoom(room.roomId)}
						disabled={!connected || room.phase !== 'lobby'}
					>
						開始
					</button>
					<button
						class="btn danger"
						type="button"
						onclick={() => forceComplete(room.roomId)}
						disabled={!connected || room.phase === 'complete'}
					>
						強制結束
					</button>
					<button
						class="btn ghost"
						type="button"
						onclick={() => clearRecord(room.roomId)}
						disabled={!connected || room.phase !== 'complete'}
					>
						刪除紀錄
					</button>
				</div>

				<ul class="player-list">
					{#each room.players as player (player.id)}
						<li class:offline={!player.isConnected}>
							<span class="dot" class:on={player.isConnected || player.isArmed}></span>
							<span>{player.name}</span>
							{#if player.id === room.hostId}
								<em>host</em>
							{/if}
							{#if !player.isConnected}
								<em>offline</em>
							{:else if player.isArmed}
								<em>ACK</em>
							{:else if player.hasLogged}
								<em>logged</em>
							{/if}
						</li>
					{/each}
				</ul>
			</article>
		{/each}
	</section>

	<section class="panel ranking-panel">
		<div class="panel-head">
			<div>
				<div class="room-badge">RANKING</div>
				<h2>完成順位</h2>
			</div>
		</div>
		{#if ranking.length === 0}
			<p class="muted">尚無隊伍完成</p>
		{:else}
			<ol class="ranking-list">
				{#each ranking as entry (entry.roomId)}
					<li class:selected={selectedRooms.includes(entry.roomId)}>
						<strong>ROOM {entry.roomId}</strong>
						<span>{formatTime(entry.completedAt)}</span>
						{#if entry.forcedComplete}<em>FORCED</em>{/if}
					</li>
				{/each}
			</ol>
		{/if}
	</section>
</main>

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
	input,
	select {
		font: inherit;
	}

	.admin-shell {
		width: min(1180px, 100%);
		min-height: 100vh;
		margin: 0 auto;
		padding: 0.9rem;
		display: grid;
		gap: 0.85rem;
	}

	.topbar,
	.panel,
	.selector-row {
		border: 1px solid rgba(142, 230, 107, 0.22);
		border-radius: 8px;
		background: rgba(10, 20, 19, 0.94);
		box-shadow: 0 18px 60px rgba(0, 0, 0, 0.28);
	}

	.topbar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
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
		padding: 1rem;
	}

	.auth-panel,
	.selector-row,
	.panel-head,
	.actions {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
	}

	.actions {
		flex-wrap: wrap;
	}

	.auth-panel {
		align-items: center;
		flex-wrap: wrap;
	}

	h1,
	h2 {
		margin: 0.15rem 0 0;
		line-height: 1.2;
	}

	h1 {
		font-size: 1.75rem;
	}

	h2 {
		font-size: 1.35rem;
	}

	.room-badge {
		color: #49d3ff;
		font-size: 0.74rem;
		font-weight: 800;
	}

	.auth-row {
		display: flex;
		gap: 0.6rem;
		min-width: min(420px, 100%);
	}

	.input,
	select {
		min-width: 0;
		border: 1px solid rgba(238, 247, 242, 0.16);
		border-radius: 8px;
		color: #eef7f2;
		background: #06100f;
		padding: 0.72rem 0.85rem;
		outline: none;
	}

	.input {
		flex: 1;
	}

	.input:focus,
	select:focus {
		border-color: #49d3ff;
	}

	.error-line {
		width: 100%;
		margin: 0;
		color: #ff6961;
		font-size: 0.8rem;
	}

	.selector-row {
		align-items: stretch;
		padding: 1rem;
	}

	label,
	.winner-box {
		flex: 1;
		display: grid;
		gap: 0.4rem;
	}

	label span,
	.winner-box span,
	.section-label,
	.muted {
		color: #8aa29d;
		font-size: 0.74rem;
	}

	select {
		width: 100%;
	}

	.winner-box {
		border: 1px solid rgba(238, 247, 242, 0.14);
		border-radius: 8px;
		background: #081312;
		padding: 0.65rem;
	}

	.winner-box strong {
		color: #8ee66b;
		font-size: 1.15rem;
	}

	.rooms-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.85rem;
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

	.status-strip {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 0.5rem;
		margin: 1rem 0 0.85rem;
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

	.status-strip span {
		color: #8aa29d;
		font-size: 0.72rem;
	}

	.status-strip strong {
		color: #eef7f2;
		font-size: 0.9rem;
		overflow-wrap: anywhere;
	}

	.progress-block {
		margin-bottom: 0.95rem;
	}

	.section-label {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.4rem;
	}

	.progress-track {
		height: 9px;
		overflow: hidden;
		border: 1px solid rgba(73, 211, 255, 0.24);
		border-radius: 999px;
		background: #06100f;
	}

	.progress-fill {
		height: 100%;
		border-radius: 999px;
		background: linear-gradient(90deg, #49d3ff, #8ee66b);
		transition: width 0.2s ease;
	}

	.btn {
		border: 1px solid rgba(238, 247, 242, 0.16);
		border-radius: 8px;
		color: #eef7f2;
		cursor: pointer;
		background: #0d1817;
		font-weight: 900;
		padding: 0.7rem 0.95rem;
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

	.btn.danger {
		border-color: rgba(255, 105, 97, 0.55);
		color: #ff6961;
	}

	.btn.ghost {
		border-color: rgba(255, 191, 87, 0.48);
		color: #ffbf57;
		background: #081312;
	}

	.player-list,
	.ranking-list {
		list-style: none;
		margin: 1rem 0 0;
		padding: 0;
		display: grid;
		gap: 0.45rem;
	}

	.player-list li,
	.ranking-list li {
		min-height: 42px;
		display: flex;
		align-items: center;
		gap: 0.45rem;
		border: 1px solid rgba(238, 247, 242, 0.1);
		border-radius: 8px;
		background: #081312;
		padding: 0.5rem 0.65rem;
	}

	.player-list li.offline {
		opacity: 0.58;
	}

	.player-list em,
	.ranking-list em {
		margin-left: auto;
		color: #ffbf57;
		font-size: 0.68rem;
		font-style: normal;
		font-weight: 800;
	}

	.dot {
		width: 0.65rem;
		height: 0.65rem;
		border-radius: 999px;
		background: #28413d;
	}

	.dot.on {
		background: #8ee66b;
		box-shadow: 0 0 12px rgba(142, 230, 107, 0.55);
	}

	.ranking-list li.selected {
		border-color: rgba(73, 211, 255, 0.45);
	}

	.ranking-list strong {
		color: #eef7f2;
	}

	.ranking-list span {
		margin-left: auto;
		color: #8aa29d;
		font-size: 0.78rem;
	}

	@media (max-width: 820px) {
		.rooms-grid,
		.selector-row {
			grid-template-columns: 1fr;
			display: grid;
		}

		.auth-row,
		.actions {
			width: 100%;
			flex-direction: column;
		}

		.btn {
			width: 100%;
		}

		.status-strip {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
