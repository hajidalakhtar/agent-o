<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';
	import { FolderGit2, Plus, ArrowRight, GitBranch, ShieldAlert } from '@lucide/svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<div class="h-full overflow-y-auto p-6 max-w-6xl mx-auto space-y-6">
	<!-- Page Header -->
	<div class="flex items-center justify-between pb-4 border-b border-neutral-200">
		<div>
			<h1 class="text-xl font-bold text-neutral-900 tracking-tight">Projects</h1>
			<p class="text-xs text-neutral-500 mt-0.5">
				Kelola git repository lokal sebagai workspace Kanban untuk agent ACP
			</p>
		</div>
		<span class="text-xs font-mono text-neutral-400">
			{data.projects.length} project terdaftar
		</span>
	</div>

	<!-- Add Project Form Card -->
	<div class="rounded-xl border border-neutral-200 bg-white p-4 shadow-2xs">
		<h2 class="text-xs font-semibold text-neutral-700 uppercase tracking-wider mb-2">
			Tambah Project Baru
		</h2>
		<form method="POST" action="?/add" use:enhance class="flex flex-col sm:flex-row gap-2.5">
			<div class="relative flex-1">
				<FolderGit2 class="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
				<input
					name="path"
					placeholder="/path/ke/git/repo (working tree harus bersih)"
					value={form?.path ?? ''}
					class="w-full pl-9 pr-3 py-2 text-xs border border-neutral-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-neutral-400 bg-neutral-50/50 focus:bg-white transition-all font-mono"
				/>
			</div>
			<button
				type="submit"
				class="px-4 py-2 bg-[#964f28] hover:bg-[#83421f] text-white text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 shadow-xs transition-colors shrink-0"
			>
				<Plus class="w-3.5 h-3.5" />
				<span>Tambah Project</span>
			</button>
		</form>

		{#if form?.error}
			<p class="mt-2 text-xs text-rose-600 flex items-center gap-1">
				<ShieldAlert class="w-3.5 h-3.5" />
				<span>{form.error}</span>
			</p>
		{/if}
		{#if form?.addedName}
			<p class="mt-2 text-xs text-emerald-600">
				Project {form.addedName} berhasil ditambahkan.
			</p>
		{/if}
	</div>

	<!-- Projects Grid -->
	<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
		{#each data.projects as project (project.id)}
			<a
				href={`/projects/${project.id}`}
				class="group rounded-xl border border-neutral-200/90 bg-white p-4 hover:border-neutral-300 hover:shadow-xs transition-all flex flex-col justify-between"
			>
				<div class="space-y-2">
					<div class="flex items-start justify-between gap-2">
						<h2 class="text-sm font-bold text-neutral-900 group-hover:text-neutral-950 transition-colors">
							{project.name}
						</h2>
						{#if !project.available}
							<span class="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-600 border border-rose-200">
								tidak tersedia
							</span>
						{/if}
					</div>
					<p class="text-[11px] font-mono text-neutral-400 truncate" title={project.rootPath}>
						{project.rootPath}
					</p>
				</div>

				<div class="flex items-center justify-between pt-4 mt-3 border-t border-neutral-100 text-xs">
					<div class="flex items-center gap-2 text-neutral-500 font-mono text-[11px]">
						<span class="flex items-center gap-1">
							<GitBranch class="w-3 h-3 text-neutral-400" />
							{project.defaultBranch}
						</span>
						<span>·</span>
						<span>WIP {project.wipLimit}</span>
						<span>·</span>
						<span>{project.cardCount} card</span>
					</div>
					<ArrowRight class="w-3.5 h-3.5 text-neutral-400 group-hover:translate-x-0.5 group-hover:text-neutral-700 transition-all" />
				</div>
			</a>
		{/each}
	</div>

	{#if data.projects.length === 0}
		<div class="p-12 text-center rounded-xl border border-dashed border-neutral-200 bg-white space-y-2">
			<FolderGit2 class="w-8 h-8 text-neutral-300 mx-auto" />
			<h3 class="text-sm font-semibold text-neutral-700">Belum ada project</h3>
			<p class="text-xs text-neutral-400 max-w-md mx-auto">
				Folder repo divalidasi: git repo, bukan detached HEAD, punya commit, working tree bersih, dan branch utama terdeteksi.
			</p>
		</div>
	{/if}
</div>
