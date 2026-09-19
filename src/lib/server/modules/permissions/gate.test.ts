import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { scratchDir } from '$test/helpers/repo.js';
import type { PermissionCategory, Decision } from './types.js';
import { PermissionDenied, PermissionGate } from './gate.js';

const scratch: string[] = [];
afterEach(() => {
	for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface Audit {
	type: string;
	payload: Record<string, unknown>;
}

function makeGate(resolve: (category: PermissionCategory) => Decision = () => 'allow') {
	const worktreePath = scratchDir('agent-o-gate-wt-');
	scratch.push(worktreePath);
	const audit: Audit[] = [];
	const gate = new PermissionGate({
		cardId: 'c1',
		runId: 'r1',
		worktreePath,
		resolve: (category) => ({
			decision: ['fs_read_external', 'fs_write_external', 'git_remote', 'network', 'terminal_destructive'].includes(
				category
			)
				? 'deny'
				: resolve(category),
			source: 'system',
			forced: false
		}),
		record: (type, payload) => audit.push({ type, payload })
	});
	return { gate, worktreePath, audit };
}

describe('PERM-02/PERM-08 — path di luar worktree selalu ditolak', () => {
	it('mengizinkan tulis di dalam worktree dan mencatat audit (PERM-05)', async () => {
		const { gate, worktreePath, audit } = makeGate();
		await gate.writeTextFile(join(worktreePath, 'catatan.txt'), 'halo');

		expect(readFileSync(join(worktreePath, 'catatan.txt'), 'utf8')).toBe('halo');
		expect(audit[0].type).toBe('permission_decision');
		expect(audit[0].payload.decision).toBe('allow');
		expect(audit[0].payload.category).toBe('fs_write_internal');
	});

	it('menolak tulis ke luar worktree dan mencatatnya sebagai event (PERM-06)', async () => {
		const { gate, worktreePath } = makeGate();

		await expect(gate.writeTextFile('/tmp/agent-o-luar.txt', 'x')).rejects.toThrow(PermissionDenied);
		await expect(gate.readTextFile(join(worktreePath, '..', 'rahasia.txt'))).rejects.toThrow(PermissionDenied);
		expect(existsSync('/tmp/agent-o-luar.txt')).toBe(false);
	});
});

describe('PERM-09 — git remote ditolak di gerbang terminal', () => {
	it('menolak git push tanpa men-spawn proses', async () => {
		const { gate } = makeGate();
		await expect(
			gate.createTerminal({ command: 'git', args: ['push', 'origin', 'main'], cwd: null, env: [], outputByteLimit: null })
		).rejects.toThrow(/git_remote/);
	});

	it('mengizinkan command aman dan menangkap outputnya', async () => {
		const { gate } = makeGate();
		const { terminalId } = await gate.createTerminal({
			command: 'echo',
			args: ['halo-dari-terminal'],
			cwd: null,
			env: [],
			outputByteLimit: null
		});

		const exit = await gate.waitForTerminalExit(terminalId);
		expect(exit.exitCode).toBe(0);
		const output = await gate.terminalOutput(terminalId);
		expect(output.output).toContain('halo-dari-terminal');
		expect(output.truncated).toBe(false);
		await gate.releaseTerminal(terminalId);
		gate.dispose();
	});
});

describe('PERM-07 — permintaan izin agent dijawab sesuai policy', () => {
	it('menjawab allow untuk aksi di dalam worktree', () => {
		const { gate, worktreePath, audit } = makeGate();
		const decision = gate.decidePermission({
			title: 'Edit file',
			kind: 'edit',
			locations: [{ path: join(worktreePath, 'src', 'a.ts') }]
		});

		expect(decision).toBe('allow');
		expect(audit.map((item) => item.type)).toEqual(['permission_request', 'permission_decision']);
	});

	it('menjawab deny bila ada lokasi di luar worktree', () => {
		const { gate } = makeGate();
		const decision = gate.decidePermission({
			title: 'Tulis konfigurasi global',
			kind: 'edit',
			locations: [{ path: '/etc/hosts' }]
		});

		expect(decision).toBe('deny');
	});
});
