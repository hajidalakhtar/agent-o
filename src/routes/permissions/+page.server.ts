import { getApp } from '$lib/server/containers.js';
import {
	ALWAYS_DENIED,
	CATEGORY_LABELS,
	PERMISSION_CATEGORIES,
	SYSTEM_DEFAULTS,
	type Decision,
	type PermissionCategory,
	type PermissionRule,
	type PolicyScope
} from '$lib/server/modules/permissions/index.js';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

function rulesFromForm(form: FormData): PermissionRule[] {
	const rules: PermissionRule[] = [];
	for (const category of PERMISSION_CATEGORIES) {
		const value = String(form.get(`rule_${category}`) ?? '');
		if (value === 'allow' || value === 'deny' || value === 'ask') {
			rules.push({ category, decision: value });
		}
	}
	return rules;
}

export const load: PageServerLoad = () => {
	const app = getApp();
	return {
		policies: app.permissions.list(),
		categories: PERMISSION_CATEGORIES.map((category) => ({
			id: category,
			label: CATEGORY_LABELS[category],
			systemDefault: SYSTEM_DEFAULTS[category],
			forced: ALWAYS_DENIED.includes(category)
		})),
		projects: app.projects.list().map((project) => ({ id: project.id, name: project.name })),
		defaultPolicyId: app.settings.defaultPolicyId()
	};
};

export const actions: Actions = {
	create: async ({ request }) => {
		const app = getApp();
		const form = await request.formData();
		const scope = String(form.get('scope') ?? 'global') as PolicyScope;
		const scopeId = String(form.get('scopeId') ?? '') || null;
		try {
			app.permissions.create({
				name: String(form.get('name') ?? ''),
				scope,
				scopeId: scope === 'global' ? null : scopeId,
				rules: rulesFromForm(form),
				defaultDecision: 'deny'
			});
			return { added: true };
		} catch (cause) {
			return fail(400, { error: (cause as Error).message });
		}
	},

	saveRules: async ({ request }) => {
		const app = getApp();
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		try {
			app.permissions.update(id, { rules: rulesFromForm(form) });
			return { ok: true };
		} catch (cause) {
			return fail(400, { error: (cause as Error).message });
		}
	},

	remove: async ({ request }) => {
		const app = getApp();
		const form = await request.formData();
		try {
			app.permissions.remove(String(form.get('id') ?? ''));
			return { ok: true };
		} catch (cause) {
			return fail(400, { error: (cause as Error).message });
		}
	},

	setDefault: async ({ request }) => {
		const app = getApp();
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		app.settings.setDefaultPolicyId(id || null);
		return { ok: true };
	},

	/** PERM-10: simulasi resolusi policy tanpa menyimpan apa pun. */
	simulate: async ({ request }) => {
		const app = getApp();
		const form = await request.formData();
		const category = String(form.get('category') ?? '') as PermissionCategory;
		const projectId = String(form.get('projectId') ?? '') || null;
		if (!PERMISSION_CATEGORIES.includes(category)) {
			return fail(400, { error: 'Kategori tidak dikenal.' });
		}
		const resolution = app.permissions.simulate(category, { projectId });
		return {
			simulation: {
				category,
				label: CATEGORY_LABELS[category],
				...resolution
			}
		};
	}
};

export type PermissionDecision = Decision;
