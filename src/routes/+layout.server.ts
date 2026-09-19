import { getApp } from '$lib/server/containers.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => {
	const app = getApp();
	const projects = app.projects.list().map((project) => ({
		...project,
		cardCount: app.cards.listByProject(project.id).length
	}));
	return {
		projects
	};
};
