import { getApp } from '$lib/server/containers.js';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types.js';

export const load: PageServerLoad = () => {
	const app = getApp();
	const projects = app.projects.list();
	return {
		projects: projects.map((project) => ({
			...project,
			cardCount: app.cards.listByProject(project.id).length
		}))
	};
};

export const actions: Actions = {
	add: async ({ request }) => {
		const form = await request.formData();
		const path = String(form.get('path') ?? '').trim();
		if (!path) return fail(400, { error: 'Path folder wajib diisi.', path });

		try {
			const app = getApp();
			const defaultAgent = app.agents.ensureDefault();
			const project = await app.projects.add(path, { defaultAgentId: defaultAgent.id });
			return { addedId: project.id, addedName: project.name };
		} catch (error) {
			return fail(400, { error: (error as Error).message, path });
		}
	}
};
