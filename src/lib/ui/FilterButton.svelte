
<script lang="ts">
	import { filterStore, availableFilters, type Filter } from '$lib/store/filterStore';
	import type { ComicBook } from '../../types/comic';

	export let comic: ComicBook;

	let isMenuOpen = false;

	function toggleMenu() {
		isMenuOpen = !isMenuOpen;
	}

	function selectFilter(filter: Filter) {
		filterStore.setFilter(comic.id, filter);
		isMenuOpen = false;
	}

	$: activeFilter = $filterStore[comic.id] || 'none';
</script>

<div class="filter-container">
	{#if isMenuOpen}
		<div class="filter-menu">
			<ul>
				{#each availableFilters as filter}
					<li>
						<button
							class:active={activeFilter === filter.id}
							on:click={() => selectFilter(filter.id)}
						>
							{filter.name}
						</button>
					</li>
				{/each}
			</ul>
		</div>
	{/if}
	<button class="filter-toggle" on:click={toggleMenu} aria-label="Open filter menu">
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="24" height="24">
			<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/>
			<path d="M12 4c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
			<path d="M12 14c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
		</svg>
	</button>
</div>

<style>
	.filter-container {
		position: fixed;
		bottom: 1.5rem;
		right: 1.5rem;
		z-index: 20;
	}

	.filter-toggle {
		background: linear-gradient(135deg, #ff6600 0%, #ff8533 100%);
		color: white;
		border: none;
		border-radius: 50%;
		width: 56px;
		height: 56px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		box-shadow: 0 6px 18px rgba(255, 102, 0, 0.35);
		transition: transform 0.2s ease, box-shadow 0.2s ease;
	}

	.filter-toggle:hover {
		transform: translateY(-2px) scale(1.05);
		box-shadow: 0 10px 24px rgba(255, 102, 0, 0.45);
	}

	.filter-menu {
		position: absolute;
		bottom: 68px;
		right: 0;
		background: #2a2a2a;
		border-radius: 8px;
		box-shadow: 0 10px 30px rgba(0, 0, 0, 0.4);
		border: 1px solid rgba(255, 255, 255, 0.1);
		width: 200px;
		overflow: hidden;
	}

	.filter-menu ul {
		list-style: none;
		margin: 0;
		padding: 0.5rem;
	}

	.filter-menu li button {
		width: 100%;
		padding: 0.75rem 1rem;
		background: transparent;
		color: #f5f5f5;
		border: none;
		text-align: left;
		cursor: pointer;
		border-radius: 4px;
		font-size: 1rem;
		transition: background 0.2s ease;
	}

	.filter-menu li button:hover {
		background: #3a3a3a;
	}

	.filter-menu li button.active {
		background: #ff6600;
		color: white;
		font-weight: 600;
	}
</style>
