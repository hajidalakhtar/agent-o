export const PERMISSION_CATEGORIES = [
	'fs_read_internal',
	'fs_write_internal',
	'fs_read_external',
	'fs_write_external',
	'terminal_internal',
	'terminal_destructive',
	'git_remote',
	'network'
] as const;

export type PermissionCategory = (typeof PERMISSION_CATEGORIES)[number];

export type Decision = 'allow' | 'deny' | 'ask';

export type PolicyScope = 'global' | 'project' | 'card';

export interface PermissionRule {
	category: PermissionCategory;
	decision: Decision;
}

export interface PermissionPolicy {
	id: string;
	name: string;
	scope: PolicyScope;
	/** id project/card bila scope-nya bukan global. */
	scopeId: string | null;
	rules: PermissionRule[];
	defaultDecision: Decision;
	createdAt: number;
}

export const CATEGORY_LABELS: Record<PermissionCategory, string> = {
	fs_read_internal: 'Baca file di dalam worktree',
	fs_write_internal: 'Tulis file di dalam worktree',
	fs_read_external: 'Baca file di luar worktree',
	fs_write_external: 'Tulis file di luar worktree',
	terminal_internal: 'Command aman di dalam worktree',
	terminal_destructive: 'Command destruktif',
	git_remote: 'Operasi git remote',
	network: 'Akses jaringan dari agent'
};

/**
 * Kategori yang TIDAK BISA dinaikkan oleh policy apa pun (PERM-08, PERM-09,
 * NFR-14, NFR-15). Inilah yang membuat keluar-worktree dan git remote selalu
 * ditolak.
 */
export const ALWAYS_DENIED: readonly PermissionCategory[] = [
	'fs_read_external',
	'fs_write_external',
	'terminal_destructive',
	'git_remote',
	'network'
];

/** Default sistem bila tidak ada policy yang cocok (ADR 0001). */
export const SYSTEM_DEFAULTS: Record<PermissionCategory, Decision> = {
	fs_read_internal: 'allow',
	fs_write_internal: 'allow',
	terminal_internal: 'allow',
	fs_read_external: 'deny',
	fs_write_external: 'deny',
	terminal_destructive: 'deny',
	git_remote: 'deny',
	network: 'deny'
};
