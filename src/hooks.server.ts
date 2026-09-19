import { shutdownApp, tryInitApp } from '$lib/server/containers.js';
import type { Handle } from '@sveltejs/kit';

const initError = tryInitApp();

let shuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
	process.on(signal, () => {
		if (shuttingDown) return;
		shuttingDown = true;
		shutdownApp();
		process.exit(0);
	});
}

/** NFR-17/PERSIST-09: instance kedua menolak start, pesannya terlihat di UI. */
export const handle: Handle = async ({ event, resolve }) => {
	if (initError) {
		return new Response(`agent-o tidak bisa start:\n\n${initError.message}\n`, {
			status: 503,
			headers: { 'content-type': 'text/plain; charset=utf-8' }
		});
	}
	return resolve(event);
};
