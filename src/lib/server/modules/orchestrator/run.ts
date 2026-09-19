import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { buildThread } from '$lib/shared/thread.js';
import type { AcpRunner, AcpRunOutcome, AcpUpdate } from '../acp/index.js';
import type { AgentService } from '../agents/index.js';
import type { CardService } from '../cards/index.js';
import type { Card, CardStatus, Run, RunKind } from '../cards/types.js';
import { BRIEFING, decideCompletion, parseStatusBlock, resumeBriefing } from '../completion/index.js';
import type { CardEventType, EventService } from '../events/index.js';
import { PermissionGate, type PermissionService } from '../permissions/index.js';
import type { ProjectService } from '../projects/index.js';
import type { WorkspaceService, Worktree } from '../workspace/index.js';

export interface RunDeps {
	cards: CardService;
	events: EventService;
	agents: AgentService;
	projects: ProjectService;
	permissions: PermissionService;
	workspace: WorkspaceService;
	acp: AcpRunner;
	/** Direktori log mentah per run (ACP-09). */
	logsDir: string;
	/** Transisi yang dipicu sistem (agent melapor selesai/gagal), bukan user. */
	systemTransition(cardId: string, to: CardStatus | 'deleted', reason: string): Promise<void>;
}

interface ActiveRun {
	card: Card;
	runId: string;
	agentId: string;
	worktree: Worktree;
	controller: AbortController;
	gate: PermissionGate;
	/** Run dibatalkan user/ sistem; hasilnya diabaikan. */
	cancelled: boolean;
}

/**
 * Mengelola siklus hidup satu run: worktree → baris run → sesi ACP → streaming
 * update ke CardEvent → keputusan selesai → transisi sistem. Satu card hanya
 * boleh punya satu run aktif (BOARD-03, NFR-05).
 */
export class RunCoordinator {
	private readonly active = new Map<string, ActiveRun>();

	constructor(private readonly deps: RunDeps) {}

	isRunning(cardId: string): boolean {
		return this.active.has(cardId);
	}

	count(): number {
		return this.active.size;
	}

	/** Dipanggil orchestrator setelah transisi ke `in_progress` berhasil (NFR-04: tidak blocking). */
	async start(card: Card, action: string): Promise<void> {
		if (this.active.has(card.id)) return;

		const kind: RunKind = action === 'resume-run' ? 'answer' : 'task';
		const project = this.deps.projects.require(card.projectId);
		const agentId = card.agentId ?? project.defaultAgentId;
		const agent = agentId ? this.deps.agents.get(agentId) : undefined;
		if (!agent) return this.fail(card, 'Agent tidak ditemukan atau tidak ditentukan.');
		const usability = this.deps.agents.usable(agent.id);
		if (!usability.usable) return this.fail(card, usability.reason ?? 'Agent tidak bisa dipakai.');

		let worktree: Worktree;
		try {
			worktree = this.deps.workspace.findByCard(card.id) ?? (await this.deps.workspace.create(card, project));
		} catch (error) {
			return this.fail(card, `Gagal menyiapkan worktree: ${(error as Error).message}`);
		}

		const run: Run = {
			id: randomUUID(),
			cardId: card.id,
			attemptNo: this.deps.cards.nextAttemptNo(card.id),
			kind,
			agentId: agent.id,
			sessionId: null,
			worktreeId: worktree.id,
			status: 'running',
			stopReason: null,
			reason: null,
			startedAt: Date.now(),
			endedAt: null
		};
		this.deps.cards.createRun(run);
		this.record(card.id, run.id, 'run_started', {
			attemptNo: run.attemptNo,
			agentId: agent.id,
			agentName: agent.name,
			kind
		});
		if (kind === 'task') {
			this.deps.cards.addMessage(card.id, 'user', card.instruction, run.id);
		}

		const controller = new AbortController();
		const active: ActiveRun = {
			card,
			runId: run.id,
			agentId: agent.id,
			worktree,
			controller,
			gate: new PermissionGate({
				cardId: card.id,
				runId: run.id,
				worktreePath: worktree.path,
				resolve: (category) =>
					this.deps.permissions.simulate(category, { cardId: card.id, projectId: card.projectId }),
				record: (type, payload) => this.record(card.id, run.id, type as CardEventType, payload)
			}),
			cancelled: false
		};
		this.active.set(card.id, active);

		let agentText = '';
		const onSession = (sessionId: string) => {
			this.deps.cards.updateRun(run.id, { sessionId });
		};
		const onHandshake = (capabilities: Record<string, unknown> | null, authMethods: string[]) => {
			this.deps.agents.recordHandshake(agent.id, {
				capabilities,
				authMethod: authMethods[0] ?? null,
				health: 'ok'
			});
		};

		try {
			const prompt = await this.buildPrompt(card, kind);
			const outcome = await this.deps.acp.run({
				agent: { command: agent.command, args: agent.args, env: agent.env },
				cwd: worktree.path,
				prompt,
				gate: active.gate,
				logPath: join(this.deps.logsDir, `${card.id}-${run.id}.log`),
				signal: controller.signal,
				onSession,
				onHandshake,
				onUpdate: (update) => {
					if (active.cancelled) return;
					agentText += this.recordUpdate(active, update);
				}
			});

			await this.finish(active, outcome, agentText);
		} catch (error) {
			await this.finish(
				active,
				{
					stopReason: null,
					sessionId: null,
					capabilities: null,
					authMethods: [],
					authRequired: false,
					error: `Run gagal: ${(error as Error).message}`,
					processDied: false,
					killed: false,
					exitCode: null
				},
				agentText
			);
		} finally {
			active.gate.dispose?.();
			this.active.delete(card.id);
		}
	}

