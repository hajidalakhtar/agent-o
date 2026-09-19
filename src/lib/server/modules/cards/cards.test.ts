import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { testDb } from '$test/helpers/db.js';
import { Db } from '../persistence/db.js';
import { migrate } from '../persistence/index.js';
import { ProjectRepository } from '../projects/repository.js';
import { EventService } from '../events/service.js';
import { CardError, CardService } from './service.js';

function seedProject(db: Db, id = 'p1'): void {
	new ProjectRepository(db).insert({
		id,
		name: 'Demo',
		rootPath: '/tmp/demo',
		defaultBranch: 'main',
		defaultAgentId: null,
		wipLimit: 3,
		permissionPolicyId: null,
		available: true,
		createdAt: Date.now()
	});
}

describe('CARD-01 — pembuatan dan validasi card', () => {
	let db: Db;
	let cards: CardService;

	beforeEach(() => {
		db = testDb();
		seedProject(db);
		cards = new CardService(db);
	});

	afterEach(() => db.close());

	it('membuat card di Backlog dengan posisi berurutan', () => {
		const first = cards.create('p1', 'Card satu');
		const second = cards.create('p1', 'Card dua');
		expect(first.status).toBe('backlog');
		expect(first.position).toBe(0);
		expect(second.position).toBe(1);
	});

	it('menolak card tanpa judul', () => {
		expect(() => cards.create('p1', '   ')).toThrow(CardError);
	});

	it('mengubah dan menghapus card', () => {
		const card = cards.create('p1', 'Awal', 'instruksi awal');
		const updated = cards.update(card.id, { title: 'Berubah', instruction: 'instruksi baru' });
		expect(updated.title).toBe('Berubah');
		expect(updated.instruction).toBe('instruksi baru');
		expect(updated.updatedAt).toBeGreaterThanOrEqual(card.updatedAt);

		cards.remove(card.id);
		expect(cards.get(card.id)).toBeUndefined();
	});

	it('menyimpan pesan thread sesuai urutan waktu (CARD-02)', () => {
		const card = cards.create('p1', 'Thread');
		cards.addMessage(card.id, 'user', 'kerjakan ini');
		cards.addMessage(card.id, 'agent', 'sedang dikerjakan');
		const thread = cards.listMessages(card.id);
		expect(thread.map((m) => m.role)).toEqual(['user', 'agent']);
	});
});

describe('CARD-06 — thread bisa dirender ulang setelah restart', () => {
	it('memuat ulang card, event, pesan dari file database', () => {
		const dir = mkdtempSync(join(tmpdir(), 'agent-o-cards-'));
		const path = join(dir, 'agent-o.db');

		const first = new Db(path);
		migrate(first);
		seedProject(first);
		const cards = new CardService(first);
		const events = new EventService(first);
		const card = cards.create('p1', 'Persisten');
		cards.addMessage(card.id, 'user', 'halo');
		events.record({ cardId: card.id, type: 'card_created', payload: { title: card.title } });
		first.close();

		const second = new Db(path);
		migrate(second);
		const reloadedCards = new CardService(second);
		const reloadedEvents = new EventService(second);

		expect(reloadedCards.get(card.id)?.title).toBe('Persisten');
		expect(reloadedCards.listMessages(card.id).map((m) => m.content)).toEqual(['halo']);
		expect(reloadedEvents.listByCard(card.id).map((e) => e.type)).toEqual(['card_created']);
		second.close();

		rmSync(dir, { recursive: true, force: true });
	});
});
