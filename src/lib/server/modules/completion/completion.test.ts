import { describe, expect, it } from 'vitest';
import { parseStatusBlock } from './parser.js';
import { BRIEFING, decideCompletion } from './service.js';

const doneBlock = '```json\n{"agent_o":"done","summary":"beres","changed_files":["a.ts"]}\n```';

describe('DONE-02 — parsing blok status di akhir pesan terakhir', () => {
	it('membaca blok done di akhir pesan', () => {
		const result = parseStatusBlock(`Sudah saya kerjakan.\n\n${doneBlock}`);
		expect(result.report?.kind).toBe('done');
		expect(result.report?.summary).toBe('beres');
		expect(result.report?.changedFiles).toEqual(['a.ts']);
	});

	it('membaca blok question dan failed', () => {
		expect(parseStatusBlock('```json\n{"agent_o":"question","question":"pakai A atau B?"}\n```').report?.kind).toBe(
			'question'
		);
		expect(parseStatusBlock('```json\n{"agent_o":"failed","reason":"tes gagal"}\n```').report?.kind).toBe('failed');
	});

	it('mengabaikan blok yang bukan di akhir pesan', () => {
		const result = parseStatusBlock(`${doneBlock}\n\nTapi tunggu, masih ada lagi.`);
		expect(result.report).toBeNull();
	});

	it('mengabaikan blok JSON yang tidak valid dan mencatat parse error', () => {
		const result = parseStatusBlock('```json\n{ agent_o: done }\n```');
		expect(result.report).toBeNull();
		expect(result.error).toBeDefined();
	});

	it('mengabaikan blok yang nilainya tidak dikenal', () => {
		const result = parseStatusBlock('```json\n{"agent_o":"partial"}\n```');
		expect(result.report).toBeNull();
		expect(result.error).toBeDefined();
	});

	it('mengabaikan blok yang melebihi batas ukuran', () => {
		const big = 'x'.repeat(9000);
		const result = parseStatusBlock(`\`\`\`json\n{"agent_o":"done","summary":"${big}"}\n\`\`\``);
		expect(result.report).toBeNull();
		expect(result.error).toContain('batas ukuran');
	});

	it('tidak menganggap tanpa blok sebagai error', () => {
		const result = parseStatusBlock('Saya sedang mengerjakan bagian pertama.');
		expect(result.report).toBeNull();
		expect(result.error).toBeUndefined();
	});
});

describe('DONE-04 — keputusan dari stopReason dan perubahan file', () => {
	it('done + ada commit → in_review', () => {
		const report = parseStatusBlock(doneBlock).report;
		expect(decideCompletion({ report, stopReason: 'end_turn', commits: 2 }).status).toBe('in_review');
	});

	it('done tanpa perubahan → blocked', () => {
		const report = parseStatusBlock(doneBlock).report;
		const decision = decideCompletion({ report, stopReason: 'end_turn', commits: 0 });
		expect(decision.status).toBe('blocked');
		expect(decision.reason).toContain('tidak ada perubahan');
	});

	it('question → blocked apa pun kondisi commit', () => {
		const report = parseStatusBlock('```json\n{"agent_o":"question","question":"A atau B?"}\n```').report;
		const decision = decideCompletion({ report, stopReason: 'end_turn', commits: 3 });
		expect(decision.status).toBe('blocked');
		expect(decision.reason).toBe('A atau B?');
	});

	it('failed → blocked dengan alasan agent', () => {
		const report = parseStatusBlock('```json\n{"agent_o":"failed","reason":"dependency hilang"}\n```').report;
		expect(decideCompletion({ report, stopReason: 'end_turn', commits: 0 }).reason).toBe('dependency hilang');
	});

	it('tanpa blok + end_turn + ada commit → in_review belum terverifikasi (DONE-05)', () => {
		const decision = decideCompletion({ report: null, stopReason: 'end_turn', commits: 1 });
		expect(decision.status).toBe('in_review');
		expect(decision.inferred).toBe(true);
	});

	it('tanpa blok + end_turn + tanpa commit → blocked', () => {
		expect(decideCompletion({ report: null, stopReason: 'end_turn', commits: 0 }).status).toBe('blocked');
	});

	it('stopReason selain end_turn → blocked dengan alasan spesifik', () => {
		for (const [stopReason, fragment] of [
			['refusal', 'menolak'],
			['max_tokens', 'token'],
			['max_turn_requests', 'giliran'],
			['cancelled', 'dibatalkan']
		] as const) {
			const decision = decideCompletion({ report: null, stopReason, commits: 5 });
			expect(decision.status).toBe('blocked');
			expect(decision.reason).toContain(fragment);
		}
	});

	it('proses mati tanpa stopReason → blocked interrupted', () => {
		const decision = decideCompletion({ report: null, stopReason: null, commits: 1, processDied: true });
		expect(decision.status).toBe('blocked');
		expect(decision.reason).toContain('interrupted');
	});
});

describe('DONE-01 — briefing memuat instruksi pelaporan', () => {
	it('menyebut ketiga bentuk blok status', () => {
		expect(BRIEFING).toContain('"agent_o": "done"');
		expect(BRIEFING).toContain('"agent_o": "question"');
		expect(BRIEFING).toContain('"agent_o": "failed"');
	});
});
