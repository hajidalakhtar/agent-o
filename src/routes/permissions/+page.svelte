<script lang="ts">
	import { callAction, submitAction } from '$lib/client/action.js';
	import { untrack } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let errorMessage = $state<string | null>(null);
	let busy = $state(false);

	let simCategory = $state(untrack(() => data.categories[0]?.id ?? 'fs_read_internal'));
	let simProject = $state('');
	let simulation = $state<{ label: string; decision: string; source: string; forced: boolean; reason?: string } | null>(
		null
	);

	let newName = $state('');
	let newScope = $state<'global' | 'project'>('global');
	let newScopeId = $state('');

	async function run(action: string, fields: Record<string, string>, confirm?: string) {
		if (busy) return;
		busy = true;
		const result = await submitAction(action, fields, { confirm });
		errorMessage = result.ok ? null : (result.error ?? null);
		busy = false;
	}

	async function addPolicy(event: SubmitEvent) {
		event.preventDefault();
		const result = await submitAction('create', { name: newName, scope: newScope, scopeId: newScopeId });
		if (result.ok) {
			newName = '';
			errorMessage = null;
		} else {
			errorMessage = result.error ?? null;
		}
	}

	async function simulate(event: SubmitEvent) {
		event.preventDefault();
		const result = await callAction('simulate', { category: simCategory, projectId: simProject });
		if (result.ok && result.data?.simulation) {
			simulation = result.data.simulation as typeof simulation;
			errorMessage = null;
		} else {
			errorMessage = result.error ?? null;
		}
	}

	function decisionFor(policy: PageData['policies'][number], category: string): string {
		return policy.rules.find((rule) => rule.category === category)?.decision ?? '';
	}

	function scopeLabel(policy: PageData['policies'][number]): string {
		if (policy.scope === 'global') return 'global';
		const project = data.projects.find((item) => item.id === policy.scopeId);
		return `${policy.scope}: ${project?.name ?? policy.scopeId ?? '—'}`;
	}
</script>

<div class="head">
	<h1>Permissions</h1>
	<span class="spacer"></span>
	<span class="tiny faint">default policy: {data.defaultPolicyId ? 'diset' : 'belum diset'}</span>
</div>

