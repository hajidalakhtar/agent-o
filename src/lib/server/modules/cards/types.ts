export type CardStatus = 'backlog' | 'in_progress' | 'blocked' | 'in_review' | 'done';

export type RunKind = 'task' | 'resolve-conflict' | 'answer';

export type RunStatus = 'queued' | 'running' | 'finished' | 'interrupted' | 'cancelled' | 'failed';

export interface Card {
	id: string;
	projectId: string;
	title: string;
	instruction: string;
	status: CardStatus;
	position: number;
	agentId: string | null;
	createdAt: number;
	updatedAt: number;
}

export interface Run {
	id: string;
	cardId: string;
	attemptNo: number;
	kind: RunKind;
	agentId: string | null;
	sessionId: string | null;
	worktreeId: string | null;
	status: RunStatus;
	stopReason: string | null;
	reason: string | null;
	startedAt: number | null;
	endedAt: number | null;
}

export type MessageRole = 'user' | 'agent' | 'system';

export interface CardMessage {
	id: string;
	cardId: string;
	runId: string | null;
	role: MessageRole;
	content: string;
	createdAt: number;
}
