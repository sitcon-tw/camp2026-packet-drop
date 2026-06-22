import { Room } from './room.js';

const PORT = (() => {
	const p = parseInt(Bun.env.WS_PORT ?? '8080');
	if (isNaN(p) || p < 1 || p > 65535) {
		console.error(`[ACK] Invalid WS_PORT: "${Bun.env.WS_PORT}"`);
		process.exit(1);
	}
	return p;
})();

const rooms = new Map<string, Room>();

function getRoom(roomId: string): Room {
	if (!rooms.has(roomId)) rooms.set(roomId, new Room(roomId));
	return rooms.get(roomId)!;
}

interface WsData {
	roomId: string;
	playerId: string;
}

const server = Bun.serve<WsData>({
	port: PORT,

	fetch(req, server) {
		const url = new URL(req.url);
		if (url.pathname.startsWith('/ws/')) {
			const roomId = url.pathname.slice(4).split('/')[0];
			if (!roomId) return new Response('roomId required', { status: 400 });
			const playerId = url.searchParams.get('pid') || crypto.randomUUID();
			const ok = server.upgrade(req, { data: { roomId, playerId } });
			return ok ? undefined : new Response('WS upgrade failed', { status: 500 });
		}
		return new Response('ACK! Game Server', { status: 200 });
	},

	websocket: {
		open(ws) {
			ws.send(JSON.stringify({ type: 'welcome', playerId: ws.data.playerId }));
		},

		message(ws, raw) {
			const { roomId, playerId } = ws.data;
			const room = getRoom(roomId);
			let msg: { type: string; [k: string]: unknown };
			try {
				msg = JSON.parse(raw as string);
			} catch {
				return;
			}
			switch (msg.type) {
				case 'join':
					room.addPlayer(playerId, ws as never);
					break;
				case 'ready':
					room.setReady(playerId);
					break;
				case 'log_fragment':
					room.logFragment(playerId, String(msg.text ?? ''));
					break;
				case 'arm_ack':
					room.armAck(playerId);
					break;
				case 'submit_answer':
					room.submitAnswer(playerId, String(msg.text ?? ''));
					break;
				case 'vote_restart':
					room.voteRestart(playerId);
					break;
				case 'resync':
					room.resync(playerId);
					break;
			}
		},

		close(ws) {
			rooms.get(ws.data.roomId)?.removePlayer(ws.data.playerId, ws as never);
		},
	},
});

console.log(`ACK! WS → ws://localhost:${PORT}`);

for (const sig of ['SIGINT', 'SIGTERM'] as NodeJS.Signals[]) {
	process.on(sig, () => {
		server.stop(true);
		process.exit(0);
	});
}
