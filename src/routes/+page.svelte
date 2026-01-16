<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { comicStorage, type ComicMetadata, type StoredComic } from '$lib/storage/comicStorage.js';
	import { setLoading } from '$lib/store/session.js';
	import { handleFile, openExistingComic, cleanupComicProcessor } from '$lib/services/comicProcessor.js';

	let fileInput: HTMLInputElement;
	let dragActive = false;
	let recentComics: ComicMetadata[] = [];
	let storageInfo = { usage: 0, quota: 0, percentage: 0 };

	onMount(async () => {
		try {
			await comicStorage.init();
			await loadComics();
		} catch (error) {
			console.error('Failed to initialize:', error);
		}
	});

	async function loadComics() {
		recentComics = await comicStorage.getAllComics();
		recentComics.sort((a, b) => b.lastAccessed - a.lastAccessed);
		storageInfo = await comicStorage.getStorageEstimate();
	}

	onDestroy(() => {
		cleanupComicProcessor();
	});

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		dragActive = true;
	}

	function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		dragActive = false;
	}

	async function handleDrop(event: DragEvent) {
		event.preventDefault();
		dragActive = false;

		const files = event.dataTransfer?.files;
		if (files && files.length > 0) {
			await handleFile(files[0], loadComics);
		}
	}

	async function handleFileInput(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];

		if (file) {
			await handleFile(file, loadComics);
		}

		input.value = '';
	}

	async function openRecentComic(comicMeta: ComicMetadata) {
		try {
			setLoading(true, 'Loading comic...');

			const storedComic = await comicStorage.getComic(comicMeta.id);
			if (!storedComic) {
				alert('Comic not found in storage');
				setLoading(false);
				return;
			}

			const file = comicStorage.createFile(storedComic as StoredComic);
			await openExistingComic(comicMeta.id, file, loadComics);
			
		} catch (error) {
			console.error('Failed to open comic:', error);
			setLoading(false);
			alert('Failed to open comic: ' + (error instanceof Error ? error.message : 'Unknown error'));
		}
	}
	
	async function deleteComic(comicMeta: ComicMetadata, event: Event) {
		event.stopPropagation(); // Prevent opening the comic
		
		if (confirm(`Delete "${comicMeta.filename}" from library?`)) {
			try {
				// Delete from storage
				await comicStorage.deleteComic(comicMeta.id);
				
				// Reload the list
				await loadComics();
			} catch (error) {
				console.error('Failed to delete comic:', error);
				alert('Failed to delete comic');
			}
		}
	}
	
	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
	}
	
	function formatDate(timestamp: number): string {
		const date = new Date(timestamp);
		const now = new Date();
		const diff = now.getTime() - date.getTime();
		const days = Math.floor(diff / (1000 * 60 * 60 * 24));

		if (days === 0) return 'Today';
		if (days === 1) return 'Yesterday';
		if (days < 7) return `${days} days ago`;
		return date.toLocaleDateString();
	}
	
	function triggerFileInput() {
		fileInput?.click();
	}
</script>

<svelte:head>
	<title>Online Comic Reader</title>
</svelte:head>

