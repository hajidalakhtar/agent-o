import { describe, expect, it } from 'vitest';
import { Scheduler } from './service.js';
import type { LimitProvider } from './types.js';

function limits(overrides: Partial<LimitProvider> = {}): LimitProvider {
	return {
		globalLimit: () => 3,
		projectLimit: () => 3,
		agentLimit: () => null,
		...overrides
	};
}

describe('SCHED-01/SCHED-02 — WIP limit dan antrean FIFO', () => {
	it('mengantrekan card yang melewati batas global dan melaporkan posisinya', () => {
		const scheduler = new Scheduler(limits({ globalLimit: () => 2 }));
		expect(scheduler.acquire({ cardId: 'a', projectId: 'p', agentId: null }).granted).toBe(true);
		expect(scheduler.acquire({ cardId: 'b', projectId: 'p', agentId: null }).granted).toBe(true);

		const third = scheduler.acquire({ cardId: 'c', projectId: 'p', agentId: null });
		expect(third.granted).toBe(false);
		if (third.granted) return;
		expect(third.queuePosition).toBe(1);
		expect(third.reason).toContain('global');
	});

	it('menegakkan batas per project', () => {
		const scheduler = new Scheduler(limits({ projectLimit: (id) => (id === 'p1' ? 1 : 5) }));
		expect(scheduler.acquire({ cardId: 'a', projectId: 'p1', agentId: null }).granted).toBe(true);
		const second = scheduler.acquire({ cardId: 'b', projectId: 'p1', agentId: null });
		expect(second.granted).toBe(false);
		if (!second.granted) expect(second.reason).toContain('project');
	});

	it('menegakkan batas konkurensi per agent (AGENT-06)', () => {
		const scheduler = new Scheduler(limits({ agentLimit: (id) => (id === 'a1' ? 1 : null) }));
		expect(scheduler.acquire({ cardId: 'a', projectId: 'p', agentId: 'a1' }).granted).toBe(true);
		const second = scheduler.acquire({ cardId: 'b', projectId: 'p', agentId: 'a1' });
		expect(second.granted).toBe(false);
		if (!second.granted) expect(second.reason).toContain('agent');
	});
});

describe('SCHED-03/SCHED-04 — melepas dan mengambil ulang slot', () => {
	it('melepas slot lalu mempromosikan item antrean terdepan', () => {
		const scheduler = new Scheduler(limits({ globalLimit: () => 1 }));
		scheduler.acquire({ cardId: 'a', projectId: 'p', agentId: null });
		scheduler.acquire({ cardId: 'b', projectId: 'p', agentId: null });

		const promoted = scheduler.release('a');
		expect(promoted.map((r) => r.cardId)).toEqual(['b']);
		expect(scheduler.isRunning('b')).toBe(true);
	});

	it('card blocked melepas slot (BOARD-06)', () => {
		const scheduler = new Scheduler(limits({ globalLimit: () => 1 }));
		scheduler.acquire({ cardId: 'a', projectId: 'p', agentId: null });
		scheduler.release('a');
		expect(scheduler.isRunning('a')).toBe(false);
		expect(scheduler.acquire({ cardId: 'c', projectId: 'p', agentId: null }).granted).toBe(true);
	});
});

describe('edge case 22 — prioritas resolve-conflict', () => {
	it('menyisipkan item prioritas di depan antrean non-prioritas', () => {
		const scheduler = new Scheduler(limits({ globalLimit: () => 1 }));
		scheduler.acquire({ cardId: 'running', projectId: 'p', agentId: null });
		scheduler.acquire({ cardId: 'n1', projectId: 'p', agentId: null });
		scheduler.acquire({ cardId: 'n2', projectId: 'p', agentId: null });
		scheduler.acquire({ cardId: 'conflict', projectId: 'p', agentId: null, priority: true });

		expect(scheduler.queueSnapshot().map((r) => r.cardId)).toEqual(['conflict', 'n1', 'n2']);

		const promoted = scheduler.release('running');
		expect(promoted.map((r) => r.cardId)).toEqual(['conflict']);
	});
});

describe('SCHED-08 — rekonstruksi dari database', () => {
	it('seed() memuat ulang slot yang sedang dipakai', () => {
		const scheduler = new Scheduler(limits({ globalLimit: () => 2 }));
		scheduler.seed([{ cardId: 'a', projectId: 'p', agentId: null }]);
		expect(scheduler.isRunning('a')).toBe(true);
		const second = scheduler.acquire({ cardId: 'b', projectId: 'p', agentId: null });
		expect(second.granted).toBe(true);
		const third = scheduler.acquire({ cardId: 'c', projectId: 'p', agentId: null });
		expect(third.granted).toBe(false);
	});
});
