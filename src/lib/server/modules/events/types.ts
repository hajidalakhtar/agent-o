export type CardEventType =
	| 'card_created'
	| 'card_updated'
	| 'moved'
	| 'run_started'
	| 'message'
	| 'tool_call'
	| 'tool_call_update'
	| 'plan'
	| 'thought'
	| 'permission_request'
	| 'permission_decision'
	| 'completion_reported'
	| 'completion_inferred'
	| 'conflict_detected'
	| 'run_ended'
	| 'review_frozen'
	| 'merged'
	| 'rejected'
	| 'deleted';

export interface CardEvent {
	id: string;
	cardId: string;
	runId: string | null;
	type: CardEventType;
	payload: Record<string, unknown>;
	createdAt: number;
}

export interface NewCardEvent {
	cardId: string;
	runId?: string | null;
	type: CardEventType;
	payload?: Record<string, unknown>;
}
