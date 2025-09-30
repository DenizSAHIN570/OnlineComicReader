<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { currentComic, currentPageIndex, isLoading, error, currentFile } from '$lib/store/session.js';
	import UniversalArchiveManager from '$lib/archive/universalArchiveManager.js';
	import type { ComicPage } from '../../types/comic.js';
	import { IndexedDBStore } from '$lib/store/indexeddb.js';
	import Viewer from '$lib/ui/Viewer.svelte';
	import type { ComicBook } from '../../types/comic.js';
	
	let archiveManager: UniversalArchiveManager;
	let dbStore: IndexedDBStore;
	let comic: ComicBook | null = null;
	let file: File | null = null;
	let archiveReady = false;
	
	// Subscribe to store changes
	const unsubscribeComic = currentComic.subscribe(value => {
		comic = value;
	});
	
	const unsubscribeFile = currentFile.subscribe(value => {
		file = value;
	});
	
	onMount(async () => {
		// Initialize services
		archiveManager = new UniversalArchiveManager();
		dbStore = new IndexedDBStore();
		await dbStore.init();
		
		// Check if we have a comic to display
		if (!comic) {
			await goto('/');
			return;
		}
		
		// If we have a file from the store, load it automatically
		if (file && comic) {
			try {
				// Check if file is supported first
				const isSupported = await archiveManager.isSupported(file);
				if (!isSupported) {
					throw new Error('Unsupported file format');
				}
				
				// Load the archive and get pages
				const pages = await archiveManager.openArchive(file);
				
				// Update comic with pages info
				comic.pages = pages;
				comic.totalPages = pages.length;
				currentComic.set(comic);
				
				archiveReady = true;
				console.log(`Loaded ${pages.length} pages from ${await archiveManager.getFileType(file)} archive`);
			} catch (error) {
				console.error('Failed to load archive:', error);
				// File might be stale, request reload
				requestFileReload();
			}
		} else if (comic && !file) {
			// We have comic metadata but no file, request reload
			requestFileReload();
		}
	});
	
	onDestroy(() => {
		unsubscribeComic();
		unsubscribeFile();
		if (archiveManager) {
			archiveManager.cleanup();
		}
	});
	
	// Subscribe to page changes to save reading position
	currentPageIndex.subscribe(async (pageIndex) => {
		if (comic && dbStore && pageIndex !== undefined) {
			comic.currentPage = pageIndex;
			comic.lastRead = new Date();
			try {
				await dbStore.saveComic(comic);
			} catch (error) {
				console.error('Failed to save reading position:', error);
			}
		}
	});
	
	async function onExtractPage(index: number): Promise<Blob> {
		if (!archiveManager || !comic) {
			throw new Error('Archive manager or comic not available');
		}
		
		// Check cache first
		if (dbStore) {
			try {
				const cachedBlob = await dbStore.getPageBlob(comic.id, index);
				if (cachedBlob) {
					return cachedBlob;
				}
			} catch (error) {
				console.warn('Failed to get cached page:', error);
			}
		}
		
		// Get the page from comic pages array
		const page = comic.pages[index];
		if (!page) {
			throw new Error(`Page ${index} not found`);
		}
		
		// Load page if not already loaded
		if (!page.blob) {
			await archiveManager.loadPage(page);
		}
		
		if (!page.blob) {
			throw new Error(`Failed to load page ${index}`);
		}
		
		// Cache the extracted page
		if (dbStore) {
			try {
				await dbStore.savePageBlob(comic.id, index, page.blob);
			} catch (error) {
				console.warn('Failed to cache page:', error);
			}
		}
		
		return page.blob;
	}
	
	async function handleFileReload(event: Event) {
		const input = event.target as HTMLInputElement;
		const selectedFile = input.files?.[0];
		
		if (selectedFile && comic) {
			// Verify this is the same file
			const expectedId = `${selectedFile.name}-${selectedFile.size}`;
			if (expectedId === comic.id) {
				// Update the store with the new file
				currentFile.set(selectedFile);
				
				// Reload the archive
				try {
					await archiveManager.openArchive(selectedFile);
					archiveReady = true;
					// Hide the file reload dialog
					const dialog = document.getElementById('file-reload-dialog');
					if (dialog) {
						dialog.style.display = 'none';
					}
				} catch (error) {
					console.error('Failed to reload archive:', error);
				}
			} else {
				alert('This doesn\'t appear to be the same file. Please select the correct file.');
			}
		}
		
		// Reset input
		input.value = '';
	}
	
	function requestFileReload() {
		// Show file reload dialog
		setTimeout(() => {
			const dialog = document.getElementById('file-reload-dialog');
			if (dialog) {
				dialog.style.display = 'flex';
			}
		}, 100);
	}
	
	async function goHome() {
		await goto('/');
	}
