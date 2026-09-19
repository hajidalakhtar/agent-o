import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { testDb } from '$test/helpers/db.js';
import { commitFile, makeRepo, scratchDir } from '$test/helpers/repo.js';
import { AgentService } from '../agents/index.js';
import type { AcpRunInput, AcpRunOutcome, AcpRunner } from '../acp/index.js';
import { BoardService } from '../board/index.js';
import { CardService } from '../cards/index.js';
import type { Card } from '../cards/types.js';
import { EventService } from '../events/index.js';
import { Orchestrator } from './orchestrator.js';
import type { Db } from '../persistence/db.js';
import { PermissionService } from '../permissions/index.js';
import { ProjectRepository } from '../projects/repository.js';
import { ProjectService } from '../projects/service.js';
import { Scheduler } from '../scheduler/index.js';
import { WorkspaceService } from '../workspace/index.js';

type Mode = 'commit-and-done' | 'done-without-change' | 'question' | 'died' | 'hang' | 'needs-auth';

class FakeAcpRunner implements AcpRunner {
	prompts: string[] = [];
	cwd: string | null = null;
	constructor(private readonly mode: Mode) {}

	async run(input: AcpRunInput): Promise<AcpRunOutcome> {
		this.prompts.push(input.prompt);
		this.cwd = input.cwd;
		input.onSession?.('session-1');
		// Mengiklankan metode auth (seperti OpenCode) bukan berarti belum login.
		input.onHandshake?.({ loadSession: true }, ['opencode-login']);

		if (this.mode === 'hang') {
			return new Promise<AcpRunOutcome>((resolve) => {
				input.signal?.addEventListener('abort', () =>
					resolve(this.outcome('cancelled'))
				);
			});
		}

		if (this.mode === 'needs-auth') {
			return {
				...this.outcome(null),
				authMethods: ['opencode-login'],
				authRequired: true,
				error: 'authentication required'
			};
		}

		input.onUpdate({
			kind: 'message',
			text: 'Mulai bekerja…',
			messageId: 'm1',
			rawKind: 'agent_message_chunk'
		});
		input.onUpdate({
			kind: 'tool_call',
			toolCallId: 't1',
			title: 'Tulis file',
			status: 'running',
			rawKind: 'tool_call'
		});
		input.onUpdate({
			kind: 'tool_call',
			toolCallId: 't1',
			title: 'Tulis file',
			status: 'completed',
			rawKind: 'tool_call_update'
		});

		if (this.mode === 'commit-and-done') {
			// Lewat gate seperti agent nyata, supaya audit permission ikut tercatat (PERM-05).
			await input.gate.writeTextFile(join(input.cwd, 'hasil.txt'), 'halo');
			commitFile(input.cwd, 'hasil.txt', 'halo', 'kerja agent');
		}
		if (this.mode === 'commit-and-done' || this.mode === 'done-without-change') {
			input.onUpdate({
				kind: 'message',
				text: '```json\n{"agent_o":"done","summary":"beres"}\n```',
				messageId: 'm1',
				rawKind: 'agent_message_chunk'
			});
			return this.outcome('end_turn');
		}
		if (this.mode === 'question') {
			input.onUpdate({
				kind: 'message',
				text: '```json\n{"agent_o":"question","question":"pakai A atau B?"}\n```',
				messageId: 'm1',
				rawKind: 'agent_message_chunk'
			});
			return this.outcome('end_turn');
		}
		return { ...this.outcome(null), processDied: true };
	}

	private outcome(stopReason: AcpRunOutcome['stopReason']): AcpRunOutcome {
		return {
			stopReason,
			sessionId: 'session-1',
			capabilities: { loadSession: true },
			authMethods: [],
			authRequired: false,
			processDied: false,
			killed: true,
			exitCode: 0
		};
	}
}

