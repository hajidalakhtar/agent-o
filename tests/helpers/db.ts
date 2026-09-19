import { Db } from '$lib/server/modules/persistence/db.js';
import { migrate } from '$lib/server/modules/persistence/index.js';

/** Database in-memory yang sudah dimigrasi, untuk unit test modul. */
export function testDb(): Db {
	const db = new Db(':memory:');
	migrate(db);
	return db;
}
