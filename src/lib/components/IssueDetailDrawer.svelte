<script lang="ts">
	import { untrack } from 'svelte';
	import { Collapsible, DropdownMenu, Tooltip } from 'bits-ui';
	import type { ThreadItem } from '$lib/shared/thread.js';
	import {
		X,
		Link as LinkIcon,
		MoreHorizontal,
		Check,
		ChevronDown,
		ChevronRight,
		ArrowUp,
		Plus,
		Undo2,
		Redo2,
		Bold,
		Italic,
		Underline,
		Strikethrough,
		Code,
		List,
		ListOrdered,
		Paperclip,
		Send,
		Smile,
		Bot,
		GitBranch,
		ExternalLink,
		Trash2,
		Clock,
		Wrench
	} from '@lucide/svelte';

	interface CardData {
		id: string;
		projectId: string;
		title: string;
		instruction: string;
		status: string;
		agentId?: string | null;
		agentName?: string | null;
		effectiveAgentId?: string | null;
		queued?: number;
		allowed?: { to: string; trigger: string }[];
		issueKey?: string;
	}

	interface WorktreeData {
		path: string;
		branch: string;
		base_sha: string | null;
		head_sha: string | null;
		state: string;
	}

	let {
		card,
		agents = [],
		onClose,
		onTransition,
		onUpdateDetails,
		onAssignAgent,
		onAddComment,
		busy = false
	}: {
		card: CardData;
		agents?: { id: string; name: string; usable: boolean; health?: string }[];
		onClose: () => void;
		onTransition: (to: string, feedback?: string) => Promise<void>;
		onUpdateDetails: (title: string, instruction: string) => Promise<void>;
		onAssignAgent: (agentId: string) => Promise<void>;
		onAddComment: (content: string) => Promise<void>;
		busy?: boolean;
	} = $props();

	let title = $state('');
	let instruction = $state('');
	let selectedAgentId = $state('');
	let commentInput = $state('');
	let copiedLink = $state(false);

	let cardDetailsLoading = $state(false);
	let cardDetails = $state<{
		thread: ThreadItem[];
		worktree: WorktreeData | null;
		allowed: { to: string; trigger: string }[];
		running: boolean;
	} | null>(null);

	// Collapsible states
	let workspacesOpen = $state(true);
	let relationshipsOpen = $state(false);
	let subIssuesOpen = $state(false);
	let commentsOpen = $state(true);

	// Priority state
	let priority = $state<'high' | 'medium' | 'low'>('high');

	// Tags state
	let tags = $state<string[]>(['enhancement', 'ui']);

	const STATUS_CONFIG: Record<string, { label: string; dot: string; bg: string; text: string }> = {
		backlog: { label: 'To do', dot: 'bg-blue-500', bg: 'bg-blue-50', text: 'text-blue-700' },
		in_progress: { label: 'In progress', dot: 'bg-amber-500', bg: 'bg-amber-50', text: 'text-amber-700' },
		in_review: { label: 'In review', dot: 'bg-purple-500', bg: 'bg-purple-50', text: 'text-purple-700' },
		done: { label: 'Done', dot: 'bg-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700' },
		blocked: { label: 'Blocked', dot: 'bg-rose-500', bg: 'bg-rose-50', text: 'text-rose-700' }
	};

	$effect(() => {
		// When card changes, synchronize form state
		const currentCard = card;
		untrack(() => {
			title = currentCard.title;
			instruction = currentCard.instruction;
			selectedAgentId = currentCard.agentId ?? '';
			fetchCardDetails(currentCard.id);
		});
	});

	$effect(() => {
		// Saat agent berjalan, thread disegarkan berkala agar progres terlihat.
		if (!cardDetails?.running) return;
		const timer = setTimeout(() => fetchCardDetails(card.id), 2500);
		return () => clearTimeout(timer);
	});

	async function fetchCardDetails(id: string) {
		cardDetailsLoading = true;
		try {
			const res = await fetch(`/api/cards/${id}`);
			if (res.ok) {
				const data = await res.json();
				cardDetails = {
					thread: data.thread ?? [],
					worktree: data.worktree ?? null,
					allowed: data.allowed ?? [],
					running: data.running ?? false
				};
			}
		} catch {
			// ignore fetch error
		} finally {
			cardDetailsLoading = false;
		}
	}

	async function handleSaveDetails() {
		if (title === card.title && instruction === card.instruction) return;
		await onUpdateDetails(title, instruction);
	}

	async function handleAgentChange(newAgentId: string) {
		selectedAgentId = newAgentId;
		await onAssignAgent(newAgentId);
	}

	async function handleCommentSubmit() {
		if (!commentInput.trim() || busy) return;
		const text = commentInput.trim();
		commentInput = '';
		await onAddComment(text);
		await fetchCardDetails(card.id);
	}

	function copyIssueLink() {
		const url = `${window.location.origin}/cards/${card.id}`;
		navigator.clipboard.writeText(url);
		copiedLink = true;
		setTimeout(() => (copiedLink = false), 2000);
	}

	function formatTime(timestamp: number) {
		const diffMs = Date.now() - timestamp;
		const diffMin = Math.floor(diffMs / 60000);
		if (diffMin < 1) return 'just now';
		if (diffMin < 60) return `${diffMin}m ago`;
		const diffHours = Math.floor(diffMin / 60);
		if (diffHours < 24) return `${diffHours}h ago`;
		return new Date(timestamp).toLocaleDateString();
	}

	const allowedMoves = $derived(cardDetails?.allowed ?? card.allowed ?? []);
