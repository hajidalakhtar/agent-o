import type { Db } from '../persistence/db.js';
import type { Worktree, WorktreeState } from './types.js';

interface WorktreeRow {
	id: string;
	card_id: string;
	path: string;
	branch: string;
	base_sha: string | null;
	head_sha: string | null;
	state: string;
	created_at: number;
}

function toWorktree(row: WorktreeRow): Worktree {
	return {
		id: row.id,
		cardId: row.card_id,
		path: row.path,
		branch: row.branch,
		baseSha: row.base_sha,
		headSha: row.head_sha,
		state: row.state as WorktreeState,
		createdAt: row.created_at
	};
}

export class WorktreeRepository {
	constructor(private readonly db: Db) {}

	insert(worktree: Worktree): Worktree {
		this.db.run(
			`INSERT INTO worktree (id, card_id, path, branch, base_sha, head_sha, state, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				worktree.id,
				worktree.cardId,
				worktree.path,
				worktree.branch,
				worktree.baseSha,
				worktree.headSha,
				worktree.state,
				worktree.createdAt
			]
		);
		return worktree;
	}

	findById(id: string): Worktree | undefined {
		const row = this.db.get<WorktreeRow>('SELECT * FROM worktree WHERE id = ?', [id]);
		return row ? toWorktree(row) : undefined;
	}

	/** WS-08: worktree dilacak dari metadata, bukan dari nama folder. */
	findByCard(cardId: string): Worktree | undefined {
		const row = this.db.get<WorktreeRow>(
			"SELECT * FROM worktree WHERE card_id = ? AND state != 'removed' ORDER BY created_at DESC LIMIT 1",
			[cardId]
		);
		return row ? toWorktree(row) : undefined;
	}

	list(): Worktree[] {
		return this.db.all<WorktreeRow>('SELECT * FROM worktree ORDER BY created_at ASC').map(toWorktree);
	}

	listByState(state: WorktreeState): Worktree[] {
		return this.db
			.all<WorktreeRow>('SELECT * FROM worktree WHERE state = ?', [state])
			.map(toWorktree);
	}

	update(
		id: string,
		changes: Partial<Pick<Worktree, 'baseSha' | 'headSha' | 'state' | 'path' | 'branch'>>
	): void {
		const current = this.findById(id);
		if (!current) return;
		const next = { ...current, ...changes };
		this.db.run(
			'UPDATE worktree SET base_sha = ?, head_sha = ?, state = ?, path = ?, branch = ? WHERE id = ?',
			[next.baseSha, next.headSha, next.state, next.path, next.branch, id]
		);
	}

	delete(id: string): void {
		this.db.run('DELETE FROM worktree WHERE id = ?', [id]);
	}
}
