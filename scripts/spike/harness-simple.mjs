#!/usr/bin/env node
// Harness ACP minimal untuk spike agent-o (Fase 0).
//
// Sengaja BERBEDA dari contoh agent bawaan SDK:
//   - TIDAK pernah mengirim session/request_permission
//   - memakai `fs/write_text_file` & `fs/read_text_file` milik CLIENT
//   - capabilities-nya berbeda (loadSession: true)
//
// Tujuannya membuktikan bahwa sisi client agent-o tidak mengasumsikan
// perilaku satu harness tertentu.
import * as acp from '@agentclientprotocol/sdk';
import { Readable, Writable } from 'node:stream';

/** @type {Map<string, { cwd: string }>} */
const sessions = new Map();

acp
	.agent({ name: 'agent-o-spike-harness-b' })
	.onRequest('initialize', () => ({
		protocolVersion: acp.PROTOCOL_VERSION,
		agentCapabilities: {
			loadSession: true,
			promptCapabilities: { image: false, audio: false, embeddedContext: false }
		},
		authMethods: []
	}))
	.onRequest('session/new', (ctx) => {
		const sessionId = `harness-b-${Math.random().toString(16).slice(2, 10)}`;
		sessions.set(sessionId, { cwd: ctx.params.cwd });
		return { sessionId };
	})
	.onRequest('session/prompt', async (ctx) => {
		const { sessionId } = ctx.params;
		const session = sessions.get(sessionId);
		if (!session) throw new Error(`session ${sessionId} tidak ditemukan`);

		await ctx.client.notify(acp.methods.client.session.update, {
			sessionId,
			update: {
				sessionUpdate: 'agent_message_chunk',
				content: { type: 'text', text: 'Menulis file lewat fs milik client...' }
			}
		});

		const target = `${session.cwd}/dari-harness-b.txt`;
		await ctx.client.request(acp.methods.client.fs.writeTextFile, {
			sessionId,
			path: target,
			content: 'halo dari harness B\n'
		});

		const readBack = await ctx.client.request(acp.methods.client.fs.readTextFile, {
			sessionId,
			path: target
		});

		await ctx.client.notify(acp.methods.client.session.update, {
			sessionId,
			update: {
				sessionUpdate: 'agent_message_chunk',
				content: {
					type: 'text',
					text:
						`\nDibaca kembali ${readBack.content.trim().length} karakter.\n` +
						`{"agent_o":"done","summary":"menulis dari-harness-b.txt","changed_files":["${target}"]}`
				}
			}
		});

		return { stopReason: 'end_turn' };
	})
	.onNotification('session/cancel', () => {
		// Harness ini menyelesaikan turn dengan cepat sehingga tidak ada yang
		// perlu dibatalkan.
	})
	.connect(acp.ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin)));
