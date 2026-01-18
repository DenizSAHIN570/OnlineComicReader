<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { comicStorage } from '$lib/storage/comicStorage.js';
	import { setLoading, setError, setComic } from '$lib/store/session.js';
	import { handleFile, cleanupComicProcessor } from '$lib/services/comicProcessor.js';
	import ThemeToggle from '$lib/ui/ThemeToggle.svelte';
	import { logger } from '$lib/services/logger';
    import ArchiveManager from '$lib/archive/archiveManager.js';
    import { goto } from '$app/navigation';
    import type { ComicBook, FileSystemItem } from '../types/comic';

	let fileInput = $state<HTMLInputElement>();
	let dragActive = $state(false);
	let recentComics = $state<(FileSystemItem & { metadata?: ComicBook })[]>([]);
	let storageInfo = $state({ usage: 0, quota: 0, percentage: 0 });
    let openMenuId = $state<string | null>(null);

	onMount(async () => {
		try {
			await comicStorage.init();
			await loadComics();
		} catch (error) {
			logger.error('Home', 'Failed to initialize', error);
			setError('Failed to initialize application', 'error');
		}
	});

	async function loadComics() {
		try {
			const files = await comicStorage.getRecentFiles(12);
			
			// Calculate total usage based on files instead of disk quota
			let totalUsage = 0;
			
			recentComics = await Promise.all(files.map(async file => {
				const metadata = await comicStorage.getComicMetadata(file.id);
				if (file.size) totalUsage += file.size;
				return {
					...file,
					metadata: metadata || undefined
				};
			}));
			
			// Use manually calculated usage to match file sizes
			const estimate = await comicStorage.getStorageEstimate();
			storageInfo = {
				...estimate,
				usage: totalUsage // Override usage
			};
		} catch (err) {
			logger.error('Home', 'Failed to load comics', err);
		}
	}

	onDestroy(() => {
		cleanupComicProcessor();
	});

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		dragActive = true;
	}

	function handleDragLeave() {
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

	async function openRecentComic(item: FileSystemItem & { metadata?: ComicBook }) {
		try {
			logger.info('Home', `Opening comic: ${item.name}`);
			setLoading(true, 'Loading comic...');

            const file = await comicStorage.getFile(item.id);
			if (!file) {
				logger.warn('Home', `File data not found: ${item.id}`);
				setError('Comic data not found in storage', 'warning');
				setLoading(false);
				return;
			}

			const archiveManager = new ArchiveManager();
			
            // Unwrap proxy if it exists
            let comic: ComicBook | undefined;
            if (item.metadata) {
                 comic = JSON.parse(JSON.stringify(item.metadata));
            }
			
			if (!comic || !comic.pages || comic.pages.length === 0) {
				const pages = await archiveManager.openArchive(file);
				comic = {
					id: item.id,
					title: item.name.replace(/\.(cbz|zip|cbr|rar)$/i, ''),
					filename: item.name,
					pages: pages.map(p => ({ filename: p.filename, index: p.index })),
					currentPage: 0,
					totalPages: pages.length,
					lastRead: new Date(),
                    coverThumbnail: item.thumbnail
				};
				await comicStorage.saveComicMetadata(comic);
			} else {
				comic.lastRead = new Date();
				await comicStorage.saveComicMetadata(comic);
			}
            
            if (!comic) throw new Error('Failed to initialize comic metadata');

			await comicStorage.updateLastAccessed(item.id, {
				currentPage: comic.currentPage ?? 0,
				totalPages: comic.totalPages
			});

			setComic(comic, file);
			logger.info('Home', 'Navigating to reader...');
			await goto('/reader');
			
		} catch (error) {
			logger.error('Home', 'Failed to open comic', error);
			setLoading(false);
			setError('Failed to open comic: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error');
		} finally {
			setTimeout(() => setLoading(false), 500);
		}
	}
	
	async function deleteComic(item: FileSystemItem, event: MouseEvent) {
		event.stopPropagation();
        event.preventDefault();
        openMenuId = null; // Close menu
		
		if (confirm(`Delete "${item.name}" from library?`)) {
			try {
                await comicStorage.deleteComic(item.id);
				await loadComics();
				logger.info('Home', `Deleted comic: ${item.name}`);
			} catch (error) {
				logger.error('Home', 'Failed to delete comic', error);
				setError('Failed to delete comic', 'error');
			}
		}
	}

    function toggleMenu(id: string, event: MouseEvent) {
        event.stopPropagation();
        event.preventDefault(); 
        if (openMenuId === id) {
            openMenuId = null;
        } else {
            openMenuId = id;
        }
    }

    function closeMenu() {
        openMenuId = null;
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
</script>

<svelte:head>
	<title>ComiKaiju</title>
</svelte:head>

<svelte:window onclick={closeMenu} />

<main class="container">
	<header>
		<div class="header-content">
			<h1>ComiKaiju</h1>
			<div class="header-actions">
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
				<ThemeToggle />
				
				<a href="/library" class="library-link" aria-label="Go to Library">
					<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
					</svg>
				</a>
			</div>
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
					{#each recentComics as item (item.id)}
						<div 
                            class="comic-book" 
                            style:z-index={openMenuId === item.id ? 50 : undefined}
                        >
							<div class="comic-cover">
                                <!-- Clickable area for cover -->
                                <div 
                                    class="cover-action" 
                                    role="button" 
                                    tabindex="0" 
                                    onclick={() => openRecentComic(item)} 
                                    onkeydown={(e) => e.key === 'Enter' && openRecentComic(item)}
                                >
                                    {#if item.thumbnail}
                                        <img src={item.thumbnail} alt={item.name} />
                                    {:else}
                                        <div class="placeholder-cover">
                                            <div class="placeholder-icon">
                                                <svg width="48" height="48" viewBox="0 0 24 24" fill="none">
                                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" stroke-width="1.5"/>
                                                    <polyline points="14,2 14,8 20,8" stroke="currentColor" stroke-width="1.5"/>
                                                </svg>
                                            </div>
                                            <div class="placeholder-title">{item.name.replace(/\.(cbz|zip|cbr|rar)$/i, '')}</div>
                                        </div>
                                    {/if}
                                    
                                    {#if item.metadata && item.metadata.totalPages > 0}
                                        <div class="progress-badge">
                                            {Math.min(item.metadata.currentPage + 1, item.metadata.totalPages)} / {item.metadata.totalPages}
                                        </div>
                                        <div class="progress-bar-container">
                                            <div 
                                                class="progress-bar-fill" 
                                                style="width: {((item.metadata.currentPage + 1) / item.metadata.totalPages) * 100}%"
                                            ></div>
                                        </div>
                                    {/if}
                                </div>
							</div>
                            
                            <!-- Info with Menu -->
                            <div class="comic-info-container">
                                <div 
                                    class="comic-info" 
                                    role="button" 
                                    tabindex="0" 
                                    onclick={() => openRecentComic(item)}
                                    onkeydown={(e) => e.key === 'Enter' && openRecentComic(item)}
                                >
                                    <div class="comic-title">{item.name}</div>
                                    <div class="comic-meta">
                                        <span>{formatFileSize(item.size || 0)}</span>
                                        <span>•</span>
                                        <span>{formatDate(item.updatedAt)}</span>
                                    </div>
                                </div>

                                <!-- 3-dot Menu -->
                                <div class="menu-container">
                                    <button 
                                        class="menu-btn"
                                        onclick={(e) => toggleMenu(item.id, e)}
                                        aria-label="Options"
                                    >
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="pointer-events-none">
                                            <circle cx="12" cy="12" r="1" />
                                            <circle cx="12" cy="5" r="1" />
                                            <circle cx="12" cy="19" r="1" />
                                        </svg>
                                    </button>
                                    
                                    {#if openMenuId === item.id}
                                        <div class="dropdown-menu">
                                            <button 
                                                class="dropdown-item delete"
                                                onclick={(e) => deleteComic(item, e)}
                                            >
                                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="pointer-events-none">
                                                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" stroke-linecap="round" stroke-linejoin="round"/>
                                                </svg>
                                                Delete
                                            </button>
                                        </div>
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
			ondragover={handleDragOver}
			ondragleave={handleDragLeave}
			ondrop={handleDrop}
			role="button"
			tabindex="0"
			onclick={() => fileInput?.click()}
			onkeydown={(e) => e.key === 'Enter' && fileInput?.click()}
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
			onchange={handleFileInput}
			style="display: none;"
		/>
	</div>
</main>

<style>
	:global(body) {
		margin: 0;
		padding: 0;
		background-color: var(--color-bg-main);
	}

	.container {
		max-width: 1400px;
		margin: 0 auto;
		padding: 2rem;
		min-height: 100vh;
		display: flex;
		flex-direction: column;
	}
	
	header {
		padding: 1rem 0 2rem;
		border-bottom: 1px solid var(--color-border);
		margin-bottom: 2rem;
	}
	
	.header-content {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.header-actions {
		display: flex;
		align-items: center;
		gap: 1.5rem;
	}

	.library-link {
		color: var(--color-text-main);
		padding: 0.5rem;
		border-radius: 9999px;
		transition: all 0.2s;
	}

	.library-link:hover {
		background-color: var(--color-bg-secondary);
		color: var(--color-primary);
	}
	
	header h1 {
		font-size: 1.5rem;
		font-weight: 600;
		margin: 0;
		color: var(--color-primary);
	}
	
	.storage-info {
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.25rem;
	}
	
	.storage-text {
		font-size: 0.75rem;
		color: var(--color-text-secondary);
	}
	
	.storage-bar {
		width: 120px;
		height: 4px;
		background: var(--color-bg-secondary);
		border-radius: 2px;
		overflow: hidden;
	}
	
	.storage-fill {
		height: 100%;
		background: var(--color-primary);
		transition: width 0.3s ease;
	}
	
	.empty-state {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		color: var(--color-text-secondary);
		padding: 4rem 2rem;
	}
	
	.empty-state svg {
		margin-bottom: 2rem;
		opacity: 0.2;
		color: var(--color-text-main);
	}
	
	.empty-state h2 {
		font-size: 2rem;
		margin: 0 0 1rem;
		color: var(--color-text-main);
	}
	
	.empty-state p {
		font-size: 1.1rem;
		color: var(--color-text-secondary);
		margin: 0;
	}
	
	.file-loader {
		margin-top: auto;
		padding-top: 2rem;
	}
	
	.drop-zone {
		border: 2px dashed var(--color-border);
		border-radius: 8px;
		padding: 1.25rem;
		text-align: center;
		cursor: pointer;
		transition: all 0.3s ease;
		background: var(--color-bg-surface);
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	
	.drop-zone:hover,
	.drop-zone.active {
		border-color: var(--color-primary);
		background: var(--color-bg-main);
	}
	
	.drop-content {
		display: flex;
		align-items: center;
		gap: 1.5rem;
	}
	
	.upload-icon {
		color: var(--color-text-secondary);
		transition: color 0.3s ease;
		display: flex;
		align-items: center;
	}
	
	.drop-zone:hover .upload-icon {
		color: var(--color-primary);
	}
	
	.drop-text {
		font-size: 1rem;
		color: var(--color-text-secondary);
		font-weight: 500;
	}
	
	.drop-zone:hover .drop-text {
		color: var(--color-text-main);
	}
	
	.supported-formats {
		display: flex;
		gap: 0.5rem;
		align-items: center;
	}
	
	.format {
		background: var(--color-bg-secondary);
		color: var(--color-text-secondary);
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		font-size: 0.75rem;
		font-weight: 500;
		border: 1px solid var(--color-border);
		transition: all 0.3s ease;
	}
	
	.drop-zone:hover .format {
		background: var(--color-bg-secondary);
		color: var(--color-primary);
		border-color: var(--color-border);
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
		border-bottom: 1px solid var(--color-border);
	}
	
	.library-header h2 {
		font-size: 1.8rem;
		margin: 0;
		font-weight: 600;
		color: var(--color-text-main);
	}
	
	.library-count {
		color: var(--color-text-secondary);
		font-size: 0.9rem;
		background: var(--color-bg-secondary);
		padding: 0.5rem 1rem;
		border-radius: 20px;
		border: 1px solid var(--color-border);
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
		scrollbar-color: var(--color-border) transparent;
		position: relative;
		background: linear-gradient(to bottom, transparent 0%, var(--color-bg-main) 95%);
	}
	
	.shelf-row::-webkit-scrollbar {
		height: 8px;
	}
	
	.shelf-row::-webkit-scrollbar-track {
		background: transparent;
	}
	
	.shelf-row::-webkit-scrollbar-thumb {
		background: var(--color-border);
		border-radius: 4px;
	}
	
	.shelf-support {
		height: 20px;
		background: linear-gradient(to bottom, 
			var(--color-bg-secondary) 0%, 
			var(--color-bg-surface) 30%, 
			var(--color-bg-main) 100%);
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
		/* Removed cursor pointer here to indicate no action on container */
		position: relative;
		transform-style: preserve-3d;
        transition: transform 0.3s ease; /* Moved transition to container for hover effect */
	}
	
	.comic-book:hover {
		transform: translateY(-5px); 
		z-index: 10;
	}
	
	.comic-cover {
		width: 140px;
		height: 210px;
		background: var(--color-bg-surface);
		border-radius: 4px;
		overflow: hidden;
		position: relative;
		box-shadow: 
			-5px 0 15px rgba(0, 0, 0, 0.8),
			2px 2px 5px rgba(0, 0, 0, 0.6),
			0 0 40px rgba(0, 0, 0, 0.5);
		border: 1px solid var(--color-border);
	}
    
    .cover-action {
        width: 100%;
        height: 100%;
        cursor: pointer;
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
        pointer-events: none; /* Pass clicks through overlays */
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
		pointer-events: none; /* Pass clicks through overlays */
	}
	
	.comic-cover img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

    .progress-bar-container {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        height: 4px;
        background: rgba(0, 0, 0, 0.3);
        z-index: 3;
    }

    .progress-bar-fill {
        height: 100%;
        background: var(--color-primary);
    }
    
    .progress-badge {
        position: absolute;
        bottom: 0.5rem;
        left: 0.5rem;
        background: rgba(0, 0, 0, 0.8);
        color: var(--color-primary);
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        font-size: 0.65rem;
        font-weight: 700;
        z-index: 4; /* Increased from 2 to be above the cover overlays if any */
        border: 1px solid var(--color-primary);
    }
	
	.placeholder-cover {
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-hover) 100%);
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
    
    .comic-info-container {
        display: flex;
        justify-content: space-between;
        margin-top: 0.75rem;
    }
	
	.comic-info {
        flex: 1;
        min-width: 0;
        text-align: left;
        cursor: pointer;
        padding-right: 0.5rem;
	}
	
	.comic-info .comic-title {
		font-size: 0.85rem;
		font-weight: 600;
		color: var(--color-text-main);
		margin-bottom: 0.25rem;
		white-space: normal; /* Was nowrap */
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
		overflow: hidden;
		/* text-overflow: ellipsis; Removed since we wrap */
        line-height: 1.2;
        height: 2.4em; /* Enforce height for alignment */
	}
	
	.comic-info .comic-meta {
		font-size: 0.7rem;
		color: var(--color-text-muted);
		display: flex;
		align-items: center;
		justify-content: flex-start;
		gap: 0.5rem;
	}
    
    .menu-container {
        position: relative;
        z-index: 10; /* Ensure menu is above other elements in the info section */
    }
    
    .menu-btn {
        background: transparent;
        border: none;
        color: var(--color-text-secondary);
        padding: 0.25rem;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
    }
    
    .menu-btn:hover {
        background: var(--color-bg-secondary);
        color: var(--color-text-main);
    }
    
    .dropdown-menu {
        position: absolute;
        bottom: calc(100% + 5px); /* Position above the button, on top of comic */
        right: 0;
        width: 120px;
        background: var(--color-bg-surface);
        border: 1px solid var(--color-border);
        border-radius: 8px;
        box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.3), 0 4px 6px rgba(0, 0, 0, 0.1);
        z-index: 100; /* High z-index to be on top of everything */
        overflow: hidden;
    }
    
    .dropdown-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        width: 100%;
        padding: 0.75rem 1rem;
        font-size: 0.85rem;
        background: transparent;
        border: none;
        color: var(--color-text-main);
        cursor: pointer;
        text-align: left;
        transition: background 0.2s;
    }
    
    .dropdown-item:hover {
        background: var(--color-bg-secondary);
    }
    
    .dropdown-item.delete {
        color: var(--color-status-error);
    }
    
    .dropdown-item.delete:hover {
        background: rgba(239, 68, 68, 0.1);
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