</script>

<aside
	class="w-[420px] lg:w-[460px] shrink-0 border-l border-neutral-200 bg-white flex flex-col h-full overflow-hidden shadow-[-4px_0_15px_rgba(0,0,0,0.02)] z-20"
	aria-label="Issue Details"
>
	<!-- Top Bar -->
	<div class="h-12 px-4 border-b border-neutral-200 flex items-center justify-between shrink-0 bg-white">
		<div class="flex items-center gap-2">
			<span class="text-xs font-mono font-semibold text-neutral-600 tracking-tight">
				{card.issueKey ?? `ISS-${card.id.slice(0, 4)}`}
			</span>
			<button
				type="button"
				class="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded transition-colors"
				title={copiedLink ? 'Copied!' : 'Copy issue link'}
				onclick={copyIssueLink}
			>
				{#if copiedLink}
					<Check class="w-3.5 h-3.5 text-emerald-600" />
				{:else}
					<LinkIcon class="w-3.5 h-3.5" />
				{/if}
			</button>
		</div>

		<div class="flex items-center gap-1">
			<!-- More actions menu -->
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					class="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded transition-colors"
				>
					<MoreHorizontal class="w-4 h-4" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Portal>
					<DropdownMenu.Content
						class="w-48 bg-white rounded-lg shadow-lg border border-neutral-200 p-1 text-xs text-neutral-700 z-50 animate-in fade-in-50 zoom-in-95"
					>
						<DropdownMenu.Item
							class="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-neutral-100 cursor-pointer outline-none"
							onSelect={() => window.open(`/cards/${card.id}`, '_blank')}
						>
							<ExternalLink class="w-3.5 h-3.5 text-neutral-400" />
							Buka halaman terpisah
						</DropdownMenu.Item>
						<DropdownMenu.Item
							class="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-neutral-100 cursor-pointer outline-none"
							onSelect={copyIssueLink}
						>
							<LinkIcon class="w-3.5 h-3.5 text-neutral-400" />
							Salin link card
						</DropdownMenu.Item>
						<DropdownMenu.Separator class="h-px bg-neutral-100 my-1" />
						<DropdownMenu.Item
							class="flex items-center gap-2 px-2.5 py-1.5 rounded-md hover:bg-rose-50 text-rose-600 cursor-pointer outline-none"
							onSelect={() => onTransition('deleted')}
						>
							<Trash2 class="w-3.5 h-3.5 text-rose-500" />
							Hapus issue
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>

			<!-- Close button -->
			<button
				type="button"
				class="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded transition-colors"
				title="Close detail panel"
				onclick={onClose}
			>
				<X class="w-4 h-4" />
			</button>
		</div>
	</div>

	<!-- Scrollable Content -->
	<div class="flex-1 overflow-y-auto p-4 space-y-4">
		<!-- Properties Badges Row -->
		<div class="flex flex-wrap items-center gap-1.5 text-xs">
			<!-- Status Dropdown -->
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-neutral-100 hover:bg-neutral-200/80 text-neutral-700 font-medium transition-colors cursor-pointer"
				>
					<span
						class="w-2 h-2 rounded-full {STATUS_CONFIG[card.status]?.dot ?? 'bg-neutral-400'}"
					></span>
					<span>{STATUS_CONFIG[card.status]?.label ?? card.status}</span>
					<ChevronDown class="w-3 h-3 text-neutral-400 ml-0.5" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Portal>
					<DropdownMenu.Content
						class="w-44 bg-white rounded-lg shadow-lg border border-neutral-200 p-1 text-xs text-neutral-700 z-50"
					>
						{#each allowedMoves as move (move.to)}
							<DropdownMenu.Item
								class="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-neutral-100 cursor-pointer outline-none"
								onSelect={() => {
									if (move.to === 'backlog' && card.status === 'in_review') {
										const feedback = prompt('Alasan reject (wajib):');
										if (!feedback?.trim()) return;
										onTransition(move.to, feedback);
										return;
									}
									onTransition(move.to);
								}}
							>
								<span
									class="w-2 h-2 rounded-full {STATUS_CONFIG[move.to]?.dot ?? 'bg-neutral-400'}"
								></span>
								<span>Pindah ke {STATUS_CONFIG[move.to]?.label ?? move.to}</span>
							</DropdownMenu.Item>
						{/each}
						{#if allowedMoves.length === 0}
							<div class="px-2 py-1.5 text-neutral-400 italic">Tidak ada transisi tersedia</div>
						{/if}
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>

			<!-- Priority Dropdown -->
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					class="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-neutral-100 hover:bg-neutral-200/80 text-neutral-700 font-medium transition-colors cursor-pointer"
				>
					<ArrowUp class="w-3 h-3 text-amber-600" />
					<span class="capitalize">{priority}</span>
					<ChevronDown class="w-3 h-3 text-neutral-400 ml-0.5" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Portal>
					<DropdownMenu.Content
						class="w-32 bg-white rounded-lg shadow-lg border border-neutral-200 p-1 text-xs text-neutral-700 z-50"
					>
						{#each ['urgent', 'high', 'medium', 'low'] as p}
							<DropdownMenu.Item
								class="px-2 py-1.5 rounded-md hover:bg-neutral-100 cursor-pointer outline-none capitalize flex items-center justify-between"
								onSelect={() => (priority = p as any)}
							>
								<span>{p}</span>
								{#if priority === p}<Check class="w-3 h-3 text-neutral-700" />{/if}
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>

			<!-- Assignee / Creator Badge -->
			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					class="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-neutral-100 hover:bg-neutral-200/80 text-neutral-700 transition-colors cursor-pointer"
				>
					<div
						class="w-4 h-4 rounded-full bg-neutral-800 text-white flex items-center justify-center text-[9px] font-bold"
					>
						E
					</div>
					<span class="truncate max-w-[120px]">
						{card.agentName ? card.agentName : 'Created by Ethan'}
					</span>
					<ChevronDown class="w-3 h-3 text-neutral-400" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Portal>
					<DropdownMenu.Content
						class="w-56 bg-white rounded-lg shadow-lg border border-neutral-200 p-1 text-xs text-neutral-700 z-50"
					>
						<div class="px-2 py-1 font-semibold text-neutral-400 uppercase text-[10px]">
							Pilih Agent Harness
						</div>
						<DropdownMenu.Item
							class="px-2 py-1.5 rounded-md hover:bg-neutral-100 cursor-pointer outline-none flex items-center justify-between"
							onSelect={() => handleAgentChange('')}
						>
							<span>Default project agent</span>
							{#if !selectedAgentId}<Check class="w-3 h-3 text-neutral-700" />{/if}
						</DropdownMenu.Item>
						{#each agents as agent (agent.id)}
							<DropdownMenu.Item
								class="px-2 py-1.5 rounded-md hover:bg-neutral-100 cursor-pointer outline-none flex items-center justify-between"
								disabled={!agent.usable}
								onSelect={() => handleAgentChange(agent.id)}
							>
								<div class="flex items-center gap-1.5">
									<Bot class="w-3.5 h-3.5 text-neutral-500" />
									<span>{agent.name}</span>
								</div>
								{#if selectedAgentId === agent.id}<Check class="w-3 h-3 text-neutral-700" />{/if}
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Portal>
			</DropdownMenu.Root>

			<!-- Tags List -->
			{#each tags as tag}
				<span
					class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium {tag ===
					'ui'
						? 'bg-purple-50 text-purple-700 border border-purple-200/60'
						: 'bg-slate-100 text-slate-700 border border-slate-200/60'}"
				>
					<span
						class="w-1.5 h-1.5 rounded-full {tag === 'ui' ? 'bg-purple-500' : 'bg-slate-500'}"
					></span>
					{tag}
				</span>
			{/each}

			<button
				type="button"
				class="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded transition-colors"
				title="Add tag"
				onclick={() => {
					const newTag = prompt('Nama tag baru:');
					if (newTag?.trim() && !tags.includes(newTag.trim())) {
						tags = [...tags, newTag.trim()];
					}
				}}
			>
				<Plus class="w-3.5 h-3.5" />
			</button>
		</div>

		<!-- Title Input -->
		<div>
			<input
				type="text"
				bind:value={title}
				onblur={handleSaveDetails}
				onkeydown={(e) => e.key === 'Enter' && handleSaveDetails()}
				placeholder="Add dark mode support"
				class="w-full text-base font-bold text-neutral-900 border-0 p-0 focus:ring-0 focus:outline-none placeholder-neutral-300 tracking-tight"
			/>
		</div>

		<!-- Description / Instruction Input -->
		<div class="space-y-1">
			<textarea
				bind:value={instruction}
				onblur={handleSaveDetails}
				rows="3"
				placeholder="Theme toggle + system preference detection. Refactor global styles to use CSS variables."
				class="w-full text-xs text-neutral-600 leading-relaxed border-0 p-0 focus:ring-0 focus:outline-none resize-none placeholder-neutral-300"
			></textarea>
		</div>

		<!-- Rich Text Toolbar -->
		<div class="flex items-center gap-0.5 py-1 px-1 rounded border border-neutral-200 bg-neutral-50/70 text-neutral-500">
			<button type="button" class="p-1 hover:text-neutral-800 hover:bg-neutral-200/60 rounded" title="Undo">
				<Undo2 class="w-3.5 h-3.5" />
			</button>
			<button type="button" class="p-1 hover:text-neutral-800 hover:bg-neutral-200/60 rounded" title="Redo">
				<Redo2 class="w-3.5 h-3.5" />
			</button>
			<div class="w-px h-3.5 bg-neutral-200 mx-1"></div>
			<button type="button" class="p-1 hover:text-neutral-800 hover:bg-neutral-200/60 rounded" title="Bold">
				<Bold class="w-3.5 h-3.5" />
			</button>
			<button type="button" class="p-1 hover:text-neutral-800 hover:bg-neutral-200/60 rounded" title="Italic">
				<Italic class="w-3.5 h-3.5" />
			</button>
			<button type="button" class="p-1 hover:text-neutral-800 hover:bg-neutral-200/60 rounded" title="Underline">
				<Underline class="w-3.5 h-3.5" />
			</button>
			<button type="button" class="p-1 hover:text-neutral-800 hover:bg-neutral-200/60 rounded" title="Strikethrough">
				<Strikethrough class="w-3.5 h-3.5" />
			</button>
			<button type="button" class="p-1 hover:text-neutral-800 hover:bg-neutral-200/60 rounded" title="Code">
				<Code class="w-3.5 h-3.5" />
			</button>
			<div class="w-px h-3.5 bg-neutral-200 mx-1"></div>
			<button type="button" class="p-1 hover:text-neutral-800 hover:bg-neutral-200/60 rounded" title="Bullet List">
				<List class="w-3.5 h-3.5" />
			</button>
			<button type="button" class="p-1 hover:text-neutral-800 hover:bg-neutral-200/60 rounded" title="Numbered List">
				<ListOrdered class="w-3.5 h-3.5" />
			</button>
			<button type="button" class="p-1 hover:text-neutral-800 hover:bg-neutral-200/60 rounded" title="Insert Link">
				<LinkIcon class="w-3.5 h-3.5" />
			</button>
		</div>

		<hr class="border-neutral-100" />

		<!-- Collapsible Section: Workspaces -->
		<Collapsible.Root bind:open={workspacesOpen} class="space-y-2">
			<div class="flex items-center justify-between">
				<Collapsible.Trigger class="flex items-center gap-1 text-xs font-semibold text-neutral-800 hover:text-neutral-950">
					{#if workspacesOpen}
						<ChevronDown class="w-3.5 h-3.5 text-neutral-400" />
					{:else}
						<ChevronRight class="w-3.5 h-3.5 text-neutral-400" />
					{/if}
					<span>Workspaces</span>
				</Collapsible.Trigger>
				<div class="flex items-center gap-1">
					<button type="button" class="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded" title="Add workspace">
						<Plus class="w-3.5 h-3.5" />
					</button>
					<button type="button" class="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded" title="Workspace link">
						<LinkIcon class="w-3.5 h-3.5" />
					</button>
				</div>
			</div>

			<Collapsible.Content class="space-y-2">
				<div class="rounded-lg border border-neutral-200 p-2.5 bg-neutral-50/60 text-xs">
					<div class="flex items-center justify-between gap-2">
						<div class="flex items-center gap-1.5 truncate">
							<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">
								Active
							</span>
							<span class="font-medium text-neutral-800 truncate">
								{cardDetails?.worktree?.branch ?? `feature/${card.id.slice(0, 8)}`}
							</span>
						</div>
						<div class="w-4 h-4 rounded-full bg-neutral-300 text-[9px] font-bold flex items-center justify-center shrink-0">
							E
						</div>
					</div>

					<div class="flex items-center justify-between text-[11px] text-neutral-400 mt-2">
						<div class="flex items-center gap-1 font-mono">
							<span class="text-amber-600 font-bold">...</span>
							<span>just now · 5 files ·</span>
							<span class="text-emerald-600 font-semibold">+3584</span>
							<span class="text-rose-500 font-semibold">-16</span>
						</div>
						<span class="text-neutral-400 text-[10px]">No PR created</span>
					</div>

					{#if cardDetails?.worktree}
						<div class="mt-2 pt-2 border-t border-neutral-200/70 text-[10px] text-neutral-500 font-mono space-y-0.5">
							<div>path: {cardDetails.worktree.path}</div>
							<div>state: {cardDetails.worktree.state}</div>
						</div>
					{/if}
				</div>
			</Collapsible.Content>
		</Collapsible.Root>

		<!-- Collapsible Section: Relationships -->
		<Collapsible.Root bind:open={relationshipsOpen} class="space-y-1">
			<div class="flex items-center justify-between">
				<Collapsible.Trigger class="flex items-center gap-1 text-xs font-semibold text-neutral-800 hover:text-neutral-950">
					{#if relationshipsOpen}
						<ChevronDown class="w-3.5 h-3.5 text-neutral-400" />
					{:else}
						<ChevronRight class="w-3.5 h-3.5 text-neutral-400" />
					{/if}
					<span>Relationships</span>
				</Collapsible.Trigger>
				<button type="button" class="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded" title="Add relationship">
					<Plus class="w-3.5 h-3.5" />
				</button>
			</div>
			<Collapsible.Content class="pl-4 text-xs text-neutral-400 py-1">
				No relationships
			</Collapsible.Content>
		</Collapsible.Root>

		<!-- Collapsible Section: Sub-issues -->
		<Collapsible.Root bind:open={subIssuesOpen} class="space-y-1">
			<div class="flex items-center justify-between">
				<Collapsible.Trigger class="flex items-center gap-1 text-xs font-semibold text-neutral-800 hover:text-neutral-950">
					{#if subIssuesOpen}
						<ChevronDown class="w-3.5 h-3.5 text-neutral-400" />
					{:else}
						<ChevronRight class="w-3.5 h-3.5 text-neutral-400" />
					{/if}
					<span>Sub-issues</span>
				</Collapsible.Trigger>
				<button type="button" class="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded" title="Add sub-issue">
					<Plus class="w-3.5 h-3.5" />
				</button>
			</div>
			<Collapsible.Content class="pl-4 text-xs text-neutral-400 py-1">
				No sub-issues
			</Collapsible.Content>
		</Collapsible.Root>

		<!-- Collapsible Section: Comments -->
		<Collapsible.Root bind:open={commentsOpen} class="space-y-3">
			<div class="flex items-center justify-between">
				<Collapsible.Trigger class="flex items-center gap-1 text-xs font-semibold text-neutral-800 hover:text-neutral-950">
					{#if commentsOpen}
						<ChevronDown class="w-3.5 h-3.5 text-neutral-400" />
					{:else}
						<ChevronRight class="w-3.5 h-3.5 text-neutral-400" />
					{/if}
					<span>Comments</span>
				</Collapsible.Trigger>
			</div>

			<Collapsible.Content class="space-y-3">
				<!-- Thread dari backend: pesan user/agent, thinking, tool call, plan, event sistem -->
				<div class="space-y-2.5 text-xs">
					{#if cardDetails?.running}
						<div class="flex items-center gap-2 text-[11px] text-amber-700 pl-1">
							<span class="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
							{card.agentName ?? 'Agent'} sedang bekerja…
						</div>
					{/if}

					{#if cardDetails?.thread?.length}
						{#each cardDetails.thread as item (item.id)}
							{#if item.kind === 'message'}
								<div class="space-y-1">
									<div class="flex items-center gap-2">
										<div
											class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold {item.role ===
											'user'
												? 'bg-neutral-800 text-white'
												: 'bg-sky-600 text-white'}"
										>
											{item.role === 'user' ? 'U' : 'A'}
										</div>
										<span class="font-semibold text-neutral-800 capitalize">
											{item.role === 'user' ? 'Kamu' : item.role}
										</span>
										<span class="text-neutral-400 text-[11px]">{formatTime(item.createdAt)}</span>
									</div>
									<div class="pl-7 text-neutral-700 whitespace-pre-wrap">{item.content}</div>
								</div>
							{:else if item.kind === 'thought'}
								<details class="pl-7 text-[11px] text-neutral-500">
									<summary class="cursor-pointer select-none hover:text-neutral-700">
										Thinking · {formatTime(item.createdAt)}
									</summary>
									<p class="mt-1 whitespace-pre-wrap">{item.content}</p>
								</details>
							{:else if item.kind === 'tool'}
								<div class="flex items-center gap-2 text-[11px] pl-7">
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
								<div class="rounded-lg border border-neutral-200 bg-neutral-50/60 p-2.5 space-y-1">
									<div class="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
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
									class="rounded-lg border p-2.5 {item.status === 'in_review' || item.status === 'done'
										? 'bg-emerald-50 border-emerald-200'
										: 'bg-rose-50/70 border-rose-200'}"
								>
									<div class="flex items-center gap-2">
										<span
											class="font-semibold {item.status === 'in_review' || item.status === 'done'
												? 'text-emerald-800'
												: 'text-rose-800'}"
										>
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
										<span class="ml-auto text-neutral-400 text-[11px]">{formatTime(item.createdAt)}</span>
									</div>
									<p class="text-neutral-700 mt-1 whitespace-pre-wrap">{item.reason}</p>
								</div>
							{:else}
								<div class="flex items-center gap-2 text-[11px] text-neutral-400 pl-7">
									<Clock class="w-3 h-3 shrink-0" />
									<span>{formatTime(item.createdAt)}</span>
									<span>·</span>
									<span class="text-neutral-600">{item.content}</span>
								</div>
							{/if}
						{/each}
					{:else}
						<div class="text-neutral-400 italic pl-1">Belum ada aktivitas di thread ini.</div>
					{/if}
				</div>

				<!-- Comment Input Box -->
				<div class="mt-3 rounded-lg border border-neutral-200 bg-white p-2.5 focus-within:border-neutral-400 focus-within:ring-1 focus-within:ring-neutral-400 transition-all">
					<textarea
						bind:value={commentInput}
						rows="2"
						placeholder="Enter your comment here..."
						class="w-full text-xs text-neutral-700 placeholder-neutral-400 border-0 p-0 focus:outline-none focus:ring-0 resize-none"
						onkeydown={(e) => {
							if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
								e.preventDefault();
								handleCommentSubmit();
							}
						}}
					></textarea>
					<div class="flex items-center justify-between pt-2 border-t border-neutral-100 mt-1">
						<button
							type="button"
							class="p-1 text-neutral-400 hover:text-neutral-700 rounded hover:bg-neutral-100 transition-colors"
							title="Attach file"
						>
							<Paperclip class="w-3.5 h-3.5" />
						</button>
						<button
							type="button"
							class="px-2.5 py-1 bg-neutral-900 hover:bg-neutral-800 text-white rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors disabled:opacity-40"
							disabled={!commentInput.trim() || busy}
							onclick={handleCommentSubmit}
						>
							<Send class="w-3 h-3" />
							<span>Send</span>
						</button>
					</div>
				</div>
			</Collapsible.Content>
		</Collapsible.Root>
	</div>
</aside>
