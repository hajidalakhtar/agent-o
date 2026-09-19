import { DatabaseSync, type StatementSync } from 'node:sqlite';

export type SqlParam = string | number | bigint | null | Uint8Array;
export type Row = Record<string, unknown>;

/**
 * Wrapper tipis di atas `node:sqlite` bawaan Node.
 *
 * Dipilih daripada `better-sqlite3` karena environment build tidak punya
 * C toolchain dan glibc-nya lebih lama daripada yang dibutuhkan prebuilt
 * `better-sqlite3`. `node:sqlite` tidak butuh native dependency sama sekali.
 */
export class Db {
	readonly raw: DatabaseSync;
	private readonly statements = new Map<string, StatementSync>();

	constructor(path: string) {
		this.raw = new DatabaseSync(path);
		this.raw.exec('PRAGMA journal_mode = WAL;');
		this.raw.exec('PRAGMA foreign_keys = ON;');
		this.raw.exec('PRAGMA busy_timeout = 5000;');
	}

	private prepare(sql: string): StatementSync {
		let stmt = this.statements.get(sql);
		if (!stmt) {
			stmt = this.raw.prepare(sql);
			this.statements.set(sql, stmt);
		}
		return stmt;
	}

	exec(sql: string): void {
		this.raw.exec(sql);
	}

	run(sql: string, params: SqlParam[] = []): void {
		this.prepare(sql).run(...params);
	}

	get<T = Row>(sql: string, params: SqlParam[] = []): T | undefined {
		const row = this.prepare(sql).get(...params);
		return row as T | undefined;
	}

	all<T = Row>(sql: string, params: SqlParam[] = []): T[] {
		return this.prepare(sql).all(...params) as T[];
	}

	transaction<T>(fn: () => T): T {
		this.raw.exec('BEGIN');
		try {
			const result = fn();
			this.raw.exec('COMMIT');
			return result;
		} catch (error) {
			this.raw.exec('ROLLBACK');
			throw error;
		}
	}

	close(): void {
		this.statements.clear();
		this.raw.close();
	}
}
