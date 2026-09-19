import { defaultWipLimit as configDefaultWipLimit } from '../../config.js';
import type { Db } from '../persistence/db.js';

const KEY_GLOBAL_WIP = 'global_wip_limit';
const KEY_LOG_RETENTION = 'log_retention_days';
const KEY_DEFAULT_POLICY = 'default_policy_id';

/** Konfigurasi global berbasis key/value (PROJECT-05 tingkat aplikasi). */
export class SettingsService {
	constructor(private readonly db: Db) {}

	all(): Record<string, string> {
		const rows = this.db.all<{ key: string; value: string }>('SELECT key, value FROM settings');
		return Object.fromEntries(rows.map((row) => [row.key, row.value]));
	}

	get(key: string): string | undefined {
		return this.db.get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [key])?.value;
	}

	set(key: string, value: string): void {
		this.db.run(
			'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
			[key, value]
		);
	}

	globalWipLimit(): number {
		const parsed = Number.parseInt(this.get(KEY_GLOBAL_WIP) ?? '', 10);
		return Number.isFinite(parsed) && parsed > 0 ? parsed : configDefaultWipLimit();
	}

	setGlobalWipLimit(limit: number): void {
		if (!Number.isInteger(limit) || limit < 1) {
			throw new Error('WIP limit global harus bilangan bulat minimal 1.');
		}
		this.set(KEY_GLOBAL_WIP, String(limit));
	}

	logRetentionDays(): number {
		const parsed = Number.parseInt(this.get(KEY_LOG_RETENTION) ?? '', 10);
		return Number.isFinite(parsed) && parsed >= 0 ? parsed : 14;
	}

	setLogRetentionDays(days: number): void {
		if (!Number.isInteger(days) || days < 0) {
			throw new Error('Retensi log harus bilangan bulat minimal 0.');
		}
		this.set(KEY_LOG_RETENTION, String(days));
	}

	defaultPolicyId(): string | null {
		return this.get(KEY_DEFAULT_POLICY) ?? null;
	}

	setDefaultPolicyId(id: string | null): void {
		if (id === null) {
			this.db.run('DELETE FROM settings WHERE key = ?', [KEY_DEFAULT_POLICY]);
			return;
		}
		this.set(KEY_DEFAULT_POLICY, id);
	}
}
