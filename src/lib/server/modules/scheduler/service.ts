import type { AcquisitionResult, LimitProvider, SchedulerEvent, SlotRequest } from './types.js';

/**
 * Scheduler in-memory (SCHED-08): batas global, project, dan agent dievaluasi
 * bersama. Antrean FIFO, kecuali item `priority` didahulukan (edge case 22).
 */
export class Scheduler {
	private readonly running = new Map<string, SlotRequest>();
	private queue: SlotRequest[] = [];

	constructor(
		private readonly limits: LimitProvider,
		private readonly onEvent?: SchedulerEvent
	) {}

	/** Rekonstruksi dari state database saat start (SCHED-08). */
	seed(requests: SlotRequest[]): void {
		this.running.clear();
		this.queue = [];
		for (const request of requests) {
			this.running.set(request.cardId, request);
		}
	}

	/** Dipakai setelah recovery: card yang tidak lagi berjalan tetap di antrean. */
	enqueue(request: SlotRequest): number {
		if (this.running.has(request.cardId)) return -1;
		const existing = this.queue.findIndex((item) => item.cardId === request.cardId);
		if (existing === -1) {
			if (request.priority) {
				const firstNonPriority = this.queue.findIndex((item) => !item.priority);
				if (firstNonPriority === -1) this.queue.push(request);
				else this.queue.splice(firstNonPriority, 0, request);
			} else {
				this.queue.push(request);
			}
			this.onEvent?.('queued', request, { position: this.queue.length });
		}
		return this.position(request.cardId);
	}

	acquire(request: SlotRequest): AcquisitionResult {
		if (this.running.has(request.cardId)) return { granted: true };

		const blocker = this.blocker(request);
		if (blocker) {
			const position = this.enqueue(request);
			return { granted: false, reason: blocker, queuePosition: position };
		}

		this.leaveQueue(request.cardId);
		this.running.set(request.cardId, request);
		this.onEvent?.('granted', request);
		return { granted: true };
	}

	release(cardId: string): SlotRequest[] {
		const released = this.running.get(cardId);
		if (!released) {
			this.leaveQueue(cardId);
			return [];
		}
		this.running.delete(cardId);
		this.onEvent?.('released', released);
		return this.promote();
	}

	/** Setiap slot yang dilepas memicu percobaan memulai item antrean terdepan. */
	promote(): SlotRequest[] {
		const promoted: SlotRequest[] = [];
		for (const request of [...this.queue]) {
			if (this.blocker(request)) continue;
			this.leaveQueue(request.cardId);
			this.running.set(request.cardId, request);
			this.onEvent?.('promoted', request);
			promoted.push(request);
		}
		return promoted;
	}

	position(cardId: string): number {
		const index = this.queue.findIndex((item) => item.cardId === cardId);
		return index === -1 ? 0 : index + 1;
	}

	queueSnapshot(): SlotRequest[] {
		return [...this.queue];
	}

	runningSnapshot(): SlotRequest[] {
		return [...this.running.values()];
	}

	isRunning(cardId: string): boolean {
		return this.running.has(cardId);
	}

	private leaveQueue(cardId: string): void {
		this.queue = this.queue.filter((item) => item.cardId !== cardId);
	}

	private blocker(request: SlotRequest): string | null {
		const globalLimit = this.limits.globalLimit();
		if (this.running.size >= globalLimit) {
			return `Batas WIP global tercapai (${globalLimit}).`;
		}

		const projectLimit = this.limits.projectLimit(request.projectId);
		const projectCount = [...this.running.values()].filter(
			(item) => item.projectId === request.projectId
		).length;
		if (projectCount >= projectLimit) {
			return `Batas WIP project tercapai (${projectLimit}).`;
		}

		const agentLimit = this.limits.agentLimit(request.agentId);
		if (agentLimit !== null && request.agentId) {
			const agentCount = [...this.running.values()].filter(
				(item) => item.agentId === request.agentId
			).length;
			if (agentCount >= agentLimit) {
				return `Batas konkurensi agent tercapai (${agentLimit}).`;
			}
		}

		return null;
	}
}
