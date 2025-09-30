<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { EnhancedZipManager } from '$lib/archive/enhancedZipManager.js';
	import { IndexedDBStore } from '$lib/store/indexeddb.js';
	import { setComic, setLoading, setError, clearError } from '$lib/store/session.js';
	import type { ComicBook } from '../types/comic.js';
	
	let fileInput: HTMLInputElement;
	let dragActive = false;
	let archiveManager: EnhancedZipManager;
	let dbStore: IndexedDBStore;
	let recentComics: ComicBook[] = [];
	
	onMount(async () => {
		archiveManager = EnhancedZipManager.getInstance();
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
			EnhancedZipManager.cleanup();
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
		// Check if file is supported
		const isSupported = await EnhancedZipManager.isFileSupported(file);
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
				// Open archive and get session
				const session = await archiveManager.openComic(file);
				
				// Create comic book object from session
				comic = {
					id: comicId,
					title: file.name.replace(/\.(cbz|zip|cbr|rar)$/i, ''),
					filename: file.name,
					pages: session.pages,
					currentPage: 0,
					totalPages: session.pages.length,
					lastRead: new Date()
				};
				
				// Save to database
				await dbStore.saveComic(comic);
			} else {
				// Update last read time
				comic.lastRead = new Date();
				await dbStore.saveComic(comic);
				
				// Reopen the archive for the session
				await archiveManager.openComic(file);
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
	<title>Online CBR Reader</title>
</svelte:head>

<main class="container">
	<header>
		<div class="logo">
			<div class="logo-icon"></div>
			<h1>Comic Reader</h1>
		</div>
		<p>A fast, modern browser-based comic book reader</p>
	</header>
	
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
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
						<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
						<polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
						<line x1="16" y1="13" x2="8" y2="13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
						<line x1="16" y1="17" x2="8" y2="17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
						<polyline points="10,9 9,9 8,9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
					</svg>
				</div>
				<h2>Drop your comic here</h2>
				<p>or click to browse files</p>
				<div class="supported-formats">
					<span class="format primary">CBZ</span>
					<span class="format primary">ZIP</span>
					<span class="format secondary" title="Limited support - conversion to CBZ recommended">CBR*</span>
					<span class="format secondary" title="Limited support - conversion to CBZ recommended">RAR*</span>
				</div>
				<div class="format-note">
					<small>* CBR/RAR files have limited browser support</small>
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
	
	{#if recentComics.length > 0}
		<section class="library">
			<div class="library-header">
				<h2>Your Library</h2>
				<span class="library-count">{recentComics.length} {recentComics.length === 1 ? 'comic' : 'comics'}</span>
			</div>
			<div class="shelf">
				{#each recentComics.slice(0, 6) as comic (comic.id)}
					<div 
						class="comic-spine" 
						role="button"
						tabindex="0"
						on:click={() => openRecentComic(comic)}
						on:keydown={(e) => e.key === 'Enter' && openRecentComic(comic)}
					>
						<div class="spine-content">
							<div class="comic-title">{comic.title}</div>
							<div class="comic-meta">
								<div class="progress-bar">
									<div class="progress-fill" style="width: {((comic.currentPage + 1) / comic.totalPages) * 100}%"></div>
								</div>
								<span class="page-info">{comic.currentPage + 1}/{comic.totalPages}</span>
							</div>
						</div>
					</div>
				{/each}
			</div>
		</section>
	{/if}
	
	<footer>
		<p>
			Built with SvelteKit + TypeScript. 
			<a href="https://github.com" target="_blank" rel="noopener noreferrer">View Source</a>
		</p>
	</footer>
</main>

<style>
	.container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 2rem;
		min-height: 100vh;
		background: #000000;
		color: #ffffff;
	}
	
	header {
		text-align: center;
		margin-bottom: 4rem;
		padding: 2rem 0;
	}
	
	.logo {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 1rem;
		margin-bottom: 1rem;
	}
	
	.logo-icon {
		width: 48px;
		height: 48px;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border-radius: 12px;
		position: relative;
		box-shadow: 0 4px 20px rgba(102, 126, 234, 0.3);
	}
	
	.logo-icon::after {
		content: '';
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: 24px;
		height: 24px;
		background: #ffffff;
		mask: url('data:image/svg+xml,<svg viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>') center/contain no-repeat;
	}
	
	header h1 {
		font-size: 2.5rem;
		margin: 0;
		font-weight: 700;
		background: linear-gradient(135deg, #ffffff 0%, #a0a0a0 100%);
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
	}
	
	header p {
		font-size: 1.1rem;
		color: #888888;
		margin: 0;
		font-weight: 300;
	}
	
	.file-loader {
		margin-bottom: 4rem;
	}
	
	.drop-zone {
		border: 2px dashed #333333;
		border-radius: 16px;
		padding: 3rem;
		text-align: center;
		cursor: pointer;
		transition: all 0.3s ease;
		background: #0a0a0a;
		position: relative;
		overflow: hidden;
	}
	
	.drop-zone::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: linear-gradient(135deg, rgba(102, 126, 234, 0.05) 0%, rgba(118, 75, 162, 0.05) 100%);
		opacity: 0;
		transition: opacity 0.3s ease;
	}
	
	.drop-zone:hover::before,
	.drop-zone.active::before {
		opacity: 1;
	}
	
	.drop-zone:hover,
	.drop-zone.active {
		border-color: #667eea;
		transform: translateY(-4px);
		box-shadow: 0 12px 40px rgba(102, 126, 234, 0.2);
	}
	
	.drop-content {
		position: relative;
		z-index: 1;
	}
	
	.upload-icon {
		margin-bottom: 1.5rem;
		color: #666666;
		transition: color 0.3s ease;
	}
	
	.drop-zone:hover .upload-icon {
		color: #667eea;
	}
	
	.drop-content h2 {
		font-size: 1.8rem;
		margin-bottom: 0.5rem;
		font-weight: 600;
		color: #ffffff;
	}
	
	.drop-content p {
		font-size: 1rem;
		margin-bottom: 1.5rem;
		color: #888888;
	}
	
	.supported-formats {
		display: flex;
		justify-content: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}
	
	.format {
		background: #1a1a1a;
		color: #cccccc;
		padding: 0.5rem 1rem;
		border-radius: 20px;
		font-size: 0.85rem;
		font-weight: 500;
		border: 1px solid #333333;
		transition: all 0.3s ease;
	}
	
	.format.primary {
		background: #1a1a1a;
		color: #ffffff;
		border-color: #444444;
	}
	
	.format.secondary {
		background: #111111;
		color: #888888;
		border-color: #222222;
		font-size: 0.8rem;
	}
	
	.drop-zone:hover .format.primary {
		background: #667eea;
		color: #ffffff;
		border-color: #667eea;
	}
	
	.drop-zone:hover .format.secondary {
		background: #333333;
		color: #aaaaaa;
		border-color: #333333;
	}
	
	.format-note {
		margin-top: 0.75rem;
	}
	
	.format-note small {
		color: #666666;
		font-size: 0.75rem;
		line-height: 1.3;
	}
	
	.library {
		margin-bottom: 4rem;
	}
	
	.library-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 2rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid #1a1a1a;
	}
	
	.library-header h2 {
		font-size: 1.8rem;
		margin: 0;
		font-weight: 600;
		color: #ffffff;
	}
	
	.library-count {
		color: #888888;
		font-size: 0.9rem;
		background: #1a1a1a;
		padding: 0.5rem 1rem;
		border-radius: 20px;
		border: 1px solid #333333;
	}
	
	.shelf {
		display: flex;
		gap: 1rem;
		overflow-x: auto;
		padding: 1rem 0;
		scrollbar-width: none;
		-ms-overflow-style: none;
	}
	
	.shelf::-webkit-scrollbar {
		display: none;
	}
	
	.comic-spine {
		min-width: 60px;
		height: 280px;
		background: linear-gradient(180deg, #2a2a2a 0%, #1a1a1a 100%);
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.3s ease;
		position: relative;
		border: 1px solid #333333;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
		overflow: hidden;
	}
	
	.comic-spine::before {
		content: '';
		position: absolute;
		top: 0;
		left: 0;
		width: 4px;
		height: 100%;
		background: linear-gradient(180deg, #667eea 0%, #764ba2 100%);
		transition: width 0.3s ease;
	}
	
	.comic-spine:hover {
		transform: translateY(-8px);
		box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
		background: linear-gradient(180deg, #333333 0%, #222222 100%);
	}
	
	.comic-spine:hover::before {
		width: 8px;
	}
	
	.spine-content {
		padding: 1rem 0.75rem;
		height: 100%;
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		position: relative;
		z-index: 1;
	}
	
	.comic-title {
		font-weight: 600;
		font-size: 0.85rem;
		color: #ffffff;
		word-break: break-word;
		line-height: 1.3;
		max-height: 180px;
		overflow: hidden;
		display: -webkit-box;
		-webkit-line-clamp: 8;
		-webkit-box-orient: vertical;
	}
	
	.comic-meta {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	
	.progress-bar {
		height: 3px;
		background: #333333;
		border-radius: 2px;
		overflow: hidden;
	}
	
	.progress-fill {
		height: 100%;
		background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
		border-radius: 2px;
		transition: width 0.3s ease;
	}
	
	.page-info {
		font-size: 0.7rem;
		color: #888888;
		text-align: center;
		font-weight: 500;
	}
	
	footer {
		text-align: center;
		margin-top: 4rem;
		padding-top: 2rem;
		border-top: 1px solid #1a1a1a;
		color: #666666;
	}
	
	footer a {
		color: #888888;
		text-decoration: none;
		transition: color 0.3s ease;
	}
	
	footer a:hover {
		color: #667eea;
	}
	
	@media (max-width: 768px) {
		.container {
			padding: 1rem;
		}
		
		header {
			margin-bottom: 2rem;
			padding: 1rem 0;
		}
		
		header h1 {
			font-size: 2rem;
		}
		
		.drop-zone {
			padding: 2rem 1rem;
		}
		
		.library-header {
			flex-direction: column;
			gap: 1rem;
			align-items: flex-start;
		}
		
		.shelf {
			gap: 0.75rem;
		}
		
		.comic-spine {
			min-width: 50px;
			height: 240px;
		}
		
		.spine-content {
			padding: 0.75rem 0.5rem;
		}
		
		.comic-title {
			font-size: 0.75rem;
		}
	}
</style>