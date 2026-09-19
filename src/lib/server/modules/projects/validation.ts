import { accessSync, constants, statSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import * as git from '../git/index.js';

export interface ProjectValidationOk {
	ok: true;
	rootPath: string;
	name: string;
	defaultBranch: string;
}

export interface ProjectValidationFail {
	ok: false;
	step: number;
	message: string;
}

export type ProjectValidation = ProjectValidationOk | ProjectValidationFail;

function fail(step: number, message: string): ProjectValidationFail {
	return { ok: false, step, message };
}

/** Nama file dari baris `git status --porcelain`. */
function porcelainPaths(lines: string[]): string[] {
	return lines.map((line) => {
		const trimmed = line.slice(3);
		const renamed = trimmed.split(' -> ');
		return renamed[renamed.length - 1];
	});
}

/**
 * Enam validasi dari spec/project.md, berhenti pada kegagalan pertama
 * (PROJECT-02, PROJECT-03). Tidak ada opsi memaksa.
 */
export async function validateProjectFolder(inputPath: string): Promise<ProjectValidation> {
	let stats;
	try {
		stats = statSync(inputPath);
	} catch {
		return fail(1, 'Folder tidak ditemukan atau tidak bisa dibaca');
	}
	if (!stats.isDirectory()) {
		return fail(1, 'Folder tidak ditemukan atau tidak bisa dibaca');
	}
	try {
		accessSync(inputPath, constants.R_OK);
	} catch {
		return fail(1, 'Folder tidak ditemukan atau tidak bisa dibaca');
	}

	const rootPath = resolve(inputPath);

	if (!(await git.isInsideWorkTree(rootPath))) {
		return fail(2, 'Folder ini bukan git repository');
	}

	const toplevel = await git.showToplevel(rootPath);
	if (toplevel && resolve(toplevel) !== rootPath) {
		return fail(
			2,
			`Folder ini adalah subfolder dari repo di ${toplevel}. Pilih folder root repo, bukan subfolder.`
		);
	}

	if ((await git.currentBranch(rootPath)) === null) {
		return fail(3, 'Repo dalam keadaan detached HEAD');
	}

	if (!(await git.hasCommit(rootPath))) {
		return fail(4, 'Repo belum punya commit');
	}

	const dirty = await git.statusPorcelain(rootPath);
	if (dirty.length > 0) {
		const list = porcelainPaths(dirty).join(', ');
		return fail(5, `Ada perubahan yang belum di-commit: ${list}`);
	}

	const defaultBranch = await git.detectDefaultBranch(rootPath);
	if (!defaultBranch) {
		return fail(6, 'Tidak bisa menentukan branch utama');
	}

	return { ok: true, rootPath, name: basename(rootPath), defaultBranch };
}