	/** Membatalkan run aktif: `session/cancel` lalu grace period (ACP-08). */
	stop(cardId: string, _reason: string): void {
		const active = this.active.get(cardId);
		if (!active) return;
		active.cancelled = true;
		active.controller.abort();
	}

	async shutdown(): Promise<void> {
		for (const active of this.active.values()) {
			active.cancelled = true;
			active.controller.abort();
		}
	}

	private record(cardId: string, runId: string | null, type: CardEventType, payload: Record<string, unknown>): void {
		try {
			this.deps.events.record({ cardId, runId, type, payload });
		} catch {
			// Card mungkin sudah dihapus (cascade); mencatat event tidak boleh merusak run.
		}
	}

	/** ACP-02/CARD-02: setiap update agent menjadi CardEvent sehingga thread bisa dirender ulang. */
	private recordUpdate(active: ActiveRun, update: AcpUpdate): string {
		const { card, runId } = active;
		switch (update.kind) {
			case 'message':
				this.record(card.id, runId, 'message', {
					role: 'agent',
					text: update.text ?? '',
					messageId: update.messageId ?? null
				});
				return update.text ?? '';
			case 'thought':
				this.record(card.id, runId, 'thought', {
					text: update.text ?? '',
					messageId: update.messageId ?? null
				});
				return '';
			case 'tool_call':
				this.record(card.id, runId, 'tool_call', {
					toolCallId: update.toolCallId ?? null,
					title: update.title ?? 'Tool call',
					status: update.status ?? 'pending'
				});
				return '';
			case 'tool_call_update':
				this.record(card.id, runId, 'tool_call_update', {
					toolCallId: update.toolCallId ?? null,
					title: update.title ?? 'Tool call',
					status: update.status ?? 'pending'
				});
				return '';
			case 'plan':
				this.record(card.id, runId, 'plan', { entries: update.entries ?? [] });
				return '';
			default:
				return '';
		}
	}

	private async buildPrompt(card: Card, kind: RunKind): Promise<string> {
		if (kind === 'answer') {
			return resumeBriefing(this.threadSummary(card.id));
		}
		return `${card.instruction}\n\n---\n\n${BRIEFING}`;
	}

