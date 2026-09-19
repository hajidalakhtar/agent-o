import type { AcpUpdate } from './types.js';

interface ChunkLike {
	content?: { type?: string; text?: unknown };
	messageId?: string | null;
}

interface ToolLike {
	toolCallId?: string;
	title?: string | null;
	status?: string | null;
}

function textOf(chunk: ChunkLike): string {
	const content = chunk.content;
	if (!content || content.type !== 'text') return '';
	return typeof content.text === 'string' ? content.text : '';
}

/**
 * ACP-02: menerjemahkan `session/update` apa adanya menjadi bentuk yang stabil
 * untuk event card dan UI. Jenis yang tidak dikenali tetap diteruskan sebagai
 * `other` supaya tidak ada informasi yang hilang.
 */
export function normalizeUpdate(update: Record<string, unknown>): AcpUpdate | null {
	const rawKind = typeof update.sessionUpdate === 'string' ? update.sessionUpdate : 'unknown';

	switch (rawKind) {
		case 'agent_message_chunk':
		case 'user_message_chunk': {
			const chunk = update as ChunkLike;
			const text = textOf(chunk);
			if (!text) return null;
			return {
				kind: 'message',
				text,
				messageId: chunk.messageId ?? undefined,
				rawKind
			};
		}
		case 'agent_thought_chunk': {
			const chunk = update as ChunkLike;
			const text = textOf(chunk);
			if (!text) return null;
			return { kind: 'thought', text, messageId: chunk.messageId ?? undefined, rawKind };
		}
		case 'tool_call':
		case 'tool_call_update': {
			const tool = update as ToolLike;
			return {
				kind: rawKind === 'tool_call' ? 'tool_call' : 'tool_call_update',
				toolCallId: typeof tool.toolCallId === 'string' ? tool.toolCallId : undefined,
				title: typeof tool.title === 'string' ? tool.title : undefined,
				status: typeof tool.status === 'string' ? tool.status : undefined,
				rawKind
			};
		}
		case 'plan': {
			const entries = Array.isArray(update.entries) ? (update.entries as Record<string, unknown>[]) : [];
			return {
				kind: 'plan',
				entries: entries.map((entry) => ({
					content: typeof entry.content === 'string' ? entry.content : '',
					priority: typeof entry.priority === 'string' ? entry.priority : undefined,
					status: typeof entry.status === 'string' ? entry.status : undefined
				})),
				rawKind
			};
		}
		default:
			return { kind: 'other', rawKind };
	}
}
