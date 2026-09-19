<script lang="ts">
	import { submitAction } from '$lib/client/action.js';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let errorMessage = $state<string | null>(null);
	let saved = $state(false);
	let busy = $state(false);

	let globalWipLimit = $state(untrack(() => String(data.settings.globalWipLimit)));
	let logRetentionDays = $state(untrack(() => String(data.settings.logRetentionDays)));

	async function save(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		busy = true;
		const result = await submitAction('save', { globalWipLimit, logRetentionDays });
		errorMessage = result.ok ? null : (result.error ?? null);
		saved = result.ok;
		busy = false;
	}
</script>

<div class="head">
	<h1>Settings</h1>
</div>

{#if errorMessage}
	<div class="banner error-text">
		{errorMessage}
		<button class="ghost small" onclick={() => (errorMessage = null)}>tutup</button>
	</div>
{/if}
{#if saved}<p class="ok-text">Tersimpan.</p>{/if}

<div class="layout">
	<section class="panel">
		<h2>Batasan</h2>
		<form class="col" onsubmit={save}>
			<label>
				WIP limit global
				<input bind:value={globalWipLimit} type="number" min="1" />
			</label>
			<p class="hint">
				Batas jumlah card berjalan bersamaan di seluruh project. Batas project bisa lebih ketat lewat
				setting project; batas agent lewat halaman Agents. Card mengantre FIFO bila penuh, kecuali run
				<code>resolve-conflict</code> yang didahulukan.
			</p>

			<label>
				Retensi log mentah (hari)
				<input bind:value={logRetentionDays} type="number" min="0" />
			</label>
			<p class="hint">Log stdout/stderr mentah per run — satu-satunya petunjuk saat agent crash.</p>

			<button class="primary" type="submit" disabled={busy} style="align-self: flex-start">Simpan</button>
		</form>
	</section>

	<section class="panel">
		<h2>Lokasi data</h2>
		<div class="kv">
			<div><span class="faint">data dir</span><span class="mono tiny">{data.paths.dataDir}</span></div>
			<div><span class="faint">database</span><span class="mono tiny">{data.paths.dbPath}</span></div>
			<div><span class="faint">worktree</span><span class="mono tiny">{data.paths.worktreesDir}</span></div>
			<div><span class="faint">log</span><span class="mono tiny">{data.paths.logsDir}</span></div>
			<div><span class="faint">lock</span><span class="mono tiny">{data.paths.lockPath}</span></div>
		</div>
		<p class="hint">
			Ubah lewat env <code>AGENT_O_DATA_DIR</code> atau <code>AGENT_O_DB_PATH</code> (lihat
			<code>.env.example</code>).
		</p>
	</section>

	<section class="panel">
		<h2>Runtime</h2>
		<div class="kv">
			<div><span class="faint">node</span><span class="mono tiny">{data.runtime.nodeVersion}</span></div>
			<div><span class="faint">platform</span><span class="mono tiny">{data.runtime.platform}</span></div>
			<div><span class="faint">pid</span><span class="mono tiny">{data.runtime.pid}</span></div>
			<div>
				<span class="faint">migrasi</span>
				<span class="mono tiny">{data.runtime.migrationsApplied}/{data.runtime.migrationsTotal} diterapkan</span>
			</div>
		</div>
		<p class="hint">
			Hanya satu instance boleh memakai satu database; instance kedua menolak start dengan pesan lock.
		</p>
	</section>
</div>

<style>
	.head {
		margin-bottom: 1rem;
	}
	.layout {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(22rem, 1fr));
		gap: 0.75rem;
		align-items: start;
	}
	.panel {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 0.9rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
	}
	.kv {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}
	.kv > div {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		border-bottom: 1px solid var(--bg-inset);
		padding-bottom: 0.25rem;
	}
	.kv span:last-child {
		text-align: right;
		word-break: break-all;
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
</style>
