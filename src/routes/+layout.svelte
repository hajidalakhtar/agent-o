<script lang="ts">
	import '$lib/styles/app.css';
	import { page } from '$app/state';
	import {
		AppWindow,
		Plus,
		LayoutGrid,
		Bot,
		ShieldCheck,
		Settings,
		Search,
		HelpCircle,
		Bell
	} from '@lucide/svelte';

	let { children, data } = $props();

	function isActive(href: string): boolean {
		const path = page.url.pathname;
		if (href === '/') {
			return path === '/' || path.startsWith('/projects') || path.startsWith('/cards');
		}
		return path.startsWith(href);
	}

	const currentProject = $derived(
		data?.projects?.length ? data.projects[0] : null
	);

	// Project initials, e.g. "IS" for Image Studio App
	const projectInitials = $derived(
		currentProject?.name
			? currentProject.name
					.split(' ')
					.map((w: string) => w[0])
					.slice(0, 2)
					.join('')
					.toUpperCase()
			: 'IS'
	);
</script>

<div class="flex h-screen w-screen overflow-hidden bg-[#fafafa] text-neutral-900 select-none">
	<!-- Left Narrow Icon Rail Sidebar -->
	<aside
		class="w-12 sm:w-13 shrink-0 bg-white border-r border-neutral-200/80 flex flex-col items-center justify-between py-2.5 z-30 shadow-[1px_0_0_rgba(0,0,0,0.02)]"
		aria-label="Navigation Rail"
	>
		<!-- Top Section -->
		<div class="flex flex-col items-center gap-2.5 w-full">
			<!-- Workspace Switcher Icon -->
			<a
				href="/"
				class="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-600 hover:text-neutral-950 hover:bg-neutral-100 transition-colors"
				title="Overview & Projects"
			>
				<AppWindow class="w-4 h-4" />
			</a>

			<!-- Project Avatar Badge (e.g. 'IS') -->
			<a
				href={currentProject ? `/projects/${currentProject.id}` : '/'}
				class="w-8 h-8 rounded-lg bg-sky-100 text-sky-700 font-bold text-xs flex items-center justify-center border border-sky-200 hover:ring-2 hover:ring-sky-300 transition-all shadow-xs"
				title={currentProject?.name ?? 'Image Studio App'}
			>
				{projectInitials}
			</a>

			<!-- Add Project Button -->
			<a
				href="/"
				class="w-7 h-7 rounded-md border border-dashed border-neutral-300 hover:border-neutral-400 hover:bg-neutral-50 flex items-center justify-center text-neutral-500 hover:text-neutral-800 transition-all"
				title="Add Project"
			>
				<Plus class="w-3.5 h-3.5" />
			</a>

			<div class="w-6 h-px bg-neutral-200/80 my-1"></div>

			<!-- Main Nav Icons -->
			<nav class="flex flex-col items-center gap-1.5 w-full">
				<a
					href="/"
					class="w-8 h-8 rounded-lg flex items-center justify-center transition-colors {isActive(
						'/'
					)
						? 'bg-neutral-100 text-neutral-900 font-semibold'
						: 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60'}"
					title="Kanban Board"
				>
					<LayoutGrid class="w-4 h-4" />
				</a>

				<a
					href="/agents"
					class="w-8 h-8 rounded-lg flex items-center justify-center transition-colors {isActive(
						'/agents'
					)
						? 'bg-neutral-100 text-neutral-900 font-semibold'
						: 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60'}"
					title="Agents"
				>
					<Bot class="w-4 h-4" />
				</a>

				<a
					href="/permissions"
					class="w-8 h-8 rounded-lg flex items-center justify-center transition-colors {isActive(
						'/permissions'
					)
						? 'bg-neutral-100 text-neutral-900 font-semibold'
						: 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60'}"
					title="Permissions"
				>
					<ShieldCheck class="w-4 h-4" />
				</a>

				<a
					href="/settings"
					class="w-8 h-8 rounded-lg flex items-center justify-center transition-colors {isActive(
						'/settings'
					)
						? 'bg-neutral-100 text-neutral-900 font-semibold'
						: 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100/60'}"
					title="Settings"
				>
					<Settings class="w-4 h-4" />
				</a>
			</nav>
		</div>

		<!-- Bottom Section -->
		<div class="flex flex-col items-center gap-3 w-full pb-1">
			<!-- User Profile Avatar -->
			<div
				class="w-7 h-7 rounded-full bg-neutral-800 text-white flex items-center justify-center text-[10px] font-semibold ring-1 ring-neutral-200 cursor-pointer shadow-xs"
				title="Ethan Clark"
			>
				EC
			</div>

			<!-- GitHub with count badge -->
			<a
				href="https://github.com"
				target="_blank"
				rel="noreferrer"
				class="relative flex flex-col items-center group cursor-pointer text-neutral-500 hover:text-neutral-800 transition-colors"
				title="GitHub Repository"
			>
				<svg class="w-4 h-4 fill-current" viewBox="0 0 24 24">
					<path
						d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"
					/>
				</svg>
				<span
					class="mt-0.5 px-1 py-0.2 bg-[#b45309] text-white text-[9px] font-bold rounded-full leading-tight ring-1 ring-white"
				>
					2.1k
				</span>
			</a>

			<!-- Discord with count badge -->
			<a
				href="https://discord.com"
				target="_blank"
				rel="noreferrer"
				class="relative flex flex-col items-center group cursor-pointer text-neutral-500 hover:text-neutral-800 transition-colors"
				title="Community Discord"
			>
				<svg class="w-4 h-4 fill-current" viewBox="0 0 24 24">
					<path
						d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.894.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"
					/>
				</svg>
				<span
					class="mt-0.5 px-1 py-0.2 bg-[#b45309] text-white text-[9px] font-bold rounded-full leading-tight ring-1 ring-white"
				>
					267
				</span>
			</a>
		</div>
	</aside>

	<!-- Main Content Wrapper -->
	<div class="flex-1 flex flex-col min-w-0 h-full overflow-hidden bg-white">
		<!-- Top Application Header Bar -->
		<header
			class="h-10 shrink-0 bg-white border-b border-neutral-200/80 flex items-center justify-between px-4 z-20"
		>
			<div class="flex items-center gap-3">
				<span class="text-xs font-semibold text-neutral-800 tracking-tight">
					Lumina Labs
				</span>
				{#if currentProject}
					<span class="text-neutral-300 text-xs">/</span>
					<span class="text-xs text-neutral-500 font-medium truncate max-w-[200px]">
						{currentProject.name}
					</span>
				{/if}
			</div>

			<div class="flex items-center gap-3">
				<!-- Search trigger -->
				<button
					type="button"
					class="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded transition-colors"
					title="Search"
				>
					<Search class="w-3.5 h-3.5" />
				</button>

				<!-- Help icon -->
				<button
					type="button"
					class="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded transition-colors"
					title="Documentation & Help"
				>
					<HelpCircle class="w-3.5 h-3.5" />
				</button>

				<!-- Notification Bell -->
				<button
					type="button"
					class="p-1 text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 rounded transition-colors relative"
					title="Notifications"
				>
					<Bell class="w-3.5 h-3.5" />
				</button>

				<!-- Profile avatar in topbar -->
				<div
					class="w-6 h-6 rounded-full bg-neutral-800 text-white flex items-center justify-center text-[10px] font-semibold cursor-pointer shadow-xs"
					title="Ethan Clark"
				>
					EC
				</div>
			</div>
		</header>

		<!-- Page View -->
		<main class="flex-1 min-h-0 overflow-hidden bg-white">
			{@render children()}
		</main>
	</div>
</div>

