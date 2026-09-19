<script lang="ts">
	import { submitAction } from '$lib/client/action.js';
	import { untrack } from 'svelte';
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let tab = $state<'thread' | 'review' | 'runs' | 'audit'>('thread');
	let errorMessage = $state<string | null>(null);
	let busy = $state(false);

	let title = $state(untrack(() => data.card.title));
	let instruction = $state(untrack(() => data.card.instruction));
	let agentId = $state(untrack(() => data.card.agentId ?? ''));

	let replyText = $state('');

	let live = $state<{ id: string; kind: 'system'; type: string; content: string; createdAt: number }[]>([]);

	onMount(() => {
		const source = new EventSource(`/api/cards/${data.card.id}/events`);
		source.onmessage = (message) => {
			const event = JSON.parse(message.data) as { id: string; type: string; createdAt: number };
			if (data.thread.some((item) => item.id === event.id)) return;
			if (live.some((item) => item.id === event.id)) return;
			live.push({ id: event.id, kind: 'system', type: event.type, content: event.type, createdAt: event.createdAt });
		};
		return () => source.close();
	});

	const timeline = $derived([...data.thread, ...live].sort((a, b) => a.createdAt - b.createdAt));

	const STATUS_LABELS: Record<string, string> = {
		backlog: 'Backlog',
		in_progress: 'In Progress',
		blocked: 'Blocked',
		in_review: 'In Review',
		done: 'Done'
	};

	async function run(action: string, fields: Record<string, string>, confirm?: string) {
		if (busy) return;
		busy = true;
		const result = await submitAction(action, fields, { confirm });
		errorMessage = result.ok ? null : (result.error ?? null);
		busy = false;
	}

	async function saveDetails() {
		await run('update', { title, instruction });
	}

	async function saveAgent() {
		await run('assignAgent', { agentId });
	}

	async function sendReply() {
		if (!replyText.trim()) return;
		const result = await submitAction('reply', { content: replyText });
		if (result.ok) replyText = '';
		else errorMessage = result.error ?? null;
	}

	function formatTime(value: number): string {
		return new Date(value).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
	}
</script>

<p class="crumbs">
	<a href={`/projects/${data.project.id}`}>← {data.project.name}</a>
</p>

