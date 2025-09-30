<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import ArchiveManager from '$lib/archive/archiveManager.js';
	import { IndexedDBStore } from '$lib/store/indexeddb.js';
	import { setComic, setLoading, setError, clearError } from '$lib/store/session.js';
	import type { ComicBook } from '../types/comic.js';
	
	let fileInput: HTMLInputElement;
	let dragActive = false;
	let archiveManager: ArchiveManager | null = null;
	let dbStore: IndexedDBStore;
	let recentComics: ComicBook[] = [];
	
	onMount(async () => {
		// Don't initialize archiveManager here - create on demand
		dbStore = new IndexedDBStore();
		
		try {
			await dbStore.init();
			recentComics = await dbStore.getAllComics();
		} catch (error) {
			console.error('Failed to initialize database:', error);
		}
	});
	
	onDestroy(() => {
		if (archiveManager) {
			archiveManager.cleanup();
			archiveManager = null;
		}
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
			await handleFile(files[0]);
		}
	}
	
	async function handleFileInput(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		
		if (file) {
			await handleFile(file);
		}
		
		// Reset input
		input.value = '';
	}
	
	async function handleFile(file: File) {
		// Initialize archive manager on demand
		if (!archiveManager) {
			archiveManager = new ArchiveManager();
		}
		
		// Check if file is supported
		const isSupported = await archiveManager.isSupported(file);
		if (!isSupported) {
			setError('Please select a CBZ, ZIP, CBR, or RAR file.');
			return;
		}
		
		clearError();
		setLoading(true, 'Processing archive...');
		
		try {
			// Generate comic ID from filename and size
			const comicId = `${file.name}-${file.size}`;
			
			// Check if we already have this comic cached
			let comic = await dbStore.getComic(comicId);
			
			if (!comic) {
				// Open archive and get pages
				const pages = await archiveManager.openArchive(file);
				
				// Load the first page to create a thumbnail
				let coverThumbnail: string | undefined;
				if (pages.length > 0) {
					try {
						await archiveManager.loadPage(pages[0]);
						if (pages[0].blob) {
							// Create thumbnail
							coverThumbnail = await createThumbnail(pages[0].blob);
						}
					} catch (err) {
						console.warn('Failed to create thumbnail:', err);
					}
				}
				
				// Create comic book object with clean pages (no proxy objects)
				comic = {
					id: comicId,
					title: file.name.replace(/\.(cbz|zip|cbr|rar)$/i, ''),
					filename: file.name,
					pages: pages.map(p => ({
						filename: p.filename,
						index: p.index
					})),
					currentPage: 0,
					totalPages: pages.length,
					lastRead: new Date(),
					coverThumbnail
				};
				
				// Save to database
				await dbStore.saveComic(comic);
			} else {
				// Update last read time
				comic.lastRead = new Date();
				await dbStore.saveComic(comic);
				
				// Reopen the archive
				await archiveManager.openArchive(file);
			}
			
			// Set current comic and navigate to reader
			setComic(comic, file);
			await goto('/reader');
			
		} catch (error) {
			console.error('Failed to process file:', error);
			setError(error instanceof Error ? error.message : 'Failed to process file');
		} finally {
			setLoading(false);
		}
	}
	
	async function createThumbnail(blob: Blob): Promise<string> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			const canvas = document.createElement('canvas');
			const ctx = canvas.getContext('2d');
			
			img.onload = () => {
				// Set thumbnail size
				const maxWidth = 200;
				const maxHeight = 300;
				let width = img.width;
				let height = img.height;
				
				// Calculate aspect ratio
				if (width > height) {
					if (width > maxWidth) {
						height *= maxWidth / width;
						width = maxWidth;
					}
				} else {
					if (height > maxHeight) {
						width *= maxHeight / height;
						height = maxHeight;
					}
				}
				
				canvas.width = width;
				canvas.height = height;
				
				if (ctx) {
					ctx.drawImage(img, 0, 0, width, height);
					canvas.toBlob((thumbnailBlob) => {
						if (thumbnailBlob) {
							const reader = new FileReader();
							reader.onloadend = () => {
								resolve(reader.result as string);
							};
							reader.readAsDataURL(thumbnailBlob);
						} else {
							reject(new Error('Failed to create thumbnail'));
						}
					}, 'image/jpeg', 0.8);
				} else {
					reject(new Error('Failed to get canvas context'));
				}
				
				// Clean up
				URL.revokeObjectURL(img.src);
			};
			
			img.onerror = () => {
				reject(new Error('Failed to load image'));
			};
			
			img.src = URL.createObjectURL(blob);
		});
	}
	
	async function openRecentComic(comic: ComicBook) {
		// Set comic without file - user will need to re-select file
		setComic(comic);
		await goto('/reader');
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
		<h1>Online Comic Reader</h1>
	</header>
	
	{#if recentComics.length > 0}
		<section class="library">
			<div class="library-header">
				<h2>Your Library</h2>
				<span class="library-count">{recentComics.length} {recentComics.length === 1 ? 'comic' : 'comics'}</span>
			</div>
			<div class="bookshelf">
				<div class="shelf-row">
					{#each recentComics.slice(0, 8) as comic (comic.id)}
						<div 
							class="comic-book" 
							role="button"
							tabindex="0"
							on:click={() => openRecentComic(comic)}
							on:keydown={(e) => e.key === 'Enter' && openRecentComic(comic)}
						>
							<div class="comic-cover">
								{#if comic.coverThumbnail}
									<img src={comic.coverThumbnail} alt={comic.title} />
								{:else}
									<div class="placeholder-cover">
										<div class="placeholder-icon">
											<svg width="48" height="48" viewBox="0 0 24 24" fill="none">
												<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.5"/>
												<polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="1.5"/>
											</svg>
										</div>
										<div class="placeholder-title">{comic.title}</div>
									</div>
								{/if}
								<div class="reading-progress">
									<div class="progress-bar">
										<div class="progress-fill" style="width: {((comic.currentPage + 1) / comic.totalPages) * 100}%"></div>
									</div>
								</div>
							</div>
							<div class="comic-info">
								<div class="comic-title">{comic.title}</div>
								<div class="comic-pages">{comic.currentPage + 1} / {comic.totalPages}</div>
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
		background: #000000; /* AMOLED black */
	}

	.container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 2rem;
		min-height: 100vh;
		background: #000000; /* AMOLED black */
		color: #ffffff;
		display: flex;
		flex-direction: column;
	}
	
	header {
		padding: 1rem 0 2rem;
		border-bottom: 1px solid #111;
		margin-bottom: 2rem;
	}
	
	header h1 {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0;
		color: #ff6600; /* Bright orange */
		text-align: center;
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
		background: linear-gradient(135deg, #ff6600 0%, #ff8833 100%); /* Orange gradient */
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
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
	}
	
	.reading-progress {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		padding: 0.5rem;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.9), transparent);
		z-index: 1;
	}
	
	.reading-progress .progress-bar {
		height: 3px;
		background: rgba(255, 255, 255, 0.2);
		border-radius: 2px;
		overflow: hidden;
	}
	
	.reading-progress .progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #ff6600 0%, #ff8833 100%); /* Orange gradient */
		border-radius: 2px;
		transition: width 0.3s ease;
		box-shadow: 0 0 5px rgba(255, 102, 0, 0.5);
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
	
	.comic-info .comic-pages {
		font-size: 0.75rem;
		color: #666;
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
		
		.comic-info .comic-pages {
			font-size: 0.65rem;
		}
	}
</style>