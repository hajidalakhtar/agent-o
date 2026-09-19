import { beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '$test/helpers/db.js';
import type { Db } from '../persistence/db.js';
import { AgentError, AgentService } from './service.js';

describe('AGENT-01 — registrasi agent', () => {
	let db: Db;
	let agents: AgentService;

	beforeEach(() => {
		db = testDb();
		agents = new AgentService(db);
	});

	it('mendaftarkan agent dengan command dan argumen sendiri', () => {
		const agent = agents.create({
			name: 'Gemini CLI',
			command: 'gemini',
			args: ['--experimental-acp'],
			maxConcurrency: 2
		});
		expect(agent.command).toBe('gemini');
		expect(agent.args).toEqual(['--experimental-acp']);
		expect(agent.maxConcurrency).toBe(2);
		expect(agent.health).toBe('ok');
		expect(agent.enabled).toBe(true);
		expect(agent.capabilities).toBeNull();
	});

	it('menolak nama duplikat dan command kosong', () => {
		agents.create({ name: 'A', command: 'a' });
		expect(() => agents.create({ name: 'A', command: 'a' })).toThrow(AgentError);
		expect(() => agents.create({ name: 'B', command: '   ' })).toThrow(AgentError);
	});
});

describe('AGENT-05 — aktif/nonaktif tanpa menghapus riwayat', () => {
	it('menonaktifkan agent lalu menolak menghapusnya bila sudah dipakai run', () => {
		const db = testDb();
		const agents = new AgentService(db);
		const agent = agents.create({ name: 'A', command: 'a' });

		db.run(
			`INSERT INTO project (id, name, root_path, default_branch, wip_limit, available, created_at)
			 VALUES ('p', 'p', '/tmp/p', 'main', 3, 1, 1)`
		);
		db.run(
			`INSERT INTO card (id, project_id, title, instruction, status, position, created_at, updated_at)
			 VALUES ('c', 'p', 't', 'i', 'backlog', 0, 1, 1)`
		);
		db.run(
			`INSERT INTO run (id, card_id, attempt_no, kind, agent_id, status) VALUES ('r', 'c', 1, 'task', ?, 'finished')`,
			[agent.id]
		);

		const disabled = agents.setEnabled(agent.id, false);
		expect(disabled.enabled).toBe(false);
		expect(disabled.health).toBe('disabled');
		expect(() => agents.remove(agent.id)).toThrow(AgentError);
		db.close();
	});

	it('boleh menghapus agent yang belum pernah dipakai', () => {
		const db = testDb();
		const agents = new AgentService(db);
		const agent = agents.create({ name: 'B', command: 'b' });
		agents.remove(agent.id);
		expect(agents.get(agent.id)).toBeUndefined();
		db.close();
	});
});

describe('AGENT-03/AGENT-04 — kelayakan agent', () => {
	it('menolak agent yang dinonaktifkan atau needs_auth', () => {
		const db = testDb();
		const agents = new AgentService(db);

		const auth = agents.create({ name: 'Auth', command: 'x' });
		agents.recordHandshake(auth.id, { capabilities: { loadSession: true }, authMethod: 'oauth', health: 'needs_auth' });
		expect(agents.usable(auth.id).usable).toBe(false);
		expect(agents.usable(auth.id).reason).toContain('autentikasi');

		const off = agents.create({ name: 'Off', command: 'y' });
		agents.setEnabled(off.id, false);
		expect(agents.usable(off.id).usable).toBe(false);

		const ok = agents.create({ name: 'Ok', command: 'z' });
		expect(agents.usable(ok.id).usable).toBe(true);
		db.close();
	});

	it('menyimpan hasil handshake sebagai capability map (AGENT-02)', () => {
		const db = testDb();
		const agents = new AgentService(db);
		const agent = agents.create({ name: 'C', command: 'c' });
		const updated = agents.recordHandshake(agent.id, {
			capabilities: { loadSession: false, promptCapabilities: { image: false } },
			authMethod: null,
			health: 'ok'
		});
		expect(updated.capabilities?.loadSession).toBe(false);
		expect(updated.lastCheckedAt).not.toBeNull();
		db.close();
	});

	it('mengekspos batas konkurensi untuk scheduler (AGENT-06)', () => {
		const db = testDb();
		const agents = new AgentService(db);
		const agent = agents.create({ name: 'D', command: 'd', maxConcurrency: 3 });
		expect(agents.limitFor(agent.id)).toBe(3);
		expect(agents.limitFor(null)).toBeNull();
		db.close();
	});
});
