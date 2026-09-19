import { describe, expect, it } from 'vitest';
import type { Card } from '../cards/types.js';
import type { Project } from '../projects/types.js';
import { findTransition, transitions, type BoardContext } from './machine.js';

const project: Project = {
	id: 'p1',
	name: 'Demo',
	rootPath: '/tmp/demo',
	defaultBranch: 'main',
	defaultAgentId: null,
	wipLimit: 3,
	permissionPolicyId: null,
	available: true,
	createdAt: 0
};

function card(overrides: Partial<Card> = {}): Card {
	return {
		id: 'c1',
		projectId: 'p1',
		title: 'Card',
		instruction: 'kerjakan',
		status: 'backlog',
		position: 0,
		agentId: 'a1',
		createdAt: 0,
		updatedAt: 0,
		...overrides
	};
}

function context(overrides: Partial<BoardContext> = {}): BoardContext {
	return {
		card: card(),
		project,
		projectDirtyFiles: [],
		slot: { available: true },
		agent: { determined: true, usable: true },
		branchCommits: 1,
		...overrides
	};
}

describe('BOARD-04 — hanya transisi terdaftar yang diizinkan', () => {
	it('menolak backlog → in_review', () => {
		expect(findTransition('backlog', 'in_review')).toBeUndefined();
	});

	it('menolak done → apa pun', () => {
		const fromDone = transitions.filter((t) => t.from === 'done');
		expect(fromDone).toHaveLength(0);
	});
});

describe('BOARD-01 — guard transisi', () => {
	it('backlog → in_progress menolak instruksi kosong', () => {
		const transition = findTransition('backlog', 'in_progress');
		const result = transition!.guard(context({ card: card({ instruction: '  ' }) }));
		expect(result.ok).toBe(false);
	});

	it('backlog → in_progress menolak bila agent tidak ditentukan', () => {
		const transition = findTransition('backlog', 'in_progress');
		const result = transition!.guard(context({ agent: { determined: false, usable: false } }));
		expect(result.ok).toBe(false);
	});

	it('backlog → in_progress menolak bila slot WIP penuh', () => {
		const transition = findTransition('backlog', 'in_progress');
		const result = transition!.guard(context({ slot: { available: false, reason: 'penuh' } }));
		expect(result.ok).toBe(false);
	});

	it('backlog → in_progress menolak bila working tree kotor', () => {
		const transition = findTransition('backlog', 'in_progress');
		const result = transition!.guard(context({ projectDirtyFiles: ['a.txt'] }));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.message).toContain('a.txt');
	});

	it('backlog → in_progress lolos bila semua guard terpenuhi', () => {
		const transition = findTransition('backlog', 'in_progress');
		expect(transition!.guard(context()).ok).toBe(true);
	});

	it('in_progress → in_review menolak bila tidak ada commit (DONE-08)', () => {
		const transition = findTransition('in_progress', 'in_review');
		const result = transition!.guard(context({ branchCommits: 0 }));
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.message).toContain('tidak ada perubahan');
	});

	it('in_review → backlog mewajibkan alasan reject (REVIEW-04)', () => {
		const transition = findTransition('in_review', 'backlog');
		expect(transition!.guard(context({ feedback: '' })).ok).toBe(false);
		expect(transition!.guard(context({ feedback: 'kurang tepat' })).ok).toBe(true);
	});

	it('penghapusan card butuh konfirmasi eksplisit (CARD-08)', () => {
		const transition = findTransition('backlog', 'deleted');
		expect(transition!.guard(context({ confirmed: false })).ok).toBe(false);
		expect(transition!.guard(context({ confirmed: true })).ok).toBe(true);
	});
});
