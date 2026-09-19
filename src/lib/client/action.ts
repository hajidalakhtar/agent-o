import { invalidateAll } from '$app/navigation';
import { deserialize } from '$app/forms';

export interface ActionResult {
	ok: boolean;
	error?: string;
	data?: Record<string, unknown> | null;
}

/**
 * Memanggil form action SvelteKit secara programatik dan mengembalikan data mentahnya.
 * SvelteKit men-serialisasi `data` dengan devalue, jadi respons wajib dibaca lewat
 * `deserialize` — `response.json()` menghasilkan `data` berupa string, bukan objek.
 */
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
		const result = deserialize(await response.text());
		if (result.type === 'error') {
			return { ok: false, error: result.error?.message ?? 'Aksi gagal.' };
		}
		const data = (result.type === 'redirect' ? null : result.data) as Record<string, unknown> | null;
		if (result.type === 'failure') {
			return { ok: false, error: (data?.error as string) ?? 'Aksi gagal.', data };
		}
		return { ok: true, data };
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
