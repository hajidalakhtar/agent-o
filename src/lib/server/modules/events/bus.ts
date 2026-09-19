import type { CardEvent } from './types.js';

export type EventListener = (event: CardEvent) => void;

/** Bus in-process: menyambungkan penulisan event ke stream SSE (UI). */
export class EventBus {
	private readonly listeners = new Map<string, Set<EventListener>>();

	subscribe(cardId: string, listener: EventListener): () => void {
		let set = this.listeners.get(cardId);
		if (!set) {
			set = new Set();
			this.listeners.set(cardId, set);
		}
		set.add(listener);
		return () => {
			set.delete(listener);
			if (set.size === 0) this.listeners.delete(cardId);
		};
	}

	publish(event: CardEvent): void {
		const set = this.listeners.get(event.cardId);
		if (!set) return;
		for (const listener of set) {
			try {
				listener(event);
			} catch {
				// Listener yang gagal tidak boleh merusak penulisan event.
			}
		}
	}
}
