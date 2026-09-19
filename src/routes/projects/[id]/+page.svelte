<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let errorMessage = $state<string | null>(null);
	let busy = $state(false);
	let dragCardId = $state<string | null>(null);
	let dragOverStatus = $state<string | null>(null);
	let newTitle = $state('');
	let newInstruction = $state('');
	let newAgent = $state('');

	const STATUS_LABELS: Record<string, string> = {
		backlog: 'Backlog',
		in_progress: 'In Progress',
		blocked: 'Blocked',
		in_review: 'In Review',
		done: 'Done'
	};

	async function submitAction(action: string, fields: Record<string, string>, confirmMessage?: string) {
		if (confirmMessage && !confirm(confirmMessage)) return;
		if (busy) return;
		busy = true;
		errorMessage = null;
		try {
			const body = new FormData();
			for (const [key, value] of Object.entries(fields)) body.append(key, value);
			const response = await fetch(`?/${action}`, {
				method: 'POST',
				body,
				headers: { 'x-sveltekit-action': 'true' }
			});
			const result = await response.json();
			if (result?.type === 'failure') {
				errorMessage = result.data?.error ?? 'Aksi gagal.';
			} else {
				await invalidateAll();
			}
		} catch (cause) {
			errorMessage = (cause as Error).message;
		} finally {
			busy = false;
		}
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
			await submitAction('transition', { cardId, to: status, confirmed: 'true' }, 'Hapus card ini?');
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
		await submitAction('transition', { cardId, to: status, ...(feedback ? { feedback } : {}) });
	}

	async function createCard(event: SubmitEvent) {
		event.preventDefault();
		await submitAction('create', {
			title: newTitle,
			instruction: newInstruction,
			agentId: newAgent
		});
		newTitle = '';
		newInstruction = '';
	}
</script>

<div class="head">
	<div class="row wrap">
		<h1>{data.project.name}</h1>
		{#if !data.project.available}<span class="pill danger">tidak tersedia</span>{/if}
		<span class="pill">{data.project.defaultBranch}</span>
	</div>
	<span class="spacer"></span>
	<div class="wip tiny">
		<span class="faint">WIP</span>
		<span class="mono">project {data.wip.projectRunning}/{data.wip.projectLimit}</span>
		<span class="faint">·</span>
		<span class="mono">global {data.wip.globalRunning}/{data.wip.globalLimit}</span>
	</div>
</div>
<div class="path mono tiny faint">{data.project.rootPath}</div>

{#if errorMessage}
	<div class="banner error-text">
		{errorMessage}
		<button class="ghost small" onclick={() => (errorMessage = null)}>tutup</button>
	</div>
{/if}

{#if data.queue.length > 0}
	<div class="queue tiny">
		<strong>Antrean:</strong>
		{#each data.queue as slot (slot.cardId)}
			<span class="pill warn">#{slot.position} {slot.title}</span>
		{/each}
	</div>
{/if}

<form class="new row wrap" onsubmit={createCard}>
	<input bind:value={newTitle} placeholder="Judul card" class="w-title" />
	<input bind:value={newInstruction} placeholder="Instruksi untuk agent" class="w-instr" />
	<select bind:value={newAgent} class="w-agent">
		<option value="">Agent: default project</option>
		{#each data.agents as agent (agent.id)}
			<option value={agent.id} disabled={!agent.usable}>
				{agent.name}{agent.usable ? '' : ` (${agent.health})`}
			</option>
		{/each}
	</select>
	<button class="primary" type="submit" disabled={busy}>Tambah card</button>
</form>

<div class="board">
	{#each data.columns as column (column.status)}
		<section
			class:over={dragOverStatus === column.status}
			aria-label={`Kolom ${STATUS_LABELS[column.status] ?? column.status}`}
			ondragover={(event) => {
				event.preventDefault();
				dragOverStatus = column.status;
			}}
			ondragleave={() => (dragOverStatus = null)}
			ondrop={(event) => onDrop(column.status, event)}
		>
			<header>
				<span>{STATUS_LABELS[column.status] ?? column.status}</span>
				<span class="count">{column.cards.length}</span>
			</header>

			{#each column.cards as card (card.id)}
				<article
					draggable="true"
					ondragstart={(event) => {
						dragCardId = card.id;
						event.dataTransfer?.setData('text/plain', card.id);
					}}
				>
					<a class="title" href={`/cards/${card.id}`}>{card.title}</a>
					{#if card.instruction}
						<p class="instr">{card.instruction}</p>
					{/if}

					<div class="row wrap tiny meta">
						{#if card.agentName}
							<span class="pill" title={card.effectiveAgentId ?? ''}>{card.agentName}</span>
						{:else}
							<span class="pill muted">agent default project belum diset</span>
						{/if}
						{#if card.queued > 0}
							<span class="pill warn">antre #{card.queued}</span>
						{/if}
					</div>

					<div class="actions">
						{#each card.allowed as move (move.to)}
							<button
								class="small"
								title={move.trigger}
								disabled={busy}
								onclick={() => {
									if (move.to === 'deleted') {
										submitAction('transition', { cardId: card.id, to: move.to, confirmed: 'true' }, 'Hapus card ini?');
										return;
									}
									if (move.to === 'backlog' && card.status === 'in_review') {
										const feedback = prompt('Alasan reject (wajib):') ?? '';
										if (!feedback.trim()) return;
										submitAction('transition', { cardId: card.id, to: move.to, feedback });
										return;
									}
									submitAction('transition', { cardId: card.id, to: move.to });
								}}
							>
								→ {STATUS_LABELS[move.to] ?? move.to}
							</button>
						{/each}
					</div>
				</article>
			{/each}

			{#if column.cards.length === 0}
				<p class="empty">kosong</p>
			{/if}
		</section>
	{/each}
</div>

<style>
	.head {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.path {
		margin-top: 0.15rem;
	}
	.wip {
		display: flex;
		gap: 0.35rem;
		align-items: baseline;
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
	.queue {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		margin: 0.5rem 0;
	}
	.new {
		margin: 1rem 0;
	}
	.w-title {
		width: 15rem;
	}
	.w-instr {
		flex: 1;
		min-width: 14rem;
	}
	.w-agent {
		width: 15rem;
	}
	.board {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: 0.75rem;
		align-items: start;
	}
	@media (max-width: 1100px) {
		.board {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
	section {
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		padding: 0.6rem;
		min-height: 8rem;
		transition: border-color 0.12s ease, background 0.12s ease;
	}
	section.over {
		border-color: var(--accent);
		background: var(--accent-soft);
	}
	section > header {
		display: flex;
		justify-content: space-between;
		font-size: 0.74rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--text-muted);
		margin-bottom: 0.5rem;
	}
	article {
		background: var(--bg-inset);
		border: 1px solid var(--border-strong);
		border-radius: var(--radius);
		padding: 0.55rem;
		margin-bottom: 0.5rem;
		cursor: grab;
	}
	article:active {
		cursor: grabbing;
	}
	.title {
		font-weight: 600;
		text-decoration: none;
		display: block;
	}
	.instr {
		margin: 0.3rem 0 0;
		font-size: 0.78rem;
		color: var(--text-muted);
		white-space: pre-wrap;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.meta {
		margin-top: 0.45rem;
	}
	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.25rem;
		margin-top: 0.5rem;
	}
	.empty {
		color: var(--text-faint);
		font-size: 0.78rem;
		margin: 0.25rem 0;
	}
</style>
