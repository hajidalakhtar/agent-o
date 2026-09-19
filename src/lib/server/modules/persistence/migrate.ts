import type { Db } from './db.js';
import { migrations } from './migrations.js';

/** Menjalankan migrasi yang belum diterapkan. Idempoten (NFR-27). */
export function migrate(db: Db): number {
	db.exec(`
CREATE TABLE IF NOT EXISTS _migration (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  applied_at INTEGER NOT NULL
);
`);

	const applied = new Set(
		db.all<{ id: number }>('SELECT id FROM _migration').map((row) => row.id)
	);

	let count = 0;
	for (const migration of migrations) {
		if (applied.has(migration.id)) continue;
		db.transaction(() => {
			db.exec(migration.sql);
			db.run('INSERT INTO _migration (id, name, applied_at) VALUES (?, ?, ?)', [
				migration.id,
				migration.name,
				Date.now()
			]);
		});
		count += 1;
	}
	return count;
}
