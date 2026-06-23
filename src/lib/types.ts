export type Phase = 'lobby' | 'inspect' | 'answer' | 'complete';

export type QuestionType = 'sentence' | 'clues';

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
	wantsRestart: boolean;
}

export interface RoomState {
	roomId: string;
	phase: Phase;
	round: number; // retransmit round within current question
	gameRound: number; // 1 = Q1 (sentence), 2 = Q2 (clues)
	maxRounds: number; // always 2
	minPlayers: number;
	players: Player[];
	// Shared notes by slot. null = slot not yet transcribed. Free text — never validated.
	buffer: (string | null)[];
	totalFragments: number;
	revealMs: number; // how long a fragment stays visible before it vanishes
	questionType: QuestionType | null;
	prompt: string | null; // answer-phase question text
}

export type ClientMsg =
	| { type: 'join'; playerName: string }
	| { type: 'ready' }
	| { type: 'log_fragment'; text: string }
	| { type: 'arm_ack' }
	| { type: 'submit_answer'; text: string }
	| { type: 'vote_restart' }
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