<main class="container">
	<header>
		<div class="header-content">
			<h1>Online Comic Reader</h1>
			{#if recentComics.length > 0}
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
	
	{#if recentComics.length > 0}
		<section class="library">
			<div class="library-header">
				<h2>Your Library</h2>
				<span class="library-count">{recentComics.length} {recentComics.length === 1 ? 'comic' : 'comics'}</span>
			</div>
			<div class="bookshelf">
				<div class="shelf-row">
					{#each recentComics.slice(0, 12) as comic (comic.id)}
						<div 
							class="comic-book" 
							role="button"
							tabindex="0"
							on:click={() => openRecentComic(comic)}
							on:keydown={(e) => e.key === 'Enter' && openRecentComic(comic)}
						>
							<div class="comic-cover">
								{#if comic.thumbnail}
									<img src={comic.thumbnail} alt={comic.filename} />
								{:else}
									<div class="placeholder-cover">
										<div class="placeholder-icon">
											<svg width="48" height="48" viewBox="0 0 24 24" fill="none">
												<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.5"/>
												<polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="1.5"/>
											</svg>
										</div>
										<div class="placeholder-title">{comic.filename.replace(/\.(cbz|zip|cbr|rar)$/i, '')}</div>
									</div>
								{/if}
								<button 
									class="delete-btn"
									on:click={(e) => deleteComic(comic, e)}
									title="Delete comic"
								>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none">
										<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
									</svg>
								</button>
							</div>
						<div class="comic-info">
							<div class="comic-title">{comic.filename}</div>
							<div class="comic-meta">
								<span>{formatFileSize(comic.fileSize)}</span>
								<span>•</span>
								<span>{formatDate(comic.lastAccessed)}</span>
								{#if comic.totalPages > 0}
									<span>•</span>
									<span>Page {Math.min(comic.currentPage + 1, comic.totalPages)} / {comic.totalPages}</span>
								{/if}
							</div>
						</div>
					</div>
				{/each}
				</div>
				<div class="shelf-support"></div>
			</div>
		</section>
	{:else}
		<div class="empty-state">
			<svg width="120" height="120" viewBox="0 0 24 24" fill="none">
				<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1" stroke-opacity="0.3"/>
				<polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="1" stroke-opacity="0.3"/>
			</svg>
			<h2>No comics yet</h2>
			<p>Upload your first comic below to get started</p>
		</div>
	{/if}
	
	<div class="file-loader">
		<div 
			class="drop-zone"
			class:active={dragActive}
			on:dragover={handleDragOver}
			on:dragleave={handleDragLeave}
			on:drop={handleDrop}
			role="button"
			tabindex="0"
			on:click={triggerFileInput}
			on:keydown={(e) => e.key === 'Enter' && triggerFileInput()}
		>
			<div class="drop-content">
				<div class="upload-icon">
					<svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
						<polyline points="17 8 12 3 7 8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
						<line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</div>
				<span class="drop-text">Drop comic or click to browse</span>
				<div class="supported-formats">
					<span class="format">CBZ</span>
					<span class="format">CBR</span>
				</div>
			</div>
		</div>
		
		<input
			bind:this={fileInput}
			type="file"
			accept=".cbz,.zip,.cbr,.rar"
			on:change={handleFileInput}
			style="display: none;"
		/>
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
	
	.empty-state {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		color: #333;
		padding: 4rem 2rem;
	}
	
	.empty-state svg {
		margin-bottom: 2rem;
		opacity: 0.2;
	}
	
	.empty-state h2 {
		font-size: 2rem;
		margin: 0 0 1rem;
		color: #444;
	}
	
	.empty-state p {
		font-size: 1.1rem;
		color: #333;
		margin: 0;
	}
	
	.file-loader {
		margin-top: auto;
		padding-top: 2rem;
	}
	
	.drop-zone {
		border: 2px dashed #222;
		border-radius: 8px;
		padding: 1.25rem;
		text-align: center;
		cursor: pointer;
		transition: all 0.3s ease;
		background: #000000;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.drop-zone:hover,
	.drop-zone.active {
		border-color: #ff6600;
		background: #0a0a0a;
	}
	
	.drop-content {
		display: flex;
		align-items: center;
		gap: 1.5rem;
	}
	
	.upload-icon {
		color: #444;
		transition: color 0.3s ease;
		display: flex;
		align-items: center;
	}
	
	.drop-zone:hover .upload-icon {
		color: #ff6600;
	}
	
	.drop-text {
		font-size: 1rem;
		color: #666;
		font-weight: 500;
	}
	
	.drop-zone:hover .drop-text {
		color: #ffffff;
	}
	
	.supported-formats {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	
	.format {
		background: #111;
		color: #555;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 500;
		border: 1px solid #1a1a1a;
		transition: all 0.3s ease;
	}
	
	.drop-zone:hover .format {
		background: #1a1a1a;
		color: #ff6600;
		border-color: #222;
	}
	
	.library {
		flex: 1;
		margin-bottom: 2rem;
	}
	
	.library-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 2rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid #111;
	}
	
	.library-header h2 {
		font-size: 1.8rem;
		margin: 0;
		font-weight: 600;
		color: #ffffff;
	}
	
	.library-count {
		color: #666;
		font-size: 0.9rem;
		background: #0a0a0a;
		padding: 0.5rem 1rem;
		border-radius: 20px;
		border: 1px solid #111;
	}
	
	.bookshelf {
		perspective: 1000px;
	}
	
	.shelf-row {
		display: flex;
		gap: 1.5rem;
		padding: 2rem 1rem 0.5rem;
		overflow-x: auto;
		scrollbar-width: thin;
		scrollbar-color: #222 #000;
		position: relative;
		background: linear-gradient(to bottom, transparent 0%, #000 95%);
	}
	
	.shelf-row::-webkit-scrollbar {
		height: 8px;
	}
	
	.shelf-row::-webkit-scrollbar-track {
		background: #000;
	}
	
	.shelf-row::-webkit-scrollbar-thumb {
		background: #222;
		border-radius: 4px;
	}
	
	.shelf-support {
		height: 20px;
		background: linear-gradient(to bottom, 
			#1a1a1a 0%, 
			#111 30%, 
			#000 100%);
		box-shadow: 
			0 -2px 10px rgba(0, 0, 0, 0.5),
			0 2px 5px rgba(0, 0, 0, 0.8),
			inset 0 1px 0 rgba(255, 255, 255, 0.05);
		border-radius: 2px;
		position: relative;
	}
	
	.shelf-support::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		height: 2px;
		background: linear-gradient(to right, 
			transparent 0%, 
			rgba(255, 255, 255, 0.05) 50%, 
			transparent 100%);
	}
	
	.comic-book {
		min-width: 140px;
		max-width: 140px;
		cursor: pointer;
		transition: transform 0.3s ease;
		position: relative;
		transform-style: preserve-3d;
	}
	
	.comic-book:hover {
		transform: translateY(-10px) rotateY(-5deg) scale(1.05);
		z-index: 10;
	}
	
	.comic-cover {
		width: 140px;
		height: 210px;
		background: #000;
		border-radius: 4px;
		overflow: hidden;
		position: relative;
		box-shadow: 
			-5px 0 15px rgba(0, 0, 0, 0.8),
			2px 2px 5px rgba(0, 0, 0, 0.6),
			0 0 40px rgba(0, 0, 0, 0.5);
		border: 1px solid #111;
		background: linear-gradient(135deg, #111 0%, #000 100%);
	}
	
	.comic-cover::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		width: 3px;
		height: 100%;
		background: linear-gradient(to bottom,
			rgba(0, 0, 0, 0.4) 0%,
			rgba(0, 0, 0, 0.6) 50%,
			rgba(0, 0, 0, 0.4) 100%);
		z-index: 2;
	}
	
	.comic-cover::after {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: linear-gradient(105deg,
			rgba(255, 255, 255, 0) 40%,
			rgba(255, 255, 255, 0.05) 45%,
			rgba(255, 255, 255, 0) 50%);
		pointer-events: none;
	}
	
	.comic-cover img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}
	
	.placeholder-cover {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, #ff6600 0%, #ff8833 100%);
		color: white;
		padding: 1rem;
		text-align: center;
	}
	
	.placeholder-icon {
		margin-bottom: 1rem;
		opacity: 0.8;
	}
	
	.placeholder-title {
		font-size: 0.9rem;
		font-weight: 600;
		line-height: 1.3;
		max-height: 3.9em;
		overflow: hidden;
		display: -webkit-box;
		line-clamp: 3;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
	}
	
	.delete-btn {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		background: rgba(0, 0, 0, 0.8);
		border: 1px solid rgba(255, 255, 255, 0.1);
		color: #ff4444;
		width: 32px;
		height: 32px;
		border-radius: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		opacity: 0;
		transition: all 0.2s ease;
		z-index: 3;
	}
	
	.comic-book:hover .delete-btn {
		opacity: 1;
	}
	
	.delete-btn:hover {
		background: rgba(255, 68, 68, 0.2);
		border-color: #ff4444;
	}
	
	.comic-info {
		margin-top: 0.75rem;
		text-align: center;
	}
	
	.comic-info .comic-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: #ffffff;
		margin-bottom: 0.25rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	
	.comic-info .comic-meta {
		font-size: 0.7rem;
		color: #666;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}
	
	@media (max-width: 768px) {
		.container {
			padding: 1rem;
		}
		
		.drop-zone {
			padding: 1rem;
		}
		
		.drop-content {
			flex-direction: row;
			gap: 1rem;
			flex-wrap: wrap;
			justify-content: center;
		}
		
		.library-header {
			flex-direction: column;
			gap: 1rem;
			align-items: flex-start;
		}
		
		.shelf-row {
			gap: 1rem;
			padding: 1.5rem 0.5rem 0.5rem;
		}
		
		.comic-book {
			min-width: 110px;
			max-width: 110px;
		}
		
		.comic-cover {
			width: 110px;
			height: 165px;
		}
		
		.comic-info .comic-title {
			font-size: 0.75rem;
		}
		
		.comic-info .comic-meta {
			font-size: 0.65rem;
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
