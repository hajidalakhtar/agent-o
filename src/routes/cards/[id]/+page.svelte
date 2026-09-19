<script lang="ts">
	import { submitAction } from '$lib/client/action.js';
	import {
		appendThreadItem,
		eventToThreadItem,
		type ThreadEventInput,
		type ThreadItem
	} from '$lib/shared/thread.js';
	import { untrack, onMount } from 'svelte';
	import type { PageData } from './$types';
	import {
		ArrowLeft,
		Send,
		Paperclip,
		Bot,
		GitBranch,
		Check,
		Clock,
		ShieldAlert,
		Activity,
		Terminal,
		Wrench
	} from '@lucide/svelte';

	let { data }: { data: PageData } = $props();

	let tab = $state<'thread' | 'review' | 'runs' | 'audit'>('thread');
	let errorMessage = $state<string | null>(null);
	let busy = $state(false);

	let title = $state(untrack(() => data.card.title));
	let instruction = $state(untrack(() => data.card.instruction));
	let agentId = $state(untrack(() => data.card.agentId ?? ''));

	let replyText = $state('');

	let live = $state<ThreadItem[]>([]);
	const seen = new Set<string>();

	onMount(() => {
		const source = new EventSource(`/api/cards/${data.card.id}/events`);
		source.onmessage = (message) => {
			const event = JSON.parse(message.data) as ThreadEventInput;
			if (seen.has(event.id)) return;
			seen.add(event.id);
			if (data.thread.some((item) => item.id === event.id)) return;
			const item = eventToThreadItem(event);
			if (!item) return;
			live = appendThreadItem(live, item);
		};
		return () => source.close();
	});

	const timeline = $derived.by(() =>
		[...data.thread, ...live]
			.sort((a, b) => a.createdAt - b.createdAt)
			.reduce<ThreadItem[]>((items, item) => appendThreadItem(items, item), [])
	);

	const STATUS_LABELS: Record<string, { label: string; dot: string; bg: string; text: string }> = {
		backlog: { label: 'To do', dot: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700' },
		in_progress: { label: 'In Progress', dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700' },
		blocked: { label: 'Blocked', dot: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-700' },
		in_review: { label: 'In Review', dot: 'bg-purple-500', bg: 'bg-purple-50', text: 'text-purple-700' },
		done: { label: 'Done', dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' }
	};

	async function run(action: string, fields: Record<string, string>, confirm?: string) {
		if (busy) return;
		busy = true;
		const result = await submitAction(action, fields, { confirm });
		errorMessage = result.ok ? null : result.error ?? null;
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

<div class="h-full flex flex-col overflow-hidden bg-[#fafafa]">
	<!-- Top Bar / Breadcrumbs -->
	<div
		class="h-11 px-6 border-b border-neutral-200 bg-white flex items-center justify-between shrink-0 select-none"
	>
		<a
			href={`/projects/${data.project.id}`}
			class="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-900 font-medium transition-colors"
		>
			<ArrowLeft class="w-3.5 h-3.5" />
			<span>{data.project.name}</span>
		</a>

		<div class="flex items-center gap-2">
			<span
				class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium {STATUS_LABELS[data.card.status]?.bg ?? 'bg-neutral-100'} {STATUS_LABELS[data.card.status]?.text ?? 'text-neutral-700'}"
			>
				<span
					class="w-1.5 h-1.5 rounded-full {STATUS_LABELS[data.card.status]?.dot ?? 'bg-neutral-400'}"
				></span>
				{STATUS_LABELS[data.card.status]?.label ?? data.card.status}
			</span>

			{#if data.queuePosition > 0}
				<span class="px-2 py-0.5 rounded-md text-xs bg-amber-50 text-amber-700 font-medium">
					antrean #{data.queuePosition}
				</span>
			{/if}
		</div>
	</div>

	<!-- Error Alert -->
	{#if errorMessage}
		<div
			class="px-6 py-2 bg-rose-50 border-b border-rose-200 text-rose-700 text-xs flex items-center justify-between"
		>
			<span>{errorMessage}</span>
			<button class="font-medium underline hover:text-rose-950" onclick={() => (errorMessage = null)}>
				tutup
			</button>
		</div>
	{/if}

	<!-- Main Body Layout -->
	<div class="flex-1 overflow-hidden flex divide-x divide-neutral-200">
		<!-- Left Main Content Column -->
		<div class="flex-1 overflow-y-auto p-6 space-y-6">
			<!-- Title & Status Header -->
			<div class="space-y-1">
				<h1 class="text-xl font-bold text-neutral-900 tracking-tight">
					{data.card.title}
				</h1>
				<p class="text-xs text-neutral-400 font-mono">
					ID: {data.card.id}
				</p>
			</div>

			<!-- Navigation Tabs -->
			<div class="flex items-center gap-1 border-b border-neutral-200 pb-2">
				{#each [{ id: 'thread', label: 'Thread' }, { id: 'review', label: 'Review' }, { id: 'runs', label: 'Runs' }, { id: 'audit', label: 'Audit Izin' }] as item (item.id)}
					<button
						type="button"
						class="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors {tab ===
						item.id
							? 'bg-neutral-900 text-white'
							: 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'}"
						onclick={() => (tab = item.id as typeof tab)}
					>
						{item.label}
					</button>
				{/each}
			</div>

			<!-- Tab 1: Thread -->
			{#if tab === 'thread'}
				<div class="space-y-4 max-w-2xl">
					<div class="space-y-3">
						{#each timeline as item (item.id)}
							{#if item.kind === 'message'}
								<div
									class="rounded-lg border p-3 text-xs {item.role === 'user'
										? 'bg-white border-neutral-200'
										: item.role === 'system'
											? 'bg-amber-50/60 border-amber-200/70'
											: 'bg-sky-50/50 border-sky-200/80'}"
								>
									<div class="flex items-center justify-between mb-1">
										<span class="font-semibold text-neutral-800 capitalize">{item.role}</span>
										<span class="text-[11px] text-neutral-400">{formatTime(item.createdAt)}</span>
									</div>
									<p class="text-neutral-700 whitespace-pre-wrap">{item.content}</p>
								</div>
							{:else if item.kind === 'thought'}
								<details class="pl-2 text-[11px] text-neutral-500">
									<summary class="cursor-pointer select-none hover:text-neutral-700">
										Thinking · {formatTime(item.createdAt)}
									</summary>
									<p class="mt-1 whitespace-pre-wrap text-neutral-500">{item.content}</p>
								</details>
							{:else if item.kind === 'tool'}
								<div class="flex items-center gap-2 text-[11px] pl-2">
									<Wrench class="w-3 h-3 text-neutral-400 shrink-0" />
									<span class="text-neutral-600 truncate">{item.title}</span>
									<span
										class="px-1.5 py-0.5 rounded border text-[10px] shrink-0 {item.status === 'completed'
											? 'border-emerald-200 text-emerald-700 bg-emerald-50'
											: item.status === 'failed'
												? 'border-rose-200 text-rose-700 bg-rose-50'
												: 'border-neutral-200 text-neutral-500'}"
									>
										{item.status}
									</span>
								</div>
							{:else if item.kind === 'plan'}
								<div class="rounded-lg border border-neutral-200 bg-white p-3 text-xs space-y-1.5">
									<div class="font-semibold text-neutral-500 text-[10px] uppercase tracking-wide">
										Rencana agent
									</div>
									{#each item.entries as entry, index (index)}
										<div class="flex items-start gap-2 text-neutral-600">
											<span
												class="w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 {entry.status === 'completed'
													? 'bg-emerald-500'
													: entry.status === 'in_progress'
														? 'bg-amber-500'
														: 'bg-neutral-300'}"
											></span>
											<span>{entry.content}</span>
										</div>
									{/each}
								</div>
							{:else if item.kind === 'completion'}
								<div
									class="rounded-lg border p-3 text-xs {item.status === 'in_review' || item.status === 'done'
										? 'bg-emerald-50 border-emerald-200'
										: 'bg-rose-50/70 border-rose-200'}"
								>
									<div class="flex items-center gap-2 mb-1">
										<span class="font-semibold {item.status === 'in_review' || item.status === 'done'
											? 'text-emerald-800'
											: 'text-rose-800'}">
											{item.status === 'in_review' || item.status === 'done'
												? 'Agent melapor selesai'
												: `Agent berhenti (${item.status})`}
										</span>
										{#if item.inferred}
											<span
												class="px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-700 text-[10px]"
											>
												belum terverifikasi
											</span>
										{/if}
										<span class="ml-auto text-[11px] text-neutral-400">{formatTime(item.createdAt)}</span>
									</div>
									<p class="text-neutral-700 whitespace-pre-wrap">{item.reason}</p>
								</div>
							{:else}
								<div class="flex items-center gap-2 text-[11px] text-neutral-400 pl-2">
									<Clock class="w-3 h-3 text-neutral-400 shrink-0" />
									<span class="font-mono">{formatTime(item.createdAt)}</span>
									<span>·</span>
									<span class="text-neutral-600">{item.content}</span>
								</div>
							{/if}
						{/each}

						{#if timeline.length === 0}
							<div class="p-8 text-center text-xs text-neutral-400 border border-dashed rounded-lg">
								Belum ada aktivitas di thread ini.
							</div>
						{/if}
					</div>

					<!-- Reply Box -->
					<div class="rounded-lg border border-neutral-200 bg-white p-3 space-y-2">
						<textarea
							bind:value={replyText}
							rows="3"
							placeholder="Tulis jawaban / catatan untuk agent..."
							class="w-full text-xs text-neutral-800 placeholder-neutral-400 border-0 p-0 focus:outline-none focus:ring-0 resize-none"
						></textarea>
						<div class="flex items-center justify-end pt-2 border-t border-neutral-100">
							<button
								type="button"
								class="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-40"
								disabled={busy || !replyText.trim()}
								onclick={sendReply}
							>
								<Send class="w-3 h-3" />
								<span>Kirim</span>
							</button>
						</div>
					</div>
				</div>
			{/if}

			<!-- Tab 2: Review -->
			{#if tab === 'review'}
				<div class="space-y-4 max-w-2xl text-xs">
					{#if data.worktree}
						<div class="rounded-lg border border-neutral-200 bg-white p-4 space-y-2 font-mono">
							<div class="flex justify-between py-1 border-b border-neutral-100">
								<span class="text-neutral-400">branch:</span>
								<span class="font-semibold text-neutral-800">{data.worktree.branch}</span>
							</div>
							<div class="flex justify-between py-1 border-b border-neutral-100">
								<span class="text-neutral-400">base:</span>
								<span class="text-neutral-800">{data.worktree.base_sha?.slice(0, 10) ?? '—'}</span>
							</div>
							<div class="flex justify-between py-1 border-b border-neutral-100">
								<span class="text-neutral-400">head:</span>
								<span class="text-neutral-800">{data.worktree.head_sha?.slice(0, 10) ?? '—'}</span>
							</div>
							<div class="flex justify-between py-1">
								<span class="text-neutral-400">state:</span>
								<span class="text-neutral-800">{data.worktree.state}</span>
							</div>
						</div>
						<p class="text-[11px] text-neutral-400">
							Diff dari pasangan SHA beku akan tampil di sini. Modul review (freeze, batas ukuran diff, approve/reject) menyusul di Fase 3.
						</p>
					{:else}
						<div class="p-8 text-center text-neutral-400 border border-dashed rounded-lg">
							Belum ada worktree untuk card ini.
						</div>
					{/if}
				</div>
			{/if}

			<!-- Tab 3: Runs -->
			{#if tab === 'runs'}
				<div class="space-y-4 max-w-2xl text-xs">
					{#if data.runs.length === 0}
						<div class="p-8 text-center text-neutral-400 border border-dashed rounded-lg">
							Belum ada run eksekusi agent.
						</div>
					{:else}
						<div class="rounded-lg border border-neutral-200 overflow-hidden bg-white">
							<table class="w-full text-left">
								<thead class="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-medium">
									<tr>
										<th class="p-2.5">#</th>
										<th class="p-2.5">Jenis</th>
										<th class="p-2.5">Agent</th>
										<th class="p-2.5">Status</th>
										<th class="p-2.5">Stop Reason</th>
										<th class="p-2.5">Mulai</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-neutral-100 text-neutral-700">
									{#each data.runs as item (item.id)}
										<tr>
											<td class="p-2.5 font-mono">{item.attemptNo}</td>
											<td class="p-2.5">{item.kind}</td>
											<td class="p-2.5 font-mono text-[11px]">{item.agentId?.slice(0, 8) ?? '—'}</td>
											<td class="p-2.5">{item.status}</td>
											<td class="p-2.5 font-mono text-[11px]">{item.stopReason ?? '—'}</td>
											<td class="p-2.5 text-neutral-400 text-[11px]">{item.startedAt ? formatTime(item.startedAt) : '—'}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Tab 4: Audit -->
			{#if tab === 'audit'}
				<div class="space-y-4 max-w-2xl text-xs">
					{#if data.permissionAudit.length === 0}
						<div class="p-8 text-center text-neutral-400 border border-dashed rounded-lg">
							Belum ada catatan audit izin.
						</div>
					{:else}
						<div class="rounded-lg border border-neutral-200 overflow-hidden bg-white">
							<table class="w-full text-left">
								<thead class="bg-neutral-50 border-b border-neutral-200 text-neutral-500 font-medium">
									<tr>
										<th class="p-2.5">Waktu</th>
										<th class="p-2.5">Jenis</th>
										<th class="p-2.5">Kategori</th>
										<th class="p-2.5">Keputusan</th>
									</tr>
								</thead>
								<tbody class="divide-y divide-neutral-100 text-neutral-700">
									{#each data.permissionAudit as item (item.id)}
										<tr>
											<td class="p-2.5 text-neutral-400 text-[11px]">{formatTime(item.createdAt)}</td>
											<td class="p-2.5">{item.type}</td>
											<td class="p-2.5 font-mono text-[11px]">{item.payload.category ?? '—'}</td>
											<td class="p-2.5 font-medium">{item.payload.decision ?? '—'}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Right Properties Sidebar -->
		<aside class="w-80 shrink-0 bg-white p-5 space-y-6 overflow-y-auto">
			<!-- Detail Edit Section -->
			<section class="space-y-3">
				<h2 class="text-xs font-bold uppercase tracking-wider text-neutral-400">Detail Issue</h2>
				<div class="space-y-2">
					<div>
						<label for="detail-title" class="block text-[11px] font-medium text-neutral-500 mb-1">Judul</label>
						<input
							id="detail-title"
							type="text"
							bind:value={title}
							class="w-full text-xs border border-neutral-200 rounded-lg p-2 focus:ring-1 focus:ring-neutral-400 focus:outline-none"
						/>
					</div>
					<div>
						<label for="detail-instruction" class="block text-[11px] font-medium text-neutral-500 mb-1">Instruksi</label>
						<textarea
							id="detail-instruction"
							bind:value={instruction}
							rows="4"
							class="w-full text-xs border border-neutral-200 rounded-lg p-2 focus:ring-1 focus:ring-neutral-400 focus:outline-none resize-none"
						></textarea>
					</div>
					<button
						type="button"
						class="w-full py-1.5 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
						onclick={saveDetails}
						disabled={busy}
					>
						Simpan Detail
					</button>
				</div>
			</section>

			<hr class="border-neutral-100" />

			<!-- Agent Assignment Section -->
			<section class="space-y-3">
				<h2 class="text-xs font-bold uppercase tracking-wider text-neutral-400">Agent Harness</h2>
				<div class="space-y-2">
					<select
						bind:value={agentId}
						class="w-full border border-neutral-200 rounded-lg p-2 text-xs bg-white focus:ring-1 focus:ring-neutral-400 focus:outline-none"
					>
						<option value="">Default project agent</option>
						{#each data.agents as agent (agent.id)}
							<option value={agent.id} disabled={!agent.usable}>
								{agent.name}{agent.usable ? '' : ` (${agent.health})`}
							</option>
						{/each}
					</select>
					<button
						type="button"
						class="w-full py-1.5 border border-neutral-200 hover:bg-neutral-50 text-neutral-700 rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
						onclick={saveAgent}
						disabled={busy}
					>
						Terapkan Agent
					</button>
				</div>
			</section>

			<hr class="border-neutral-100" />

			<!-- State Machine Actions Section -->
			<section class="space-y-3">
				<h2 class="text-xs font-bold uppercase tracking-wider text-neutral-400">Transisi State</h2>
				<div class="space-y-1.5">
					{#each data.allowed as move (move.to)}
						<button
							type="button"
							class="w-full py-2 px-3 text-left border border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50 rounded-lg text-xs font-medium text-neutral-800 flex items-center justify-between transition-colors disabled:opacity-40"
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
							<span>Pindah ke {STATUS_LABELS[move.to]?.label ?? move.to}</span>
							<span class="text-neutral-400 font-mono text-[10px]">→</span>
						</button>
					{/each}
					{#if data.allowed.length === 0}
						<p class="text-xs text-neutral-400 italic">Tidak ada transisi tersedia.</p>
					{/if}
				</div>
			</section>
		</aside>
	</div>
</div>
