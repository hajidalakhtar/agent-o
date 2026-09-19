import { randomUUID } from 'node:crypto';
import type { Db } from '../persistence/db.js';
import type { CardEvent, CardEventType, NewCardEvent } from './types.js';

interface EventRow {
	id: string;
	card_id: string;
	run_id: string | null;
	type: string;
	payload: string;
	created_at: number;
}

function toEvent(row: EventRow): CardEvent {
	let payload: Record<string, unknown> = {};
	try {
		payload = JSON.parse(row.payload) as Record<string, unknown>;
	} catch {
		payload = { _parseError: true, raw: row.payload };
	}
	return {
		id: row.id,
		cardId: row.card_id,
		runId: row.run_id,
		type: row.type as CardEventType,
		payload,
		createdAt: row.created_at
	};
}

export class EventRepository {
	constructor(private readonly db: Db) {}

	/** Append-only: tidak ada update/delete (NFR-11). */
	append(event: NewCardEvent, now = Date.now()): CardEvent {
		const stored: CardEvent = {
			id: randomUUID(),
			cardId: event.cardId,
			runId: event.runId ?? null,
			type: event.type,
			payload: event.payload ?? {},
			createdAt: now
		};
		this.db.run(
			`INSERT INTO card_event (id, card_id, run_id, type, payload, created_at)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			[stored.id, stored.cardId, stored.runId, stored.type, JSON.stringify(stored.payload), stored.createdAt]
		);
		return stored;
	}

	listByCard(cardId: string): CardEvent[] {
		return this.db
			.all<EventRow>(
				`SELECT id, card_id, run_id, type, payload, created_at
				 FROM card_event WHERE card_id = ? ORDER BY created_at ASC, rowid ASC`,
				[cardId]
			)
			.map(toEvent);
	}
}
