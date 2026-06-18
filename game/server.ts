import { Room } from './room.js';

const rooms = new Map<string, Room>();

function getRoom(roomId: string): Room {
	if (!rooms.has(roomId)) rooms.set(roomId, new Room(roomId));
	return rooms.get(roomId)!;
}

interface WsData {
	roomId: string;
	playerId: string;
}

Bun.serve<WsData>({
	port: parseInt(Bun.env.WS_PORT ?? '8080'),

	fetch(req, server) {
		const url = new URL(req.url);
		if (url.pathname.startsWith('/ws/')) {
			const roomId = url.pathname.slice(4);
			if (!roomId) return new Response('roomId required', { status: 400 });
			const ok = server.upgrade(req, {
				data: { roomId, playerId: crypto.randomUUID() },
			});
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
					room.addPlayer(playerId, String(msg.playerName ?? 'Player'), ws as never);
					break;
				case 'ready':
					room.setReady(playerId);
					break;
				case 'log_fragment':
					room.logFragment(playerId);
					break;
				case 'arm_ack':
					room.armAck(playerId);
					break;
				case 'set_order':
					room.setOrder(playerId, msg.order as string[]);
					break;
				case 'submit':
					room.submit(playerId);
					break;
				case 'resync':
					room.resync(playerId);
					break;
			}
		},

		close(ws) {
			rooms.get(ws.data.roomId)?.removePlayer(ws.data.playerId);
		},
	},
});

console.log(`ACK! WS → ws://localhost:${Bun.env.WS_PORT ?? 8080}`);
