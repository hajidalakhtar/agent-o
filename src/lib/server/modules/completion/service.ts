import type { CompletionDecision, CompletionInput, CompletionReport } from './types.js';

/** Briefing DONE-01. Dikirim bersama instruksi card, karena ACP tidak punya system prompt. */
export const BRIEFING = `Kalau tugas ini sudah selesai, akhiri balasan terakhirmu dengan blok berikut:

\`\`\`json
{ "agent_o": "done", "summary": "<ringkasan singkat>", "changed_files": ["<path>"] }
\`\`\`

Kalau kamu butuh keputusan manusia sebelum bisa lanjut, akhiri dengan:

\`\`\`json
{ "agent_o": "question", "question": "<pertanyaan yang butuh jawaban>" }
\`\`\`

Kalau kamu tidak bisa melanjutkan, akhiri dengan:

\`\`\`json
{ "agent_o": "failed", "reason": "<alasan>" }
\`\`\``;

/** Instruksi tambahan untuk run lanjutan saat agent tidak mendukung `session/load`. */
export function resumeBriefing(previousContext: string): string {
	return `Lanjutan dari percakapan sebelumnya pada card ini. Konteks sejauh ini:\n\n${previousContext}\n\n${BRIEFING}`;
}

function summarize(report: CompletionReport): string {
	if (report.kind === 'question') return report.question ?? 'Agent butuh keputusan manusia.';
	if (report.kind === 'failed') return report.reason ?? 'Agent melaporkan kegagalan tanpa alasan.';
	return report.summary ?? 'Agent melaporkan selesai.';
}

/**
 * DONE-03/DONE-04: menentukan hasil akhir dari blok status, `stopReason`, dan
 * ada-tidaknya commit. Tabel keputusan spec/completion-signal.md.
 */
export function decideCompletion(input: CompletionInput): CompletionDecision {
	const { report, stopReason, commits, processDied } = input;
	const changed = commits > 0;

	if (report) {
		if (report.kind === 'done') {
			return changed
				? { status: 'in_review', reason: summarize(report), inferred: false, report }
				: {
						status: 'blocked',
						reason: 'Agent melapor selesai tapi tidak ada perubahan.',
						inferred: false,
						report
					};
		}
		return { status: 'blocked', reason: summarize(report), inferred: false, report };
	}

	if (processDied || stopReason === null) {
		return {
			status: 'blocked',
			reason: 'Proses agent berhenti tanpa stopReason (interrupted).',
			inferred: true,
			report: null
		};
	}

	if (stopReason === 'end_turn') {
		return changed
			? {
					status: 'in_review',
					reason: 'Agent berhenti dengan end_turn dan ada perubahan (belum terverifikasi).',
					inferred: true,
					report: null
				}
			: {
					status: 'blocked',
					reason: 'Agent berhenti tanpa perubahan dan tanpa blok status.',
					inferred: true,
					report: null
				};
	}

	if (stopReason === 'cancelled') {
		return { status: 'blocked', reason: 'Run dibatalkan.', inferred: true, report: null };
	}

	const labels: Record<string, string> = {
		max_tokens: 'Agent kehabisan token.',
		max_turn_requests: 'Batas jumlah giliran tercapai.',
		refusal: 'Agent menolak mengerjakan.'
	};
	return {
		status: 'blocked',
		reason: labels[stopReason] ?? `Run berhenti dengan stopReason ${stopReason}.`,
		inferred: true,
		report: null
	};
}
