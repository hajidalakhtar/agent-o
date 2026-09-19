import { getApp } from '$lib/server/containers.js';
import { transitions } from '$lib/server/modules/board/index.js';
import { buildThread } from '$lib/shared/thread.js';
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ params }) => {
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

	const allowed = transitions
		.filter((transition) => transition.from === card.status)
		.map((transition) => ({ to: transition.to, trigger: transition.trigger }));

	return json({
		card,
		project,
		thread,
		runs: app.cards.listRuns(card.id),
		queuePosition: app.scheduler.position(card.id),
		effectiveAgentId: card.agentId ?? project.defaultAgentId,
		running: app.orchestrator.runs.isRunning(card.id),
		worktree,
		allowed
	});
};
