import type { Card } from '../cards/types.js';
import type { CardService } from '../cards/service.js';
import type { EventService } from '../events/service.js';
import {
	findTransition,
	guardFail,
	type BoardContext,
	type BoardState,
	type GuardResult,
	type TransitionActor,
	type TransitionDefinition
} from './machine.js';

export class BoardError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'BoardError';
	}
}

export interface TransitionInput {
	card: Card;
	to: BoardState | 'deleted';
	actor: TransitionActor;
	reason?: string;
	context: BoardContext;
}

export interface TransitionOutcome {
	card: Card;
	transition: TransitionDefinition;
}

export class BoardService {
	constructor(
		private readonly cards: CardService,
		private readonly events: EventService
	) {}

	/** Validasi transisi + guard tanpa efek samping (BOARD-01). */
	check(from: BoardState, to: BoardState | 'deleted', context: BoardContext): GuardResult {
		const transition = findTransition(from, to);
		if (!transition) {
			return guardFail(`Transisi ${from} → ${to} tidak diizinkan.`);
		}
		return transition.guard(context);
	}

	/**
	 * Menjalankan transisi: perbarui status (BOARD-02 mencatat event `moved`).
	 * Efek samping sistem (worktree, spawn agent, merge) dijalankan orchestrator
	 * berdasarkan `transition.action`.
	 */
	transition(input: TransitionInput): TransitionOutcome {
		const { card, to, actor, reason, context } = input;
		const transition = findTransition(card.status, to);
		if (!transition) {
			throw new BoardError(`Transisi ${card.status} → ${to} tidak terdaftar.`);
		}

		const guard = transition.guard(context);
		if (!guard.ok) {
			throw new BoardError(guard.message);
		}

		let updated: Card;
		if (to === 'deleted') {
			// Event dicatat sebelum card dihapus agar FK card_id tetap valid.
			this.events.record({
				cardId: card.id,
				type: 'moved',
				payload: { from: card.status, to, actor, reason: reason ?? null }
			});
			this.cards.remove(card.id);
			updated = { ...card };
		} else {
			updated = this.cards.update(card.id, {
				status: to,
				position: this.cards.nextPosition(card.projectId, to)
			});
			this.events.record({
				cardId: card.id,
				type: 'moved',
				payload: { from: card.status, to, actor, reason: reason ?? null }
			});
		}

		return { card: updated, transition };
	}
}