</script>

<svelte:head>
	<title>{comic?.title || 'Reading'} - Online CBR Reader</title>
</svelte:head>

{#if $error}
	<div class="error-overlay">
		<div class="error-content">
			<h2>Error</h2>
			<p>{$error}</p>
			<button on:click={goHome}>Go Home</button>
		</div>
	</div>
{/if}

{#if $isLoading}
	<div class="loading-overlay">
		<div class="loading-content">
			<div class="loading-spinner"></div>
			<p>Loading...</p>
		</div>
	</div>
{/if}

{#if comic && file && archiveReady}
	<Viewer {comic} {onExtractPage} />
{:else if comic && file && !archiveReady}
	<div class="loading-overlay">
		<div class="loading-content">
			<div class="loading-spinner"></div>
			<p>Loading archive...</p>
		</div>
	</div>
{:else if comic}
	<!-- File reload dialog -->
	<div id="file-reload-dialog" class="file-reload-overlay">
		<div class="file-reload-content">
			<h2>File Required</h2>
			<p>Please select the comic file to continue reading:</p>
			<p><strong>{comic.filename}</strong></p>
			<div class="file-reload-actions">
				<input
					type="file"
					accept=".cbz,.zip,.cbr,.rar"
					on:change={handleFileReload}
					id="file-reload-input"
				/>
				<label for="file-reload-input" class="file-select-button">
					Select File
				</label>
				<button on:click={goHome} class="cancel-button">
					Cancel
				</button>
			</div>
			<small>
				Due to browser security limitations, you need to re-select the file each time.
			</small>
		</div>
	</div>
{:else}
	<!-- No comic - redirect to home -->
	<div class="no-comic">
		<p>No comic selected.</p>
		<button on:click={goHome}>Go Home</button>
	</div>
{/if}

<style>
	.error-overlay,
	.loading-overlay,
	.file-reload-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: rgba(0, 0, 0, 0.9);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 1000;
		color: white;
	}
	
	.error-content,
	.loading-content,
	.file-reload-content {
		text-align: center;
		background: #2a2a2a;
		padding: 2rem;
		border-radius: 8px;
		max-width: 400px;
		width: 90%;
	}
	
	.loading-spinner {
		width: 40px;
		height: 40px;
		border: 4px solid #444;
		border-top: 4px solid #fff;
		border-radius: 50%;
		animation: spin 1s linear infinite;
		margin: 0 auto 1rem;
	}
	
	@keyframes spin {
		0% { transform: rotate(0deg); }
		100% { transform: rotate(360deg); }
	}
	
	.file-reload-actions {
		margin: 1.5rem 0;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	
	#file-reload-input {
		display: none;
	}
	
	.file-select-button {
		background: #4CAF50;
		color: white;
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 1rem;
		display: inline-block;
		text-align: center;
	}
	
	.file-select-button:hover {
		background: #45a049;
	}
	
	.cancel-button {
		background: #666;
		color: white;
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		font-size: 1rem;
	}
	
	.cancel-button:hover {
		background: #777;
	}
	
	.no-comic {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		height: 100vh;
		background: #1a1a1a;
		color: white;
	}
	
	button {
		background: #4CAF50;
		color: white;
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		margin-top: 1rem;
	}
	
	button:hover {
		background: #45a049;
	}
</style>
