<script lang="ts">
	import { Dialog } from 'bits-ui';
	import { X, Bot, Tag, ArrowUp } from '@lucide/svelte';

	let {
		open = $bindable(false),
		agents = [],
		onSubmit,
		busy = false
	}: {
		open: boolean;
		agents?: { id: string; name: string; usable: boolean; health?: string }[];
		onSubmit: (data: { title: string; instruction: string; agentId: string }) => Promise<void>;
		busy?: boolean;
	} = $props();

	let title = $state('');
	let instruction = $state('');
	let agentId = $state('');

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (!title.trim() || busy) return;
		await onSubmit({ title, instruction, agentId });
		title = '';
		instruction = '';
		agentId = '';
		open = false;
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 bg-black/40 backdrop-blur-xs z-50 animate-in fade-in-0"
		/>
		<Dialog.Content
			class="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg bg-white rounded-xl shadow-2xl border border-neutral-200 z-50 p-6 space-y-4 focus:outline-none animate-in zoom-in-95"
		>
			<div class="flex items-center justify-between pb-2 border-b border-neutral-100">
				<Dialog.Title class="text-base font-semibold text-neutral-900">
					New Issue
				</Dialog.Title>
				<Dialog.Close
					class="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded-md transition-colors"
				>
					<X class="w-4 h-4" />
				</Dialog.Close>
			</div>

			<form onsubmit={handleSubmit} class="space-y-4">
				<div>
					<input
						type="text"
						bind:value={title}
						required
						placeholder="Issue title"
						class="w-full text-sm font-medium text-neutral-900 border border-neutral-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-neutral-400 focus:outline-none placeholder-neutral-400"
					/>
				</div>

				<div>
					<textarea
						bind:value={instruction}
						rows="4"
						placeholder="Add description or instruction for agent..."
						class="w-full text-xs text-neutral-700 border border-neutral-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-neutral-400 focus:outline-none placeholder-neutral-400 resize-none"
					></textarea>
				</div>

				<div class="grid grid-cols-2 gap-3 text-xs">
					<div>
						<label class="block text-neutral-500 mb-1 font-medium flex items-center gap-1">
							<Bot class="w-3.5 h-3.5" />
							<span>Assign Agent</span>
						</label>
						<select
							bind:value={agentId}
							class="w-full border border-neutral-200 rounded-lg px-2.5 py-1.5 text-xs text-neutral-800 bg-white focus:outline-none focus:ring-1 focus:ring-neutral-400"
						>
							<option value="">Default project agent</option>
							{#each agents as agent (agent.id)}
								<option value={agent.id} disabled={!agent.usable}>
									{agent.name}{agent.usable ? '' : ` (${agent.health})`}
								</option>
							{/each}
						</select>
					</div>

					<div>
						<label class="block text-neutral-500 mb-1 font-medium flex items-center gap-1">
							<ArrowUp class="w-3.5 h-3.5 text-amber-600" />
							<span>Priority</span>
						</label>
						<select
							class="w-full border border-neutral-200 rounded-lg px-2.5 py-1.5 text-xs text-neutral-800 bg-white focus:outline-none focus:ring-1 focus:ring-neutral-400"
						>
							<option value="high">High</option>
							<option value="medium">Medium</option>
							<option value="low">Low</option>
							<option value="urgent">Urgent</option>
						</select>
					</div>
				</div>

				<div class="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
					<button
						type="button"
						class="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-600 hover:bg-neutral-100 transition-colors"
						onclick={() => (open = false)}
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={!title.trim() || busy}
						class="px-4 py-1.5 rounded-lg text-xs font-medium bg-[#964f28] hover:bg-[#854320] text-white shadow-xs transition-colors disabled:opacity-40"
					>
						Create Issue
					</button>
				</div>
			</form>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
