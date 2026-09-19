import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export class LockError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'LockError';
	}
}

export interface LockHandle {
	readonly path: string;
	readonly pid: number;
	release(): void;
}

function isProcessAlive(pid: number): boolean {
	if (!Number.isInteger(pid) || pid <= 0) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		// EPERM berarti proses ada tapi milik user lain.
		return (error as NodeJS.ErrnoException).code === 'EPERM';
	}
}

/**
 * File lock ber-PID. Hanya satu instance yang boleh memakai satu database
 * (PERSIST-09, NFR-17). Lock basi (PID sudah mati) diambil alih otomatis.
 */
export function acquireLock(path: string): LockHandle {
	mkdirSync(dirname(path), { recursive: true });

	if (existsSync(path)) {
		const existing = Number.parseInt(readFileSync(path, 'utf8').trim(), 10);
		if (existing !== process.pid && isProcessAlive(existing)) {
			throw new LockError(
				`Instance agent-o lain sedang berjalan (pid ${existing}). Tutup instance itu dulu.`
			);
		}
	}

	writeFileSync(path, String(process.pid), 'utf8');

	return {
		path,
		pid: process.pid,
		release() {
			try {
				if (existsSync(path) && readFileSync(path, 'utf8').trim() === String(process.pid)) {
					rmSync(path);
				}
			} catch {
				// Melepas lock yang sudah hilang bukan kegagalan.
			}
		}
	};
}
