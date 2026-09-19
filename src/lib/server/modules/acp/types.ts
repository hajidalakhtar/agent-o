import type { StopReason } from '../completion/index.js';

export interface AcpUpdate {
	kind: 'message' | 'thought' | 'tool_call' | 'tool_call_update' | 'plan' | 'other';
	/** Diisi untuk message/thought. */
	text?: string;
	messageId?: string;
	toolCallId?: string;
	title?: string;
	status?: string;
	entries?: { content: string; priority?: string; status?: string }[];
	/** Jenis asli dari protokol, untuk log dan UI saat tidak dikenali. */
	rawKind: string;
}

export interface AcpAgentSpec {
	command: string;
	args: string[];
	env: Record<string, string>;
}

export interface PermissionProbe {
	title: string;
	kind?: string | null;
	locations?: { path: string }[];
	rawInput?: unknown;
}

export interface TerminalCreateSpec {
	command: string;
	args: string[];
	cwd: string | null;
	env: { name: string; value: string }[];
	outputByteLimit: number | null;
}

export interface TerminalOutput {
	output: string;
	truncated: boolean;
	exitStatus?: { exitCode?: number | null; signal?: string | null } | null;
}

export interface TerminalExit {
	exitCode?: number | null;
	signal?: string | null;
}

/**
 * Port yang dipakai klien ACP untuk semua akses filesystem/terminal dan
 * keputusan izin. Implementasi nyatanya ada di modul `permissions`; klien ACP
 * sendiri tidak pernah menyentuh disk langsung (ACP-05, ACP-06, PERM-16).
 */
export interface AcpGate {
	readTextFile(path: string): Promise<{ content: string }>;
	writeTextFile(path: string, content: string): Promise<void>;
	createTerminal(spec: TerminalCreateSpec): Promise<{ terminalId: string }>;
	terminalOutput(terminalId: string): Promise<TerminalOutput>;
	waitForTerminalExit(terminalId: string): Promise<TerminalExit>;
	killTerminal(terminalId: string): Promise<void>;
	releaseTerminal(terminalId: string): Promise<void>;
	decidePermission(probe: PermissionProbe): 'allow' | 'deny';
	/** Membersihkan sumber daya gate (terminal yang masih hidup) saat run berakhir. */
	dispose?(): void;
}

export interface AcpRunInput {
	agent: AcpAgentSpec;
	cwd: string;
	prompt: string;
	gate: AcpGate;
	/** Log mentah per run: stdout/stderr proses apa adanya (ACP-09). */
	logPath: string;
	onUpdate(update: AcpUpdate): void;
	onSession?(sessionId: string): void;
	onHandshake?(capabilities: Record<string, unknown> | null, authMethods: string[]): void;
	/** Dibatalkan oleh orchestrator (user stop / aplikasi menutup). */
	signal?: AbortSignal;
}

export interface AcpRunOutcome {
	stopReason: StopReason | null;
	sessionId: string | null;
	capabilities: Record<string, unknown> | null;
	authMethods: string[];
	/**
	 * True hanya bila sesi gagal dibuka karena agent menuntut autentikasi
	 * (`auth_required`). Sekadar mengiklankan `authMethods` bukan berarti belum login.
	 */
	authRequired: boolean;
	/** Terisi bila spawn/handshake/sesi gagal sebelum turn selesai. */
	error?: string;
	/** Proses berhenti tanpa stopReason. */
	processDied: boolean;
	killed: boolean;
	exitCode: number | null;
}

/** Port runner ACP. Implementasi nyata men-spawn proses; test memakai implementasi palsu. */
export interface AcpRunner {
	run(input: AcpRunInput): Promise<AcpRunOutcome>;
}

export class AcpError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AcpError';
	}
}
