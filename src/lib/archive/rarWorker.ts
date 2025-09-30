// src/lib/archive/rarWorker.ts
import type { 
	WorkerMessage, 
	WorkerResponse, 
	ListArchiveMessage, 
	ExtractPageMessage,
	ArchiveEntry 
} from '../../types/comic.js';

// Load libarchive.js from static directory
self.importScripts('/libarchive/libarchive.js');

// Get Archive from global scope
const Archive = (self as any).Archive;

// Archive state
let currentArchive: any = null;
let archiveEntries: ArchiveEntry[] = [];

// Wait for libarchive.js to load
let archiveReady = false;
let initPromise = Archive.init({
	workerUrl: '/libarchive/worker-bundle.js'
}).then(() => {
	archiveReady = true;
	console.log('RAR Worker: libarchive.js initialized');
}).catch((error: any) => {
	console.error('RAR Worker: Failed to initialize libarchive.js:', error);
});

async function processListArchive(file: File): Promise<ArchiveEntry[]> {
	try {
		// Ensure libarchive.js is initialized
		if (!archiveReady) {
			await initPromise;
			if (!archiveReady) {
				throw new Error('Failed to initialize libarchive.js');
			}
		}
		// Open archive using libarchive.js
		currentArchive = await Archive.open(file);
		
		// Get file listing
		const filesObj = await currentArchive.getFilesObject();
		
		// Flatten and convert to our format
		const entries: ArchiveEntry[] = [];
		
		function processFileObj(obj: any, basePath = '') {
			for (const [name, item] of Object.entries(obj)) {
				const fullPath = basePath ? `${basePath}/${name}` : name;
				
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
					processFileObj(item, fullPath);
				}
			}
		}
		
		processFileObj(filesObj);
		
		// Filter to only image files and sort
		archiveEntries = entries
			.filter(entry => isImageFile(entry.filename))
			.sort((a, b) => a.filename.localeCompare(b.filename, undefined, { numeric: true }));
		
		console.log(`Found ${archiveEntries.length} images in RAR archive`);
		return archiveEntries;
		
	} catch (error) {
		console.error('Failed to process RAR archive:', error);
		throw new Error(`Failed to open RAR file: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}

async function processExtractPage(index: number): Promise<Blob> {
	// Ensure libarchive.js is initialized
	if (!archiveReady) {
		await initPromise;
		if (!archiveReady) {
			throw new Error('Failed to initialize libarchive.js');
		}
	}
	
	if (!currentArchive || !archiveEntries[index]) {
		throw new Error('No archive loaded or invalid page index');
	}
	
	const entry = archiveEntries[index];
	
	try {
		// Get the files object again (cached by libarchive.js)
		const filesObj = await currentArchive.getFilesObject();
		
		// Navigate to the file in the nested object structure
		const pathParts = entry.filename.split('/');
		let currentObj = filesObj;
		
		for (const part of pathParts) {
			if (currentObj[part]) {
				currentObj = currentObj[part];
			} else {
				throw new Error(`File not found in archive: ${entry.filename}`);
			}
		}
		
		// Extract the file
		if (typeof currentObj === 'object' && 'extract' in currentObj) {
			const extractedFile = await currentObj.extract();
			
			// Convert to blob with proper MIME type
			const mimeType = getMimeType(entry.filename);
			return new Blob([extractedFile], { type: mimeType });
		} else {
			throw new Error(`Invalid file object for: ${entry.filename}`);
		}
		
	} catch (error) {
		console.error(`Failed to extract ${entry.filename}:`, error);
		throw new Error(`Failed to extract page: ${error instanceof Error ? error.message : 'Unknown error'}`);
	}
}

function isImageFile(filename: string): boolean {
	const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp'];
	const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
	return imageExtensions.includes(ext) && !filename.startsWith('__MACOSX');
}

function getMimeType(filename: string): string {
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

function closeArchive(): void {
	currentArchive = null;
	archiveEntries = [];
}

// Worker message handler
self.addEventListener('message', async (event: MessageEvent<WorkerMessage>) => {
	const { id, type, payload } = event.data;
	
	try {
		let response: WorkerResponse;
		
		switch (type) {
			case 'LIST_ARCHIVE':
				const entries = await processListArchive(payload.file);
				response = {
					id,
					type: 'ARCHIVE_LISTED',
					payload: { entries }
				};
				break;
				
			case 'EXTRACT_PAGE':
				const blob = await processExtractPage(payload.index);
				response = {
					id,
					type: 'PAGE_EXTRACTED',
					payload: { blob }
				};
				break;
				
			default:
				throw new Error(`Unknown message type: ${type}`);
		}
		
		self.postMessage(response);
		
	} catch (error) {
		console.error('RAR Worker error:', error);
		const response: WorkerResponse = {
			id,
			type: 'ERROR',
			payload: { 
				message: error instanceof Error ? error.message : 'Unknown worker error'
			}
		};
		self.postMessage(response);
	}
});

// Global error handler
self.addEventListener('error', (event) => {
	console.error('RAR Worker global error:', event);
});