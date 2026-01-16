
import { goto } from '$app/navigation';
import ArchiveManager from '$lib/archive/archiveManager.js';
import { comicStorage } from '$lib/storage/comicStorage.js';
import { setComic, setLoading, setError, clearError } from '$lib/store/session.js';
import type { ComicBook } from '../../types/comic.js';

let archiveManager: ArchiveManager | null = null;

// Clean pages array to remove proxy objects and make it serializable
function cleanPages(pages: any[]) {
	return pages.map(p => ({
		filename: p.filename,
		index: p.index
	}));
}

async function createThumbnail(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		const canvas = document.createElement('canvas');
		const ctx = canvas.getContext('2d');

		img.onload = () => {
			const maxWidth = 200;
			const maxHeight = 300;
			let width = img.width;
			let height = img.height;

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
				}, 'image/jpeg', 0.7);
			} else {
				reject(new Error('Failed to get canvas context'));
			}

			URL.revokeObjectURL(img.src);
		};

		img.onerror = () => {
			reject(new Error('Failed to load image'));
		};

		img.src = URL.createObjectURL(blob);
	});
}

export async function handleFile(file: File, loadComics: () => Promise<void>) {
	if (!archiveManager) {
		archiveManager = new ArchiveManager();
	}

	const isSupported = await archiveManager.isSupported(file);
	if (!isSupported) {
		setError('Please select a CBZ, ZIP, CBR, or RAR file.');
		return;
	}

	clearError();
	setLoading(true, 'Processing archive...');

	try {
		const comicId = `${file.name}-${file.size}`;
		const existingStoredComic = await comicStorage.getComic(comicId);

		if (existingStoredComic) {
			console.log('Comic already in storage, opening...');
			await openExistingComic(comicId, file, loadComics);
			return;
		}

		console.log('New comic, processing...');
		const pages = await archiveManager.openArchive(file);
		console.log(`Loaded ${pages.length} pages from archive`);

		if (pages.length === 0) {
			throw new Error('No images found in archive. The file may be corrupted or use an unsupported RAR version.');
		}

		let thumbnail: string | undefined;
		if (pages.length > 0) {
			try {
				await archiveManager.loadPage(pages[0]);
				if (pages[0].blob) {
					console.log('Creating thumbnail...');
					thumbnail = await createThumbnail(pages[0].blob);
					console.log('Thumbnail created successfully');
				}
			} catch (err) {
				console.error('Failed to create thumbnail:', err);
			}
		}

		const cleanedPages = cleanPages(pages);
		const comic: ComicBook = {
			id: comicId,
			title: file.name.replace(/\.(cbz|zip|cbr|rar)$/i, ''),
			filename: file.name,
			pages: cleanedPages,
			currentPage: 0,
			totalPages: pages.length,
			lastRead: new Date(),
			coverThumbnail: thumbnail
		};

		await comicStorage.saveComic(file, {
			thumbnail,
			totalPages: pages.length,
			currentPage: comic.currentPage
		});
		console.log('Comic saved to offline storage with thumbnail');

		await comicStorage.saveComicMetadata(comic);

		await loadComics();

		setComic(comic, file);
		await goto('/reader');

	} catch (error) {
		console.error('Failed to process file:', error);
		setError(error instanceof Error ? error.message : 'Failed to process file');
	} finally {
		setLoading(false);
	}
}

export function cleanupComicProcessor() {
	if (archiveManager) {
		archiveManager.cleanup();
		archiveManager = null;
	}
}

export async function openExistingComic(comicId: string, file: File, loadComics: () => Promise<void>) {
	try {
		if (!archiveManager) {
			archiveManager = new ArchiveManager();
		}

		const pages = await archiveManager.openArchive(file);
		console.log(`Reopened archive with ${pages.length} pages`);

		if (pages.length === 0) {
			throw new Error('No images found in archive. The file may be corrupted or use an unsupported RAR version.');
		}

		const storedComic = await comicStorage.getComic(comicId);

		const cleanedPages = cleanPages(pages);
		const comic: ComicBook = {
			id: comicId,
			title: file.name.replace(/\.(cbz|zip|cbr|rar)$/i, ''),
			filename: file.name,
			pages: cleanedPages,
			currentPage: storedComic?.currentPage ?? 0,
			totalPages: pages.length,
			lastRead: new Date(),
			coverThumbnail: storedComic?.coverThumbnail
		};

		await comicStorage.updateLastAccessed(comicId, {
			currentPage: comic.currentPage ?? 0,
			totalPages: comic.totalPages
		});

		await loadComics();

		setComic(comic, file);
		setLoading(false);
		await goto('/reader');

	} catch (error) {
		console.error('Failed to open existing comic:', error);
		setError(error instanceof Error ? error.message : 'Failed to open comic');
		setLoading(false);
	}
}
