import type { Db } from '../persistence/db.js';
import { EventBus, type EventListener } from './bus.js';
import { EventRepository } from './repository.js';
import type { CardEvent, NewCardEvent } from './types.js';

export class EventService {
	readonly bus = new EventBus();
	private readonly repository: EventRepository;

	constructor(db: Db) {
		this.repository = new EventRepository(db);
	}

	/** Tulis ke database (append-only) lalu publish ke bus. */
	record(event: NewCardEvent): CardEvent {
		const stored = this.repository.append(event);
		this.bus.publish(stored);
		return stored;
	}

	listByCard(cardId: string): CardEvent[] {
		return this.repository.listByCard(cardId);
	}

	subscribe(cardId: string, listener: EventListener): () => void {
		return this.bus.subscribe(cardId, listener);
	}
}
