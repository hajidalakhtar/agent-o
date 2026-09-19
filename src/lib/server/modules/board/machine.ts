import type { Card, CardStatus } from '../cards/types.js';
import type { Project } from '../projects/types.js';

export type TransitionActor = 'user' | 'system';

export type BoardState = CardStatus;

export type GuardResult = { ok: true } | { ok: false; message: string };

export function guardOk(): GuardResult {
	return { ok: true };
}

export function guardFail(message: string): GuardResult {
	return { ok: false, message };
}

/** Konteks yang dibutuhkan guard. Dirakit pemanggil (orchestrator) dari modul lain. */
export interface BoardContext {
	card: Card;
	project: Project;
	/** File yang belum di-commit pada branch utama project (guard kebersihan). */
	projectDirtyFiles: string[];
	/** Ketersediaan slot WIP. */
	slot: { available: boolean; reason?: string };
	/** Agent efektif yang akan dipakai. */
	agent: { determined: boolean; usable: boolean; reason?: string };
	/** Jumlah commit di atas base_sha pada branch card. */
	branchCommits: number;
	/** Feedback reject (wajib untuk in_review → backlog). */
	feedback?: string;
	/** Konfirmasi eksplisit untuk operasi destruktif. */
	confirmed?: boolean;
}

export interface TransitionDefinition {
	from: BoardState;
	to: BoardState | 'deleted';
	trigger: string;
	guard: (ctx: BoardContext) => GuardResult;
	/** Nama aksi sistem yang dijalankan orchestrator. */
	action: string;
}

const instructionNonEmpty = (ctx: BoardContext): GuardResult =>
	ctx.card.instruction.trim().length > 0 ? guardOk() : guardFail('Instruksi card masih kosong.');

const agentDetermined = (ctx: BoardContext): GuardResult => {
	if (!ctx.agent.determined) {
		return guardFail('Tidak ada agent yang ditentukan (card maupun default project).');
	}
	return ctx.agent.usable ? guardOk() : guardFail(ctx.agent.reason ?? 'Agent tidak bisa dipakai.');
};

const slotAvailable = (ctx: BoardContext): GuardResult =>
	ctx.slot.available ? guardOk() : guardFail(ctx.slot.reason ?? 'Slot WIP penuh.');

const projectClean = (ctx: BoardContext): GuardResult =>
	ctx.projectDirtyFiles.length === 0
		? guardOk()
		: guardFail(`Ada perubahan yang belum di-commit: ${ctx.projectDirtyFiles.join(', ')}`);

const branchHasCommits = (ctx: BoardContext): GuardResult =>
	ctx.branchCommits > 0
		? guardOk()
		: guardFail('Agent melapor selesai tapi tidak ada perubahan.');

const feedbackPresent = (ctx: BoardContext): GuardResult =>
	(ctx.feedback ?? '').trim().length > 0 ? guardOk() : guardFail('Alasan reject wajib diisi.');

const confirmed = (ctx: BoardContext): GuardResult =>
	ctx.confirmed ? guardOk() : guardFail('Operasi ini butuh konfirmasi eksplisit.');

const all =
	(...guards: ((ctx: BoardContext) => GuardResult)[]) =>
	(ctx: BoardContext): GuardResult => {
		for (const guard of guards) {
			const result = guard(ctx);
			if (!result.ok) return result;
		}
		return guardOk();
	};

/** Tabel transisi dari spec/board-lifecycle.md. Board tidak mengizinkan drag bebas (BOARD-04). */
export const transitions: TransitionDefinition[] = [
	{
		from: 'backlog',
		to: 'in_progress',
		trigger: 'Drag user',
		guard: all(instructionNonEmpty, agentDetermined, slotAvailable, projectClean),
		action: 'start-run'
	},
	{
		from: 'in_progress',
		to: 'in_review',
		trigger: 'Agent melaporkan done',
		guard: branchHasCommits,
		action: 'freeze'
	},
	{
		from: 'in_progress',
		to: 'blocked',
		trigger: 'Agent bertanya / gagal / dihentikan user',
		guard: () => guardOk(),
		action: 'stop-process'
	},
	{
		from: 'blocked',
		to: 'in_progress',
		trigger: 'User menjawab atau menekan Lanjut',
		guard: slotAvailable,
		action: 'resume-run'
	},
	{
		from: 'in_review',
		to: 'done',
		trigger: 'User Approve',
		guard: projectClean,
		action: 'merge'
	},
	{
		from: 'in_review',
		to: 'in_progress',
		trigger: 'Merge gagal karena konflik',
		guard: () => guardOk(),
		action: 'resolve-conflict'
	},
	{
		from: 'in_review',
		to: 'backlog',
		trigger: 'User Reject',
		guard: feedbackPresent,
		action: 'reject'
	},
	{
		from: 'blocked',
		to: 'backlog',
		trigger: 'User membatalkan',
		guard: () => guardOk(),
		action: 'cleanup'
	},
	{
		from: 'backlog',
		to: 'deleted',
		trigger: 'User menghapus card',
		guard: confirmed,
		action: 'delete'
	},
	{
		from: 'in_progress',
		to: 'deleted',
		trigger: 'User menghapus card',
		guard: confirmed,
		action: 'cancel-and-delete'
	},
	{
		from: 'blocked',
		to: 'deleted',
		trigger: 'User menghapus card',
		guard: confirmed,
		action: 'delete'
	},
	{
		from: 'in_review',
		to: 'deleted',
		trigger: 'User menghapus card',
		guard: confirmed,
		action: 'delete'
	}
];

export function findTransition(from: BoardState, to: BoardState | 'deleted'): TransitionDefinition | undefined {
	return transitions.find((t) => t.from === from && t.to === to);
}
