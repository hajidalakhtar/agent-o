export type WorktreeState = 'active' | 'frozen' | 'merged' | 'removed';

export interface Worktree {
	id: string;
	cardId: string;
	path: string;
	branch: string;
	baseSha: string | null;
	headSha: string | null;
	state: WorktreeState;
	createdAt: number;
}

export interface WorktreeWithRepo extends Worktree {
	projectId: string;
	projectRoot: string;
	defaultBranch: string;
}

export class WorkspaceError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'WorkspaceError';
	}
}
