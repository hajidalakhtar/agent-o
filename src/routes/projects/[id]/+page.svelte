<script lang="ts">
	import { submitAction as runAction } from '$lib/client/action.js';
	import type { PageData } from './$types';
	import {
		Plus,
		Search,
		Filter,
		MoreHorizontal,
		ArrowUp,
		ArrowDown,
		Minus,
		Circle,
		Bot,
		AlertCircle,
		Check,
		X
	} from '@lucide/svelte';
	import IssueDetailDrawer from '$lib/components/IssueDetailDrawer.svelte';
	import NewIssueDialog from '$lib/components/NewIssueDialog.svelte';

	let { data }: { data: PageData } = $props();

	let errorMessage = $state<string | null>(null);
	let busy = $state(false);
	let dragCardId = $state<string | null>(null);
	let dragOverStatus = $state<string | null>(null);

	// Filter and view controls
	let activeFilter = $state<'active' | 'all' | 'backlog' | 'cancelled'>('active');
	let viewMode = $state<'team' | 'personal'>('team');
	let searchQuery = $state('');

	// Dialog and Drawer states
	let newIssueDialogOpen = $state(false);
	let selectedCardId = $state<string | null>(null);

	// Map card IDs to stable issue keys like ISS-1, ISS-2, ISS-3
	const cardKeyMap = $derived.by(() => {
		const map = new Map<string, string>();
		const allCards = data.columns.flatMap((col) => col.cards);
		allCards.forEach((c, index) => {
			map.set(c.id, `ISS-${index + 1}`);
		});
		return map;
	});

	// Column definitions matching screenshot
	const COLUMN_SPECS: {
		status: string;
		label: string;
		dotClass: string;
	}[] = [
		{ status: 'backlog', label: 'To do', dotClass: 'bg-blue-500' },
		{ status: 'in_progress', label: 'In progress', dotClass: 'bg-amber-500' },
		{ status: 'in_review', label: 'In review', dotClass: 'bg-purple-500' },
		{ status: 'done', label: 'Done', dotClass: 'bg-emerald-500' }
	];

	// Filtered columns based on tab
	const visibleColumns = $derived.by(() => {
		if (activeFilter === 'backlog') {
			return COLUMN_SPECS.filter((c) => c.status === 'backlog');
		}
		if (activeFilter === 'cancelled') {
			return [];
		}
		if (activeFilter === 'all') {
			return [
				...COLUMN_SPECS,
				{ status: 'blocked', label: 'Blocked', dotClass: 'bg-rose-500' }
			];
		}
		// 'active' filter: show standard 4 columns
		return COLUMN_SPECS;
	});

	// Filter cards by search query
	function getFilteredCards(status: string) {
		const col = data.columns.find((c) => c.status === status);
		if (!col) return [];
		if (!searchQuery.trim()) return col.cards;
		const q = searchQuery.toLowerCase();
		return col.cards.filter(
			(card) =>
				card.title.toLowerCase().includes(q) ||
				(card.instruction && card.instruction.toLowerCase().includes(q))
		);
	}

	// Currently selected card object
	const selectedCard = $derived.by(() => {
		if (!selectedCardId) return null;
		const found = data.columns
			.flatMap((col) => col.cards)
			.find((c) => c.id === selectedCardId);
		if (!found) return null;
		return {
			...found,
			issueKey: cardKeyMap.get(found.id) ?? `ISS-${found.id.slice(0, 4)}`
		};
	});

	async function submitAction(
		action: string,
		fields: Record<string, string>,
		confirmMessage?: string
	) {
		if (busy) return;
		busy = true;
		errorMessage = null;
		const result = await runAction(action, fields, { confirm: confirmMessage });
		if (!result.ok) errorMessage = result.error ?? 'Aksi gagal.';
		busy = false;
	}

	function allowedTargets(card: PageData['columns'][number]['cards'][number]): string[] {
		return card.allowed.map((move) => move.to);
	}

	async function onDrop(status: string, event: DragEvent) {
		event.preventDefault();
		dragOverStatus = null;
		const cardId = dragCardId ?? event.dataTransfer?.getData('text/plain') ?? '';
		dragCardId = null;
		if (!cardId) return;

		const card = data.columns.flatMap((column) => column.cards).find((item) => item.id === cardId);
		if (!card) return;

		if (!allowedTargets(card).includes(status)) {
			errorMessage = `Transisi ${card.status} → ${status} tidak diizinkan.`;
			return;
		}

		if (status === 'deleted') {
			await submitAction(
				'transition',
				{ cardId, to: status, confirmed: 'true' },
				'Hapus card ini?'
			);
			return;
		}

		let feedback = '';
		if (status === 'backlog' && card.status === 'in_review') {
			feedback = prompt('Alasan reject (wajib):') ?? '';
			if (!feedback.trim()) {
				errorMessage = 'Alasan reject wajib diisi.';
				return;
			}
		}
		await submitAction('transition', {
			cardId,
			to: status,
			...(feedback ? { feedback } : {})
		});
	}

	async function handleCreateCard(cardData: {
		title: string;
		instruction: string;
		agentId: string;
	}) {
		await submitAction('create', {
			title: cardData.title,
			instruction: cardData.instruction,
			agentId: cardData.agentId
		});
	}

	// Heuristic tags for card visual matching screenshot
	function getCardTags(card: { title: string; instruction?: string }): {
		name: string;
		cls: string;
		dot: string;
	}[] {
		const lower = (card.title + ' ' + (card.instruction ?? '')).toLowerCase();
		const tags: { name: string; cls: string; dot: string }[] = [];

		if (lower.includes('dark') || lower.includes('ui') || lower.includes('css')) {
			tags.push({
				name: 'ui',
				cls: 'bg-purple-50 text-purple-700 border-purple-200/50',
				dot: 'bg-purple-500'
			});
			tags.push({
				name: 'enhancement',
				cls: 'bg-slate-100 text-slate-700 border-slate-200/50',
				dot: 'bg-slate-400'
			});
		} else if (lower.includes('bug') || lower.includes('stalls') || lower.includes('error')) {
			tags.push({
				name: 'bug',
				cls: 'bg-rose-50 text-rose-700 border-rose-200/50',
				dot: 'bg-rose-500'
			});
		} else if (
			lower.includes('auth') ||
			lower.includes('credit') ||
			lower.includes('prompt') ||
			lower.includes('feature')
		) {
			tags.push({
				name: 'feature',
				cls: 'bg-emerald-50 text-emerald-700 border-emerald-200/50',
				dot: 'bg-emerald-500'
			});
		} else {
			tags.push({
				name: 'enhancement',
				cls: 'bg-slate-100 text-slate-700 border-slate-200/50',
				dot: 'bg-slate-400'
			});
		}
		return tags;
	}
