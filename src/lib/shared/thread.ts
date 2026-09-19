/**
 * Bentuk item thread yang dibagi server ↔ UI. Modul ini murni (tanpa I/O)
 * supaya thread bisa dirender ulang dari event (CARD-06) dan diuji terpisah.
 */

export interface ThreadMessageInput {
	id: string;
	role: string;
	content: string;
	createdAt: number;
}

export interface ThreadEventInput {
	id: string;
	type: string;
	payload: Record<string, unknown>;
	createdAt: number;
}

export interface PlanEntryView {
	content: string;
	priority?: string;
	status?: string;
}

export type ThreadItem =
	| { id: string; kind: 'message'; role: string; content: string; createdAt: number; messageId?: string }
	| { id: string; kind: 'system'; type: string; content: string; createdAt: number }
	| { id: string; kind: 'tool'; toolCallId: string; title: string; status: string; createdAt: number }
	| { id: string; kind: 'thought'; content: string; createdAt: number; messageId?: string }
	| { id: string; kind: 'plan'; entries: PlanEntryView[]; createdAt: number }
	| {
			id: string;
			kind: 'completion';
			status: string;
			reason: string;
			inferred: boolean;
			createdAt: number;
		};

function str(value: unknown, fallback = ''): string {
	return typeof value === 'string' ? value : fallback;
}

/** Baris sistem untuk event tingkat card. */
export function formatSystemEvent(type: string, payload: Record<string, unknown>): string | null {
	switch (type) {
		case 'card_created':
			return 'Card dibuat';
		case 'moved':
			if (payload.scheduler) return `Scheduler: ${payload.scheduler}`;
			return `Pindah ${payload.from} → ${payload.to} (${payload.actor})${
				payload.reason ? ` — ${payload.reason}` : ''
			}`;
		case 'run_started':
			return `Run #${payload.attemptNo ?? '?'} dimulai dengan agent ${payload.agentName ?? payload.agentId ?? '—'}`;
		case 'run_ended':
			return `Run berakhir (${payload.status ?? 'selesai'})${payload.stopReason ? ` — ${payload.stopReason}` : ''}`;
		case 'permission_decision':
			return `Izin ${payload.decision}: ${payload.category ?? '—'} → ${payload.target ?? ''}`;
		case 'permission_request':
			return `Permintaan izin: ${payload.title ?? payload.category ?? '—'}`;
		default:
			return null;
	}
}

/** Memetakan satu CardEvent menjadi item thread. `null` berarti ditangani baris sistem. */
export function eventToThreadItem(event: ThreadEventInput): ThreadItem | null {
	const payload = event.payload;
	switch (event.type) {
		case 'message':
			return {
				id: event.id,
				kind: 'message',
				role: str(payload.role, 'agent'),
				content: str(payload.text),
				createdAt: event.createdAt,
				messageId: typeof payload.messageId === 'string' ? payload.messageId : undefined
			};
		case 'thought':
			return {
				id: event.id,
				kind: 'thought',
				content: str(payload.text),
				createdAt: event.createdAt,
				messageId: typeof payload.messageId === 'string' ? payload.messageId : undefined
			};
		case 'tool_call':
		case 'tool_call_update':
			return {
				id: event.id,
				kind: 'tool',
				toolCallId: str(payload.toolCallId, event.id),
				title: str(payload.title, 'Tool call'),
				status: str(payload.status, 'pending'),
				createdAt: event.createdAt
			};
		case 'plan':
			return {
				id: event.id,
				kind: 'plan',
				entries: Array.isArray(payload.entries)
					? (payload.entries as PlanEntryView[]).map((entry) => ({
							content: str(entry?.content),
							priority: entry?.priority,
							status: entry?.status
						}))
					: [],
				createdAt: event.createdAt
			};
		case 'completion_reported':
			return {
				id: event.id,
				kind: 'completion',
				status: str(payload.kind, 'done'),
				reason: str(payload.summary) || str(payload.question) || str(payload.reason),
				inferred: false,
				createdAt: event.createdAt
			};
		case 'completion_inferred':
			return {
				id: event.id,
				kind: 'completion',
				status: str(payload.status, 'blocked'),
				reason: str(payload.reason),
				inferred: true,
				createdAt: event.createdAt
			};
		default: {
			// Operasi yang diizinkan tidak memenuhi thread (audit lengkap ada di tab Audit Izin).
			if (event.type === 'permission_decision' && str(payload.decision) === 'allow') return null;
			const text = formatSystemEvent(event.type, payload);
			return text ? { id: event.id, kind: 'system', type: event.type, content: text, createdAt: event.createdAt } : null;
		}
	}
}

/**
 * Menambahkan item sambil menggabungkan yang bersambung: chunk pesan agent
 * dengan `messageId` sama, dan `tool_call_update` ke tool call yang sama.
 */
export function appendThreadItem(items: ThreadItem[], item: ThreadItem): ThreadItem[] {
	const last = items.at(-1);

	if (item.kind === 'message' && item.messageId && last?.kind === 'message' && last.messageId === item.messageId) {
		const merged: ThreadItem = { ...last, content: last.content + item.content };
		return [...items.slice(0, -1), merged];
	}
	if (item.kind === 'thought' && item.messageId && last?.kind === 'thought' && last.messageId === item.messageId) {
		const merged: ThreadItem = { ...last, content: last.content + item.content };
		return [...items.slice(0, -1), merged];
	}
	if (item.kind === 'tool') {
		const index = items.findIndex((existing) => existing.kind === 'tool' && existing.toolCallId === item.toolCallId);
		if (index !== -1) {
			const existing = items[index];
			if (existing.kind === 'tool') {
				const merged: ThreadItem = {
					...existing,
					title: item.title === 'Tool call' ? existing.title : item.title,
					status: item.status === 'pending' ? existing.status : item.status
				};
				const next = [...items];
				next[index] = merged;
				return next;
			}
		}
	}
	return [...items, item];
}

/** CARD-02/CARD-06: menyusun thread dari pesan tersimpan + event append-only. */
export function buildThread(messages: ThreadMessageInput[], events: ThreadEventInput[]): ThreadItem[] {
	const ordered = [
		...messages.map((message, index) => ({
			seq: index,
			createdAt: message.createdAt,
			item: {
				id: message.id,
				kind: 'message' as const,
				role: message.role,
				content: message.content,
				createdAt: message.createdAt
			} satisfies ThreadItem
		})),
		...events.map((event, index) => ({
			seq: messages.length + index,
			createdAt: event.createdAt,
			item: eventToThreadItem(event)
		}))
	].filter((entry): entry is { seq: number; createdAt: number; item: ThreadItem } => entry.item !== null);

	ordered.sort((a, b) => a.createdAt - b.createdAt || a.seq - b.seq);

	return ordered.reduce<ThreadItem[]>((items, entry) => appendThreadItem(items, entry.item), []);
}
