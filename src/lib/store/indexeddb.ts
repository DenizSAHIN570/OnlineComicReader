import type { ComicBook } from '../../types/comic.js';

const DB_NAME = 'ComicReaderDB';
const DB_VERSION = 1;
const STORE_COMICS = 'comics';
const STORE_PAGES = 'pages';

export class IndexedDBStore {
	private db: IDBDatabase | null = null;

	async init(): Promise<void> {
		return new Promise((resolve, reject) => {
			const request = indexedDB.open(DB_NAME, DB_VERSION);
			
			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				this.db = request.result;
				resolve();
			};
			
			request.onupgradeneeded = (event) => {
				const db = (event.target as IDBOpenDBRequest).result;
				
				// Comics store - for metadata and reading positions
				if (!db.objectStoreNames.contains(STORE_COMICS)) {
					const comicsStore = db.createObjectStore(STORE_COMICS, { keyPath: 'id' });
					comicsStore.createIndex('lastRead', 'lastRead');
				}
				
				// Pages store - for cached image blobs
				if (!db.objectStoreNames.contains(STORE_PAGES)) {
					const pagesStore = db.createObjectStore(STORE_PAGES, { keyPath: 'key' });
					pagesStore.createIndex('comicId', 'comicId');
				}
			};
		});
	}

	async saveComic(comic: ComicBook): Promise<void> {
		if (!this.db) throw new Error('Database not initialized');
		
		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_COMICS], 'readwrite');
			const store = transaction.objectStore(STORE_COMICS);
			
			const request = store.put(comic);
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve();
		});
	}

	async getComic(id: string): Promise<ComicBook | null> {
		if (!this.db) throw new Error('Database not initialized');
		
		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_COMICS], 'readonly');
			const store = transaction.objectStore(STORE_COMICS);
			
			const request = store.get(id);
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result || null);
		});
	}

	async savePageBlob(comicId: string, pageIndex: number, blob: Blob): Promise<void> {
		if (!this.db) throw new Error('Database not initialized');
		
		const key = `${comicId}-${pageIndex}`;
		
		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_PAGES], 'readwrite');
			const store = transaction.objectStore(STORE_PAGES);
			
			const request = store.put({
				key,
				comicId,
				pageIndex,
				blob,
				cachedAt: new Date()
			});
			
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve();
		});
	}

	async getPageBlob(comicId: string, pageIndex: number): Promise<Blob | null> {
		if (!this.db) throw new Error('Database not initialized');
		
		const key = `${comicId}-${pageIndex}`;
		
		return new Promise((resolve, reject) => {
			const transaction = this.db!.transaction([STORE_PAGES], 'readonly');
			const store = transaction.objectStore(STORE_PAGES);
			
			const request = store.get(key);
			request.onerror = () => reject(request.error);
			request.onsuccess = () => {
				const result = request.result;
				resolve(result ? result.blob : null);
			};
		});
	}
}
