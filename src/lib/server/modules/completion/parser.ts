import type { CompletionReport, ParseResult, ReportKind } from './types.js';

/** Batas ukuran blok status; agent yang menempelkan file besar diabaikan (kasus gagal spec). */
const MAX_BLOCK_BYTES = 8192;

const KINDS: ReportKind[] = ['done', 'question', 'failed'];
const FENCED_JSON = /```json[ \t]*\r?\n([\s\S]*?)```/g;

/**
 * DONE-02/DONE-03: mem-parse blok status dari **akhir** pesan terakhir.
 * Blok di tengah pesan atau dari turn lama tidak dihitung.
 */
export function parseStatusBlock(text: string): ParseResult {
	const trimmed = text.trimEnd();
	if (!trimmed) return { report: null };

	let match: RegExpExecArray | null;
	let last: RegExpExecArray | null = null;
	FENCED_JSON.lastIndex = 0;
	while ((match = FENCED_JSON.exec(trimmed)) !== null) {
		last = match;
	}
	if (!last) return { report: null };

	// Blok harus berada di akhir pesan terakhir.
	if (trimmed.slice(last.index + last[0].length).trim().length > 0) return { report: null };

	const body = last[1].trim();
	if (body.length > MAX_BLOCK_BYTES) {
		return { report: null, error: 'Blok status melebihi batas ukuran dan diabaikan.' };
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch (cause) {
		return { report: null, error: `Blok status bukan JSON valid: ${(cause as Error).message}` };
	}
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		return { report: null, error: 'Blok status bukan objek JSON.' };
	}

	const record = parsed as Record<string, unknown>;
	const kind = record.agent_o;
	if (typeof kind !== 'string' || !KINDS.includes(kind as ReportKind)) {
		return { report: null, error: 'Blok status tidak memuat nilai `agent_o` yang dikenal.' };
	}

	const report: CompletionReport = { kind: kind as ReportKind, raw: body };
	if (typeof record.summary === 'string') report.summary = record.summary;
	if (typeof record.question === 'string') report.question = record.question;
	if (typeof record.reason === 'string') report.reason = record.reason;
	if (Array.isArray(record.changed_files)) {
		report.changedFiles = record.changed_files.filter((item): item is string => typeof item === 'string');
	}
	return { report };
}
