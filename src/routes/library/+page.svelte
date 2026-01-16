<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { comicStorage, type ComicMetadata, type StoredComic } from '$lib/storage/comicStorage';
	import { setComic, setLoading } from '$lib/store/session';
	import ArchiveManager from '$lib/archive/archiveManager';

	let comics: ComicMetadata[] = [];
	let storageInfo = { usage: 0, quota: 0, percentage: 0 };
	let loading = true;

	onMount(async () => {
		await loadComics();
	});

	async function loadComics() {
		try {
			await comicStorage.init();
			comics = await comicStorage.getAllComics();
			comics.sort((a, b) => b.lastAccessed - a.lastAccessed);
			storageInfo = await comicStorage.getStorageEstimate();
			loading = false;
		} catch (error) {
			console.error('Failed to load library:', error);
			loading = false;
		}
	}

	async function openComic(id: string) {
		try {
			setLoading(true, 'Loading comic...');
			
			const storedComic = await comicStorage.getComic(id);
			if (!storedComic) {
				alert('Comic not found');
				setLoading(false);
				return;
			}

			// Create a File object from the stored blob
			const file = comicStorage.createFile(storedComic as StoredComic);
			
			// Initialize archive manager and load the comic
			const archiveManager = new ArchiveManager();
			
			// Generate comic ID
			const comicId = `${file.name}-${file.size}`;
			
			// Check if we have metadata
			let comic = await comicStorage.getComic(comicId);
			
			if (!comic) {
				// Create new comic metadata
				const pages = await archiveManager.openArchive(file);
				
				comic = {
					id: comicId,
					title: file.name.replace(/\.(cbz|zip|cbr|rar)$/i, ''),
					filename: file.name,
					pages: pages.map(p => ({
						filename: p.filename,
						index: p.index
					})),
					currentPage: storedComic.currentPage ?? 0,
					totalPages: pages.length,
					lastRead: new Date()
				};
				
				await comicStorage.saveComicMetadata(comic);
			} else {
				// Update last read time
				comic.lastRead = new Date();
				if (storedComic.currentPage !== undefined) {
					comic.currentPage = storedComic.currentPage;
				}
				await comicStorage.saveComicMetadata(comic);
			}
			
			await comicStorage.updateLastAccessed(comicId, {
				currentPage: comic.currentPage ?? 0,
				totalPages: comic.totalPages
			});
			
			// Set current comic and navigate to reader
			setComic(comic, file);
			setLoading(false);
			await goto('/reader');
			
		} catch (error) {
			console.error('Failed to open comic:', error);
			setLoading(false);
			alert('Failed to open comic: ' + (error instanceof Error ? error.message : 'Unknown error'));
		}
	}

	async function deleteComic(id: string, filename: string) {
		if (confirm(`Delete "${filename}" from library?`)) {
			try {
				await comicStorage.deleteComic(id);
				await loadComics();
			} catch (error) {
				console.error('Failed to delete comic:', error);
				alert('Failed to delete comic');
			}
		}
	}

	async function clearAll() {
		if (confirm('Delete ALL comics from library? This cannot be undone.')) {
			try {
				await comicStorage.clearAll();
				await loadComics();
			} catch (error) {
				console.error('Failed to clear library:', error);
				alert('Failed to clear library');
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
</script>

<svelte:head>
	<title>Library - Online Comic Reader</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 py-8 px-4">
	<div class="max-w-6xl mx-auto">
		<!-- Header -->
		<div class="mb-8">
			<div class="flex items-center justify-between mb-4">
				<div>
					<h1 class="text-3xl font-bold text-gray-900">My Library</h1>
					<p class="text-gray-600 mt-1">Comics stored locally in your browser</p>
				</div>
				<a
					href="/"
					class="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
				>
					← Back to Home
				</a>
			</div>

			<!-- Storage Info -->
			<div class="bg-white rounded-lg p-4 shadow-sm">
				<div class="flex items-center justify-between mb-2">
					<span class="text-sm text-gray-600">Storage Used</span>
					<span class="text-sm font-medium text-gray-900">
						{formatFileSize(storageInfo.usage)} / {formatFileSize(storageInfo.quota)}
					</span>
				</div>
				<div class="w-full bg-gray-200 rounded-full h-2">
					<div
						class="bg-blue-500 h-2 rounded-full transition-all"
						style="width: {Math.min(storageInfo.percentage, 100)}%"
					></div>
				</div>
				<p class="text-xs text-gray-500 mt-1">
					{storageInfo.percentage.toFixed(1)}% of available storage
				</p>
			</div>
		</div>

		<!-- Loading State -->
		{#if loading}
			<div class="text-center py-12">
				<div class="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
				<p class="text-gray-600 mt-4">Loading library...</p>
			</div>
		{/if}

		<!-- Empty State -->
		{#if !loading && comics.length === 0}
			<div class="text-center py-12">
				<svg
					class="mx-auto h-24 w-24 text-gray-400"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
					/>
				</svg>
				<h2 class="mt-4 text-xl font-semibold text-gray-900">No comics in library</h2>
				<p class="text-gray-600 mt-2">Upload a comic from the home page to get started</p>
				<a
					href="/"
					class="mt-4 inline-block px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition"
				>
					Upload Comic
				</a>
			</div>
		{/if}

		<!-- Comics Grid -->
		{#if !loading && comics.length > 0}
			<div class="mb-4 flex justify-between items-center">
				<p class="text-gray-600">{comics.length} comic{comics.length !== 1 ? 's' : ''} in library</p>
				<button
					on:click={clearAll}
					class="text-sm text-red-600 hover:text-red-700 font-medium"
				>
					Clear All
				</button>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
				{#each comics as comic (comic.id)}
					<div class="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow p-4">
						<div class="flex items-start justify-between mb-3">
							<div class="flex-1 min-w-0">
								<h3 class="font-semibold text-gray-900 truncate" title={comic.filename}>
									{comic.filename}
								</h3>
								<p class="text-sm text-gray-500 mt-1">
									{formatFileSize(comic.fileSize)}
								</p>
							</div>
						</div>

					<div class="space-y-1 text-xs text-gray-500 mb-4">
						<p>Uploaded: {formatDate(comic.uploadDate)}</p>
						<p>Last read: {formatDate(comic.lastAccessed)}</p>
						<p>
							{#if comic.totalPages > 0}
								Progress: Page {Math.min(comic.currentPage + 1, comic.totalPages)} of {comic.totalPages}
							{:else}
								Progress: Not started
							{/if}
						</p>
					</div>

						<div class="flex gap-2">
							<button
								on:click={() => openComic(comic.id)}
								class="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition text-sm font-medium"
							>
								Open
							</button>
							<button
								on:click={() => deleteComic(comic.id, comic.filename)}
								class="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition text-sm font-medium"
							>
								Delete
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
