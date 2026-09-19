import { getApp } from '$lib/server/containers.js';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const app = getApp();
	const agents = app.agents.list();

	return {
		agents: agents.map((agent) => ({
			...agent,
			runnable: app.agents.usable(agent.id).usable,
			runCount:
				app.db.get<{ count: number }>('SELECT COUNT(*) AS count FROM run WHERE agent_id = ?', [
					agent.id
				])?.count ?? 0
		}))
	};
};

export const actions: Actions = {
	add: async ({ request }) => {
		const app = getApp();
		const form = await request.formData();
		const argsRaw = String(form.get('args') ?? '').trim();
		const maxConcurrency = Number.parseInt(String(form.get('maxConcurrency') ?? '1'), 10);
		try {
			app.agents.create({
				name: String(form.get('name') ?? ''),
				command: String(form.get('command') ?? ''),
				args: argsRaw ? argsRaw.split(/\s+/) : [],
				maxConcurrency: Number.isFinite(maxConcurrency) ? maxConcurrency : 1
			});
			return { added: true };
		} catch (cause) {
			return fail(400, { error: (cause as Error).message });
		}
	},

	toggle: async ({ request }) => {
		const app = getApp();
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const enabled = String(form.get('enabled') ?? 'true') === 'true';
		try {
			app.agents.setEnabled(id, enabled);
			return { ok: true };
		} catch (cause) {
			return fail(400, { error: (cause as Error).message });
		}
	},

	setConcurrency: async ({ request }) => {
		const app = getApp();
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const value = Number.parseInt(String(form.get('maxConcurrency') ?? '1'), 10);
		try {
			app.agents.setMaxConcurrency(id, value);
			return { ok: true };
		} catch (cause) {
			return fail(400, { error: (cause as Error).message });
		}
	},

	remove: async ({ request }) => {
		const app = getApp();
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		try {
			app.agents.remove(id);
			return { ok: true };
		} catch (cause) {
			return fail(400, { error: (cause as Error).message });
		}
	}
};
