<script lang="ts">
	import { themeStore, type Theme } from '$lib/services/theme';
	import { onMount } from 'svelte';

	let currentTheme: Theme = 'system';

	onMount(() => {
		const unsubscribe = themeStore.subscribe(value => {
			currentTheme = value;
		});
		return unsubscribe;
	});

	function toggleTheme() {
		// Cycle: light -> dark -> system
		if (currentTheme === 'light') themeStore.setTheme('dark');
		else if (currentTheme === 'dark') themeStore.setTheme('system');
		else themeStore.setTheme('light');
	}
</script>

<button
	on:click={toggleTheme}
	class="theme-toggle"
	title="Toggle Theme ({currentTheme})"
	aria-label="Toggle Theme"
>
	{#if currentTheme === 'light'}
		<!-- Sun Icon -->
		<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
		</svg>
	{:else if currentTheme === 'dark'}
		<!-- Moon Icon -->
		<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
		</svg>
	{:else}
		<!-- System/Computer Icon -->
		<svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
		</svg>
	{/if}
</button>

<style>
	.theme-toggle {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.5rem;
		border-radius: 9999px;
		color: var(--color-text-secondary);
		background-color: transparent;
		border: 1px solid var(--color-border); /* Added border to make it visible against bg */
		transition: all 0.2s;
		cursor: pointer;
	}
	.theme-toggle:hover {
		background-color: var(--color-bg-secondary);
		color: var(--color-text-main);
		border-color: var(--color-text-secondary);
	}
	
	svg {
		width: 1.25rem;
		height: 1.25rem;
	}
</style>