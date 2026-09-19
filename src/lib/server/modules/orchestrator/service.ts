import { findTransition, type BoardService } from '../board/index.js';
import type { Card, CardStatus } from '../cards/types.js';
import type { Scheduler } from '../scheduler/index.js';
import { buildBoardContext, type BoardContextDeps } from './context.js';

export interface TransitionDeps extends BoardContextDeps {
	board: BoardService;
	scheduler: Scheduler;
	/** Dipanggil tanpa di-await setelah card berhasil masuk `in_progress` (NFR-04). */
	onStarted?: (card: Card, action: string) => void;
	/** Dipanggil setelah card tidak lagi `in_progress`, untuk menghentikan proses agent (NFR-08). */
	onStopped?: (card: Card, to: CardStatus | 'deleted', reason: string) => void;
}

export interface TransitionRequest {
	to: CardStatus | 'deleted';
	feedback?: string;
	confirmed?: boolean;
}

/**
 * Use-case transisi board: ambil slot WIP bila card menuju `in_progress`
 * (SCHED-04), jalankan guard + transisi, lalu lepas slot bila card tidak lagi
 * berjalan (SCHED-03). Bila transisi gagal, slot yang sempat diambil — atau
 * entri antrean yang dibuat saat pengambilan gagal — selalu dibersihkan.
 */
export async function applyTransition(
	deps: TransitionDeps,
	card: Card,
	request: TransitionRequest
): Promise<Card> {
	const transition = findTransition(card.status, request.to);
	const targetInProgress = request.to === 'in_progress';

	let slot: { available: boolean; reason?: string } | undefined;
	if (targetInProgress && transition) {
		const project = deps.projects.require(card.projectId);
		const acquired = deps.scheduler.acquire({
			cardId: card.id,
			projectId: card.projectId,
			agentId: card.agentId ?? project.defaultAgentId,
			priority: transition.action === 'resolve-conflict'
		});
		slot = acquired.granted
			? { available: true }
			: { available: false, reason: acquired.reason };
	}

	const context = await buildBoardContext(deps, card, {
		feedback: request.feedback,
		confirmed: request.confirmed,
		slot
	});

	try {
		const outcome = deps.board.transition({
			card,
			to: request.to,
			actor: 'user',
			reason: 'manual',
			context
		});
		if (targetInProgress) {
			if (transition) deps.onStarted?.(outcome.card, transition.action);
		} else {
			deps.scheduler.release(card.id);
			if (card.status === 'in_progress') {
				deps.onStopped?.(outcome.card, request.to, request.feedback ?? 'dihentikan user');
			}
		}
		return outcome.card;
	} catch (cause) {
		if (targetInProgress) deps.scheduler.release(card.id);
		throw cause;
	}
}
