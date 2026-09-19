import { getApp } from '$lib/server/containers.js';
import type { RequestHandler } from './$types';

/**
 * Streaming CardEvent ke UI (SSE). Hanya event baru yang dikirim; riwayat
 * dirender dari `load` halaman, sehingga tidak ada duplikasi.
 */
export const GET: RequestHandler = ({ params, request }) => {
	const app = getApp();
	const card = app.cards.get(params.id);
	if (!card) return new Response('Card tidak ditemukan', { status: 404 });

	const encoder = new TextEncoder();
	let unsubscribe: (() => void) | undefined;
	let keepAlive: ReturnType<typeof setInterval> | undefined;

	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			const send = (data: unknown) => {
				try {
					controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
				} catch {
					// Stream sudah ditutup.
				}
			};

			// Komentar pembuka: memaksa header terkirim tanpa menunggu event pertama.
			controller.enqueue(encoder.encode(': connected\n\n'));

			unsubscribe = app.events.subscribe(card.id, send);
			keepAlive = setInterval(() => {
				try {
					controller.enqueue(encoder.encode(': ping\n\n'));
				} catch {
					// Stream sudah ditutup.
				}
			}, 15000);
		},
		cancel() {
			unsubscribe?.();
			if (keepAlive) clearInterval(keepAlive);
		}
	});

	request.signal.addEventListener('abort', () => {
		unsubscribe?.();
		if (keepAlive) clearInterval(keepAlive);
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			connection: 'keep-alive'
		}
	});
};
