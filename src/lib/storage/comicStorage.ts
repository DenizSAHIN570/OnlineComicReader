// IndexedDB Storage Manager for Comic Files
// Stores comics locally in the browser for offline access

export interface StoredComic {
	id: string;
	filename: string;
	fileData: Blob;
	uploadDate: number;
	lastAccessed: number;
	fileSize: number;
	thumbnail?: string; // Base64 thumbnail
}

export interface ComicMetadata {
	id: string;
	filename: string;
	uploadDate: number;
	lastAccessed: number;
	fileSize: number;
	thumbnail?: string;
}

class ComicStorageManager {
	private dbName = 'ComicReaderDB';
	private dbVersion = 1;
	private storeName = 'comics';
	private db: IDBDatabase | null = null;

	async init(): Promise<void> {
		if (this.db) return;

		this.db = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = indexedDB.open(this.dbName, this.dbVersion);

			request.onerror = () => reject(new Error('Failed to open database'));

			request.onsuccess = () => resolve(request.result);

			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;
				if (!db.objectStoreNames.contains(this.storeName)) {
					const objectStore = db.createObjectStore(this.storeName, { keyPath: 'id' });
					objectStore.createIndex('filename', 'filename', { unique: false });
					objectStore.createIndex('uploadDate', 'uploadDate', { unique: false });
					objectStore.createIndex('lastAccessed', 'lastAccessed', { unique: false });
				}
			};
		});
	}

	private async ensureDB(): Promise<IDBDatabase> {
		if (!this.db) {
			await this.init();
		}
		if (!this.db) throw new Error('Database not initialized');
		return this.db;
	}

	async saveComic(file: File, thumbnail?: string): Promise<string> {
		const db = await this.ensureDB();
		const id = this.generateId(file.name, file.size);

		// Check if comic already exists
		const existing = await this.getComic(id);
		if (existing) {
			await this.updateLastAccessed(id);
			console.log(`Comic already exists: ${file.name}`);
			return id;
		}

		const comic: StoredComic = {
			id,
			filename: file.name,
			fileData: file.slice(0, file.size, file.type), // ensure Blob stored
			uploadDate: Date.now(),
			lastAccessed: Date.now(),
			fileSize: file.size,
			thumbnail
		};

		return new Promise((resolve, reject) => {
			const transaction = db.transaction(this.storeName, 'readwrite');
			const objectStore = transaction.objectStore(this.storeName);
			const request = objectStore.put(comic);

			request.onsuccess = () => {
				console.log(`Comic saved: ${file.name} (${this.formatFileSize(file.size)})`);
				resolve(id);
			};
			request.onerror = () => reject(new Error('Failed to save comic'));
		});
	}

	async getComic(id: string): Promise<StoredComic | null> {
		const db = await this.ensureDB();

		return new Promise((resolve, reject) => {
			const transaction = db.transaction(this.storeName, 'readonly');
			const objectStore = transaction.objectStore(this.storeName);
			const request = objectStore.get(id);

			request.onsuccess = () => {
				const result = request.result as StoredComic | undefined;
				resolve(result || null);
			};
			request.onerror = () => reject(new Error('Failed to retrieve comic'));
		});
	}

	async getAllComics(): Promise<ComicMetadata[]> {
		const db = await this.ensureDB();

		return new Promise((resolve, reject) => {
			const transaction = db.transaction(this.storeName, 'readonly');
			const objectStore = transaction.objectStore(this.storeName);
			const request = objectStore.getAll();

			request.onsuccess = () => {
				const comics = (request.result as StoredComic[]).map((comic) => ({
					id: comic.id,
					filename: comic.filename,
					uploadDate: comic.uploadDate,
					lastAccessed: comic.lastAccessed,
					fileSize: comic.fileSize,
					thumbnail: comic.thumbnail
				}));
				resolve(comics);
			};
			request.onerror = () => reject(new Error('Failed to retrieve comics list'));
		});
	}

	async deleteComic(id: string): Promise<void> {
		const db = await this.ensureDB();

		return new Promise((resolve, reject) => {
			const transaction = db.transaction(this.storeName, 'readwrite');
			const objectStore = transaction.objectStore(this.storeName);
			const request = objectStore.delete(id);

			request.onsuccess = () => {
				console.log(`Comic deleted: ${id}`);
				resolve();
			};
			request.onerror = () => reject(new Error('Failed to delete comic'));
		});
	}

	async clearAll(): Promise<void> {
		const db = await this.ensureDB();

		return new Promise((resolve, reject) => {
			const transaction = db.transaction(this.storeName, 'readwrite');
			const objectStore = transaction.objectStore(this.storeName);
			const request = objectStore.clear();

			request.onsuccess = () => {
				console.log('All comics cleared from storage');
				resolve();
			};
			request.onerror = () => reject(new Error('Failed to clear storage'));
		});
	}

	async updateLastAccessed(id: string): Promise<void> {
		const db = await this.ensureDB();

		return new Promise((resolve, reject) => {
			const transaction = db.transaction(this.storeName, 'readwrite');
			const objectStore = transaction.objectStore(this.storeName);
			const getRequest = objectStore.get(id);

			getRequest.onsuccess = () => {
				const comic = getRequest.result as StoredComic | undefined;
				if (comic) {
					comic.lastAccessed = Date.now();
					const putRequest = objectStore.put(comic);
					putRequest.onsuccess = () => resolve();
					putRequest.onerror = () => reject(new Error('Failed to update last accessed'));
				} else {
					resolve(); // Not found
				}
			};
			getRequest.onerror = () => reject(new Error('Failed to get comic'));
		});
	}

	private generateId(filename: string, fileSize: number): string {
		return `${filename}-${fileSize}`;
	}

	private formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
	}

	async getStorageEstimate(): Promise<{ usage: number; quota: number; percentage: number }> {
		if ('storage' in navigator && 'estimate' in navigator.storage) {
			const estimate = await navigator.storage.estimate();
			const usage = estimate.usage || 0;
			const quota = estimate.quota || 0;
			const percentage = quota > 0 ? (usage / quota) * 100 : 0;

			return {
				usage,
				quota,
				percentage: Math.round(percentage * 100) / 100
			};
		}
		return { usage: 0, quota: 0, percentage: 0 };
	}
}

// Export singleton instance
export const comicStorage = new ComicStorageManager();
