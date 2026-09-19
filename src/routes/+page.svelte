<script lang="ts">
	import { enhance } from '$app/forms';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<div class="head">
	<h1>Projects</h1>
	<span class="spacer"></span>
	<span class="tiny faint">{data.projects.length} project terdaftar</span>
</div>

<form method="POST" action="?/add" use:enhance class="add row">
	<input
		name="path"
		placeholder="/path/ke/git/repo (working tree harus bersih)"
		value={form?.path ?? ''}
	/>
	<button class="primary" type="submit">Tambah project</button>
</form>

{#if form?.error}
	<p class="error-text">{form.error}</p>
{/if}
{#if form?.addedName}
	<p class="ok-text">Project {form.addedName} ditambahkan.</p>
{/if}

<div class="grid">
	{#each data.projects as project (project.id)}
		<a class="project-card" href={`/projects/${project.id}`}>
			<div class="row">
				<strong>{project.name}</strong>
				{#if !project.available}<span class="pill danger">tidak tersedia</span>{/if}
			</div>
			<div class="path mono tiny faint">{project.rootPath}</div>
			<div class="row wrap tiny">
				<span class="pill">{project.defaultBranch}</span>
				<span class="pill">WIP {project.wipLimit}</span>
				<span class="pill">{project.cardCount} card</span>
			</div>
		</a>
	{/each}
</div>

{#if data.projects.length === 0}
	<div class="empty">
		<p>Belum ada project.</p>
		<p class="hint">
			Folder divalidasi berurutan: ada &amp; terbaca, git repo, tidak detached HEAD, punya commit,
			working tree bersih, dan branch utama terdeteksi.
		</p>
	</div>
{/if}

<style>
	.head {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}
	.add {
		margin-bottom: 0.5rem;
	}
	.add input {
		max-width: 34rem;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(19rem, 1fr));
		gap: 0.75rem;
		margin-top: 1rem;
	}
	.project-card {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 0.85rem;
		background: var(--bg-elevated);
		border: 1px solid var(--border);
		border-radius: var(--radius-lg);
		color: var(--text);
	}
	.project-card:hover {
		border-color: var(--border-strong);
		background: var(--bg-hover);
		text-decoration: none;
	}
	.path {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.pill {
		font-size: 0.72rem;
		padding: 0.1rem 0.45rem;
		border-radius: 999px;
		background: var(--bg-inset);
		border: 1px solid var(--border);
		color: var(--text-muted);
	}
	.pill.danger {
		background: var(--danger-soft);
		border-color: #5a2a2a;
		color: #ff9a9a;
	}
	.empty {
		margin-top: 1.5rem;
		padding: 1.5rem;
		text-align: center;
		background: var(--bg-elevated);
		border: 1px dashed var(--border-strong);
		border-radius: var(--radius-lg);
	}
</style>
