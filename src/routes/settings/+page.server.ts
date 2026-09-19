import { appDataDir, dbPath, logsDir, worktreesDir } from '$lib/server/config.js';
import { getApp } from '$lib/server/containers.js';
import { migrations } from '$lib/server/modules/persistence/index.js';
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
	const app = getApp();
	const applied =
		app.db.get<{ count: number }>('SELECT COUNT(*) AS count FROM _migration')?.count ?? 0;

	return {
		settings: {
			globalWipLimit: app.settings.globalWipLimit(),
			logRetentionDays: app.settings.logRetentionDays(),
			defaultPolicyId: app.settings.defaultPolicyId()
		},
		paths: {
			dataDir: appDataDir(),
			dbPath: dbPath(),
			logsDir: logsDir(),
			worktreesDir: worktreesDir(),
			lockPath: app.lock.path
		},
		runtime: {
			nodeVersion: process.version,
			pid: process.pid,
			platform: `${process.platform}/${process.arch}`,
			migrationsApplied: applied,
			migrationsTotal: migrations.length
		}
	};
};

export const actions: Actions = {
	save: async ({ request }) => {
		const app = getApp();
		const form = await request.formData();
		const wip = Number.parseInt(String(form.get('globalWipLimit') ?? ''), 10);
		const retention = Number.parseInt(String(form.get('logRetentionDays') ?? ''), 10);
		try {
			if (Number.isFinite(wip)) app.settings.setGlobalWipLimit(wip);
			if (Number.isFinite(retention)) app.settings.setLogRetentionDays(retention);
			return { saved: true };
		} catch (cause) {
			return fail(400, { error: (cause as Error).message });
		}
	}
};
