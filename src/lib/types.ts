export type Phase = 'lobby' | 'inspect' | 'assemble' | 'answer' | 'complete';

// Client-visible fragment: NO slot field (slot = the ordering puzzle)
export interface Fragment {
	id: string;
	content: string;
	isCorrupt: boolean;
}

export interface Player {
	id: string;
	name: string;
	isReady: boolean;
	hasLogged: boolean;
	isArmed: boolean;
	isAfk: boolean;
}

// Buffer item also hides slot number
export interface BufferItem {
	id: string;
	content: string;
}

export interface RoomState {
	roomId: string;
	phase: Phase;
	round: number;
	gameRound: number;
	maxRounds: number;
	minPlayers: number;
	players: Player[];
	buffer: BufferItem[];
	totalFragments: number;
	assemblyOrder: string[];
	currentQuestion: string | null;
}

export type ClientMsg =
	| { type: 'join'; playerName: string }
	| { type: 'ready' }
	| { type: 'log_fragment' }
	| { type: 'arm_ack' }
	| { type: 'set_order'; order: string[] }
	| { type: 'submit_answer'; text: string }
	| { type: 'resync' };

export type ServerMsg =
	| { type: 'welcome'; playerId: string }
	| { type: 'state'; room: RoomState }
	| { type: 'inbox'; fragment: Fragment }
	| { type: 'log_ok' }
	| { type: 'log_reject'; reason: string }
	| { type: 'answer_wrong'; penalty: number }
	| { type: 'complete' }
	| { type: 'error'; message: string }
	| { type: 'toast'; text: string; kind: 'info' | 'success' | 'error' };