</script>

<div class="flex flex-col h-full w-full overflow-hidden bg-white">
	<!-- Project Subheader & Toolbar Bar -->
	<div
		class="h-11 shrink-0 border-b border-neutral-200/80 px-4 flex items-center justify-between gap-3 text-xs bg-white z-10 select-none"
	>
		<!-- Left: Project Name & Filters -->
		<div class="flex items-center gap-3 overflow-x-auto py-1">
			<!-- Project Title with Dropdown Menu -->
			<div class="flex items-center gap-1.5 shrink-0">
				<h1 class="text-sm font-bold text-neutral-900 tracking-tight">
					{data.project.name}
				</h1>
				<button
					type="button"
					class="p-0.5 text-neutral-400 hover:text-neutral-700 rounded transition-colors"
					title="Project options"
				>
					<MoreHorizontal class="w-3.5 h-3.5" />
				</button>
			</div>

			<!-- Filter Tabs: [Active] [All] [Backlog] [Cancelled] -->
			<div class="flex items-center gap-1 shrink-0 bg-neutral-100/70 p-0.5 rounded-lg border border-neutral-200/60">
				<button
					type="button"
					class="px-2 py-0.5 rounded-md font-medium transition-all {activeFilter === 'active'
						? 'bg-white text-neutral-900 shadow-2xs'
						: 'text-neutral-500 hover:text-neutral-900'}"
					onclick={() => (activeFilter = 'active')}
				>
					Active
				</button>
				<button
					type="button"
					class="px-2 py-0.5 rounded-md font-medium transition-all {activeFilter === 'all'
						? 'bg-white text-neutral-900 shadow-2xs'
						: 'text-neutral-500 hover:text-neutral-900'}"
					onclick={() => (activeFilter = 'all')}
				>
					All
				</button>
				<button
					type="button"
					class="px-2 py-0.5 rounded-md font-medium transition-all {activeFilter === 'backlog'
						? 'bg-white text-neutral-900 shadow-2xs'
						: 'text-neutral-500 hover:text-neutral-900'}"
					onclick={() => (activeFilter = 'backlog')}
				>
					Backlog
				</button>
				<button
					type="button"
					class="px-2 py-0.5 rounded-md font-medium transition-all {activeFilter === 'cancelled'
						? 'bg-white text-neutral-900 shadow-2xs'
						: 'text-neutral-500 hover:text-neutral-900'}"
					onclick={() => (activeFilter = 'cancelled')}
				>
					Cancelled
				</button>
			</div>

			<!-- View Switcher: [Team] [Personal] -->
			<div class="flex items-center shrink-0 border border-neutral-200 rounded-md p-0.5 bg-white text-xs">
				<button
					type="button"
					class="px-2 py-0.5 rounded font-medium transition-all {viewMode === 'team'
						? 'bg-neutral-100 text-neutral-900'
						: 'text-neutral-500 hover:text-neutral-900'}"
					onclick={() => (viewMode = 'team')}
				>
					Team
				</button>
				<button
					type="button"
					class="px-2 py-0.5 rounded font-medium transition-all {viewMode === 'personal'
						? 'bg-neutral-100 text-neutral-900'
						: 'text-neutral-500 hover:text-neutral-900'}"
					onclick={() => (viewMode = 'personal')}
				>
					Personal
				</button>
			</div>

			<!-- Search issues input -->
			<div class="relative flex items-center shrink-0">
				<Search class="w-3.5 h-3.5 text-neutral-400 absolute left-2.5 pointer-events-none" />
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search issues..."
					class="pl-8 pr-2.5 py-1 w-44 lg:w-56 text-xs text-neutral-800 placeholder-neutral-400 bg-neutral-50 border border-neutral-200/80 rounded-md focus:outline-none focus:bg-white focus:ring-1 focus:ring-neutral-400 transition-all"
				/>
			</div>

			<!-- Filter Button (Funnel) -->
			<button
				type="button"
				class="p-1.5 text-neutral-500 hover:text-neutral-800 hover:bg-neutral-100 border border-neutral-200 rounded-md transition-colors shrink-0"
				title="Filter issues"
			>
				<Filter class="w-3.5 h-3.5" />
			</button>
		</div>

		<!-- Right: New Issue Action Button -->
		<div class="flex items-center gap-2.5 shrink-0">
			<!-- WIP Stats Badge -->
			<div class="hidden xl:flex items-center gap-1.5 text-[11px] text-neutral-400">
				<span class="font-medium text-neutral-600">WIP:</span>
				<span class="font-mono">proj {data.wip.projectRunning}/{data.wip.projectLimit}</span>
				<span>·</span>
				<span class="font-mono">glob {data.wip.globalRunning}/{data.wip.globalLimit}</span>
			</div>

			<!-- Terracotta "+ New Issue" Button -->
			<button
				type="button"
				class="px-3 py-1.5 rounded-md text-xs font-semibold bg-[#964f28] hover:bg-[#83421f] text-white flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
				onclick={() => (newIssueDialogOpen = true)}
			>
				<span>New Issue</span>
				<Plus class="w-3.5 h-3.5 stroke-[2.5]" />
			</button>
		</div>
	</div>

	<!-- Error Message Alert -->
	{#if errorMessage}
		<div class="px-4 py-2 bg-rose-50 border-b border-rose-200 text-rose-700 text-xs flex items-center justify-between">
			<span>{errorMessage}</span>
			<button
				type="button"
				class="p-1 hover:bg-rose-100 rounded"
				onclick={() => (errorMessage = null)}
			>
				<X class="w-3.5 h-3.5" />
			</button>
		</div>
	{/if}

	<!-- Board & Drawer Container -->
	<div class="flex-1 flex overflow-hidden bg-[#fafafa]">
		<!-- Kanban Columns View -->
		<div
			class="flex-1 flex overflow-x-auto min-w-0 h-full divide-x divide-neutral-200/80"
			aria-label="Kanban Columns"
		>
			{#each visibleColumns as col (col.status)}
				{@const cards = getFilteredCards(col.status)}
				<section
					class="w-72 lg:w-80 shrink-0 flex flex-col h-full bg-[#fafafa] {dragOverStatus ===
					col.status
						? 'bg-neutral-100/80 ring-2 ring-blue-400/40 ring-inset'
						: ''}"
					aria-label={col.label}
					ondragover={(event) => {
						event.preventDefault();
						dragOverStatus = col.status;
					}}
					ondragleave={() => (dragOverStatus = null)}
					ondrop={(event) => onDrop(col.status, event)}
				>
					<!-- Column Header -->
					<div class="h-10 px-3.5 flex items-center justify-between shrink-0 select-none">
						<div class="flex items-center gap-2">
							<span class="w-2 h-2 rounded-full {col.dotClass}"></span>
							<h2 class="text-xs font-semibold text-neutral-700 tracking-tight">
								{col.label}
							</h2>
							<span class="text-xs text-neutral-400 font-medium">
								{cards.length}
							</span>
						</div>

						<button
							type="button"
							class="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-200/60 rounded transition-colors"
							title={`Add card to ${col.label}`}
							onclick={() => (newIssueDialogOpen = true)}
						>
							<Plus class="w-3.5 h-3.5" />
						</button>
					</div>

					<!-- Cards List -->
					<div class="flex-1 overflow-y-auto px-3 pb-4 space-y-2.5">
						{#each cards as card (card.id)}
							{@const isSelected = selectedCardId === card.id}
							{@const tags = getCardTags(card)}
							{@const issueKey = cardKeyMap.get(card.id) ?? `ISS-${card.id.slice(0, 4)}`}

							<!-- Single Issue Card -->
							<div
								role="button"
								tabindex="0"
								draggable="true"
								class="rounded-lg bg-white p-3 border transition-all cursor-pointer select-none text-left flex flex-col gap-1.5 shadow-2xs {isSelected
									? 'border-[#ea580c] ring-1 ring-[#ea580c]/60 shadow-xs'
									: 'border-neutral-200/90 hover:border-neutral-300 hover:shadow-xs'}"
								onclick={() => (selectedCardId = isSelected ? null : card.id)}
								onkeydown={(e) => {
									if (e.key === 'Enter' || e.key === ' ') {
										selectedCardId = isSelected ? null : card.id;
									}
								}}
								ondragstart={(event) => {
									dragCardId = card.id;
									event.dataTransfer?.setData('text/plain', card.id);
								}}
							>
								<!-- Issue Key -->
								<div class="flex items-center justify-between text-[11px] font-mono text-neutral-400">
									<span>{issueKey}</span>
									{#if card.queued > 0}
										<span class="text-amber-600 font-semibold text-[10px]">
											antre #{card.queued}
										</span>
									{/if}
								</div>

								<!-- Card Title -->
								<div class="text-[13px] font-semibold text-neutral-900 leading-snug line-clamp-2">
									{card.title}
								</div>

								<!-- Description Snippet -->
								{#if card.instruction}
									<p class="text-[11px] text-neutral-500 line-clamp-2 leading-relaxed">
										{card.instruction}
									</p>
								{/if}

								<!-- Tags and Assignee Row -->
								<div class="flex items-center justify-between pt-1 mt-0.5">
									<div class="flex flex-wrap items-center gap-1.5">
										{#each tags as t}
											<span
												class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border {t.cls}"
											>
												<span class="w-1.5 h-1.5 rounded-full {t.dot}"></span>
												{t.name}
											</span>
										{/each}
									</div>

									<!-- Assignee / Agent Avatar -->
									<div
										class="w-4 h-4 rounded-full bg-neutral-800 text-white flex items-center justify-center text-[9px] font-bold shrink-0"
										title={card.agentName ?? 'Ethan'}
									>
										{card.agentName ? card.agentName[0].toUpperCase() : 'E'}
									</div>
								</div>

								<!-- Active Worktree / Git Stats Pill (linear-style) -->
								{#if col.status === 'in_progress' || col.status === 'in_review' || isSelected}
									<div
										class="mt-1.5 rounded-md bg-neutral-100/90 border border-neutral-200/80 px-2 py-1.5 text-[10px] text-neutral-600"
									>
										<div class="font-medium text-neutral-800 truncate flex items-center gap-1">
											<span class="text-neutral-400 font-normal">Active</span>
											<span class="truncate">{card.title}</span>
										</div>
										<div class="text-[10px] text-neutral-400 flex items-center gap-1.5 mt-0.5 font-mono">
											<span class="text-amber-600 font-bold">...</span>
											<span>just now · 5 files ·</span>
											<span class="text-emerald-600 font-semibold">+3584</span>
											<span class="text-rose-500 font-semibold">-16</span>
										</div>
									</div>
								{/if}
							</div>
						{/each}

						{#if cards.length === 0}
							<div class="p-6 text-center text-xs text-neutral-400 border border-dashed border-neutral-200 rounded-lg">
								No issues
							</div>
						{/if}
					</div>
				</section>
			{/each}
		</div>

		<!-- Right Detail Drawer / Inspector -->
		{#if selectedCard}
			<IssueDetailDrawer
				card={selectedCard}
				agents={data.agents}
				busy={busy}
				onClose={() => (selectedCardId = null)}
				onTransition={async (to, feedback) => {
					await submitAction('transition', {
						cardId: selectedCard.id,
						to,
						...(feedback ? { feedback } : {})
					});
				}}
				onUpdateDetails={async (title, instruction) => {
					await submitAction('update', {
						cardId: selectedCard.id,
						title,
						instruction
					});
				}}
				onAssignAgent={async (agentId) => {
					await submitAction('assignAgent', {
						cardId: selectedCard.id,
						agentId
					});
				}}
				onAddComment={async (content) => {
					await submitAction('reply', {
						cardId: selectedCard.id,
						content
					});
				}}
			/>
		{/if}
	</div>
</div>

<!-- New Issue Modal Dialog -->
<NewIssueDialog
	bind:open={newIssueDialogOpen}
	agents={data.agents}
	busy={busy}
	onSubmit={handleCreateCard}
/>
