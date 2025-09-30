// Universal Archive Manager for OnlineCbrReader
// Supports ZIP (CBZ) and RAR (CBR) files using uncompress.js library

import type { ComicPage } from '../../types/comic.js';

export interface ArchiveFile {
	name: string;
	size: number;
	content: Uint8Array;
}

export interface ArchiveEntry {
	name: string;
	is_file: boolean;
	size_compressed: number;
	size_uncompressed: number;
	readData: (callback: (data: ArrayBuffer | null, error: Error | null) => void) => void;
}

export interface Archive {
	file_name: string;
	archive_type: 'zip' | 'rar' | 'tar';
	array_buffer: ArrayBuffer;
	entries: ArchiveEntry[];
	handle: any;
}

class UniversalArchiveManager {
	private isLibraryLoaded = false;
	private loadingPromise: Promise<void> | null = null;

	constructor() {}

	private async loadLibraries(): Promise<void> {
		if (this.isLibraryLoaded) return;
		if (this.loadingPromise) return this.loadingPromise;

		this.loadingPromise = new Promise((resolve, reject) => {
			try {
				// Load libarchive.js for archive handling
				const script = document.createElement('script');
				script.src = '/libarchive/libarchive.js';
				script.onload = () => {
					// Initialize Archive with correct worker URL
					const Archive = (window as any).Archive;
					if (Archive) {
						Archive.init({
							workerUrl: '/libarchive/worker-bundle.js'
						}).then(() => {
							this.isLibraryLoaded = true;
							console.log('UniversalArchiveManager: libarchive.js initialized');
							resolve();
						}).catch((error: any) => {
							reject(new Error(`Failed to initialize libarchive.js: ${error.message}`));
						});
					} else {
						reject(new Error('Archive not found in global scope'));
					}
				};
				script.onerror = () => {
					reject(new Error('Failed to load libarchive.js'));
				};
				document.head.appendChild(script);
			} catch (error) {
				reject(error);
			}
		});

		return this.loadingPromise;
	}

	private isImageFile(filename: string): boolean {
		const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
		const extension = filename.toLowerCase().slice(filename.lastIndexOf('.'));
		return imageExtensions.includes(extension);
	}

	private sortByFilename(entries: ArchiveEntry[]): ArchiveEntry[] {
		return entries.sort((a, b) => {
			// Natural sort for filenames (handles numbers correctly)
			return a.name.localeCompare(b.name, undefined, {
				numeric: true,
				sensitivity: 'base'
			});
		});
	}

	async openArchive(file: File): Promise<ComicPage[]> {
		await this.loadLibraries();

		return new Promise(async (resolve, reject) => {
			try {
				const Archive = (window as any).Archive;
				if (!Archive) {
					throw new Error('Archive library not loaded');
				}

				// Open the archive
				const archive = await Archive.open(file);
				console.log(`Opened archive: ${file.name}`);

				// Get file listing
				const filesObj = await archive.getFilesObject();
				
				// Flatten and convert to our format
				const entries: any[] = [];
				
				function processFileObj(obj: any, basePath = '') {
					for (const [name, item] of Object.entries(obj)) {
						const fullPath = basePath ? `${basePath}/${name}` : name;
						
						if (item && typeof item === 'object' && 'extract' in item) {
							// This is a compressed file
							if (this.isImageFile(fullPath)) {
								entries.push({
									name: fullPath,
									size: (item as any).size || 0,
									archiveFile: item
								});
							}
						} else if (typeof item === 'object') {
							// This is a directory, recurse
							processFileObj(item, fullPath);
						}
					}
				}
				
				processFileObj.call(this, filesObj);

				// Sort entries by filename
				const sortedEntries = entries.sort((a, b) => 
					a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
				);

				console.log(`Found ${sortedEntries.length} image files`);

				// Convert entries to ComicPage format
				const pages: ComicPage[] = sortedEntries.map((entry, index) => ({
					index,
					filename: entry.name,
					blob: null, // Will be loaded on demand
					url: null,   // Will be created on demand
					archiveFile: entry.archiveFile // Store the raw entry for later data loading
				}));

				resolve(pages);
			} catch (error) {
				console.error('Failed to open archive:', error);
				reject(error);
			}
		});
	}

	async loadPage(page: ComicPage): Promise<void> {
		if (page.blob) return; // Already loaded

		const archiveFile = (page as any).archiveFile;
		if (!archiveFile) {
			throw new Error('Page archive file not found');
		}

		try {
			// Extract the file using libarchive.js
			const extractedFile = await archiveFile.extract();
			
			// Create blob and URL
			const mimeType = this.getMimeType(page.filename);
			page.blob = new Blob([extractedFile], { type: mimeType });
			page.url = URL.createObjectURL(page.blob);
		} catch (error) {
			console.error(`Failed to extract ${page.filename}:`, error);
			throw new Error(`Failed to extract page: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	private getMimeType(filename: string): string {
		const extension = filename.toLowerCase().slice(filename.lastIndexOf('.'));
		const mimeTypes: { [key: string]: string } = {
			'.jpg': 'image/jpeg',
			'.jpeg': 'image/jpeg',
			'.png': 'image/png',
			'.gif': 'image/gif',
			'.bmp': 'image/bmp',
			'.webp': 'image/webp'
		};
		return mimeTypes[extension] || 'image/jpeg';
	}

	// Helper method to check if a file is supported
	async isSupported(file: File): Promise<boolean> {
		const filename = file.name.toLowerCase();
		return filename.endsWith('.cbz') || 
		       filename.endsWith('.zip') || 
		       filename.endsWith('.cbr') || 
		       filename.endsWith('.rar');
	}

	// Get file type for display purposes
	async getFileType(file: File): Promise<'zip' | 'rar' | 'unknown'> {
		const filename = file.name.toLowerCase();
		if (filename.endsWith('.cbz') || filename.endsWith('.zip')) {
			return 'zip';
		} else if (filename.endsWith('.cbr') || filename.endsWith('.rar')) {
			return 'rar';
		} else {
			return 'unknown';
		}
	}

	// Clean up resources
	cleanup(): void {
		// The uncompress library doesn't provide explicit cleanup
		// But we can revoke any object URLs that were created
		console.log('Archive manager cleanup completed');
	}
}

export default UniversalArchiveManager;