<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';

	const TEAM_COUNT = 10;
	const QUESTION_COUNT = 2;
	const teams = Array.from({ length: TEAM_COUNT }, (_, i) => String(i + 1).padStart(2, '0'));
	const packetSteps = ['RX', 'CRC', 'ACK', 'RETX', 'DONE'];
	const telemetry = [
		{ label: 'FLASH', value: '15s', tone: 'cyan' },
		{ label: 'LOSS', value: 'RNG', tone: 'amber' },
		{ label: 'BUFFER', value: 'TEAM', tone: 'green' },
		{ label: 'ROUND', value: '02', tone: 'pink' }
	];

	function join(team: string) {
		goto(resolve('/game/[roomId]', { roomId: team }));
	}
</script>

<svelte:head>
	<title>封包掉包 | SITCON Camp 2026</title>
</svelte:head>

<main class="gate">
	<section class="selector" aria-labelledby="title">
		<div class="eyebrow">
			<span>SITCON Camp 2026</span>
			<span>NYCU 7/8-7/12</span>
		</div>

		<h1 id="title">
			<span>封包掉包</span>
			<strong>ACK!</strong>
		</h1>
		<p class="sub">多人協作封包重組關卡</p>

		<div class="route-board" aria-hidden="true">
			{#each packetSteps as step, i (step)}
				<div class="route-node" class:hot={i === 2}>{step}</div>
				{#if i < packetSteps.length - 1}
					<div class="route-line" class:drop={i === 1}></div>
				{/if}
			{/each}
		</div>

		<div class="team-heading">
			<p>選擇隊伍編號</p>
			<span>ADMIN START / {QUESTION_COUNT} QUESTIONS</span>
		</div>

		<div class="team-grid">
			{#each teams as team (team)}
				<button class="team-btn" type="button" onclick={() => join(team)}>
					{team}
				</button>
			{/each}
		</div>
	</section>

	<aside class="telemetry-panel" aria-label="關卡狀態">
		<div class="terminal-head">
			<span></span>
			<span></span>
			<span></span>
		</div>
		<div class="terminal-title">PACKET DROP</div>
		<div class="terminal-grid">
			{#each telemetry as item (item.label)}
				<div
					class="metric"
					class:cyan={item.tone === 'cyan'}
					class:amber={item.tone === 'amber'}
					class:green={item.tone === 'green'}
					class:pink={item.tone === 'pink'}
				>
					<span>{item.label}</span>
					<strong>{item.value}</strong>
				</div>
			{/each}
		</div>
		<div class="packet-stack" aria-hidden="true">
			<span></span>
			<span></span>
			<span></span>
			<span></span>
			<span></span>
		</div>
	</aside>
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

	button {
		font: inherit;
	}

	.gate {
		width: min(1120px, 100%);
		min-height: 100vh;
		margin: 0 auto;
		padding: 1rem;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(260px, 340px);
		gap: 1rem;
		align-items: center;
	}

	.selector,
	.telemetry-panel {
		border: 1px solid rgba(142, 230, 107, 0.22);
		border-radius: 8px;
		background: rgba(10, 20, 19, 0.92);
		box-shadow: 0 18px 60px rgba(0, 0, 0, 0.32);
	}

	.selector {
		padding: 1.25rem;
	}

	.eyebrow {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-bottom: 1.25rem;
		color: #9bb7b0;
		font-size: 0.78rem;
	}

	.eyebrow span {
		border: 1px solid rgba(73, 211, 255, 0.24);
		border-radius: 999px;
		padding: 0.28rem 0.55rem;
		background: rgba(73, 211, 255, 0.06);
	}

	h1 {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.85rem;
		margin: 0;
		font-size: 2.5rem;
		line-height: 1.05;
	}

	h1 strong {
		color: #49d3ff;
		font-size: 2rem;
	}

	.sub {
		margin: 0.65rem 0 1.4rem;
		color: #8aa29d;
		font-size: 0.92rem;
	}

	.route-board {
		display: grid;
		grid-template-columns: repeat(5, minmax(44px, 1fr));
		align-items: center;
		gap: 0.45rem;
		min-height: 76px;
		margin-bottom: 1.4rem;
		padding: 0.75rem;
		border: 1px solid rgba(73, 211, 255, 0.18);
		border-radius: 8px;
		background:
			linear-gradient(90deg, rgba(73, 211, 255, 0.1), transparent 38%), rgba(4, 12, 12, 0.78);
	}

	.route-node {
		position: relative;
		min-height: 44px;
		display: grid;
		place-items: center;
		border: 1px solid rgba(238, 247, 242, 0.16);
		border-radius: 6px;
		color: #b9cbc6;
		background: #0d1817;
		font-size: 0.78rem;
		font-weight: 800;
	}

	.route-node.hot {
		border-color: #8ee66b;
		color: #06100f;
		background: #8ee66b;
	}

	.route-line {
		height: 2px;
		background: #49d3ff;
		box-shadow: 0 0 14px rgba(73, 211, 255, 0.8);
	}

	.route-line.drop {
		background: repeating-linear-gradient(90deg, #ffbf57 0 8px, transparent 8px 14px);
		box-shadow: none;
	}

	.team-heading {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.team-heading p {
		margin: 0;
		font-size: 1rem;
		font-weight: 800;
	}

	.team-heading span {
		color: #8aa29d;
		font-size: 0.76rem;
		text-align: right;
	}

	.team-grid {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.55rem;
	}

	.team-btn {
		min-height: 58px;
		border: 1px solid rgba(238, 247, 242, 0.16);
		border-radius: 8px;
		color: #eef7f2;
		cursor: pointer;
		background: #0a1514;
		font-size: 1.1rem;
		font-weight: 900;
		transition:
			transform 0.12s ease,
			border-color 0.12s ease,
			background 0.12s ease,
			color 0.12s ease;
	}

	.team-btn:hover,
	.team-btn:focus-visible {
		transform: translateY(-1px);
		border-color: #49d3ff;
		color: #06100f;
		background: #49d3ff;
		outline: none;
	}

	.telemetry-panel {
		padding: 1rem;
		min-height: 390px;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
	}

	.terminal-head {
		display: flex;
		gap: 0.35rem;
		margin-bottom: 1rem;
	}

	.terminal-head span {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: #ff6fae;
	}

	.terminal-head span:nth-child(2) {
		background: #ffbf57;
	}

	.terminal-head span:nth-child(3) {
		background: #8ee66b;
	}

	.terminal-title {
		color: #eef7f2;
		font-size: 1.35rem;
		font-weight: 900;
	}

	.terminal-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 0.6rem;
		margin: 1rem 0;
	}

	.metric {
		min-height: 78px;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		border: 1px solid rgba(238, 247, 242, 0.14);
		border-radius: 8px;
		padding: 0.65rem;
		background: #081312;
	}

	.metric span {
		color: #8aa29d;
		font-size: 0.7rem;
	}

	.metric strong {
		font-size: 1.25rem;
	}

	.metric.cyan strong {
		color: #49d3ff;
	}

	.metric.amber strong {
		color: #ffbf57;
	}

	.metric.green strong {
		color: #8ee66b;
	}

	.metric.pink strong {
		color: #ff6fae;
	}

	.packet-stack {
		display: grid;
		gap: 0.45rem;
	}

	.packet-stack span {
		height: 14px;
		border-radius: 3px;
		background: linear-gradient(90deg, #49d3ff 0 38%, #8ee66b 38% 66%, #ffbf57 66% 100%);
		opacity: 0.85;
	}

	.packet-stack span:nth-child(2) {
		width: 86%;
	}

	.packet-stack span:nth-child(3) {
		width: 64%;
		background: repeating-linear-gradient(90deg, #ff6fae 0 10px, transparent 10px 16px);
	}

	.packet-stack span:nth-child(4) {
		width: 74%;
	}

	.packet-stack span:nth-child(5) {
		width: 48%;
	}

	@media (max-width: 760px) {
		.gate {
			grid-template-columns: 1fr;
			align-items: stretch;
			padding: 0.75rem;
		}

		.telemetry-panel {
			min-height: 220px;
		}

		h1 {
			font-size: 2rem;
		}

		h1 strong {
			font-size: 1.55rem;
		}

		.team-grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.route-board {
			grid-template-columns: 1fr;
		}

		.route-line {
			width: 2px;
			height: 18px;
			justify-self: center;
		}
	}
</style>
