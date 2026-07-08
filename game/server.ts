import { Room } from './room.js';
import type { AdminRankingEntry } from '../src/lib/types.js';

const PORT = (() => {
	const p = parseInt(Bun.env.WS_PORT ?? '8080');
	if (isNaN(p) || p < 1 || p > 65535) {
		console.error(`[ACK] Invalid WS_PORT: "${Bun.env.WS_PORT}"`);
		process.exit(1);
	}
	return p;
})();

const rooms = new Map<string, Room>();
type WS = { send(data: string): void; readyState: number };
const adminSockets = new Set<WS>();
const adminSubscriptions = new Map<WS, string[]>();

function getRoom(roomId: string): Room {
	if (!rooms.has(roomId)) rooms.set(roomId, new Room(roomId, broadcastAdminState));
	return rooms.get(roomId)!;
}

interface WsData {
	role: 'player' | 'admin';
	roomId?: string;
	playerId?: string;
}

function isValidAdminToken(token: string | null): boolean {
	const expected = Bun.env.ADMIN_TOKEN;
	return !!expected && token === expected;
}

function sanitizeRoomIds(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((roomId) => String(roomId).trim())
		.filter(Boolean)
		.slice(0, 2);
}

function getRanking(): AdminRankingEntry[] {
	return Array.from(rooms.values())
		.map((room) => room.getAdminState())
		.filter((room): room is ReturnType<Room['getAdminState']> & { completedAt: number } =>
			Number.isFinite(room.completedAt)
		)
		.sort((a, b) => a.completedAt - b.completedAt)
		.map((room) => ({
			roomId: room.roomId,
			completedAt: room.completedAt,
			forcedComplete: room.forcedComplete
		}));
}

function sendAdminState(ws: WS): void {
	if (ws.readyState !== 1) return;
	const roomIds = adminSubscriptions.get(ws) ?? [];
	const roomsState = roomIds.map((roomId) => getRoom(roomId).getAdminState());
	ws.send(JSON.stringify({ type: 'admin_state', rooms: roomsState, ranking: getRanking() }));
}

function broadcastAdminState(): void {
	adminSockets.forEach(sendAdminState);
}

const server = Bun.serve<WsData>({
	port: PORT,

	fetch(req, server) {
		const url = new URL(req.url);
		if (url.pathname === '/ws/admin') {
			if (!isValidAdminToken(url.searchParams.get('token'))) {
				return new Response('admin token required', { status: 401 });
			}
			const ok = server.upgrade(req, { data: { role: 'admin' } });
			return ok ? undefined : new Response('WS upgrade failed', { status: 500 });
		}
		if (url.pathname.startsWith('/ws/')) {
			const roomId = url.pathname.slice(4).split('/')[0];
			if (!roomId) return new Response('roomId required', { status: 400 });
			const playerId = url.searchParams.get('pid') || crypto.randomUUID();
			const ok = server.upgrade(req, { data: { role: 'player', roomId, playerId } });
			return ok ? undefined : new Response('WS upgrade failed', { status: 500 });
		}
		return new Response('ACK! Game Server', { status: 200 });
	},

	websocket: {
		open(ws) {
			if (ws.data.role === 'admin') {
				adminSockets.add(ws as never);
				sendAdminState(ws as never);
				return;
			}
			ws.send(JSON.stringify({ type: 'welcome', playerId: ws.data.playerId }));
		},

		message(ws, raw) {
			let msg: { type: string; [k: string]: unknown };
			try {
				msg = JSON.parse(raw as string);
			} catch {
				return;
			}

			if (ws.data.role === 'admin') {
				switch (msg.type) {
					case 'admin_subscribe': {
						adminSubscriptions.set(ws as never, sanitizeRoomIds(msg.roomIds));
						sendAdminState(ws as never);
						break;
					}
					case 'admin_start': {
						const roomId = String(msg.roomId ?? '').trim();
						if (!roomId) break;
						const result = getRoom(roomId).startByAdmin();
						if (!result.ok) {
							ws.send(JSON.stringify({ type: 'admin_error', message: result.message }));
							sendAdminState(ws as never);
						}
						break;
					}
					case 'admin_force_complete': {
						const roomId = String(msg.roomId ?? '').trim();
						if (!roomId) break;
						getRoom(roomId).forceCompleteByAdmin();
						break;
					}
					case 'admin_clear_record': {
						const roomId = String(msg.roomId ?? '').trim();
						if (!roomId) break;
						const result = getRoom(roomId).clearRecordByAdmin();
						if (!result.ok) {
							ws.send(JSON.stringify({ type: 'admin_error', message: result.message }));
							sendAdminState(ws as never);
						}
						break;
					}
				}
				return;
			}

			const { roomId, playerId } = ws.data;
			if (!roomId || !playerId) return;
			const room = getRoom(roomId);
			switch (msg.type) {
				case 'join':
					room.addPlayer(playerId, ws as never);
					break;
				case 'kick_player':
					room.kickPlayer(playerId, String(msg.playerId ?? ''));
					break;
				case 'log_fragment':
					room.logFragment(playerId, String(msg.text ?? ''));
					break;
				case 'select_fragment_choice':
					room.selectFragmentChoice(playerId, String(msg.choiceId ?? ''));
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
			if (ws.data.role === 'admin') {
				adminSockets.delete(ws as never);
				adminSubscriptions.delete(ws as never);
				return;
			}
			if (ws.data.roomId && ws.data.playerId) {
				rooms.get(ws.data.roomId)?.removePlayer(ws.data.playerId, ws as never);
			}
		}
	}
});

console.log(`ACK! WS → ws://localhost:${PORT}`);

for (const sig of ['SIGINT', 'SIGTERM'] as NodeJS.Signals[]) {
	process.on(sig, () => {
		server.stop(true);
		process.exit(0);
	});
}
