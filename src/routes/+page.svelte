<script lang="ts">
	import { goto } from '$app/navigation';

	const TEAM_COUNT = 10;
	const teams = Array.from({ length: TEAM_COUNT }, (_, i) => String(i + 1).padStart(2, '0'));

	function join(team: string) {
		goto(`/game/${team}`);
	}

	function onkeydown(e: KeyboardEvent, team: string) {
		if (e.key === 'Enter' || e.key === ' ') join(team);
	}
</script>

<main class="center">
	<div class="card">
		<h1>ACK!</h1>
		<p class="sub">封包掉落 · 多人網路協議遊戲</p>

		<p class="label">選擇隊伍編號</p>
		<div class="team-grid">
			{#each teams as team}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="team-btn"
					role="button"
					tabindex="0"
					onclick={() => join(team)}
					onkeydown={(e) => onkeydown(e, team)}
				>
					{team}
				</div>
			{/each}
		</div>

		<p class="hint">需要 3 位以上隊員才能開始 · 共 3 輪</p>
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
		max-width: 420px;
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

	.label {
		margin: 0 0 0.75rem;
		font-size: 0.78rem;
		color: #556;
		letter-spacing: 0.08em;
	}

	.team-grid {
		display: grid;
		grid-template-columns: repeat(5, 1fr);
		gap: 0.5rem;
		margin-bottom: 1.5rem;
	}

	.team-btn {
		background: #0a0a0f;
		border: 1px solid #2a2a3a;
		border-radius: 8px;
		color: #99b;
		cursor: pointer;
		font-family: inherit;
		font-size: 1.1rem;
		font-weight: 700;
		letter-spacing: 0.05em;
		padding: 0.9rem 0;
		transition: background 0.12s, border-color 0.12s, color 0.12s;
	}

	.team-btn:hover,
	.team-btn:focus {
		background: #1a1a2e;
		border-color: #7bf;
		color: #7bf;
		outline: none;
	}

	.hint {
		color: #555;
		font-size: 0.75rem;
		margin: 0;
	}
</style>
