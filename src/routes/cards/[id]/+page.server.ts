import { getApp } from '$lib/server/containers.js';
import { transitions } from '$lib/server/modules/board/index.js';
import type { CardStatus } from '$lib/server/modules/cards/types.js';
import { error, fail } from '@sveltejs/kit';
import { buildThread } from '$lib/shared/thread.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params }) => {
	const app = getApp();
	const card = app.cards.get(params.id);
	if (!card) error(404, 'Card tidak ditemukan.');
	const project = app.projects.require(card.projectId);

	const messages = app.cards.listMessages(card.id);
	const events = app.events.listByCard(card.id);
	const thread = buildThread(messages, events);

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
		running: app.orchestrator.runs.isRunning(card.id),
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

		// BOARD: menjawab card `blocked` melanjutkan run (mengambil slot lagi, bisa mengantre).
		if (card.status === 'blocked') {
			try {
				await app.orchestrator.transition(card, { to: 'in_progress' });
			} catch (cause) {
				return fail(400, { error: (cause as Error).message });
			}
		}
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
		const feedbackRaw = form.get('feedback');

		try {
			await app.orchestrator.transition(card, {
				to,
				feedback: feedbackRaw ? String(feedbackRaw) : undefined,
				confirmed: form.get('confirmed') === 'true'
			});
			return { ok: true };
		} catch (cause) {
			return fail(400, { error: (cause as Error).message });
		}
	}
};
