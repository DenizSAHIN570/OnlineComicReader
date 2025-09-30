// src/lib/archive/enhancedZipManager.ts
import { ArchiveManager } from './zipManager.js';
import type { 
	ArchiveEntry, 
	ComicPage, 
	ComicSession, 
	ComicMetadata,
	WorkerMessage 
} from '../../types/comic.js';

export class EnhancedZipManager {
	private static instance: EnhancedZipManager | null = null;
	private archiveManager = new ArchiveManager();
	private currentSession: ComicSession | null = null;
	private pageCache = new Map<string, ComicPage>();
	private libarchiveInstance: any = null;
	private isLibarchiveLoaded = false;
	private libarchiveLoadPromise: Promise<void> | null = null;

	constructor() {
		// Initialize
	}

	static getInstance(): EnhancedZipManager {
		if (!this.instance) {
			this.instance = new EnhancedZipManager();
		}
		return this.instance;
	}

	private async loadLibarchive(): Promise<void> {
		if (this.isLibarchiveLoaded) return;
		if (this.libarchiveLoadPromise) return this.libarchiveLoadPromise;

		this.libarchiveLoadPromise = new Promise((resolve, reject) => {
			try {
				// Load libarchive.js for RAR support
				const script = document.createElement('script');
				script.src = '/libarchive/libarchive.js';
				script.onload = () => {
					// Initialize Archive with correct worker URL
					const Archive = (window as any).Archive;
					if (Archive) {
						Archive.init({
							workerUrl: '/libarchive/worker-bundle.js'
						}).then(() => {
							this.isLibarchiveLoaded = true;
							console.log('EnhancedZipManager: libarchive.js initialized successfully');
							resolve();
						}).catch((error: any) => {
							console.warn('Failed to initialize libarchive.js:', error);
							// Don't reject - we can still handle ZIP files
							resolve();
						});
					} else {
						console.warn('Archive not found in global scope - RAR support disabled');
						// Don't reject - we can still handle ZIP files
						resolve();
					}
				};
				script.onerror = () => {
					console.warn('Failed to load libarchive.js - RAR support disabled');
					// Don't reject - we can still handle ZIP files
					resolve();
				};
				document.head.appendChild(script);
			} catch (error) {
				console.warn('Error loading libarchive.js:', error);
				// Don't reject - we can still handle ZIP files
				resolve();
			}
		});

		return this.libarchiveLoadPromise;
	}

	async openComic(file: File): Promise<ComicSession> {
		try {
			console.log(`Opening comic: ${file.name} (${file.size} bytes)`);
			
			// Close any existing session
			if (this.currentSession) {
				await this.closeComic();
			}

			const archiveType = this.detectArchiveType(file.name);
			console.log(`Detected archive type: ${archiveType}`);
			
			let entries: ArchiveEntry[] = [];
			let metadata: ComicMetadata;

			if (archiveType === 'zip') {
				// Use existing ZIP implementation
				console.log('Using ZIP implementation');
				entries = await this.archiveManager.listArchive(file);
				metadata = {
					fileName: file.name,
					totalPages: entries.length,
					archiveType: 'zip',
					fileSize: file.size
				};
			} else if (archiveType === 'rar') {
				// Try to use libarchive.js for RAR files
				console.log('Attempting to use libarchive.js for RAR');
				await this.loadLibarchive();
				
				if (!this.isLibarchiveLoaded) {
					throw new Error(`RAR files are not fully supported in your browser. Please convert to CBZ format:\n\n1. Rename .cbr to .rar\n2. Extract with 7-Zip/WinRAR\n3. Create new ZIP file with images\n4. Rename ZIP to .cbz`);
				}

				try {
					const Archive = (window as any).Archive;
					this.libarchiveInstance = await Archive.open(file);
					const filesObj = await this.libarchiveInstance.getFilesObject();
					entries = this.extractEntriesFromFilesObj(filesObj);
					
					metadata = {
						fileName: file.name,
						totalPages: entries.length,
						archiveType: 'rar',
						fileSize: file.size
					};
				} catch (error) {
					console.error('libarchive.js error:', error);
					throw new Error(`Failed to open RAR file. Please convert to CBZ format:\n\n1. Rename .cbr to .rar\n2. Extract with 7-Zip/WinRAR\n3. Create new ZIP file with images\n4. Rename ZIP to .cbz\n\nError: ${error instanceof Error ? error.message : 'Unknown error'}`);
				}
			} else {
				throw new Error(`Unsupported file format: ${file.name}. Supported formats: CBZ, ZIP, CBR, RAR`);
			}

			console.log(`Found ${entries.length} total entries`);

			// Filter and sort image files
			const imageEntries = entries
				.filter(entry => this.isImageFile(entry.filename))
				.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));

