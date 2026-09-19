import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Db } from './db.js';
import { acquireLock, LockError } from './lock.js';
import { migrate } from './migrate.js';

describe('PERSIST-01/PERSIST-03 — skema dan migrasi', () => {
	it('menerapkan seluruh migrasi saat start dan idempoten (NFR-27)', () => {
		const db = new Db(':memory:');
		const first = migrate(db);
		expect(first).toBeGreaterThan(0);
		expect(migrate(db)).toBe(0);

		const tables = db
			.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'")
			.map((row) => row.name);
		for (const expected of [
			'project',
			'card',
			'run',
			'worktree',
			'card_event',
			'message',
			'permission_policy',
			'agent_registration',
			'settings'
		]) {
			expect(tables).toContain(expected);
		}
		db.close();
	});

	it('event tersimpan append-only — menulis dua kali menambah baris, bukan menimpa (NFR-11)', () => {
		const db = new Db(':memory:');
		migrate(db);
		db.run(
			`INSERT INTO project (id, name, root_path, default_branch, wip_limit, available, created_at)
			 VALUES ('p', 'p', '/tmp/p', 'main', 3, 1, 1)`
		);
		db.run(
			`INSERT INTO card (id, project_id, title, instruction, status, position, created_at, updated_at)
			 VALUES ('c', 'p', 't', 'i', 'backlog', 0, 1, 1)`
		);
		const insert = (id: string, createdAt: number) =>
			db.run(
				`INSERT INTO card_event (id, card_id, run_id, type, payload, created_at)
				 VALUES (?, 'c', NULL, 'moved', '{}', ?)`,
				[id, createdAt]
			);
		insert('e1', 1);
		insert('e2', 2);
		expect(db.get<{ count: number }>('SELECT COUNT(*) AS count FROM card_event')?.count).toBe(2);
		db.close();
	});
});

describe('PERSIST-09 — file lock satu instance', () => {
	it('menolak start bila ada instance lain yang hidup', () => {
		const dir = mkdtempSync(join(tmpdir(), 'agent-o-lock-'));
		const path = join(dir, 'agent-o.lock');
		try {
			acquireLock(path);
			// pid 1 selalu hidup di Linux; mensimulasikan instance lain.
			writeFileSync(path, '1', 'utf8');
			expect(() => acquireLock(path)).toThrow(LockError);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('mengambil alih lock basi bila PID pemiliknya sudah mati', () => {
		const dir = mkdtempSync(join(tmpdir(), 'agent-o-lock-'));
		const path = join(dir, 'agent-o.lock');
		try {
			writeFileSync(path, '999999', 'utf8');
			const lock = acquireLock(path);
			expect(lock.pid).toBe(process.pid);
			lock.release();
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
