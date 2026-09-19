import { getApp } from '$lib/server/containers.js';
import { transitions } from '$lib/server/modules/board/index.js';
import type { CardStatus } from '$lib/server/modules/cards/types.js';
import { buildBoardContext } from '$lib/server/modules/orchestrator/context.js';
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

const COLUMNS: CardStatus[] = ['backlog', 'in_progress', 'blocked', 'in_review', 'done'];

export const load: PageServerLoad = ({ params }) => {
	const app = getApp();
	const project = app.projects.get(params.id);
	if (!project) error(404, 'Project tidak ditemukan.');

	const cards = app.cards.listByProject(project.id);
	const agents = app.agents.list();
	const running = app.scheduler.runningSnapshot();
	const queue = app.scheduler.queueSnapshot();

	return {
		project,
		agents: agents.map((agent) => ({
			id: agent.id,
			name: agent.name,
			health: agent.health,
			enabled: agent.enabled,
			usable: app.agents.usable(agent.id).usable
		})),
		wip: {
			globalLimit: app.settings.globalWipLimit(),
			globalRunning: running.length,
			projectLimit: project.wipLimit,
			projectRunning: running.filter((slot) => slot.projectId === project.id).length
		},
		queue: queue.map((slot) => ({
			...slot,
			title: app.cards.get(slot.cardId)?.title ?? slot.cardId,
			position: app.scheduler.position(slot.cardId)
		})),
		columns: COLUMNS.map((status) => ({
			status,
			cards: cards
				.filter((card) => card.status === status)
				.map((card) => {
					const effectiveAgentId = card.agentId ?? project.defaultAgentId;
					return {
						...card,
						effectiveAgentId,
						agentName: effectiveAgentId
							? (agents.find((agent) => agent.id === effectiveAgentId)?.name ?? 'agent tidak dikenal')
							: null,
						queued: app.scheduler.position(card.id),
						allowed: transitions
							.filter((transition) => transition.from === card.status)
							.map((transition) => ({ to: transition.to, trigger: transition.trigger }))
					};
				})
		}))
	};
};

export const actions: Actions = {
	create: async ({ params, request }) => {
		const form = await request.formData();
		const title = String(form.get('title') ?? '');
		const instruction = String(form.get('instruction') ?? '');
		const agentId = String(form.get('agentId') ?? '');
		const app = getApp();
		try {
			const card = app.cards.create(params.id, title, instruction);
			if (agentId) app.cards.update(card.id, { agentId });
			app.events.record({
				cardId: card.id,
				type: 'card_created',
				payload: { title: card.title }
			});
			return { ok: true };
		} catch (cause) {
			return fail(400, { error: (cause as Error).message });
		}
	},

	assignAgent: async ({ request }) => {
		const app = getApp();
		const form = await request.formData();
		const cardId = String(form.get('cardId') ?? '');
		const agentId = String(form.get('agentId') ?? '');
		try {
			app.cards.update(cardId, { agentId: agentId || null });
			return { ok: true };
		} catch (cause) {
			return fail(400, { error: (cause as Error).message });
		}
	},

	transition: async ({ request }) => {
		const app = getApp();
		const form = await request.formData();
		const cardId = String(form.get('cardId') ?? '');
		const to = String(form.get('to') ?? '') as CardStatus | 'deleted';
		const feedbackRaw = form.get('feedback');
		const feedback = feedbackRaw ? String(feedbackRaw) : undefined;
		const confirmed = form.get('confirmed') === 'true';

		const card = app.cards.get(cardId);
		if (!card) return fail(404, { error: 'Card tidak ditemukan.' });

		try {
			const context = await buildBoardContext(app, card, { feedback, confirmed });
			app.board.transition({ card, to, actor: 'user', reason: 'manual', context });
			if (to !== 'in_progress') app.scheduler.release(cardId);
			return { ok: true };
		} catch (cause) {
			return fail(400, { error: (cause as Error).message });
		}
	}
};
