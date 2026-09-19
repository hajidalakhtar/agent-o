import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve as resolvePath } from 'node:path';
import {
	ALWAYS_DENIED,
	SYSTEM_DEFAULTS,
	type Decision,
	type PermissionCategory,
	type PolicyScope
} from './types.js';

export interface PolicyLayer {
	scope: PolicyScope;
	rules: { category: PermissionCategory; decision: Decision }[];
	defaultDecision: Decision;
	name?: string;
}

export interface Resolution {
	decision: Decision;
	source: PolicyScope | 'system';
	forced: boolean;
	reason?: string;
}

/**
 * Urutan resolusi: card → project → global → default sistem (PERM-03).
 * Kategori di ALWAYS_DENIED tidak bisa dinaikkan oleh apa pun.
 */
export function resolveDecision(category: PermissionCategory, layers: PolicyLayer[]): Resolution {
	if (ALWAYS_DENIED.includes(category)) {
		return {
			decision: 'deny',
			source: 'system',
			forced: true,
			reason: 'Kategori ini ditolak tanpa syarat oleh sistem.'
		};
	}

	for (const scope of ['card', 'project', 'global'] as const) {
		const layer = layers.find((item) => item.scope === scope);
		if (!layer) continue;
		const rule = layer.rules.find((item) => item.category === category);
		if (rule) return { decision: rule.decision, source: scope, forced: false };
	}

	return { decision: SYSTEM_DEFAULTS[category], source: 'system', forced: false };
}

const GIT_REMOTE = /\bgit\s+(push|fetch|pull|clone|remote|ls-remote)\b/;
const NETWORK_TOOLS = /(^|[\s|;&])(curl|wget|nc|netcat|ssh|scp|sftp|ping|telnet|dig|nslookup)\b/;
const DESTRUCTIVE =
	/(^|[\s|;&])(sudo|dd|mkfs\S*|shutdown|reboot|kill|killall|pkill)\b|\brm\s+(-[a-z]*[rf][a-z]*\s+)+|\bchmod\s+-R\b|\bchown\s+-R\b|>\s*\/dev\/(sd|nvme|null|zero)/;

/**
 * Klasifikasi command secara konservatif (PERM-01). Tidak boleh hanya
 * mencocokkan string utuh: pemanggilan bersarang (`bash -c`, pipe, subshell)
 * diperlakukan sebagai berisiko.
 */
export function classifyCommand(command: string): {
	category: PermissionCategory;
	conservative: boolean;
	reason: string;
} {
	const trimmed = command.trim();
	if (!trimmed) {
		return { category: 'terminal_internal', conservative: false, reason: 'Command kosong.' };
	}

	if (GIT_REMOTE.test(trimmed)) {
		return { category: 'git_remote', conservative: false, reason: 'Menyentuh remote git.' };
	}
	if (DESTRUCTIVE.test(trimmed)) {
		return {
			category: 'terminal_destructive',
			conservative: false,
			reason: 'Pola command destruktif terdeteksi.'
		};
	}
	if (NETWORK_TOOLS.test(trimmed)) {
		return { category: 'network', conservative: false, reason: 'Memakai tool jaringan.' };
	}

	// Pemanggilan bersarang tidak bisa dipastikan aman → konservatif.
	if (/(^|[\s;|&])(bash|sh|zsh|fish)\s+-c\b/.test(trimmed) || /\$\(|`/.test(trimmed)) {
		return {
			category: 'terminal_destructive',
			conservative: true,
			reason: 'Command bersarang tidak bisa dipastikan aman; diklasifikasi berisiko.'
		};
	}

	return { category: 'terminal_internal', conservative: false, reason: 'Tidak ada pola berisiko.' };
}

/**
 * Menyelesaikan path semirip mungkin dengan realpath: symlink pada bagian yang
 * sudah ada diikuti, sehingga symlink di dalam worktree yang menunjuk keluar
 * tetap terdeteksi (NFR-13).
 */
export function realpathBestEffort(target: string): string {
	const missing: string[] = [];
	let current = resolvePath(target);

	for (;;) {
		try {
			const real = realpathSync(current);
			return missing.length > 0 ? join(real, ...missing.reverse()) : real;
		} catch {
			const parent = dirname(current);
			if (parent === current) return resolvePath(target);
			missing.push(basename(current));
			current = parent;
		}
	}
}

/** `~` di-expand ke home user, bukan dianggap relatif terhadap worktree. */
export function expandPath(input: string, base: string): string {
	const expanded = input === '~' || input.startsWith('~/') ? join(homedir(), input.slice(1)) : input;
	return isAbsolute(expanded) ? resolvePath(expanded) : resolvePath(base, expanded);
}

function isInside(abs: string, worktree: string): boolean {
	const realWorktree = realpathBestEffort(worktree);
	const rel = relative(realWorktree, abs);
	return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** Klasifikasi path baca (PERM-02). */
export function classifyPath(path: string, worktree: string): PermissionCategory {
	const abs = realpathBestEffort(expandPath(path, worktree));
	return isInside(abs, worktree) ? 'fs_read_internal' : 'fs_read_external';
}

/** Klasifikasi path tulis (PERM-02). */
export function classifyWritePath(path: string, worktree: string): PermissionCategory {
	const abs = realpathBestEffort(expandPath(path, worktree));
	return isInside(abs, worktree) ? 'fs_write_internal' : 'fs_write_external';
}
