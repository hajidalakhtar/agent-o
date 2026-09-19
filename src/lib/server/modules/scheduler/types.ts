export interface SlotRequest {
	cardId: string;
	projectId: string;
	agentId: string | null;
	/** Run `resolve-conflict` didahulukan (ADR 0005, edge case 22). */
	priority?: boolean;
}

export type AcquisitionResult =
	| { granted: true }
	| { granted: false; reason: string; queuePosition: number };

export interface LimitProvider {
	globalLimit(): number;
	projectLimit(projectId: string): number;
	/** null berarti agent tidak punya batas khusus. */
	agentLimit(agentId: string | null): number | null;
}

export type SchedulerEvent = (
	type: 'queued' | 'granted' | 'released' | 'promoted',
	request: SlotRequest,
	detail?: Record<string, unknown>
) => void;
