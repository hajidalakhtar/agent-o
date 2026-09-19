/** Nilai `stopReason` ACP yang dikenal. Sengaja tidak mengimpor SDK agar domain murni. */
export type StopReason = 'end_turn' | 'max_tokens' | 'max_turn_requests' | 'refusal' | 'cancelled';

export type ReportKind = 'done' | 'question' | 'failed';

export interface CompletionReport {
	kind: ReportKind;
	summary?: string;
	changedFiles?: string[];
	question?: string;
	reason?: string;
	raw: string;
}

export interface ParseResult {
	report: CompletionReport | null;
	/** Terisi bila ada blok tetapi tidak bisa dipakai (DONE, kasus gagal). */
	error?: string;
}

export type CompletionStatus = 'in_review' | 'blocked';

export interface CompletionDecision {
	status: CompletionStatus;
	reason: string;
	/** True bila hasil disimpulkan tanpa blok status → badge "belum terverifikasi" (DONE-05). */
	inferred: boolean;
	report: CompletionReport | null;
}

export interface CompletionInput {
	report: CompletionReport | null;
	stopReason: StopReason | null;
	/** Jumlah commit di atas base_sha (DONE-08). */
	commits: number;
	/** Proses agent mati tanpa stopReason. */
	processDied?: boolean;
}
