#!/usr/bin/env node
// Spike Fase 0 agent-o: menjalankan klien ACP terhadap dua harness berbeda
// lewat stdio nyata, lalu melaporkan capability dan waktu yang terukur.
//
// Yang diuji:
//   1. handshake `initialize` tanpa editor
//   2. `session/new` + `session/prompt`
//   3. streaming `session/update`
//   4. menyediakan fs/* untuk agent dan agen benar-benar memakainya
//   5. membalas `session/request_permission`
//   6. mematikan proses dengan bersih
//   7. mengabaikan output non-protokol tanpa merusak parser
import * as acp from '@agentclientprotocol/sdk';
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';

const HARNESSES = {
	'sdk-example-agent': {
		command: process.execPath,
		args: ['node_modules/@agentclientprotocol/sdk/dist/examples/agent.js']
	},
	'harness-b-minimal': {
		command: process.execPath,
		args: ['scripts/spike/harness-simple.mjs']
	}
};

const CLIENT_READ_CAP = true;
const CLIENT_WRITE_CAP = true;

async function runHarness(name, cfg) {
	const cwd = mkdtempSync(join(tmpdir(), `agent-o-spike-${name}-`));
	const child = spawn(cfg.command, cfg.args, { stdio: ['pipe', 'pipe', 'pipe'] });

	const stderrChunks = [];
	child.stderr.on('data', (chunk) => stderrChunks.push(chunk.toString()));

	const result = {
		name,
		cwd,
		initialized: false,
		initMs: null,
		protocolVersion: null,
		agentCapabilities: null,
		authMethods: null,
		sessionId: null,
		sessionNewMs: null,
		promptMs: null,
		stopReason: null,
		updates: { total: 0, messageChunks: 0, toolCalls: 0, other: 0 },
		permissionRequests: 0,
		fsReadRequests: 0,
		fsWriteRequests: 0,
		agentWroteFile: false,
		statusBlockFound: false,
		cancelStopReason: null,
		stderr: ''
	};

	const app = acp
		.client({ name: 'agent-o-spike' })
		.onRequest(acp.methods.client.session.requestPermission, (ctx) => {
			result.permissionRequests += 1;
			const options = ctx.params.options ?? [];
			const allow = options.find(
				(option) => option.kind === 'allow_once' || option.kind === 'allow_always'
			);
			return allow
				? { outcome: { outcome: 'selected', optionId: allow.optionId } }
				: { outcome: { outcome: 'cancelled' } };
		})
		.onRequest(acp.methods.client.fs.readTextFile, (ctx) => {
			result.fsReadRequests += 1;
			try {
				return { content: readFileSync(ctx.params.path, 'utf8') };
			} catch (error) {
				throw new Error(`tidak bisa membaca ${ctx.params.path}: ${error.message}`);
			}
		})
		.onRequest(acp.methods.client.fs.writeTextFile, (ctx) => {
			result.fsWriteRequests += 1;
			writeFileSync(ctx.params.path, ctx.params.content);
			return {};
		})
		.onNotification(acp.methods.client.session.update, (ctx) => {
			const update = ctx.params.update;
			result.updates.total += 1;
			if (update.sessionUpdate === 'agent_message_chunk') {
				result.updates.messageChunks += 1;
				const text = typeof update.content?.text === 'string' ? update.content.text : '';
				if (/"agent_o"\s*:\s*"done"/.test(text)) result.statusBlockFound = true;
			} else if (update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update') {
				result.updates.toolCalls += 1;
			} else {
				result.updates.other += 1;
			}
		});

	const stream = acp.ndJsonStream(Writable.toWeb(child.stdin), Readable.toWeb(child.stdout));

	const t0 = Date.now();
	await app.connectWith(stream, async (ctx) => {
		const init = await ctx.request(acp.methods.agent.initialize, {
			protocolVersion: acp.PROTOCOL_VERSION,
			clientCapabilities: {
				fs: { readTextFile: CLIENT_READ_CAP, writeTextFile: CLIENT_WRITE_CAP },
				terminal: true
			},
			clientInfo: { name: 'agent-o', version: '0.1.0-spike' }
		});
		result.initialized = true;
		result.initMs = Date.now() - t0;
		result.protocolVersion = init.protocolVersion ?? null;
		result.agentCapabilities = init.agentCapabilities ?? null;
		result.authMethods = init.authMethods ?? null;

		const sessionT0 = Date.now();
		const session = await ctx.buildSession(cwd).start();
		result.sessionId = session.sessionId;
		result.sessionNewMs = Date.now() - sessionT0;

		const promptT0 = Date.now();
		const promptText =
			'Kerjakan tugas contoh ini. Kalau sudah selesai, akhiri balasanmu dengan blok ' +
			'{"agent_o":"done","summary":"...","changed_files":[...]}.';
		const promptDone = session.prompt(promptText);
		while (true) {
			const message = await session.nextUpdate();
			if (message.kind === 'stop') {
				result.stopReason = message.stopReason;
				break;
			}
		}
		await promptDone;
		result.promptMs = Date.now() - promptT0;
		session.dispose();
	});

	child.kill('SIGTERM');
	await new Promise((resolve) => {
		const timer = setTimeout(() => {
			child.kill('SIGKILL');
			resolve();
		}, 3000);
		child.once('exit', () => {
			clearTimeout(timer);
			resolve();
		});
	});

	result.exited = child.exitCode !== null || child.signalCode !== null;
	result.agentWroteFile = existsSync(join(cwd, 'dari-harness-b.txt'));
	// Output non-protokol: contoh agent SDK tidak menulis apa pun ke stderr,
	// jadi baris apa pun di sini adalah bukti parser toleran terhadapnya.
	result.stderr = stderrChunks.join('').trim().slice(0, 500);

	return result;
}

const results = [];
for (const [name, cfg] of Object.entries(HARNESSES)) {
	try {
		results.push(await runHarness(name, cfg));
	} catch (error) {
		results.push({ name, error: error?.message ?? String(error), stack: error?.stack });
	}
}

console.log(JSON.stringify(results, null, 2));
