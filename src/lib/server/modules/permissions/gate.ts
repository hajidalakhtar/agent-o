import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import type {
	AcpGate,
	PermissionProbe,
	TerminalCreateSpec,
	TerminalExit,
	TerminalOutput
} from '../acp/index.js';
import { classifyCommand, classifyPath, classifyWritePath } from './resolver.js';
import type { Decision, PermissionCategory } from './types.js';

const DEFAULT_OUTPUT_LIMIT = 1024 * 1024;
const TERMINAL_KILL_GRACE_MS = 2000;

export interface GateContext {
	cardId: string;
	runId: string;
	/** Direktori kerja sesi; semua operasi di luarnya ditolak (PERM-02, PERM-08). */
	worktreePath: string;
	/** Resolusi policy card → project → global → default sistem (PERM-03). */
	resolve(category: PermissionCategory): { decision: Decision; source: string; forced: boolean };
	/** Audit: setiap operasi filesystem/terminal dicatat (PERM-05, PERM-06). */
	record(type: string, payload: Record<string, unknown>): void;
}

export class PermissionDenied extends Error {
	readonly category: PermissionCategory;
	constructor(category: PermissionCategory, target: string, source: string) {
		super(`Operasi ${category} ditolak (policy: ${source}): ${target}`);
		this.name = 'PermissionDenied';
		this.category = category;
	}
}

interface TerminalSession {
	child: ChildProcess;
	output: string;
	truncated: boolean;
	limit: number;
	exit: TerminalExit | null;
	waiters: (() => void)[];
}

/**
 * Implementasi `AcpGate`: mengklasifikasi setiap permintaan agent, memutuskan
 * lewat policy, mencatat audit, lalu mengeksekusi hanya bila diizinkan.
 * Terminasi process tree dipakai agar anak proses tidak tertinggal.
 */
export class PermissionGate implements AcpGate {
	private readonly terminals = new Map<string, TerminalSession>();
	private counter = 0;

	constructor(private readonly context: GateContext) {}

	private check(category: PermissionCategory, target: string): void {
		const resolution = this.context.resolve(category);
		const decision: Decision = resolution.forced ? 'deny' : resolution.decision;
		this.context.record('permission_decision', {
			decision,
			category,
			target,
			source: resolution.source,
			forced: resolution.forced ?? false
		});
		if (decision === 'allow') return;
		// `ask` belum punya jalur jawaban interaktif di Fase 2 (PERM-07 penuh di Fase 6),
		// jadi diperlakukan konservatif: ditolak dan terlihat di thread.
		throw new PermissionDenied(category, target, resolution.source);
	}

	async readTextFile(path: string): Promise<{ content: string }> {
		const category = classifyPath(path, this.context.worktreePath);
		this.check(category, path);
		return { content: readFileSync(path, 'utf8') };
	}

	async writeTextFile(path: string, content: string): Promise<void> {
		const category = classifyWritePath(path, this.context.worktreePath);
		this.check(category, path);
		writeFileSync(path, content);
	}

	decidePermission(probe: PermissionProbe): 'allow' | 'deny' {
		const category = this.classifyProbe(probe);
		const resolution = this.context.resolve(category);
		const decision: Decision = resolution.forced ? 'deny' : resolution.decision;
		this.context.record('permission_request', {
			title: probe.title,
			category,
			kind: probe.kind ?? null,
			target: probe.locations?.[0]?.path ?? null
		});
		this.context.record('permission_decision', {
			decision,
			category,
			target: probe.title,
			source: resolution.source
		});
		return decision === 'allow' ? 'allow' : 'deny';
	}

	/** Klasifikasi permintaan izin agent: lokasi yang keluar worktree menang (PERM-08). */
	private classifyProbe(probe: PermissionProbe): PermissionCategory {
		if (probe.locations?.length) {
			for (const location of probe.locations) {
				const category = classifyWritePath(location.path, this.context.worktreePath);
				if (category === 'fs_write_external') return category;
			}
		}
		switch (probe.kind) {
			case 'read':
				return 'fs_read_internal';
			case 'edit':
			case 'write':
				return 'fs_write_internal';
			case 'execute':
				return 'terminal_internal';
			default:
				return 'fs_write_internal';
		}
	}

	async createTerminal(spec: TerminalCreateSpec): Promise<{ terminalId: string }> {
		const label = [spec.command, ...spec.args].join(' ');
		this.check(classifyCommand(label).category, label);

		const cwd = spec.cwd ?? this.context.worktreePath;
		if (cwd !== this.context.worktreePath) {
			this.check(classifyPath(cwd, this.context.worktreePath), cwd);
		}

		const env = { ...process.env };
		for (const item of spec.env) env[item.name] = item.value;

		const child = spawn(spec.command, spec.args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
		const id = `term-${++this.counter}`;
		const session: TerminalSession = {
			child,
			output: '',
			truncated: false,
			limit: spec.outputByteLimit && spec.outputByteLimit > 0 ? spec.outputByteLimit : DEFAULT_OUTPUT_LIMIT,
			exit: null,
			waiters: []
		};
		this.terminals.set(id, session);

		const append = (chunk: Buffer) => {
			session.output += chunk.toString('utf8');
			if (session.output.length > session.limit) {
				session.output = session.output.slice(-session.limit);
				session.truncated = true;
			}
		};
		child.stdout?.on('data', append);
		child.stderr?.on('data', append);
		child.on('error', (error) => {
			append(Buffer.from(`\n[gagal menjalankan command: ${error.message}]\n`));
			this.finish(id, { exitCode: null, signal: null });
		});
		child.on('exit', (code, signal) => this.finish(id, { exitCode: code, signal }));

		return { terminalId: id };
	}

	private finish(id: string, exit: TerminalExit): void {
		const session = this.terminals.get(id);
		if (!session || session.exit) return;
		session.exit = exit;
		for (const waiter of session.waiters.splice(0)) waiter();
	}

	async terminalOutput(terminalId: string): Promise<TerminalOutput> {
		const session = this.requireTerminal(terminalId);
		return { output: session.output, truncated: session.truncated, exitStatus: session.exit };
	}

	async waitForTerminalExit(terminalId: string): Promise<TerminalExit> {
		const session = this.requireTerminal(terminalId);
		if (session.exit) return session.exit;
		return new Promise<TerminalExit>((resolve) => {
			session.waiters.push(() => resolve(session.exit ?? { exitCode: null, signal: null }));
		});
	}

	async killTerminal(terminalId: string): Promise<void> {
		const session = this.requireTerminal(terminalId);
		if (session.exit) return;
		session.child.kill('SIGTERM');
		await new Promise<void>((resolve) => {
			const timer = setTimeout(() => {
				session.child.kill('SIGKILL');
				resolve();
			}, TERMINAL_KILL_GRACE_MS);
			session.waiters.push(() => {
				clearTimeout(timer);
				resolve();
			});
		});
	}

	async releaseTerminal(terminalId: string): Promise<void> {
		const session = this.terminals.get(terminalId);
		if (!session) return;
		if (!session.exit) session.child.kill('SIGKILL');
		this.terminals.delete(terminalId);
	}

	private requireTerminal(terminalId: string): TerminalSession {
		const session = this.terminals.get(terminalId);
		if (!session) throw new Error(`Terminal ${terminalId} tidak dikenal.`);
		return session;
	}

	/** Membersihkan seluruh terminal saat run berakhir. */
	dispose(): void {
		for (const session of this.terminals.values()) {
			if (!session.exit) {
				try {
					session.child.kill('SIGKILL');
				} catch {
					// Proses sudah tidak ada.
				}
			}
		}
		this.terminals.clear();
	}
}
