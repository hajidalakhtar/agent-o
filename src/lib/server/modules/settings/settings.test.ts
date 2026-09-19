import { describe, expect, it } from 'vitest';
import { testDb } from '$test/helpers/db.js';
import { SettingsService } from './index.js';

describe('OD-05 — WIP limit global lewat settings', () => {
	it('memakai default 3 lalu menghormati nilai yang diset', () => {
		const db = testDb();
		const settings = new SettingsService(db);
		expect(settings.globalWipLimit()).toBe(3);

		settings.setGlobalWipLimit(5);
		expect(settings.globalWipLimit()).toBe(5);
		db.close();
	});

	it('menolak nilai WIP tidak valid', () => {
		const db = testDb();
		const settings = new SettingsService(db);
		expect(() => settings.setGlobalWipLimit(0)).toThrow();
		expect(() => settings.setGlobalWipLimit(-1)).toThrow();
		db.close();
	});
});

describe('PERSIST-04 — retensi log', () => {
	it('memakai default 14 hari dan bisa diubah', () => {
		const db = testDb();
		const settings = new SettingsService(db);
		expect(settings.logRetentionDays()).toBe(14);
		settings.setLogRetentionDays(30);
		expect(settings.logRetentionDays()).toBe(30);
		db.close();
	});
});

describe('settings — key/value persisten', () => {
	it('menyimpan dan membaca kembali nilai', () => {
		const db = testDb();
		const settings = new SettingsService(db);
		settings.set('apa_saja', 'nilai');
		expect(settings.get('apa_saja')).toBe('nilai');
		expect(settings.all().apa_saja).toBe('nilai');
		db.close();
	});

	it('menghapus default policy id saat di-set null', () => {
		const db = testDb();
		const settings = new SettingsService(db);
		settings.setDefaultPolicyId('p1');
		expect(settings.defaultPolicyId()).toBe('p1');
		settings.setDefaultPolicyId(null);
		expect(settings.defaultPolicyId()).toBeNull();
		db.close();
	});
});
