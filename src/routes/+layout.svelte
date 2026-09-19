<script lang="ts">
	import '$lib/styles/app.css';
	import { page } from '$app/state';

	let { children } = $props();

	const nav = [
		{ href: '/', label: 'Board' },
		{ href: '/agents', label: 'Agents' },
		{ href: '/permissions', label: 'Permissions' },
		{ href: '/settings', label: 'Settings' }
	];

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		if (href === '/') {
			return path === '/' || path.startsWith('/projects') || path.startsWith('/cards');
		}
		return path.startsWith(href);
	}
</script>

<header class="topbar">
	<div class="brand"><span class="logo">◆</span><span>agent-o</span></div>
	<nav>
		{#each nav as item (item.href)}
			<a href={item.href} class:active={isActive(item.href)}>{item.label}</a>
		{/each}
	</nav>
	<span class="spacer"></span>
	<span class="tiny faint">kanban untuk agent ACP</span>
</header>

<main>
	{@render children()}
</main>

<style>
	.topbar {
		display: flex;
		align-items: center;
		gap: 1.25rem;
		padding: 0 1.25rem;
		height: 52px;
		border-bottom: 1px solid var(--border);
		background: var(--bg-elevated);
		position: sticky;
		top: 0;
		z-index: 10;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 0.45rem;
		font-weight: 650;
	}
	.logo {
		color: var(--accent);
	}
	nav {
		display: flex;
		gap: 0.25rem;
	}
	nav a {
		color: var(--text-muted);
		padding: 0.3rem 0.6rem;
		border-radius: var(--radius-sm);
		font-size: 0.86rem;
	}
	nav a:hover {
		background: var(--bg-hover);
		color: var(--text);
		text-decoration: none;
	}
	nav a.active {
		background: var(--accent-soft);
		color: #9dc4ff;
	}
	main {
		padding: 1.25rem;
		max-width: 1600px;
		margin: 0 auto;
	}
</style>
