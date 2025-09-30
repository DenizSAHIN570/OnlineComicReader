import { unzip, type AsyncZipOptions } from 'fflate';
import type { 
	WorkerMessage, 
	WorkerResponse, 
	ListArchiveMessage, 
	ExtractPageMessage,
	ArchiveEntry 
} from '../types/comic.js';

let currentArchiveData: Uint8Array | null = null;
let currentEntries: ArchiveEntry[] = [];

// Helper function to check if file is an image
function isImageFile(filename: string): boolean {
	const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.svg'];
	const ext = filename.toLowerCase().split('.').pop();
	return ext ? imageExtensions.includes('.' + ext) : false;
}

// Handle incoming messages from main thread
self.addEventListener('message', async (event: MessageEvent<WorkerMessage>) => {
	const { id, type, payload } = event.data;

	try {
		switch (type) {
			case 'LIST_ARCHIVE':
				await handleListArchive(id, payload as ListArchiveMessage['payload']);
				break;
			
			case 'EXTRACT_PAGE':
				await handleExtractPage(id, payload as ExtractPageMessage['payload']);
				break;
				
			default:
				throw new Error(`Unknown message type: ${type}`);
		}
	} catch (error) {
		const response: WorkerResponse = {
			id,
			type: 'ERROR',
			payload: { 
				message: error instanceof Error ? error.message : 'Unknown error' 
			}
		};
		self.postMessage(response);
	}
});

async function handleListArchive(id: string, { file }: ListArchiveMessage['payload']) {
	// Read file as ArrayBuffer and convert to Uint8Array
	const arrayBuffer = await file.arrayBuffer();
	currentArchiveData = new Uint8Array(arrayBuffer);
	
	// Extract archive entries using fflate
	return new Promise<void>((resolve, reject) => {
		unzip(currentArchiveData!, (err, data) => {
			if (err) {
				reject(new Error(`Failed to extract archive: ${err.message}`));
				return;
			}
			
			// Filter for image files and sort by filename
			const entries: ArchiveEntry[] = Object.keys(data)
				.filter(filename => isImageFile(filename) && !filename.includes('__MACOSX'))
				.sort()
				.map((filename, index) => ({
					filename,
					isDirectory: false,
					size: data[filename].length,
					index
				}));
			
			currentEntries = entries;
			
			const response: WorkerResponse = {
				id,
				type: 'ARCHIVE_LISTED',
				payload: { entries }
			};
			
			self.postMessage(response);
			resolve();
		});
	});
}

async function handleExtractPage(id: string, { index }: ExtractPageMessage['payload']) {
	if (!currentArchiveData || !currentEntries[index]) {
		throw new Error('Archive not loaded or invalid page index');
	}
	
	const entry = currentEntries[index];
	
	return new Promise<void>((resolve, reject) => {
		unzip(currentArchiveData!, (err, data) => {
			if (err) {
				reject(new Error(`Failed to extract page: ${err.message}`));
				return;
			}
			
			const fileData = data[entry.filename];
			if (!fileData) {
				reject(new Error(`File not found: ${entry.filename}`));
				return;
			}
			
			// Create blob from extracted file data
			const blob = new Blob([fileData], { type: 'image/*' });
			
			const response: WorkerResponse = {
				id,
				type: 'PAGE_EXTRACTED',
				payload: {
					index,
					blob
				}
			};
			
			self.postMessage(response);
			resolve();
		});
	});
}
