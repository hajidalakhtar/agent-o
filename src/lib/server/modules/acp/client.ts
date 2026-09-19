import * as acp from '@agentclientprotocol/sdk';
import { spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { dirname } from 'node:path';
import { PassThrough, Readable, Writable } from 'node:stream';
import type { StopReason } from '../completion/index.js';
import { normalizeUpdate } from './normalize.js';
import { AcpError, type AcpRunInput, type AcpRunOutcome, type AcpRunner } from './types.js';

export interface AcpTimeouts {
	handshakeMs: number;
	deadAirMs: number;
	graceMs: number;
	forceKillMs: number;
}

export const DEFAULT_ACP_TIMEOUTS: AcpTimeouts = {
	handshakeMs: 30_000,
	deadAirMs: 120_000,
	graceMs: 5_000,
	forceKillMs: 2_000
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		const timer = setTimeout(() => reject(new AcpError(`Timeout ${ms} ms saat ${label}.`)), ms);
		promise.then(
			(value) => {
				clearTimeout(timer);
				resolve(value);
			},
			(error) => {
				clearTimeout(timer);
				reject(error);
			}
		);
	});
}

function hasExited(child: ChildProcess): boolean {
	return child.exitCode !== null || child.signalCode !== null;
}

/**
 * ACP-01/ACP-03/ACP-04: men-spawn satu proses agent per run, menjalankan
 * handshake, membuka sesi di worktree, dan memetakan seluruh permintaan agent
 * ke `AcpGate` (permission), bukan langsung ke disk.
 */
export class SpawnAcpRunner implements AcpRunner {
	constructor(private readonly timeouts: AcpTimeouts = DEFAULT_ACP_TIMEOUTS) {}