	/** Ringkasan konteks untuk run lanjutan saat agent tidak mendukung `session/load`. */
	private threadSummary(cardId: string): string {
		const items = buildThread(this.deps.cards.listMessages(cardId), this.deps.events.listByCard(cardId));
		const tail = items
			.filter((item) => item.kind === 'message' || item.kind === 'completion')
			.slice(-8)
			.map((item) => {
				if (item.kind === 'message') return `${item.role}: ${item.content}`;
				if (item.kind === 'completion') return `hasil: ${item.reason}`;
				return '';
			})
			.filter((line) => line.length > 0);
		return tail.join('\n') || '(belum ada percakapan sebelumnya)';
	}

	/** DONE-04/DONE-08: menentukan hasil akhir dan memicu transisi sistem. */
	private async finish(active: ActiveRun, outcome: AcpRunOutcome, agentText: string): Promise<void> {
		const { card, runId, worktree } = active;
		const current = this.deps.cards.get(card.id);
		if (!current || active.cancelled || current.status !== 'in_progress') {
			this.deps.cards.updateRun(runId, {
				status: 'cancelled',
				stopReason: outcome.stopReason,
				reason: 'Dibatalkan',
				endedAt: Date.now()
			});
			return;
		}

		const commits = await this.commitCount(worktree);

		if (outcome.authRequired) {
			this.deps.agents.recordHandshake(active.agentId, {
				capabilities: outcome.capabilities,
				authMethod: outcome.authMethods[0] ?? null,
				health: 'needs_auth'
			});
			this.deps.cards.updateRun(runId, {
				status: 'failed',
				stopReason: outcome.stopReason,
				reason: 'Agent butuh autentikasi.',
				endedAt: Date.now()
			});
			this.record(card.id, runId, 'run_ended', { status: 'failed' });
			await this.deps.systemTransition(
				card.id,
				'blocked',
				'Agent butuh autentikasi. Login dulu lewat harness-nya, lalu lanjutkan card ini.'
			);
			return;
		}

		if (outcome.error && outcome.stopReason === null) {
			this.deps.cards.updateRun(runId, {
				status: 'failed',
				stopReason: outcome.stopReason,
				reason: outcome.error,
				endedAt: Date.now()
			});
			this.record(card.id, runId, 'run_ended', { status: 'failed', reason: outcome.error });
			await this.deps.systemTransition(card.id, 'blocked', outcome.error);
			return;
		}

		if (outcome.processDied) {
			this.deps.cards.updateRun(runId, {
				status: 'interrupted',
				stopReason: null,
				reason: 'Proses agent berhenti tanpa stopReason.',
				endedAt: Date.now()
			});
			this.record(card.id, runId, 'run_ended', { status: 'interrupted' });
			await this.deps.systemTransition(card.id, 'blocked', 'Run interrupted: proses agent berhenti tanpa hasil.');
			return;
		}

		const parsed = parseStatusBlock(agentText);
		if (parsed.error) {
			this.record(card.id, runId, 'message', { role: 'system', text: `Blok status tidak terbaca: ${parsed.error}` });
		}
		const decision = decideCompletion({
			report: parsed.report,
			stopReason: outcome.stopReason,
			commits,
			processDied: false
		});

		if (parsed.report) {
			this.record(card.id, runId, 'completion_reported', {
				kind: parsed.report.kind,
				summary: parsed.report.summary ?? null,
				question: parsed.report.question ?? null,
				reason: parsed.report.reason ?? null
			});
		} else {
			this.record(card.id, runId, 'completion_inferred', {
				status: decision.status,
				reason: decision.reason,
				verified: false
			});
		}

		this.deps.cards.updateRun(runId, {
			status: 'finished',
			stopReason: outcome.stopReason,
			reason: decision.reason,
			endedAt: Date.now()
		});
		this.record(card.id, runId, 'run_ended', { status: 'finished', stopReason: outcome.stopReason });

		await this.deps.systemTransition(card.id, decision.status, decision.reason);
	}

	private async commitCount(worktree: Worktree): Promise<number> {
		try {
			return await this.deps.workspace.commitCount(worktree);
		} catch {
			return 0;
		}
	}

	private async fail(card: Card, reason: string): Promise<void> {
		this.record(card.id, null, 'run_ended', { status: 'failed', reason });
		await this.deps.systemTransition(card.id, 'blocked', reason);
	}
}
