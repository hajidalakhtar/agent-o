import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, scratchDir } from '$test/helpers/repo.js';
import { SpawnAcpRunner, DEFAULT_ACP_TIMEOUTS } from './client.js';
import { normalizeUpdate } from './normalize.js';
import type { AcpGate, AcpUpdate, TerminalCreateSpec, TerminalExit, TerminalOutput } from './types.js';

const HARNESS = join(process.cwd(), 'scripts/spike/harness-simple.mjs');

/** Gate palsu: mencatat akses dan meloloskan semuanya (permission diuji di modul permissions). */
class FakeGate implements AcpGate {
	reads: string[] = [];
	writes: { path: string; content: string }[] = [];

	async readTextFile(path: string) {
		this.reads.push(path);
		if (!existsSync(path)) throw new Error(`ENOENT: ${path}`);
		return { content: readFileSync(path, 'utf8') };
	}

	async writeTextFile(path: string, content: string) {
		this.writes.push({ path, content });
		writeFileSync(path, content);
	}

	async createTerminal(_spec: TerminalCreateSpec): Promise<{ terminalId: string }> {
		throw new Error('terminal tidak dipakai harness ini');
	}
	async terminalOutput(_terminalId: string): Promise<TerminalOutput> {
		throw new Error('terminal tidak dipakai harness ini');
	}
	async waitForTerminalExit(_terminalId: string): Promise<TerminalExit> {
		throw new Error('terminal tidak dipakai harness ini');
	}
	async killTerminal() {}
	async releaseTerminal() {}
	decidePermission(): 'allow' | 'deny' {
		return 'allow';
	}
}

const created: string[] = [];
afterEach(() => cleanup(...created.splice(0)));

function track(dir: string): string {
	created.push(dir);
	return dir;
}

describe('ACP-02 — normalisasi session/update', () => {
	it('mengubah chunk pesan menjadi update teks', () => {
		const update = normalizeUpdate({
			sessionUpdate: 'agent_message_chunk',
			messageId: 'm1',
			content: { type: 'text', text: 'halo' }
		});
		expect(update).toMatchObject({ kind: 'message', text: 'halo', messageId: 'm1' });
	});

	it('memisahkan thought dari message', () => {
		const update = normalizeUpdate({
			sessionUpdate: 'agent_thought_chunk',
			content: { type: 'text', text: 'berpikir' }
		});
		expect(update?.kind).toBe('thought');
	});

	it('meneruskan tool call dan plan', () => {
		expect(
			normalizeUpdate({ sessionUpdate: 'tool_call', toolCallId: 't1', title: 'Baca file', status: 'pending' })
		).toMatchObject({ kind: 'tool_call', toolCallId: 't1', title: 'Baca file' });
		expect(
			normalizeUpdate({ sessionUpdate: 'plan', entries: [{ content: 'langkah 1', status: 'pending' }] })?.entries
		).toEqual([{ content: 'langkah 1', priority: undefined, status: 'pending' }]);
	});

	it('menandai update tak dikenal sebagai other tanpa membuang jenisnya', () => {
		expect(normalizeUpdate({ sessionUpdate: 'usage_update' })).toEqual({
			kind: 'other',
			rawKind: 'usage_update'
		});
	});

	it('mengabaikan chunk non-teks', () => {
		expect(normalizeUpdate({ sessionUpdate: 'agent_message_chunk', content: { type: 'image' } })).toBeNull();
	});
});

describe('ACP-01/ACP-03/ACP-04/ACP-05 — run nyata lewat stdio', () => {
	it('handshake, buka sesi di cwd, streaming update, dan fs lewat gate', async () => {
		const cwd = track(scratchDir('agent-o-acp-wt-'));
		const logPath = join(cwd, 'run.log');
		const gate = new FakeGate();
		const updates: AcpUpdate[] = [];
		const handshakes: { capabilities: Record<string, unknown> | null; authMethods: string[] }[] = [];
		const sessions: string[] = [];

		const runner = new SpawnAcpRunner({ ...DEFAULT_ACP_TIMEOUTS, deadAirMs: 20_000 });
		const outcome = await runner.run({
			agent: { command: process.execPath, args: [HARNESS], env: {} },
			cwd,
			prompt: 'Kerjakan tugas contoh ini.',
			gate,
			logPath,
			onUpdate: (update) => updates.push(update),
			onHandshake: (capabilities, authMethods) => handshakes.push({ capabilities, authMethods }),
			onSession: (sessionId) => sessions.push(sessionId)
		});

		expect(outcome.stopReason).toBe('end_turn');
		expect(outcome.processDied).toBe(false);
		expect(outcome.error).toBeUndefined();
		expect(sessions).toHaveLength(1);
		expect(handshakes[0].capabilities?.loadSession).toBe(true);

		const text = updates
			.filter((update) => update.kind === 'message')
			.map((update) => update.text)
			.join('');
		expect(text).toContain('Dibaca kembali');
		expect(text).toContain('"agent_o":"done"');

		// ACP-04/ACP-05: agent memakai fs milik client, di dalam worktree.
		expect(gate.writes).toHaveLength(1);
		expect(gate.writes[0].path.startsWith(cwd)).toBe(true);
		expect(gate.reads[0].startsWith(cwd)).toBe(true);
		expect(existsSync(join(cwd, 'dari-harness-b.txt'))).toBe(true);
	});

	it('menyimpan log mentah per run (ACP-09)', async () => {
		const cwd = track(scratchDir('agent-o-acp-wt-'));
		const logPath = join(cwd, 'logs', 'run.log');

		await new SpawnAcpRunner({ ...DEFAULT_ACP_TIMEOUTS, deadAirMs: 20_000 }).run({
			agent: { command: process.execPath, args: [HARNESS], env: {} },
			cwd,
			prompt: 'halo',
			gate: new FakeGate(),
			logPath,
			onUpdate: () => {}
		});

		expect(existsSync(logPath)).toBe(true);
		expect(readFileSync(logPath, 'utf8')).toContain('run end');
	});

	it('melaporkan command yang tidak ada di PATH sebagai kegagalan', async () => {
		const cwd = track(scratchDir('agent-o-acp-wt-'));
		const outcome = await new SpawnAcpRunner(DEFAULT_ACP_TIMEOUTS).run({
			agent: { command: 'agent-o-tidak-ada-xyz', args: [], env: {} },
			cwd,
			prompt: 'halo',
			gate: new FakeGate(),
			logPath: join(cwd, 'run.log'),
			onUpdate: () => {}
		});

		expect(outcome.stopReason).toBeNull();
		expect(outcome.error).toContain('tidak ditemukan');
		expect(outcome.processDied).toBe(false);
	});

	it('mematikan proses setelah turn selesai (NFR-08)', async () => {
		const cwd = track(scratchDir('agent-o-acp-wt-'));
		const outcome = await new SpawnAcpRunner({ ...DEFAULT_ACP_TIMEOUTS, deadAirMs: 20_000 }).run({
			agent: { command: process.execPath, args: [HARNESS], env: {} },
			cwd,
			prompt: 'halo',
			gate: new FakeGate(),
			logPath: join(cwd, 'run.log'),
			onUpdate: () => {}
		});

		expect(outcome.killed).toBe(true);
	});
});
