export type Phase = 'lobby' | 'inspect' | 'answer' | 'complete';

export type QuestionType = 'sentence' | 'clues';

// Client-visible fragment: NO slot field (slot = the ordering puzzle)
export interface Fragment {
	id: string;
	content: string;
	isCorrupt: boolean;
}

export interface FragmentChoice {
	id: string;
	text: string;
}

export interface Player {
	id: string;
	name: string;
	isConnected: boolean;
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
	players: Player[];
	// Shared notes by slot. null = slot not yet recognized from the choice set.
	buffer: (string | null)[];
	totalFragments: number;
	revealMs: number; // how long a fragment stays visible before it vanishes
	questionType: QuestionType | null;
	prompt: string | null; // answer-phase question text
	startedAt: number | null;
	completedAt: number | null;
	forcedComplete: boolean;
}

export type ClientMsg =
	| { type: 'join'; playerName?: string }
	| { type: 'log_fragment'; text: string }
	| { type: 'select_fragment_choice'; choiceId: string }
	| { type: 'arm_ack' }
	| { type: 'submit_answer'; text: string }
	| { type: 'vote_restart' }
	| { type: 'resync' };

export interface AdminRoomState {
	roomId: string;
	phase: Phase;
	round: number;
	gameRound: number;
	maxRounds: number;
	players: Player[];
	bufferFilled: number;
	totalFragments: number;
	questionType: QuestionType | null;
	prompt: string | null;
	startedAt: number | null;
	completedAt: number | null;
	forcedComplete: boolean;
}

export interface AdminRankingEntry {
	roomId: string;
	completedAt: number;
	forcedComplete: boolean;
}

export type AdminClientMsg =
	| { type: 'admin_subscribe'; roomIds: string[] }
	| { type: 'admin_start'; roomId: string }
	| { type: 'admin_force_complete'; roomId: string };

export type ServerMsg =
	| { type: 'welcome'; playerId: string }
	| { type: 'state'; room: RoomState }
	| { type: 'inbox'; fragment: Fragment }
	| { type: 'choice_set'; fragId: string; choices: FragmentChoice[] }
	| { type: 'choice_wrong'; penalty: number }
	| { type: 'log_ok' }
	| { type: 'log_reject'; reason: string }
	| { type: 'answer_wrong'; penalty: number }
	| { type: 'complete' }
	| { type: 'error'; message: string }
	| { type: 'toast'; text: string; kind: 'info' | 'success' | 'error' }
	| { type: 'admin_state'; rooms: AdminRoomState[]; ranking: AdminRankingEntry[] }
	| { type: 'admin_error'; message: string };
