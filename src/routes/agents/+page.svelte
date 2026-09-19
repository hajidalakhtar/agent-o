<script lang="ts">
	import { submitAction } from '$lib/client/action.js';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let errorMessage = $state<string | null>(null);
	let busy = $state(false);

	let name = $state('');
	let command = $state('');
	let args = $state('');
	let maxConcurrency = $state('1');

	const HEALTH_LABELS: Record<string, { label: string; cls: string }> = {
		ok: { label: 'ok', cls: '' },
		needs_auth: { label: 'butuh autentikasi', cls: 'warn' },
		spawn_failed: { label: 'gagal spawn', cls: 'danger' },
		handshake_failed: { label: 'handshake gagal', cls: 'danger' },
		disabled: { label: 'dinonaktifkan', cls: 'muted' }
	};

	async function run(action: string, fields: Record<string, string>, confirm?: string) {
		if (busy) return;
		busy = true;
		const result = await submitAction(action, fields, { confirm });
		errorMessage = result.ok ? null : (result.error ?? null);
		busy = false;
	}

	async function addAgent(event: SubmitEvent) {
		event.preventDefault();
		const result = await submitAction('add', { name, command, args, maxConcurrency });
		if (result.ok) {
			name = '';
			command = '';
			args = '';
			maxConcurrency = '1';
			errorMessage = null;
		} else {
			errorMessage = result.error ?? null;
		}
	}

	function capabilitySummary(agent: PageData['agents'][number]): string[] {
		if (!agent.capabilities) return [];
		const lines: string[] = [];
		const caps = agent.capabilities as Record<string, unknown>;
		if ('loadSession' in caps) lines.push(`loadSession: ${String(caps.loadSession)}`);
		if (caps.promptCapabilities) lines.push(`promptCapabilities: ${JSON.stringify(caps.promptCapabilities)}`);
		const extra = Object.keys(caps).filter((key) => key !== 'loadSession' && key !== 'promptCapabilities');
		for (const key of extra) lines.push(`${key}: ${JSON.stringify(caps[key])}`);
		return lines;
	}
</script>

<div class="head">
	<h1>Agents</h1>
	<span class="spacer"></span>
	<span class="tiny faint">{data.agents.length} agent terdaftar</span>
</div>

{#if errorMessage}
	<div class="banner error-text">
		{errorMessage}
		<button class="ghost small" onclick={() => (errorMessage = null)}>tutup</button>
	</div>
{/if}

<section class="panel">
	<h2>Daftarkan agent ACP</h2>
	<form class="row wrap" onsubmit={addAgent}>
		<input bind:value={name} placeholder="Nama (mis. Gemini CLI)" class="w-name" />
		<input bind:value={command} placeholder="Command (mis. gemini)" class="w-cmd" />
		<input bind:value={args} placeholder="Argumen (mis. --experimental-acp)" class="w-args" />
		<input bind:value={maxConcurrency} type="number" min="1" class="w-conc" title="Batas konkurensi" />
		<button class="primary" type="submit" disabled={busy}>Tambah</button>
	</form>
	<p class="hint">
		Harness apa pun yang bicara ACP bisa didaftarkan: <code>gemini --experimental-acp</code>,
		<code>opencode acp</code>, adapter Claude Code, Goose, dan lainnya. Handshake <code>initialize</code>
		untuk mengisi capability map berjalan saat agent diaktifkan (Fase 5).
	</p>
</section>

<div class="grid">
	{#each data.agents as agent (agent.id)}
		<section class="panel agent">
			<div class="row">
				<strong>{agent.name}</strong>
				<span class="pill {HEALTH_LABELS[agent.health]?.cls ?? ''}">
					{HEALTH_LABELS[agent.health]?.label ?? agent.health}
				</span>
				{#if !agent.enabled}<span class="pill muted">nonaktif</span>{/if}
				<span class="spacer"></span>
				{#if !agent.runnable && agent.enabled}<span class="pill warn">tidak bisa dipakai</span>{/if}
			</div>

			<div class="cmd mono tiny">{agent.command} {agent.args.join(' ')}</div>

			<div class="row tiny">
				<span class="faint">run</span><span>{agent.runCount}</span>
				<span class="faint">·</span>
				<span class="faint">diperiksa</span>
				<span>{agent.lastCheckedAt ? new Date(agent.lastCheckedAt).toLocaleString('id-ID') : 'belum'}</span>
			</div>

			<div class="caps">
				{#if agent.capabilities}
					{#each capabilitySummary(agent) as line}
						<div class="mono tiny">{line}</div>
					{/each}
				{:else}
					<p class="hint">Capability map belum ada — diisi dari hasil handshake.</p>
				{/if}
			</div>

			<div class="row wrap">
				<button
					class="small"
					disabled={busy}
					onclick={() => run('toggle', { id: agent.id, enabled: agent.enabled ? 'false' : 'true' })}
				>
					{agent.enabled ? 'Nonaktifkan' : 'Aktifkan'}
				</button>
				{#if agent.runCount === 0}
					<button
						class="small danger"
						disabled={busy}
						onclick={() => run('remove', { id: agent.id }, `Hapus agent ${agent.name}?`)}
					>
						Hapus
					</button>
				{:else}
					<span class="tiny faint">tidak bisa dihapus (punya riwayat run)</span>
				{/if}
			</div>
		</section>
	{/each}
</div>

{#if data.agents.length === 0}
	<div class="empty-state">
		<p>Belum ada agent terdaftar.</p>
		<p class="hint">Tanpa agent, card tidak bisa dipindahkan ke In Progress — guard transisi menolaknya.</p>
	</div>
{/if}

<style>
	.head {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}
	.panel {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 0.85rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 0.75rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(24rem, 1fr));
		gap: 0.75rem;
	}
	.agent {
		margin-bottom: 0;
	}
	.w-name {
		width: 14rem;
	}
	.w-cmd {
		width: 12rem;
	}
	.w-args {
		flex: 1;
		min-width: 12rem;
	}
	.w-conc {
		width: 5rem;
	}
	.cmd {
		color: var(--text-muted);
		word-break: break-all;
	}
	.caps {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: 0.5rem;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		min-height: 2.5rem;
	}
	.pill {
		font-size: 0.72rem;
		padding: 0.1rem 0.45rem;
		border-radius: 999px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		color: var(--text-muted);
	}
	.pill.warn {
		background: var(--warn-soft);
		border-color: #4a3c1c;
		color: var(--warn);
	}
	.pill.danger {
		background: var(--danger-soft);
		border-color: #5a2a2a;
		color: #ff9a9a;
	}
	.pill.muted {
		color: var(--text-faint);
	}
	.banner {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		margin: 0.75rem 0;
		padding: 0.5rem 0.7rem;
		background: var(--danger-soft);
		border: 1px solid #5a2a2a;
		border-radius: var(--radius);
	}
	.empty-state {
		padding: 1.5rem;
		border: 1px dashed var(--border-strong);
		border-radius: var(--radius-lg);
		text-align: center;
	}
</style>
