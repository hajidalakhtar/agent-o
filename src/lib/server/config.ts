import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

function env(name: string): string | undefined {
	const value = process.env[name];
	return value && value.length > 0 ? value : undefined;
}

export const APP_NAME = 'agent-o';

export function appDataDir(): string {
	return resolve(env('AGENT_O_DATA_DIR') ?? join(homedir(), '.agent-o'));
}

export function dbPath(): string {
	return resolve(env('AGENT_O_DB_PATH') ?? join(appDataDir(), 'agent-o.db'));
}

export function logsDir(): string {
	return join(appDataDir(), 'logs');
}

export function worktreesDir(): string {
	return join(appDataDir(), 'worktrees');
}

export function lockPath(): string {
	return join(appDataDir(), 'agent-o.lock');
}

/** Ambang waktu ACP; nilai awal dari ADR 0000. */
export function acpTimeouts(): {
	handshakeMs: number;
	deadAirMs: number;
	graceMs: number;
	forceKillMs: number;
} {
	const read = (name: string, fallback: number) => {
		const parsed = Number.parseInt(env(name) ?? '', 10);
		return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
	};
	return {
		handshakeMs: read('AGENT_O_HANDSHAKE_TIMEOUT_MS', 30_000),
		deadAirMs: read('AGENT_O_DEAD_AIR_TIMEOUT_MS', 120_000),
		graceMs: read('AGENT_O_CANCEL_GRACE_MS', 5_000),
		forceKillMs: 2_000
	};
}

export function defaultWipLimit(): number {
	const raw = env('AGENT_O_GLOBAL_WIP');
	const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
	return Number.isFinite(parsed) && parsed > 0 ? parsed : 3;
}
