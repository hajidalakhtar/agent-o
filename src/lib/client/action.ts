import { invalidateAll } from '$app/navigation';

export interface ActionResult {
	ok: boolean;
	error?: string;
	data?: Record<string, unknown> | null;
}

interface RawActionResponse {
	type?: string;
	data?: Record<string, unknown> | null;
}

/** Memanggil form action SvelteKit secara programatik dan mengembalikan data mentahnya. */
export async function callAction(
	action: string,
	fields: Record<string, string>,
	options: { confirm?: string; url?: string } = {}
): Promise<ActionResult> {
	if (options.confirm && !confirm(options.confirm)) return { ok: false };

	const body = new FormData();
	for (const [key, value] of Object.entries(fields)) body.append(key, value);

	try {
		const response = await fetch(`${options.url ?? ''}?/${action}`, {
			method: 'POST',
			body,
			headers: { 'x-sveltekit-action': 'true' }
		});
		const result = (await response.json()) as RawActionResponse;
		if (result?.type === 'failure') {
			return { ok: false, error: (result.data?.error as string) ?? 'Aksi gagal.', data: result.data ?? null };
		}
		return { ok: true, data: result.data ?? null };
	} catch (cause) {
		return { ok: false, error: (cause as Error).message };
	}
}

/**
 * Seperti `callAction`, tapi menyegarkan data halaman saat berhasil.
 * Dipakai tombol transisi dan drag-and-drop di board.
 */
export async function submitAction(
	action: string,
	fields: Record<string, string>,
	options: { confirm?: string; url?: string } = {}
): Promise<ActionResult> {
	const result = await callAction(action, fields, options);
	if (result.ok) await invalidateAll();
	return result;
}