interface Fixture {
	db: Db;
	orchestrator: Orchestrator;
	cards: CardService;
	events: EventService;
	agents: AgentService;
	runner: FakeAcpRunner;
	projectId: string;
	agentId: string;
}

const scratch: string[] = [];
afterEach(() => {
	for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture(mode: Mode): Fixture {
	const repo = makeRepo();
	scratch.push(repo);
	const worktreesRoot = scratchDir('agent-o-orch-wt-');
	const logsDir = mkdtempSync(join(tmpdir(), 'agent-o-orch-log-'));
	scratch.push(worktreesRoot, logsDir);

	const db = testDb();
	const projectId = 'p1';
	new ProjectRepository(db).insert({
		id: projectId,
		name: 'Demo',
		rootPath: repo,
		defaultBranch: 'main',
		defaultAgentId: null,
		wipLimit: 3,
		permissionPolicyId: null,
		available: true,
		createdAt: Date.now()
	});

	const cards = new CardService(db);
	const events = new EventService(db);
	const board = new BoardService(cards, events);
	const agents = new AgentService(db);
	const agentId = agents.create({ name: 'Fake', command: 'fake' }).id;
	const permissions = new PermissionService(db);
	const workspace = new WorkspaceService(db, { worktreesRoot });
	const scheduler = new Scheduler({ globalLimit: () => 3, projectLimit: () => 3, agentLimit: () => null });
	const runner = new FakeAcpRunner(mode);

	const orchestrator = new Orchestrator({
		cards,
		events,
		board,
		agents,
		projects: new ProjectService(db),
		permissions,
		scheduler,
		workspace,
		runs: { acp: runner, logsDir }
	});

	return { db, orchestrator, cards, events, agents, runner, projectId, agentId };
}

async function waitFor(predicate: () => boolean, timeoutMs = 15_000): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (predicate()) return;
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	throw new Error('Timeout menunggu kondisi.');
}

/** Transisi sistem selalu mengubah status card, jadi ini bebas race. */
function waitForOutcome(f: Fixture, cardId: string): Promise<void> {
	return waitFor(() => f.cards.get(cardId)?.status !== 'in_progress');
}

function newCard(f: Fixture, title = 'Card', instruction = 'kerjakan ini'): Card {
	const card = f.cards.create(f.projectId, title, instruction);
	f.cards.update(card.id, { agentId: f.agentId });
	return f.cards.get(card.id)!;
}

describe('BOARD/WS — start-run membuat worktree, run, dan streaming ke thread', () => {
	it('menjalankan agent, mencatat event, dan mengakhiri card di in_review bila ada commit', async () => {
		const f = fixture('commit-and-done');
		const card = newCard(f);

		await f.orchestrator.transition(card, { to: 'in_progress' });
		await waitForOutcome(f, card.id);

		expect(f.cards.get(card.id)?.status).toBe('in_review');
		const types = f.events.listByCard(card.id).map((event) => event.type);
		expect(types).toContain('run_started');
		expect(types).toContain('message');
		expect(types).toContain('tool_call');
		expect(types).toContain('permission_decision');
		expect(types).toContain('completion_reported');
		expect(types).toContain('run_ended');

		const run = f.cards.listRuns(card.id)[0];
		expect(run.status).toBe('finished');
		expect(run.stopReason).toBe('end_turn');
		expect(run.sessionId).toBe('session-1');
		// AGENT-04: agent yang mengiklankan authMethods tetap dianggap sehat.
		expect(f.agents.get(f.agentId)?.health).toBe('ok');
		f.db.close();
	});

	it('mengirim instruksi card beserta briefing pelaporan (DONE-01)', async () => {
		const f = fixture('commit-and-done');
		const card = newCard(f, 'Card', 'perbaiki login');

		await f.orchestrator.transition(card, { to: 'in_progress' });
		await waitForOutcome(f, card.id);

		expect(f.runner.prompts[0]).toContain('perbaiki login');
		expect(f.runner.prompts[0]).toContain('"agent_o": "done"');
		f.db.close();
	});

	it('menjalankan agent di dalam worktree card, bukan folder project (ACP-04)', async () => {
		const f = fixture('commit-and-done');
		const card = newCard(f);

		await f.orchestrator.transition(card, { to: 'in_progress' });
		await waitForOutcome(f, card.id);

		expect(f.runner.cwd).toBeTruthy();
		expect(f.runner.cwd!.includes(card.id)).toBe(true);
		f.db.close();
	});
});

describe('DONE-04 — hasil run menentukan kolom berikutnya', () => {
	it('melapor done tanpa commit → blocked', async () => {
		const f = fixture('done-without-change');
		const card = newCard(f);

		await f.orchestrator.transition(card, { to: 'in_progress' });
		await waitForOutcome(f, card.id);

		expect(f.cards.get(card.id)?.status).toBe('blocked');
		const moved = f.events.listByCard(card.id).filter((event) => event.type === 'moved').at(-1);
		expect(moved?.payload.reason).toContain('tidak ada perubahan');
		f.db.close();
	});

	it('agent bertanya → blocked dan pertanyaannya tercatat', async () => {
		const f = fixture('question');
		const card = newCard(f);

		await f.orchestrator.transition(card, { to: 'in_progress' });
		await waitForOutcome(f, card.id);

		expect(f.cards.get(card.id)?.status).toBe('blocked');
		const completion = f.events.listByCard(card.id).find((event) => event.type === 'completion_reported');
		expect(completion?.payload.question).toBe('pakai A atau B?');
		f.db.close();
	});

	it('proses mati tanpa stopReason → run interrupted, card blocked', async () => {
		const f = fixture('died');
		const card = newCard(f);

		await f.orchestrator.transition(card, { to: 'in_progress' });
		await waitForOutcome(f, card.id);

		expect(f.cards.get(card.id)?.status).toBe('blocked');
		expect(f.cards.listRuns(card.id)[0].status).toBe('interrupted');
		f.db.close();
	});

	it('agent menuntut autentikasi → blocked dengan pesan jelas (AGENT-04)', async () => {
		const f = fixture('needs-auth');
		const card = newCard(f);

		await f.orchestrator.transition(card, { to: 'in_progress' });
		await waitForOutcome(f, card.id);

		expect(f.cards.get(card.id)?.status).toBe('blocked');
		const moved = f.events.listByCard(card.id).filter((event) => event.type === 'moved').at(-1);
		expect(moved?.payload.reason).toContain('butuh autentikasi');
		expect(f.agents.get(f.agentId)?.health).toBe('needs_auth');
		f.db.close();
	});
});

describe('NFR-08/NFR-20 — menghentikan run dan tidak menggantung', () => {
	it('transisi ke blocked membatalkan run dan melepas slot', async () => {
		const f = fixture('hang');
		const card = newCard(f);

		await f.orchestrator.transition(card, { to: 'in_progress' });
		await waitFor(() => f.orchestrator.runs.isRunning(card.id));

		await f.orchestrator.transition(f.cards.get(card.id)!, { to: 'blocked' });
		await waitFor(() => f.cards.listRuns(card.id)[0]?.status === 'cancelled');

		expect(f.cards.get(card.id)?.status).toBe('blocked');
		expect(f.cards.listRuns(card.id)[0].status).toBe('cancelled');
		f.db.close();
	});

	it('menghapus card berjalan tidak meninggalkan run aktif', async () => {
		const f = fixture('hang');
		const card = newCard(f);

		await f.orchestrator.transition(card, { to: 'in_progress' });
		await waitFor(() => f.orchestrator.runs.isRunning(card.id));

		await f.orchestrator.transition(f.cards.get(card.id)!, { to: 'deleted', confirmed: true });
		await waitFor(() => !f.orchestrator.runs.isRunning(card.id));

		expect(f.cards.get(card.id)).toBeUndefined();
		f.db.close();
	});
});
