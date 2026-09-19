import type { AgentService } from '../agents/index.js';
import type { BoardContext } from '../board/index.js';
import type { Card } from '../cards/types.js';
import * as git from '../git/index.js';
import type { Project } from '../projects/types.js';
import type { Scheduler } from '../scheduler/index.js';

export interface BoardContextDeps {
	projects: { require(id: string): Project };
	scheduler: Scheduler;
	agents?: AgentService;
	/** Jumlah commit di atas base_sha pada branch card. */
	branchCommits?: (card: Card) => Promise<number>;
}

export interface BoardContextInput {
	feedback?: string;
	confirmed?: boolean;
	/**
	 * Hasil akuisisi slot dari scheduler. Bila diisi, nilai ini yang dipakai —
	 * pemanggil sudah memutuskan status slot sebelum guard dievaluasi.
	 */
	slot?: { available: boolean; reason?: string };
}

/**
 * Merakit BoardContext dari state nyata (project, agent, scheduler).
 * Efek samping sistem (worktree, spawn) dijalankan orchestrator, bukan di sini.
 */
export async function buildBoardContext(
	deps: BoardContextDeps,
	card: Card,
	input: BoardContextInput = {}
): Promise<BoardContext> {
	const project = deps.projects.require(card.projectId);

	let projectDirtyFiles: string[] = [];
	if (project.available) {
		try {
			projectDirtyFiles = await git.statusPorcelain(project.rootPath);
		} catch {
			projectDirtyFiles = [];
		}
	}

	const running = deps.scheduler.isRunning(card.id);
	const effectiveAgentId = card.agentId ?? project.defaultAgentId;
	const usability = deps.agents
		? deps.agents.usable(effectiveAgentId)
		: {
				usable: false,
				reason: effectiveAgentId ?? 'Belum ada agent yang ditentukan.'
			};

	return {
		card,
		project,
		projectDirtyFiles,
		slot:
			input.slot ??
			(running
				? { available: true }
				: { available: false, reason: 'Card ini belum memegang slot WIP.' }),
		agent: {
			determined: Boolean(effectiveAgentId),
			usable: usability.usable,
			reason: usability.reason
		},
		branchCommits: deps.branchCommits ? await deps.branchCommits(card) : 0,
		feedback: input.feedback,
		confirmed: input.confirmed
	};
}
