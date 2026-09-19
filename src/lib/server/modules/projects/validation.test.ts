import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, git, makeEmptyDir, makeRepo } from '$test/helpers/repo.js';
import { validateProjectFolder } from './validation.js';

const created: string[] = [];

afterEach(() => {
	cleanup(...created.splice(0));
});

function track(dir: string): string {
	created.push(dir);
	return dir;
}

describe('PROJECT-02/PROJECT-03 — enam validasi folder', () => {
	it('menolak folder yang tidak ada dengan pesan spesifik (langkah 1)', async () => {
		const result = await validateProjectFolder('/tidak/ada/folder-ini');
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.step).toBe(1);
		expect(result.message).toBe('Folder tidak ditemukan atau tidak bisa dibaca');
	});

	it('menolak folder bukan git repo (langkah 2)', async () => {
		const dir = track(makeEmptyDir());
		const result = await validateProjectFolder(dir);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.step).toBe(2);
		expect(result.message).toBe('Folder ini bukan git repository');
	});

	it('menolak repo tanpa commit (langkah 4)', async () => {
		const dir = track(makeRepo({ commit: false }));
		const result = await validateProjectFolder(dir);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.step).toBe(4);
		expect(result.message).toBe('Repo belum punya commit');
	});

	it('menolak detached HEAD (langkah 3)', async () => {
		const dir = track(makeRepo());
		const sha = git(dir, ['rev-parse', 'HEAD']).trim();
		git(dir, ['checkout', '--detach', sha]);
		const result = await validateProjectFolder(dir);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.step).toBe(3);
		expect(result.message).toBe('Repo dalam keadaan detached HEAD');
	});

	it('menolak working tree kotor dan menyebut nama file (langkah 5)', async () => {
		const dir = track(makeRepo());
		writeFileSync(join(dir, 'belum-commit.txt'), 'x');
		const result = await validateProjectFolder(dir);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.step).toBe(5);
		expect(result.message).toContain('belum-commit.txt');
	});

	it('menolak subfolder dari repo lain (langkah 2)', async () => {
		const dir = track(makeRepo());
		const sub = join(dir, 'sub');
		const fs = await import('node:fs');
		fs.mkdirSync(sub, { recursive: true });
		const result = await validateProjectFolder(sub);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.step).toBe(2);
		expect(result.message).toContain('subfolder');
	});

	it('menerima repo bersih dan mendeteksi branch utama (PROJECT-04)', async () => {
		const dir = track(makeRepo({ branch: 'main' }));
		const result = await validateProjectFolder(dir);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.defaultBranch).toBe('main');
		expect(result.rootPath).toBe(dir);
	});

	it('mendeteksi branch master bila main tidak ada', async () => {
		const dir = track(makeRepo({ branch: 'master' }));
		const result = await validateProjectFolder(dir);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.defaultBranch).toBe('master');
	});
});