	async run(input: AcpRunInput): Promise<AcpRunOutcome> {
		const { agent, cwd, prompt, gate, logPath } = input;

		mkdirSync(dirname(logPath), { recursive: true });
		const log = createWriteStream(logPath, { flags: 'a' });
		log.write(`\n--- run ${new Date().toISOString()} :: ${agent.command} ${agent.args.join(' ')} @ ${cwd} ---\n`);

		let child: ChildProcess;
		try {
			child = spawn(agent.command, agent.args, {
				cwd,
				env: { ...process.env, ...agent.env, GIT_TERMINAL_PROMPT: '0', GIT_OPTIONAL_LOCKS: '0' },
				stdio: ['pipe', 'pipe', 'pipe']
			});
		} catch (error) {
			log.end();
			return this.failure(`Gagal menjalankan ${agent.command}: ${(error as Error).message}`);
		}

		let spawnError: string | null = null;
		let rejectSpawn: (error: Error) => void = () => {};
		const spawnFailed = new Promise<never>((_, reject) => {
			rejectSpawn = reject;
		});
		child.once('error', (error) => {
			spawnError = (error as NodeJS.ErrnoException).code === 'ENOENT'
				? `Command agent tidak ditemukan di PATH: ${agent.command}`
				: `Proses agent gagal start: ${error.message}`;
			rejectSpawn(new AcpError(spawnError));
		});

		// Log mentah: stdout apa adanya (protokol + noise), stderr ditandai (ACP-09).
		const tee = new PassThrough();
		child.stdout?.on('data', (chunk: Buffer) => {
			log.write(chunk);
			tee.write(chunk);
		});
		child.stdout?.on('end', () => tee.end());
		child.stderr?.on('data', (chunk: Buffer) => log.write(`[stderr] ${chunk}`));

		let sessionId: string | null = null;
		let capabilities: Record<string, unknown> | null = null;
		let authMethods: string[] = [];
		let stopReason: StopReason | null = null;
		let errorMessage: string | null = null;
		let authRequired = false;
		let killed = false;
		let cancelled = false;
		let deadAir = false;
		let cancelNotify: (() => void) | null = null;

		let lastActivity = Date.now();
		const watchdog = setInterval(() => {
			if (Date.now() - lastActivity > this.timeouts.deadAirMs) {
				deadAir = true;
				this.kill(child, () => (killed = true));
			}
		}, 1000);

		const onAbort = () => {
			cancelled = true;
			cancelNotify?.();
			setTimeout(() => this.kill(child, () => (killed = true)), this.timeouts.graceMs);
		};
		input.signal?.addEventListener('abort', onAbort, { once: true });

		try {
			const app = acp
				.client({ name: 'agent-o' })
				.onRequest(acp.methods.client.fs.readTextFile, async (ctx) => {
					const result = await gate.readTextFile(ctx.params.path);
					return { content: result.content };
				})
				.onRequest(acp.methods.client.fs.writeTextFile, async (ctx) => {
					await gate.writeTextFile(ctx.params.path, ctx.params.content);
					return {};
				})
				.onRequest(acp.methods.client.session.requestPermission, (ctx) => {
					const toolCall = ctx.params.toolCall;
					const decision = gate.decidePermission({
						title: toolCall.title ?? 'tool call',
						kind: toolCall.kind ?? null,
						locations: toolCall.locations ?? undefined,
						rawInput: toolCall.rawInput
					});
					const options = ctx.params.options ?? [];
					const pick = (kinds: string[]) =>
						options.find((option) => kinds.includes(option.kind));
					const chosen =
						decision === 'allow'
							? pick(['allow_once', 'allow_always'])
							: pick(['reject_once', 'reject_always']);
					if (chosen) {
						return { outcome: { outcome: 'selected' as const, optionId: chosen.optionId } };
					}
					return { outcome: { outcome: 'cancelled' as const } };
				})
				.onRequest(acp.methods.client.terminal.create, async (ctx) => {
					const { terminalId } = await gate.createTerminal({
						command: ctx.params.command,
						args: ctx.params.args ?? [],
						cwd: ctx.params.cwd ?? null,
						env: (ctx.params.env ?? []).map((item) => ({ name: item.name, value: item.value })),
						outputByteLimit: ctx.params.outputByteLimit ?? null
					});
					return { terminalId };
				})
				.onRequest(acp.methods.client.terminal.output, async (ctx) => {
					const result = await gate.terminalOutput(ctx.params.terminalId);
					return {
						output: result.output,
						truncated: result.truncated,
						exitStatus: result.exitStatus ?? null
					};
				})
				.onRequest(acp.methods.client.terminal.waitForExit, async (ctx) => {
					const result = await gate.waitForTerminalExit(ctx.params.terminalId);
					return { exitCode: result.exitCode ?? null, signal: result.signal ?? null };
				})
				.onRequest(acp.methods.client.terminal.kill, async (ctx) => {
					await gate.killTerminal(ctx.params.terminalId);
					return {};
				})
				.onRequest(acp.methods.client.terminal.release, async (ctx) => {
					await gate.releaseTerminal(ctx.params.terminalId);
					return {};
				})
				.onNotification(acp.methods.client.session.update, (ctx) => {
					lastActivity = Date.now();
					const normalized = normalizeUpdate(ctx.params.update as unknown as Record<string, unknown>);
					if (normalized) input.onUpdate(normalized);
				});

			if (!child.stdin || !child.stdout) {
				throw new AcpError('stdio proses agent tidak tersedia.');
			}
			const stream = acp.ndJsonStream(
				Writable.toWeb(child.stdin),
				Readable.toWeb(tee) as unknown as ReadableStream<Uint8Array>
			);

			await Promise.race([
				app.connectWith(stream, async (ctx) => {
					const init = await withTimeout(
						ctx.request(acp.methods.agent.initialize, {
							protocolVersion: acp.PROTOCOL_VERSION,
							clientCapabilities: {
								fs: { readTextFile: true, writeTextFile: true },
								terminal: true
							},
							clientInfo: { name: 'agent-o', version: '0.1.0' }
						}),
						this.timeouts.handshakeMs,
						'handshake initialize'
					);
					capabilities = (init.agentCapabilities ?? null) as Record<string, unknown> | null;
					authMethods = (init.authMethods ?? [])
						.map((method) => method.id)
						.filter((id): id is string => typeof id === 'string');
					input.onHandshake?.(capabilities, authMethods);

					const session = await this.startSession(ctx, cwd, () => (authRequired = true));
					sessionId = session.sessionId;
					input.onSession?.(session.sessionId);
					lastActivity = Date.now();
					cancelNotify = () => {
						void ctx.notify(acp.methods.agent.session.cancel, { sessionId: session.sessionId });
					};

					const promptDone = session.prompt(prompt);
					for (;;) {
						const message = await session.nextUpdate();
						if (message.kind === 'stop') {
							stopReason = message.stopReason;
							break;
						}
					}
					await promptDone;
					session.dispose();
				}),
				spawnFailed
			]);
		} catch (error) {
			const message = (error as Error).message;
			if (cancelled) errorMessage = message;
			else if (deadAir) errorMessage = `Tidak ada aktivitas dari agent selama ${this.timeouts.deadAirMs} ms.`;
			else errorMessage = message;
		} finally {
			clearInterval(watchdog);
			input.signal?.removeEventListener('abort', onAbort);
			this.kill(child, () => (killed = true));
			await this.waitExit(child);
			log.write(`--- run end :: stopReason=${stopReason ?? 'none'} exit=${child.exitCode ?? child.signalCode} ---\n`);
			log.end();
		}

		return {
			stopReason,
			sessionId,
			capabilities,
			authMethods,
			error: errorMessage ?? spawnError ?? undefined,
			processDied: stopReason === null && !cancelled && sessionId !== null,
			authRequired,
			killed,
			exitCode: child.exitCode
		};
	}

	/**
	 * AGENT-04: agent menuntut autentikasi hanya bila `session/new` gagal dengan
	 * error bertema auth. Mengiklankan `authMethods` saja tidak dianggap gagal.
	 */
	private async startSession(ctx: acp.ClientContext, cwd: string, onAuthRequired: () => void) {
		try {
			return await ctx.buildSession(cwd).start();
		} catch (error) {
			if (/auth/i.test((error as Error).message ?? '')) onAuthRequired();
			throw error;
		}
	}

	private kill(child: ChildProcess, mark: () => void): void {
		if (hasExited(child)) return;
		mark();
		try {
			child.kill('SIGTERM');
		} catch {
			// Proses sudah tidak ada.
		}
	}

	private waitExit(child: ChildProcess): Promise<void> {
		if (hasExited(child)) return Promise.resolve();
		return new Promise<void>((resolve) => {
			const timer = setTimeout(() => {
				try {
					child.kill('SIGKILL');
				} catch {
					// Proses sudah tidak ada.
				}
				resolve();
			}, this.timeouts.forceKillMs);
			child.once('exit', () => {
				clearTimeout(timer);
				resolve();
			});
		});
	}

	private failure(message: string): AcpRunOutcome {
		return {
			stopReason: null,
			sessionId: null,
			capabilities: null,
			authMethods: [],
			authRequired: false,
			error: message,
			processDied: false,
			killed: false,
			exitCode: null
		};
	}
}
