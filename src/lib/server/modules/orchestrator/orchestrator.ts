import { buildBoardContext } from './context.js';
import { RunCoordinator, type RunDeps } from './run.js';
import { applyTransition, type TransitionRequest } from './service.js';
import type { BoardService } from '../board/index.js';
import type { Card, CardStatus } from '../cards/types.js';
import type { CardService } from '../cards/index.js';
import type { EventService } from '../events/index.js';
import type { AgentService } from '../agents/index.js';
import type { PermissionService } from '../permissions/index.js';
import type { ProjectService } from '../projects/index.js';
import type { Scheduler } from '../scheduler/index.js';
import type { WorkspaceService } from '../workspace/index.js';

export interface OrchestratorDeps {
	cards: CardService;
	events: EventService;
	board: BoardService;
	agents: AgentService;
	projects: ProjectService;
	permissions: PermissionService;
	scheduler: Scheduler;
	workspace: WorkspaceService;
	runs: Pick<RunDeps, 'acp' | 'logsDir'>;
}

/**
 * Koordinator tunggal: transisi board dari UI + efek samping sistem (worktree,
 * spawn agent, cleanup) + transisi yang dipicu sistem saat run selesai.
 */
export class Orchestrator {
	readonly runs: RunCoordinator;

	constructor(private readonly deps: OrchestratorDeps) {
		this.runs = new RunCoordinator({
			cards: deps.cards,
			events: deps.events,
			agents: deps.agents,
			projects: deps.projects,
			permissions: deps.permissions,
			workspace: deps.workspace,
			acp: deps.runs.acp,
			logsDir: deps.runs.logsDir,
			systemTransition: (cardId, to, reason) => this.systemTransition(cardId, to, reason)
		});
	}

	/** Transisi yang diminta user. Melepas slot & menghentikan proses lewat hook. */
	async transition(card: Card, request: TransitionRequest): Promise<Card> {
		if (request.to === 'deleted' && card.status === 'in_progress') {
			this.runs.stop(card.id, 'card dihapus');
		}

		const result = await applyTransition(
			{
				projects: this.deps.projects,
				scheduler: this.deps.scheduler,
				agents: this.deps.agents,
				board: this.deps.board,
				branchCommits: (target) => this.branchCommits(target),
				onStarted: (started, action) => {
					void this.runs.start(started, action).catch((error) => {
						console.error('[agent-o] start run gagal', error);
					});
				},
				onStopped: (stopped, _to, reason) => {
					this.runs.stop(stopped.id, reason);
				}
			},
			card,
			request
		);

		await this.cleanupWorktreeIfNeeded(card, request);
		return result;
	}

	async shutdown(): Promise<void> {
		await this.runs.shutdown();
	}

	/** Jumlah commit di atas base_sha pada branch card (guard DONE-08). */
	private async branchCommits(card: Card): Promise<number> {
		const worktree = this.deps.workspace.findByCard(card.id);
		if (!worktree) return 0;
		try {
			return await this.deps.workspace.commitCount(worktree);
		} catch {
			return 0;
		}
	}

	/**
	 * Transisi yang dipicu agent sendiri (selesai/gagal/butuh keputusan).
	 * Selalu melepas slot WIP dan tidak pernah menggantung (NFR-20).
	 */
	private async systemTransition(cardId: string, to: CardStatus | 'deleted', reason: string): Promise<void> {
		const card = this.deps.cards.get(cardId);
		if (!card) return;

		try {
			const context = await buildBoardContext(
				{
					projects: this.deps.projects,
					scheduler: this.deps.scheduler,
					agents: this.deps.agents,
					branchCommits: (target) => this.branchCommits(target)
				},
				card,
				{ slot: { available: true } }
			);
			this.deps.board.transition({ card, to, actor: 'system', reason, context });
		} catch (error) {
			// Jaring terakhir: card tidak boleh tetap tampak dikerjakan (NFR-20).
			if (card.status !== 'blocked') {
				const fallback = this.deps.cards.get(cardId);
				if (fallback && fallback.status === 'in_progress') {
					this.deps.cards.update(cardId, { status: 'blocked' });
					this.deps.events.record({
						cardId,
						type: 'moved',
						payload: { from: 'in_progress', to: 'blocked', actor: 'system', reason: (error as Error).message }
					});
				}
			}
		} finally {
			this.deps.scheduler.release(cardId);
		}

		await this.cleanupWorktreeIfNeeded(card, { to });
	}

	/** WS-05: worktree dihapus saat card dibatalkan, di-reject, atau dihapus. */
	private async cleanupWorktreeIfNeeded(card: Card, request: TransitionRequest): Promise<void> {
		const cancelling = request.to === 'backlog' && (card.status === 'blocked' || card.status === 'in_review');
		if (request.to !== 'deleted' && !cancelling) return;

		const worktree = this.deps.workspace.findByCard(card.id);
		if (!worktree) return;
		const project = this.deps.projects.get(card.projectId);
		if (!project) return;
		try {
			await this.deps.workspace.remove(worktree, project);
		} catch {
			// Cleanup idempoten: kegagalan di sini tidak boleh merusak transisi.
		}
	}
}
