<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { comicStorage } from '$lib/storage/comicStorage';
	import type { FileSystemItem } from '../../types/comic'; 
	import { uploadService, type UploadProgress } from '$lib/services/uploadService';
	import { setComic, setLoading, setError } from '$lib/store/session';
	import ArchiveManager from '$lib/archive/archiveManager';
	import ThemeToggle from '$lib/ui/ThemeToggle.svelte';
	import { logger } from '$lib/services/logger';

	let items = $state<FileSystemItem[]>([]);
	let loading = $state(true);
	let uploadProgress = $state<UploadProgress | null>(null);
	let dragOver = $state(false);
	let viewMode = $state<'list' | 'grid'>('grid');

	onMount(async () => {
		try {
			await comicStorage.init();
			await loadLibrary();
		} catch (e) {
			logger.error('Library', 'Initialization failed', e);
			setError('Failed to load library', 'error');
		}
	});

	async function loadLibrary() {
		loading = true;
		try {
			logger.info('Library', 'Loading library...');
			items = await comicStorage.getAllFiles();
		} catch (error) {
			logger.error('Library', 'Failed to load library', error);
			setError('Failed to load library', 'error');
		} finally {
			loading = false;
		}
	}

	async function openComic(item: FileSystemItem) {
		try {
			setLoading(true, 'Opening comic...');
			const file = await comicStorage.getFile(item.id);
			if (!file) throw new Error('File data not found');

			const archiveManager = new ArchiveManager();
			let comic = await comicStorage.getComicMetadata(item.id);
			
			if (!comic || !comic.pages || comic.pages.length === 0) {
				const pages = await archiveManager.openArchive(file);
				comic = {
					id: item.id,
					title: item.name.replace(/\.(cbz|zip|cbr|rar)$/i, ''),
					filename: item.name,
					pages: pages.map(p => ({ filename: p.filename, index: p.index })),
					currentPage: 0,
					totalPages: pages.length,
					lastRead: new Date()
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
			await goto('/reader');
		} catch (error) {
			logger.error('Library', 'Error opening comic', error);
			setError('Failed to open comic', 'error');
		} finally {
			setLoading(false);
		}
	}

	async function deleteItem(item: FileSystemItem, e: MouseEvent) {
        e.stopPropagation();
        e.preventDefault();
		if (!confirm(`Are you sure you want to delete "${item.name}"?`)) return;
		try {
			await comicStorage.deleteComic(item.id);
			await loadLibrary();
			logger.info('Library', `Deleted item: ${item.name}`);
		} catch (error) {
			logger.error('Library', 'Failed to delete item', error);
			setError('Failed to delete item', 'error');
		}
	}

	async function handleFilesSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files && input.files.length > 0) {
			uploadProgress = { filename: 'Preparing...', current: 0, total: 0, percentage: 0 };
			try {
				await uploadService.processFileList(input.files, (p) => {
					uploadProgress = p;
				});
			    await loadLibrary();
				logger.info('Library', 'Upload sequence finished');
			} catch (error) {
				logger.error('Library', 'Upload failed', error);
				setError('Upload failed', 'error');
			} finally {
				uploadProgress = null;
				input.value = '';
			}
		}
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		dragOver = true;
	}

	function handleDragLeave() {
		dragOver = false;
	}

	async function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragOver = false;
		
		if (e.dataTransfer && e.dataTransfer.items) {
			uploadProgress = { filename: 'Processing drop...', current: 0, total: 0, percentage: 0 };
			try {
				await uploadService.processDrop(e.dataTransfer.items, (p) => {
					uploadProgress = p;
				});
			    await loadLibrary();
				logger.info('Library', 'Drop processing finished');
			} catch (error) {
				logger.error('Library', 'Drop processing failed', error);
				setError('Upload failed', 'error');
			} finally {
				uploadProgress = null;
			}
		}
	}

	function formatSize(bytes?: number) {
		if (bytes === undefined) return '-';
		if (bytes === 0) return '0 B';
		const k = 1024;
		const sizes = ['B', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + ' ' + sizes[i];
	}

	function formatDate(ts: number) {
		return new Date(ts).toLocaleDateString();
	}
</script>

<svelte:head>
	<title>Library - ComiKaiju</title>
</svelte:head>

<div 
	class="min-h-screen bg-bg-main text-text-main flex flex-col"
	ondragover={handleDragOver}
	ondragleave={handleDragLeave}
	ondrop={handleDrop}
	role="region"
	aria-label="Library Explorer"
>
	{#if dragOver}
		<div class="fixed inset-0 bg-primary/20 z-50 flex items-center justify-center pointer-events-none backdrop-blur-sm">
			<div class="bg-bg-surface p-8 rounded-xl shadow-xl text-center border-2 border-primary animate-pulse">
				<p class="text-3xl font-bold text-primary">Drop files to upload</p>
			</div>
		</div>
	{/if}

	{#if uploadProgress}
		<div class="fixed bottom-6 right-6 bg-bg-surface p-5 rounded-xl shadow-2xl z-50 w-80 border border-border">
			<h3 class="font-bold text-primary mb-3 flex items-center gap-2">
                <div class="animate-spin h-4 w-4 border-2 border-primary border-t-transparent rounded-full"></div>
                Uploading Collection
            </h3>
			<p class="text-xs text-text-secondary truncate mb-2">{uploadProgress.filename}</p>
			<div class="w-full bg-bg-secondary rounded-full h-2.5 mb-2 overflow-hidden">
				<div class="bg-primary h-full transition-all duration-300" style="width: {uploadProgress.percentage}%"></div>
			</div>
			<div class="flex justify-between text-[10px] font-bold text-text-muted uppercase tracking-widest">
				<span>{uploadProgress.current} / {uploadProgress.total} Files</span>
				<span>{uploadProgress.percentage}%</span>
			</div>
		</div>
	{/if}

	<div class="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
		<!-- Header -->
		<div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-6">
			<div>
				<h1 class="text-4xl font-extrabold text-primary tracking-tight underline decoration-primary/30 decoration-4 underline-offset-8">Library</h1>
				<p class="text-text-secondary text-sm mt-4 font-medium">Manage and organize your chronicles.</p>
			</div>
			<div class="flex flex-wrap gap-3 items-center">
				<ThemeToggle />
                
                <div class="flex bg-bg-secondary p-1 rounded-xl border border-border shadow-inner">
                    <button 
                        onclick={() => viewMode = 'grid'}
                        class="p-2 rounded-lg transition-all {viewMode === 'grid' ? 'bg-bg-surface text-primary shadow-lg' : 'text-text-muted hover:text-text-main'}"
                        title="Grid View"
                    >
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                        </svg>
                    </button>
                    <button 
                        onclick={() => viewMode = 'list'}
                        class="p-2 rounded-lg transition-all {viewMode === 'list' ? 'bg-bg-surface text-primary shadow-lg' : 'text-text-muted hover:text-text-main'}"
                        title="List View"
                    >
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                </div>
				
				<div class="flex gap-1 bg-bg-secondary p-1 rounded-xl border border-border shadow-sm">
					<div class="relative">
						<input 
							type="file" 
							id="file-upload" 
							class="hidden" 
							multiple 
							onchange={handleFilesSelect} 
						/>
						<label 
							for="file-upload" 
							class="cursor-pointer px-4 py-2 bg-bg-surface text-text-main rounded-lg hover:bg-bg-secondary font-bold transition text-sm inline-flex items-center"
						>
							Upload Files
						</label>
					</div>
				</div>
			</div>
		</div>

		<div class="min-h-[400px]">
			{#if loading}
				<div class="p-20 text-center text-text-secondary">
					<div class="animate-spin h-12 w-12 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
					<p class="font-bold uppercase tracking-widest text-xs">Summoning Collection...</p>
				</div>
			{:else if items.length === 0}
				<div class="p-20 text-center text-text-muted bg-bg-surface rounded-3xl border-2 border-dashed border-border">
					<svg class="w-20 h-20 mx-auto mb-6 opacity-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
					</svg>
					<p class="text-2xl font-black text-text-secondary mb-2 uppercase tracking-tighter">Deserted Depths</p>
					<p class="text-sm font-medium">This realm is empty. Bestow some comics upon it.</p>
				</div>
			{:else if viewMode === 'list'}
				<div class="bg-bg-surface shadow-2xl rounded-3xl border border-border overflow-hidden">
                    <div class="overflow-x-auto">
                        <table class="w-full text-left border-collapse">
                            <thead>
                                <tr class="bg-bg-secondary text-text-muted text-[10px] font-black uppercase tracking-[0.2em] border-b border-border">
                                    <th class="px-8 py-5">Name</th>
                                    <th class="px-8 py-5 w-32">Size</th>
                                    <th class="px-8 py-5 w-40 hidden md:table-cell">Date</th>
                                    <th class="px-8 py-5 w-40 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-border">
                                {#each items as item (item.id)}
                                    <tr 
                                        class="hover:bg-bg-secondary/50 transition-colors cursor-pointer group"
                                        onclick={() => openComic(item)}
                                    >
                                        <td class="px-8 py-5">
                                            <div class="flex items-center gap-4">
                                                <div class="p-2.5 bg-primary/20 text-primary rounded-xl">
                                                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                                    </svg>
                                                </div>
                                                <div class="min-w-0">
                                                    <span class="font-bold text-text-main group-hover:text-primary transition-colors block truncate text-lg">
                                                        {item.name}
                                                    </span>
                                                </div>
                                            </div>
                                        </td>
                                        <td class="px-8 py-5 text-sm font-bold text-text-secondary tabular-nums">
                                            {formatSize(item.size)}
                                        </td>
                                        <td class="px-8 py-5 text-sm font-medium text-text-muted hidden md:table-cell">
                                            {formatDate(item.createdAt)}
                                        </td>
                                        <td class="px-8 py-5 text-right" onclick={(e) => e.stopPropagation()}>
                                            <div class="flex items-center justify-end gap-2">
                                                <button onclick={(e) => deleteItem(item, e)} class="p-2.5 text-text-muted hover:text-status-error hover:bg-bg-secondary rounded-xl transition-all" title="Delete">
                                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
				</div>
            {:else}
                <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 sm:gap-8">
                    {#each items as item (item.id)}
                        <div class="flex flex-col group relative">
                            <div 
                                class="relative w-full aspect-[2/3] bg-bg-surface border-2 border-border rounded-2xl shadow-xl overflow-hidden group-hover:border-primary group-hover:shadow-primary/20 group-hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                                onclick={() => openComic(item)}
                                onkeydown={(e) => e.key === 'Enter' && openComic(item)}
                                role="button"
                                tabindex="0"
                                aria-label="Open {item.name}"
                            >
                                {#if item.thumbnail}
                                    <img src={item.thumbnail} alt="" class="w-full h-full object-cover" />
                                {:else}
                                    <div class="w-full h-full flex flex-col items-center justify-center bg-primary/5">
                                        <svg class="w-16 h-16 text-primary/20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                                        </svg>
                                    </div>
                                {/if}

                                <div class="absolute inset-0 bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center gap-4 p-4" onclick={(e) => e.stopPropagation()}>
                                    <div class="flex gap-2">
                                        <button onclick={(e) => deleteItem(item, e)} class="p-2.5 bg-white/10 hover:bg-status-error text-white rounded-xl transition-all" title="Delete">
                                            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                        </button>
                                    </div>
                                    <button 
                                        onclick={() => openComic(item)}
                                        class="px-6 py-2 bg-primary text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-primary/40 hover:scale-105 active:scale-95 transition-all"
                                    >
                                        Launch Reader
                                    </button>
                                </div>
                            </div>
                            <div class="mt-4 text-center px-2">
                                <p class="font-bold text-sm text-text-main truncate group-hover:text-primary transition-colors" title={item.name}>
                                    {item.name}
                                </p>
                                <p class="text-[10px] font-black text-text-muted mt-1 uppercase tracking-widest opacity-60">
                                    {formatSize(item.size)}
                                </p>
                            </div>
                        </div>
                    {/each}
                </div>
			{/if}
		</div>
	</div>
</div>