import { getApp } from '$lib/server/containers.js';
import { transitions } from '$lib/server/modules/board/index.js';
import type { CardStatus } from '$lib/server/modules/cards/types.js';
import { buildBoardContext } from '$lib/server/modules/orchestrator/context.js';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

interface ThreadItem {
	id: string;
	kind: 'message' | 'system';
	role?: string;
	type?: string;
	content: string;
	createdAt: number;
}

function formatEvent(type: string, payload: Record<string, unknown>): string {
	switch (type) {
		case 'moved':
			return `Pindah ${payload.from} → ${payload.to} (${payload.actor})${
				payload.reason ? ` — ${payload.reason}` : ''
			}`;
		case 'card_created':
			return 'Card dibuat';
		case 'permission_decision':
			return `Izin ${payload.decision}: ${payload.category} → ${payload.target ?? ''}`;
		default:
			return type;
	}
}

export const load: PageServerLoad = ({ params }) => {
	const app = getApp();
	const card = app.cards.get(params.id);
	if (!card) error(404, 'Card tidak ditemukan.');
	const project = app.projects.require(card.projectId);

	const messages = app.cards.listMessages(card.id);
	const events = app.events.listByCard(card.id);

	const thread: ThreadItem[] = [
		...messages.map((message) => ({
			id: message.id,
			kind: 'message' as const,
			role: message.role,
			content: message.content,
			createdAt: message.createdAt
		})),
		...events.map((event) => ({
			id: event.id,
			kind: 'system' as const,
			type: event.type,
			content: formatEvent(event.type, event.payload),
			createdAt: event.createdAt
		}))
	].sort((a, b) => a.createdAt - b.createdAt);

	const worktree =
		app.db.get<{
			path: string;
			branch: string;
			base_sha: string | null;
			head_sha: string | null;
			state: string;
		}>('SELECT path, branch, base_sha, head_sha, state FROM worktree WHERE card_id = ? LIMIT 1', [card.id]) ??
		null;

	const permissionEvents = events.filter(
		(event) => event.type === 'permission_request' || event.type === 'permission_decision'
	);

	return {
		card,
		project,
		thread,
		runs: app.cards.listRuns(card.id),
		queuePosition: app.scheduler.position(card.id),
		agents: app.agents.list().map((agent) => ({
			id: agent.id,
			name: agent.name,
			health: agent.health,
			usable: app.agents.usable(agent.id).usable
		})),
		effectiveAgentId: card.agentId ?? project.defaultAgentId,
		worktree,
		permissionAudit: permissionEvents.map((event) => ({
			id: event.id,
			type: event.type,
			payload: event.payload,
			createdAt: event.createdAt
		})),
		allowed: transitions
			.filter((transition) => transition.from === card.status)
			.map((transition) => ({ to: transition.to, trigger: transition.trigger }))
	};
};

export const actions: Actions = {
	reply: async ({ params, request }) => {
		const app = getApp();
		const card = app.cards.get(params.id);
		if (!card) return fail(404, { error: 'Card tidak ditemukan.' });

		const form = await request.formData();
		const content = String(form.get('content') ?? '').trim();
		if (!content) return fail(400, { error: 'Pesan tidak boleh kosong.' });

		app.cards.addMessage(card.id, 'user', content);
		return { ok: true };
	},

	update: async ({ params, request }) => {
		const app = getApp();
		const form = await request.formData();
		const title = String(form.get('title') ?? '');
		const instruction = String(form.get('instruction') ?? '');
		try {
			app.cards.update(params.id, { title, instruction });
			return { ok: true };
		} catch (cause) {
			return fail(400, { error: (cause as Error).message });
		}
	},

	assignAgent: async ({ params, request }) => {
		const app = getApp();
		const form = await request.formData();
		const agentId = String(form.get('agentId') ?? '');
		try {
			app.cards.update(params.id, { agentId: agentId || null });
			return { ok: true };
		} catch (cause) {
			return fail(400, { error: (cause as Error).message });
		}
	},

	transition: async ({ params, request }) => {
		const app = getApp();
		const card = app.cards.get(params.id);
		if (!card) return fail(404, { error: 'Card tidak ditemukan.' });

		const form = await request.formData();
		const to = String(form.get('to') ?? '') as CardStatus | 'deleted';
		const feedback = form.get('feedback') ? String(form.get('feedback')) : undefined;
		const confirmed = form.get('confirmed') === 'true';

		try {
			const context = await buildBoardContext(app, card, { feedback, confirmed });
			app.board.transition({ card, to, actor: 'user', reason: 'manual', context });
			if (to !== 'in_progress') app.scheduler.release(card.id);
			return { ok: true };
		} catch (cause) {
			return fail(400, { error: (cause as Error).message });
		}
	}
};