{#if errorMessage}
	<div class="banner error-text">
		{errorMessage}
		<button class="ghost small" onclick={() => (errorMessage = null)}>tutup</button>
	</div>
{/if}

<div class="layout">
	<div>
		<section class="panel">
			<h2>Ditentukan urutan ini</h2>
			<p class="small">
				<code>card override → project override → global setting → default sistem</code>. Yang pertama cocok
				menang (PERM-03). Keputusan bisa <code>allow</code>, <code>deny</code>, atau <code>ask</code>.
			</p>
			<p class="small">
				Kategori berikut <strong>selalu ditolak</strong> dan tidak bisa dinaikkan policy apa pun
				(PERM-08, PERM-09): {data.categories.filter((item) => item.forced).map((item) => item.id).join(', ')}.
			</p>
		</section>

		{#each data.policies as policy (policy.id)}
			<section class="panel">
				<div class="row">
					<strong>{policy.name}</strong>
					<span class="pill">{scopeLabel(policy)}</span>
					{#if data.defaultPolicyId === policy.id}<span class="pill ok">default</span>{/if}
					<span class="spacer"></span>
					<button
						class="small ghost"
						disabled={busy}
						onclick={() => run('setDefault', { id: policy.id })}
					>
						Jadikan default
					</button>
					<button
						class="small danger"
						disabled={busy}
						onclick={() => run('remove', { id: policy.id }, `Hapus policy ${policy.name}?`)}
					>
						Hapus
					</button>
				</div>

				<div class="rules">
					{#each data.categories as category (category.id)}
						<div class="rule">
							<span class="small">{category.label}</span>
							<select
								name={`rule_${category.id}`}
								form={`form-${policy.id}`}
								disabled={category.forced}
								value={category.forced ? 'deny' : decisionFor(policy, category.id)}
							>
								<option value="">default sistem ({category.systemDefault})</option>
								<option value="allow">allow</option>
								<option value="deny">deny</option>
								<option value="ask">ask</option>
							</select>
							{#if category.forced}<span class="tiny faint">selalu ditolak</span>{/if}
						</div>
					{/each}
				</div>
			</section>
		{/each}

		<section class="panel">
			<h2>Policy baru</h2>
			<form class="row wrap" onsubmit={addPolicy}>
				<input bind:value={newName} placeholder="Nama policy" class="w-name" />
				<select bind:value={newScope} class="w-scope">
					<option value="global">global</option>
					<option value="project">project</option>
				</select>
				{#if newScope === 'project'}
					<select bind:value={newScopeId} class="w-scope">
						<option value="">— pilih project —</option>
						{#each data.projects as project (project.id)}
							<option value={project.id}>{project.name}</option>
						{/each}
					</select>
				{/if}
				<button class="primary" type="submit" disabled={busy}>Buat</button>
			</form>
			<p class="hint">Policy global default dipakai bila tidak ada policy project/card yang cocok.</p>
		</section>
	</div>

	<aside>
		<section class="panel">
			<h2>Uji coba policy</h2>
			<form class="col" onsubmit={simulate}>
				<label>
					Kategori
					<select bind:value={simCategory}>
						{#each data.categories as category (category.id)}
							<option value={category.id}>{category.label}</option>
						{/each}
					</select>
				</label>
				<label>
					Project (opsional)
					<select bind:value={simProject}>
						<option value="">— tidak ada —</option>
						{#each data.projects as project (project.id)}
							<option value={project.id}>{project.name}</option>
						{/each}
					</select>
				</label>
				<button class="primary" type="submit" disabled={busy}>Simulasikan</button>
			</form>

			{#if simulation}
				<div class="sim-result">
					<div class="row">
						<span class="pill {simulation.decision === 'allow' ? 'ok' : simulation.decision === 'ask' ? 'warn' : 'danger'}">
							{simulation.decision}
						</span>
						<span class="tiny faint">dari {simulation.source}</span>
					</div>
					<p class="small">{simulation.label}</p>
					{#if simulation.forced}<p class="tiny warn-text">Dipaksa sistem, tidak bisa diubah policy.</p>{/if}
					{#if simulation.reason}<p class="tiny faint">{simulation.reason}</p>{/if}
				</div>
			{/if}
		</section>

		<section class="panel">
			<h2>Cakupan penegakan</h2>
			<p class="hint">
				Setiap operasi file dan terminal yang diminta agent diklasifikasi lalu dievaluasi policy.
				Penegakan terjadi di sisi agent-o (agent-o yang menyediakan <code>fs/*</code> dan
				<code>terminal/*</code>), bukan bergantung kepatuhan agent. Audit per card muncul di tab
				&ldquo;Audit izin&rdquo; pada halaman card.
			</p>
			<p class="hint">Enforcement runtime menyusul di Fase 2 (baseline) dan Fase 6 (lengkap).</p>
		</section>
	</aside>
</div>

{#each data.policies as policy (policy.id)}
	<form
		id={`form-${policy.id}`}
		method="POST"
		action="?/saveRules"
		onsubmit={(event) => {
			event.preventDefault();
			const form = event.currentTarget as HTMLFormElement;
			const fields: Record<string, string> = { id: policy.id };
			for (const [key, value] of new FormData(form).entries()) fields[key] = String(value);
			run('saveRules', fields);
		}}
	></form>
{/each}

<style>
	.head {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(18rem, 1fr);
		gap: 1rem;
		align-items: start;
	}
	@media (max-width: 1000px) {
		.layout {
			grid-template-columns: 1fr;
		}
	}
	.panel {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 0.85rem;
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		margin-bottom: 0.75rem;
	}
	.rules {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr));
		gap: 0.35rem;
	}
	.rule {
		display: grid;
		grid-template-columns: 1fr 9rem auto;
		gap: 0.4rem;
		align-items: center;
	}
	.pill {
		font-size: 0.72rem;
		padding: 0.1rem 0.45rem;
		border-radius: 999px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		color: var(--text-muted);
	}
	.pill.ok {
		background: var(--success-soft);
		border-color: #2a4a35;
		color: #8fe3a8;
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
	.w-name {
		width: 14rem;
	}
	.w-scope {
		width: 12rem;
	}
	.sim-result {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding: 0.6rem;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		border-radius: var(--radius);
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
	.warn-text {
		color: var(--warn);
	}
</style>