<div class="head">
	<h1>{data.card.title}</h1>
	<span class="pill">{STATUS_LABELS[data.card.status] ?? data.card.status}</span>
	{#if data.queuePosition > 0}<span class="pill warn">antrean #{data.queuePosition}</span>{/if}
</div>

{#if errorMessage}
	<div class="banner error-text">
		{errorMessage}
		<button class="ghost small" onclick={() => (errorMessage = null)}>tutup</button>
	</div>
{/if}

<div class="layout">
	<div class="main-col">
		<div class="tabs">
			{#each [{ id: 'thread', label: 'Thread' }, { id: 'review', label: 'Review' }, { id: 'runs', label: 'Runs' }, { id: 'audit', label: 'Audit izin' }] as item (item.id)}
				<button class="tab" class:active={tab === item.id} onclick={() => (tab = item.id as typeof tab)}>
					{item.label}
				</button>
			{/each}
		</div>

		{#if tab === 'thread'}
			<section>
				{#each timeline as item (item.id)}
					{#if item.kind === 'message'}
						<div class="msg {item.role}">
							<span class="who">{item.role}</span>
							<p>{item.content}</p>
						</div>
					{:else}
						<div class="system">
							<span class="mono tiny faint">{formatTime(item.createdAt)}</span>
							<span>{item.content}</span>
						</div>
					{/if}
				{/each}
				{#if timeline.length === 0}
					<p class="empty">Belum ada aktivitas.</p>
				{/if}

				<div class="reply">
					<textarea bind:value={replyText} rows="3" placeholder="Tulis jawaban / catatan untuk agent..."></textarea>
					<button class="primary" onclick={sendReply} disabled={busy || !replyText.trim()}>Kirim</button>
				</div>
			</section>
		{/if}

		{#if tab === 'review'}
			<section>
				{#if data.worktree}
					<div class="kv">
						<div><span class="faint">branch</span><span class="mono">{data.worktree.branch}</span></div>
						<div><span class="faint">base</span><span class="mono">{data.worktree.base_sha?.slice(0, 10) ?? '—'}</span></div>
						<div><span class="faint">head</span><span class="mono">{data.worktree.head_sha?.slice(0, 10) ?? '—'}</span></div>
						<div><span class="faint">state</span><span class="mono">{data.worktree.state}</span></div>
					</div>
					<p class="hint">
						Diff dari pasangan SHA beku akan tampil di sini. Modul review (freeze, batas ukuran diff,
						approve/reject) menyusul di Fase 3.
					</p>
				{:else}
					<div class="empty-state">
						<p>Belum ada worktree untuk card ini.</p>
						<p class="hint">
							Tab review terisi setelah card dijalankan: sistem membuat worktree + branch, lalu membekukan
							revisi saat card masuk In Review. Bergantung Fase 2 (worktree &amp; agent) dan Fase 3 (review).
						</p>
					</div>
				{/if}
			</section>
		{/if}

		{#if tab === 'runs'}
			<section>
				{#if data.runs.length === 0}
					<div class="empty-state">
						<p>Belum ada run.</p>
						<p class="hint">Run muncul setelah card digeser ke In Progress dan agent dijalankan.</p>
					</div>
				{:else}
					<table>
						<thead>
							<tr>
								<th>#</th><th>jenis</th><th>agent</th><th>status</th><th>stop reason</th><th>mulai</th>
							</tr>
						</thead>
						<tbody>
							{#each data.runs as item (item.id)}
								<tr>
									<td class="mono">{item.attemptNo}</td>
									<td>{item.kind}</td>
									<td class="mono tiny">{item.agentId?.slice(0, 8) ?? '—'}</td>
									<td>{item.status}</td>
									<td class="mono tiny">{item.stopReason ?? '—'}</td>
									<td class="tiny faint">{item.startedAt ? formatTime(item.startedAt) : '—'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</section>
		{/if}

		{#if tab === 'audit'}
			<section>
				{#if data.permissionAudit.length === 0}
					<div class="empty-state">
						<p>Belum ada catatan izin.</p>
						<p class="hint">
							Setiap operasi file dan terminal yang diminta agent dicatat di sini: kategori, target,
							keputusan, dan policy yang berlaku (Fase 2 baseline, lengkap di Fase 6).
						</p>
					</div>
				{:else}
					<table>
						<thead><tr><th>waktu</th><th>jenis</th><th>kategori</th><th>keputusan</th></tr></thead>
						<tbody>
							{#each data.permissionAudit as item (item.id)}
								<tr>
									<td class="tiny faint">{formatTime(item.createdAt)}</td>
									<td>{item.type}</td>
									<td class="mono tiny">{item.payload.category ?? '—'}</td>
									<td>{item.payload.decision ?? '—'}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				{/if}
			</section>
		{/if}
	</div>

	<aside>
		<section>
			<h2>Detail</h2>
			<label>Judul<input bind:value={title} /></label>
			<label>Instruksi<textarea bind:value={instruction} rows="5"></textarea></label>
			<button class="primary" onclick={saveDetails} disabled={busy}>Simpan</button>
		</section>

		<section>
			<h2>Agent</h2>
			<select bind:value={agentId}>
				<option value="">Default project</option>
				{#each data.agents as agent (agent.id)}
					<option value={agent.id} disabled={!agent.usable}>
						{agent.name}{agent.usable ? '' : ` (${agent.health})`}
					</option>
				{/each}
			</select>
			<button class="small" onclick={saveAgent} disabled={busy}>Terapkan</button>
			{#if data.agents.length === 0}
				<p class="hint">Belum ada agent terdaftar. Tambahkan di halaman <a href="/agents">Agents</a>.</p>
			{/if}
		</section>

		<section>
			<h2>Aksi</h2>
			<div class="col">
				{#each data.allowed as move (move.to)}
					<button
						disabled={busy}
						onclick={() => {
							if (move.to === 'deleted') {
								run('transition', { to: move.to, confirmed: 'true' }, 'Hapus card ini beserta riwayatnya?');
								return;
							}
							if (move.to === 'backlog' && data.card.status === 'in_review') {
								const feedback = prompt('Alasan reject (wajib):') ?? '';
								if (!feedback.trim()) return;
								run('transition', { to: move.to, feedback });
								return;
							}
							run('transition', { to: move.to });
						}}
					>
						→ {STATUS_LABELS[move.to] ?? move.to}
					</button>
				{/each}
				{#if data.allowed.length === 0}
					<p class="hint">Tidak ada aksi manual yang tersedia untuk status ini.</p>
				{/if}
			</div>
		</section>

		<section>
			<h2>Ringkasan</h2>
			<div class="kv">
				<div><span class="faint">dibuat</span><span class="tiny">{formatTime(data.card.createdAt)}</span></div>
				<div><span class="faint">diubah</span><span class="tiny">{formatTime(data.card.updatedAt)}</span></div>
				<div><span class="faint">run</span><span class="tiny">{data.runs.length}</span></div>
			</div>
		</section>
	</aside>
</div>

<style>
	.crumbs {
		margin: 0 0 0.5rem;
		font-size: 0.85rem;
	}
	.head {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		flex-wrap: wrap;
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
	.layout {
		display: grid;
		grid-template-columns: minmax(0, 2fr) minmax(16rem, 1fr);
		gap: 1rem;
		align-items: start;
		margin-top: 1rem;
	}
	@media (max-width: 1000px) {
		.layout {
			grid-template-columns: 1fr;
		}
	}
	.tabs {
		display: flex;
		gap: 0.2rem;
		border-bottom: 1px solid var(--border);
		margin-bottom: 0.75rem;
	}
	.tab {
		background: transparent;
		border: none;
		border-bottom: 2px solid transparent;
		border-radius: 0;
		color: var(--text-muted);
		padding: 0.45rem 0.7rem;
	}
	.tab:hover:not(:disabled) {
		background: transparent;
		color: var(--text);
	}
	.tab.active {
		color: var(--text);
		border-bottom-color: var(--accent);
	}
	section {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 0.85rem;
		margin-bottom: 0.9rem;
		display: flex;
		flex-direction: column;
		gap: 0.55rem;
	}
	.msg {
		border-left: 3px solid var(--border-strong);
		padding: 0.35rem 0.6rem;
	}
	.msg.user {
		border-color: var(--accent);
	}
	.msg.agent {
		border-color: var(--success);
	}
	.who {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--text-muted);
	}
	.msg p {
		margin: 0.2rem 0 0;
		white-space: pre-wrap;
	}
	.system {
		display: flex;
		gap: 0.5rem;
		font-size: 0.82rem;
		color: var(--text-muted);
		padding: 0.15rem 0;
	}
	.reply {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-top: 0.5rem;
		border-top: 1px solid var(--border);
		padding-top: 0.6rem;
	}
	.reply button {
		align-self: flex-start;
	}
	.empty {
		color: var(--text-faint);
		font-size: 0.8rem;
	}
	.empty-state {
		padding: 1rem;
		border: 1px dashed var(--border-strong);
		border-radius: var(--radius);
		text-align: center;
	}
	.empty-state p {
		margin: 0 0 0.35rem;
	}
	.kv {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
	}
	.kv > div {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.82rem;
	}
	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.82rem;
	}
	th {
		text-align: left;
		color: var(--text-muted);
		font-weight: 500;
		font-size: 0.72rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		padding: 0.3rem 0.4rem;
		border-bottom: 1px solid var(--border);
	}
	td {
		padding: 0.35rem 0.4rem;
		border-bottom: 1px solid var(--bg-inset);
	}
</style>
