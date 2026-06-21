const port = process.env.PORT ?? '3000';

const sharedOptions = {
	stdout: 'inherit',
	stderr: 'inherit',
	stdin: 'inherit',
	env: process.env
} as const;

const web = Bun.spawn(
	['bun', 'run', 'preview', '--', '--host', '0.0.0.0', '--port', port],
	sharedOptions
);
const game = Bun.spawn(['bun', 'game/server.ts'], sharedOptions);

async function stopAll(signal: NodeJS.Signals = 'SIGTERM') {
	web.kill(signal);
	game.kill(signal);
	await Promise.allSettled([web.exited, game.exited]);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.on(signal, async () => {
		await stopAll(signal);
		process.exit(0);
	});
}

const firstExit = await Promise.race([
	web.exited.then((code) => ({ name: 'web', code })),
	game.exited.then((code) => ({ name: 'game', code }))
]);

await stopAll();

if (firstExit.code !== 0) {
	console.error(`[docker] ${firstExit.name} exited with code ${firstExit.code}`);
}

process.exit(firstExit.code);
