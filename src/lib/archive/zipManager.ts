import type { 
	WorkerMessage, 
	WorkerResponse, 
	ArchiveEntry,
	ComicPage 
} from '../../types/comic.js';

export class ArchiveManager {
	private zipWorker: Worker | null = null;
	private rarWorker: Worker | null = null;
	private currentWorker: Worker | null = null;
	private messageId = 0;
	private pendingRequests = new Map<string, {
		resolve: (value: any) => void;
		reject: (error: Error) => void;
	}>();

	constructor() {
		// Workers will be created on demand based on file type
	}

	private createZipWorker(): Worker {
		if (!this.zipWorker) {
			this.zipWorker = new Worker(
				new URL('./zipWorker.ts', import.meta.url), 
				{ type: 'module' }
			);
			this.zipWorker.addEventListener('message', this.handleWorkerMessage.bind(this));
		}
		return this.zipWorker;
	}

	private createRarWorker(): Worker {
		if (!this.rarWorker) {
			this.rarWorker = new Worker(
				new URL('./rarWorker.ts', import.meta.url), 
				{ type: 'module' }
			);
			this.rarWorker.addEventListener('message', this.handleWorkerMessage.bind(this));
		}
		return this.rarWorker;
	}

	private getWorkerForFile(filename: string): Worker {
		const ext = filename.toLowerCase();
		if (ext.endsWith('.cbr') || ext.endsWith('.rar')) {
			this.currentWorker = this.createRarWorker();
		} else {
			this.currentWorker = this.createZipWorker();
		}
		return this.currentWorker;
	}

	private handleWorkerMessage(event: MessageEvent<WorkerResponse>) {
		const { id, type, payload } = event.data;
		const request = this.pendingRequests.get(id);
		
		if (!request) {
			console.warn('Received response for unknown request:', id);
			return;
		}
		
		this.pendingRequests.delete(id);
		
		if (type === 'ERROR') {
			request.reject(new Error(payload?.message || 'Unknown worker error'));
		} else {
			request.resolve({ type, payload });
		}
	}

	private sendMessage(message: Omit<WorkerMessage, 'id'>, worker?: Worker): Promise<WorkerResponse> {
		const id = `msg-${++this.messageId}`;
		const fullMessage: WorkerMessage = { ...message, id };
		const targetWorker = worker || this.currentWorker;
		
		if (!targetWorker) {
			throw new Error('No worker available');
		}
		
		return new Promise((resolve, reject) => {
			this.pendingRequests.set(id, { resolve, reject });
			targetWorker.postMessage(fullMessage);
		});
	}

	async listArchive(file: File): Promise<ArchiveEntry[]> {
		const worker = this.getWorkerForFile(file.name);
		
		const response = await this.sendMessage({
			type: 'LIST_ARCHIVE',
			payload: { file }
		}, worker);
		
		if (response.type === 'ARCHIVE_LISTED') {
			return response.payload.entries;
		}
		
		throw new Error('Unexpected response type');
	}

	async extractPage(index: number): Promise<Blob> {
		if (!this.currentWorker) {
			throw new Error('No archive loaded');
		}
		
		const response = await this.sendMessage({
			type: 'EXTRACT_PAGE',
			payload: { index }
		}, this.currentWorker);
		
		if (response.type === 'PAGE_EXTRACTED') {
			return response.payload.blob;
		}
		
		throw new Error('Unexpected response type');
	}

	async createComicPages(entries: ArchiveEntry[]): Promise<ComicPage[]> {
		return entries.map(entry => ({
			filename: entry.filename,
			index: entry.index
		}));
	}

	dispose() {
		if (this.zipWorker) {
			this.zipWorker.terminate();
			this.zipWorker = null;
		}
		if (this.rarWorker) {
			this.rarWorker.terminate();
			this.rarWorker = null;
		}
		this.currentWorker = null;
		this.pendingRequests.clear();
	}
}