			console.log(`Found ${imageEntries.length} image files`);

			if (imageEntries.length === 0) {
				throw new Error(`No images found in ${file.name}. Make sure the archive contains image files (JPG, PNG, GIF, BMP, WebP).`);
			}

			// Create session
			const session: ComicSession = {
				id: `${Date.now()}_${file.name}`,
				metadata: {
					...metadata,
					totalPages: imageEntries.length
				},
				pages: imageEntries.map((entry, index) => ({
					filename: entry.filename,
					index: index
				})),
				currentPageIndex: 0,
				lastReadAt: new Date(),
				archiveType
			};

			this.currentSession = session;
			console.log(`Comic opened successfully: ${imageEntries.length} pages`);
			return session;

		} catch (error) {
			console.error('Failed to open comic:', error);
			throw error;
		}
	}

	async getPage(pageIndex: number): Promise<ComicPage> {
		if (!this.currentSession) {
			throw new Error('No comic is currently open');
		}

		if (pageIndex < 0 || pageIndex >= this.currentSession.pages.length) {
			throw new Error(`Page index ${pageIndex} is out of range (0-${this.currentSession.pages.length - 1})`);
		}

		const cacheKey = `${this.currentSession.id}_${pageIndex}`;
		
		// Check cache first
		if (this.pageCache.has(cacheKey)) {
			console.log(`Page ${pageIndex} loaded from cache`);
			return this.pageCache.get(cacheKey)!;
		}

		const pageInfo = this.currentSession.pages[pageIndex];
		console.log(`Loading page ${pageIndex}: ${pageInfo.filename}`);
		
		let blob: Blob;

		try {
			if (this.currentSession.archiveType === 'zip') {
				// Use existing ZIP extraction
				blob = await this.archiveManager.extractPage(pageIndex);
			} else if (this.currentSession.archiveType === 'rar') {
				// Extract using libarchive.js
				blob = await this.extractRarPage(pageInfo.filename);
			} else {
				throw new Error('Unknown archive type');
			}

			const url = URL.createObjectURL(blob);
			const page: ComicPage = {
				...pageInfo,
				blob,
				url
			};

			// Cache the page
			this.pageCache.set(cacheKey, page);
			
			// Update session
			this.currentSession.currentPageIndex = pageIndex;
			this.currentSession.lastReadAt = new Date();

			console.log(`Page ${pageIndex} loaded successfully`);
			return page;

		} catch (error) {
			console.error(`Failed to load page ${pageIndex}:`, error);
			throw new Error(`Failed to load page ${pageIndex}: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	async nextPage(): Promise<ComicPage | null> {
		if (!this.currentSession) return null;
		
		const nextIndex = this.currentSession.currentPageIndex + 1;
		if (nextIndex >= this.currentSession.pages.length) {
			return null; // End of comic
		}
		
		return this.getPage(nextIndex);
	}

	async previousPage(): Promise<ComicPage | null> {
		if (!this.currentSession) return null;
		
		const prevIndex = this.currentSession.currentPageIndex - 1;
		if (prevIndex < 0) {
			return null; // Beginning of comic
		}
		
		return this.getPage(prevIndex);
	}

	async goToPage(pageIndex: number): Promise<ComicPage> {
		return this.getPage(pageIndex);
	}

	getCurrentSession(): ComicSession | null {
		return this.currentSession;
	}

	async closeComic(): Promise<void> {
		if (this.currentSession) {
			console.log('Closing comic and cleaning up resources');
			
			// Cleanup archive manager
			this.archiveManager.dispose();
			
			// Cleanup libarchive instance
			if (this.libarchiveInstance) {
				this.libarchiveInstance = null;
			}

			// Cleanup page URLs
			this.pageCache.forEach(page => {
				if (page.url) {
					URL.revokeObjectURL(page.url);
				}
			});

			// Clear cache
			this.pageCache.clear();
			this.currentSession = null;
		}
	}

	static getSupportedFormats(): { extension: string; description: string; archiveType: string }[] {
		return [
			{ extension: '.cbz', description: 'Comic Book ZIP', archiveType: 'zip' },
			{ extension: '.zip', description: 'ZIP Archive', archiveType: 'zip' },
			{ extension: '.cbr', description: 'Comic Book RAR (Limited Support)', archiveType: 'rar' },
			{ extension: '.rar', description: 'RAR Archive (Limited Support)', archiveType: 'rar' }
		];
	}

	static async isFileSupported(file: File): Promise<boolean> {
		const supportedExtensions = ['.cbz', '.zip', '.cbr', '.rar'];
		const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
		const isSupported = supportedExtensions.includes(ext);
		console.log(`File ${file.name} support check: ${isSupported}`);
		return isSupported;
	}

	// Private methods

	private detectArchiveType(filename: string): 'zip' | 'rar' | 'unknown' {
		const ext = filename.toLowerCase();
		if (ext.endsWith('.cbz') || ext.endsWith('.zip')) {
			return 'zip';
		}
		if (ext.endsWith('.cbr') || ext.endsWith('.rar')) {
			return 'rar';
		}
		return 'unknown';
	}

	private extractEntriesFromFilesObj(filesObj: any, basePath = ''): ArchiveEntry[] {
		const entries: ArchiveEntry[] = [];
		
		function processObj(obj: any, currentPath = '') {
			for (const [name, item] of Object.entries(obj)) {
				const fullPath = currentPath ? `${currentPath}/${name}` : name;
				
				if (item && typeof item === 'object' && 'extract' in item) {
					// This is a compressed file
					entries.push({
						filename: fullPath,
						index: entries.length,
						size: (item as any).size || 0,
						compressed_size: (item as any).compressedSize || 0,
						is_file: true
					});
				} else if (typeof item === 'object') {
					// This is a directory, recurse
					processObj(item, fullPath);
				}
			}
		}
		
		processObj(filesObj, basePath);
		console.log(`Extracted ${entries.length} entries from RAR archive`);
		return entries;
	}

	private async extractRarPage(filename: string): Promise<Blob> {
		if (!this.libarchiveInstance) {
			throw new Error('No RAR archive loaded');
		}

		try {
			const filesObj = await this.libarchiveInstance.getFilesObject();
			
			// Navigate to the file in the nested structure
			const pathParts = filename.split('/');
			let currentObj = filesObj;
			
			for (const part of pathParts) {
				if (currentObj[part]) {
					currentObj = currentObj[part];
				} else {
					throw new Error(`File not found: ${filename}`);
				}
			}
			
			// Extract the file
			if (typeof currentObj === 'object' && 'extract' in currentObj) {
				console.log(`Extracting RAR file: ${filename}`);
				const extractedFile = await currentObj.extract();
				const mimeType = this.getMimeType(filename);
				return new Blob([extractedFile], { type: mimeType });
			} else {
				throw new Error(`Invalid file object: ${filename}`);
			}
		} catch (error) {
			console.error(`RAR extraction error for ${filename}:`, error);
			throw new Error(`Failed to extract ${filename}: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	private isImageFile(filename: string): boolean {
		const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
		const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
		const isImage = imageExtensions.includes(ext) && !filename.startsWith('__MACOSX');
		return isImage;
	}

	private getMimeType(filename: string): string {
		const ext = filename.toLowerCase().split('.').pop();
		const mimeTypes: Record<string, string> = {
			'jpg': 'image/jpeg',
			'jpeg': 'image/jpeg',
			'png': 'image/png',
			'gif': 'image/gif',
			'bmp': 'image/bmp',
			'webp': 'image/webp'
		};
		return mimeTypes[ext || ''] || 'image/jpeg';
	}

	static async cleanup(): Promise<void> {
		if (this.instance) {
			await this.instance.closeComic();
			this.instance = null;
		}
	}
}