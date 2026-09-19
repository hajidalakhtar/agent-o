import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type App } from '$lib/server/containers.js';
import { makeRepo } from './helpers/repo.js';

const HARNESS = join(process.cwd(), 'scripts/spike/harness-simple.mjs');
const scratch: string[] = [];
const apps: App[] = [];

afterEach(() => {
	for (const app of apps.splice(0)) {
		app.lock.release();
		app.db.close();
	}
	for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tmp(prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), prefix));
	scratch.push(dir);
	return dir;
}

async function waitFor(predicate: () => boolean, timeoutMs = 25_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error('Timeout menunggu run selesai.');
}

/**
 * Fase 2 end-to-end: transisi card → worktree → spawn harness ACP nyata →
 * streaming update ke thread → keputusan selesai → transisi sistem.
 */
describe('Walking skeleton lewat buildApp dengan harness ACP nyata', () => {
	it('menjalankan agent, mengisi thread, dan memutuskan hasil akhir', async () => {
		const appDir = tmp('agent-o-e2e-app-');
		const repo = makeRepo();

		const app = buildApp({
			dbPath: join(appDir, 'agent-o.db'),
			lockPath: join(appDir, 'agent-o.lock'),
			worktreesRoot: join(appDir, 'worktrees'),
			logsDir: join(appDir, 'logs')
		});
		apps.push(app);

		const agent = app.agents.create({ name: 'Spike Harness', command: process.execPath, args: [HARNESS] });
		// `git rev-parse --show-toplevel` mengembalikan path real, jadi symlink /var dinormalkan dulu.
		const project = await app.projects.add(realpathSync(repo), { defaultAgentId: agent.id });
		const card = app.cards.create(project.id, 'Tulis file contoh', 'Tulis dari-harness-b.txt lalu laporkan.');
		app.events.record({ cardId: card.id, type: 'card_created', payload: { title: card.title } });

		await app.orchestrator.transition(app.cards.get(card.id)!, { to: 'in_progress' });
		await waitFor(() => app.cards.get(card.id)?.status !== 'in_progress');

		// Harness menulis file lewat fs milik client, di dalam worktree (ACP-04/ACP-05).
		const worktree = app.workspace.findByCard(card.id)!;
		expect(existsSync(join(worktree.path, 'dari-harness-b.txt'))).toBe(true);
		expect(worktree.path.startsWith(repo)).toBe(false);

		// Thread terisi: pesan user, pesan agent streaming, dan keputusan selesai (CARD-02).
		const events = app.events.listByCard(card.id);
		const agentText = events
			.filter((event) => event.type === 'message')
			.map((event) => String(event.payload.text ?? ''))
			.join('');
		expect(agentText).toContain('Menulis file lewat fs milik client');
		expect(agentText).toContain('"agent_o":"done"');

		// Harness tidak membuat commit, jadi card harus berhenti di blocked (DONE-04).
		expect(app.cards.get(card.id)?.status).toBe('blocked');
		const run = app.cards.listRuns(card.id)[0];
		expect(run.status).toBe('finished');
		expect(run.stopReason).toBe('end_turn');
		expect(run.sessionId).toBeTruthy();

		// Audit permission tersimpan dan log mentah per run dibuat (PERM-05, ACP-09).
		expect(events.some((event) => event.type === 'permission_decision')).toBe(true);
		expect(readdirSync(join(appDir, 'logs')).length).toBeGreaterThan(0);
	});
});
