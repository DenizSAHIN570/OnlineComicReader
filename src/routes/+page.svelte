<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import FileExplorer from '$lib/ui/FileExplorer.svelte';
	import BulkUploader from '$lib/ui/BulkUploader.svelte';
	import { comicStorage } from '$lib/storage/comicStorage.js';
	import { cleanupComicProcessor } from '$lib/services/comicProcessor.js';

	let storageInfo = { usage: 0, quota: 0, percentage: 0 };
	let comicCount = 0;

	onMount(async () => {
		try {
			await comicStorage.init();
			const comics = await comicStorage.getAllComics();
			comicCount = comics.length;
			storageInfo = await comicStorage.getStorageEstimate();
		} catch (error) {
			console.error('Failed to initialize:', error);
		}
	});

	onDestroy(() => {
		cleanupComicProcessor();
	});

	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
	}
</script>

<svelte:head>
	<title>Online Comic Reader</title>
</svelte:head>

<main class="container">
	<header>
		<div class="header-content">
			<h1>Online Comic Reader</h1>
			{#if comicCount > 0}
				<div class="storage-info">
					<span class="storage-text">
						{formatFileSize(storageInfo.usage)} / {formatFileSize(storageInfo.quota)}
					</span>
					<div class="storage-bar">
						<div class="storage-fill" style="width: {Math.min(storageInfo.percentage, 100)}%"></div>
					</div>
				</div>
			{/if}
		</div>
	</header>

	<FileExplorer />

	<div class="file-loader">
		<BulkUploader />
	</div>
</main>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		background: #000000;
	}

	.container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 2rem;
		min-height: 100vh;
		background: #000000;
		color: #ffffff;
		display: flex;
		flex-direction: column;
	}

	header {
		padding: 1rem 0 2rem;
		border-bottom: 1px solid #111;
		margin-bottom: 2rem;
	}

	.header-content {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	header h1 {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0;
		color: #ff6600;
	}

	.storage-info {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.25rem;
	}

	.storage-text {
		font-size: 0.75rem;
		color: #666;
	}

	.storage-bar {
		width: 120px;
		height: 4px;
		background: #111;
		border-radius: 2px;
		overflow: hidden;
	}

	.storage-fill {
		height: 100%;
		background: #ff6600;
		transition: width 0.3s ease;
	}

	.file-loader {
		margin-top: auto;
		padding-top: 2rem;
	}

	@media (max-width: 768px) {
		.container {
			padding: 1rem;
		}

		.header-content {
			flex-direction: column;
			gap: 1rem;
			align-items: flex-start;
		}

		.storage-info {
			align-items: flex-start;
		}
	}
</style>
