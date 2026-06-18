<script lang="ts">
	import { goto } from '$app/navigation';

	let playerName = $state('');
	let roomCode = $state('');
	let error = $state('');

	function join() {
		const name = playerName.trim();
		if (!name) {
			error = '請輸入名字';
			return;
		}
		const room = roomCode.trim().toUpperCase() || crypto.randomUUID().slice(0, 6).toUpperCase();
		localStorage.setItem('ack_player_name', name);
		goto(`/game/${room}`);
	}

	function onkeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') join();
	}
</script>

<main class="center">
	<div class="card">
		<h1>ACK!</h1>
		<p class="sub">封包掉落 · 多人網路協議遊戲</p>

		<div class="fields">
			<input
				bind:value={playerName}
				placeholder="玩家名稱"
				maxlength="20"
				{onkeydown}
				autofocus
			/>
			<input
				bind:value={roomCode}
				placeholder="房間代碼（空白 = 新房間）"
				maxlength="8"
				{onkeydown}
			/>
		</div>

		{#if error}
			<p class="error">{error}</p>
		{/if}

		<button class="btn-primary" onclick={join}>加入 / 建立房間</button>

		<p class="hint">需要 2 位以上玩家才能開始</p>
	</div>
</main>

<style>
	:global(body) {
		margin: 0;
		font-family: 'Courier New', monospace;
		background: #0a0a0f;
		color: #e0e0e0;
		min-height: 100vh;
	}

	.center {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100vh;
		padding: 1rem;
	}

	.card {
		background: #111118;
		border: 1px solid #2a2a3a;
		border-radius: 12px;
		padding: 2.5rem 2rem;
		width: 100%;
		max-width: 360px;
		text-align: center;
	}

	h1 {
		margin: 0 0 0.25rem;
		font-size: 3rem;
		letter-spacing: 0.15em;
		color: #7bf;
	}

	.sub {
		margin: 0 0 2rem;
		font-size: 0.8rem;
		color: #666;
	}

	.fields {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	input {
		background: #0a0a0f;
		border: 1px solid #2a2a3a;
		border-radius: 6px;
		color: #e0e0e0;
		font-family: inherit;
		font-size: 0.95rem;
		padding: 0.65rem 0.9rem;
		width: 100%;
		box-sizing: border-box;
		outline: none;
		transition: border-color 0.15s;
	}

	input:focus {
		border-color: #7bf;
	}

	.error {
		color: #f77;
		font-size: 0.8rem;
		margin: 0 0 0.75rem;
	}

	.btn-primary {
		background: #7bf;
		border: none;
		border-radius: 6px;
		color: #000;
		cursor: pointer;
		font-family: inherit;
		font-size: 0.95rem;
		font-weight: 700;
		padding: 0.7rem 1.5rem;
		width: 100%;
		transition: opacity 0.15s;
	}

	.btn-primary:hover {
		opacity: 0.85;
	}

	.hint {
		color: #555;
		font-size: 0.75rem;
		margin: 1rem 0 0;
	}
</style>
