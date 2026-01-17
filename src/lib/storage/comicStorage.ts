// IndexedDB Storage Manager for Comic Files
// Persists comic archives locally for offline access with schema migration support

import type { ComicBook } from "../../types/comic.js";

export interface StoredComic extends ComicBook {
  fileBuffer: ArrayBuffer;
  mimeType: string;
  uploadDate: number;
  lastAccessed: number;
  fileSize: number;
  thumbnail?: string;
  currentPage: number;
  totalPages: number;
  filter?: string;
}

export interface ComicMetadata {
  id: string;
  filename: string;
  uploadDate: number;
  lastAccessed: number;
  fileSize: number;
  thumbnail?: string;
  currentPage: number;
  totalPages: number;
  filter?: string;
}

type ComicRecord = {
  id: string;
  filename: string;
  fileBuffer?: ArrayBuffer; // current storage format
  fileData?: Blob; // legacy storage format
  mimeType?: string;
  uploadDate?: number;
  lastAccessed?: number;
  fileSize?: number;
  thumbnail?: string;
  version?: number;
  currentPage?: number;
  totalPages?: number;
  filter?: string;
};

class ComicStorageManager {
  private dbName = "ComicReaderFilesDB";
  private dbVersion = 4;
  private storeName = "comicFiles";
  private pagesStoreName = "comicPages";
  private metadataStoreName = "comicMetadata";
  private fileSystemStoreName = "fileSystem";
  private recordVersion = 2;
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;

    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(new Error("Failed to open database"));

      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const objectStore = db.createObjectStore(this.storeName, {
            keyPath: "id",
          });
          objectStore.createIndex("filename", "filename", { unique: false });
          objectStore.createIndex("uploadDate", "uploadDate", {
            unique: false,
          });
          objectStore.createIndex("lastAccessed", "lastAccessed", {
            unique: false,
          });
        }
        if (!db.objectStoreNames.contains(this.pagesStoreName)) {
          const pagesStore = db.createObjectStore(this.pagesStoreName, {
            keyPath: "key",
          });
          pagesStore.createIndex("comicId", "comicId", { unique: false });
        }
        if (!db.objectStoreNames.contains(this.metadataStoreName)) {
          const metadataStore = db.createObjectStore(this.metadataStoreName, {
            keyPath: "id",
          });
          metadataStore.createIndex("lastRead", "lastRead", { unique: false });
        }
        if (!db.objectStoreNames.contains(this.fileSystemStoreName)) {
          const fileSystemStore = db.createObjectStore(
            this.fileSystemStoreName,
            {
              keyPath: "id",
            },
          );
          fileSystemStore.createIndex("parentId", "parentId", {
            unique: false,
          });
          fileSystemStore.createIndex("name", "name", { unique: false });
        }
      };
    });

    // Run migration to normalize existing records after initialization
    await this.migrateLegacyRecords();
    await this.migrateFromSharedLegacyStore();
  }

  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    if (!this.db) throw new Error("Database not initialized");
    return this.db;
  }

  async saveComic(
    file: File,
    options?: { thumbnail?: string; currentPage?: number; totalPages?: number },
  ): Promise<string> {
    const db = await this.ensureDB();
    const id = this.generateId(file.name, file.size);
    const { thumbnail, currentPage = 0, totalPages } = options || {};

    // Check if comic already exists
    const existing = await this.getComic(id);
    if (existing) {
      await this.updateLastAccessed(id);
      console.log(`Comic already exists: ${file.name}`);
      return id;
    }

    const mimeType = file.type || "application/octet-stream";
    const buffer = await file.arrayBuffer();

    const record: ComicRecord = {
      id,
      filename: file.name,
      fileBuffer: buffer,
      mimeType,
      uploadDate: Date.now(),
      lastAccessed: Date.now(),
      fileSize: file.size,
      thumbnail,
      currentPage,
      totalPages: typeof totalPages === "number" ? totalPages : 0,
      version: this.recordVersion,
    };

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readwrite");
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.put(record);

      request.onsuccess = () => {
        console.log(
          `Comic saved: ${file.name} (${this.formatFileSize(file.size)})`,
        );
        resolve(id);
      };
      request.onerror = () => reject(new Error("Failed to save comic"));
    });
  }

  async getComic(id: string): Promise<ComicBook | null> {
    const db = await this.ensureDB();

    const record = await new Promise<ComicRecord | undefined>(
      (resolve, reject) => {
        const transaction = db.transaction(this.storeName, "readonly");
        const objectStore = transaction.objectStore(this.storeName);
        const request = objectStore.get(id);

        request.onsuccess = () => {
          resolve(request.result as ComicRecord | undefined);
        };
        request.onerror = () => reject(new Error("Failed to retrieve comic"));
      },
    );

    return this.normalizeRecord(record);
  }

  async getAllComics(): Promise<ComicMetadata[]> {
    const db = await this.ensureDB();

    const records = await new Promise<ComicRecord[]>((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readonly");
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.getAll();

      request.onsuccess = () =>
        resolve((request.result as ComicRecord[]) || []);
      request.onerror = () =>
        reject(new Error("Failed to retrieve comics list"));
    });

    const normalized = await Promise.all(
      records.map((record) => this.normalizeRecord(record)),
    );
    return normalized
      .filter((comic): comic is StoredComic => comic !== null)
      .map((comic) => ({
        id: comic.id,
        filename: comic.filename,
        uploadDate: comic.uploadDate,
        lastAccessed: comic.lastAccessed,
        fileSize: comic.fileSize,
        thumbnail: comic.thumbnail,
        currentPage: comic.currentPage,
        totalPages: comic.totalPages,
        filter: comic.filter,
      }))
      .sort((a, b) => b.lastAccessed - a.lastAccessed);
  }

  async saveFilterSetting(comicId: string, filter: string): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readwrite");
      const objectStore = transaction.objectStore(this.storeName);
      const getRequest = objectStore.get(comicId);
      getRequest.onsuccess = () => {
        const record = getRequest.result as ComicRecord | undefined;
        if (record) {
          record.filter = filter;
          const putRequest = objectStore.put(record);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () =>
            reject(new Error("Failed to save filter setting"));
        } else {
          resolve(); // Not found
        }
      };
      getRequest.onerror = () =>
        reject(new Error("Failed to get comic for filter update"));
    });
  }

  async loadAllFilterSettings(): Promise<Record<string, string>> {
    const comics = await this.getAllComics();
    const settings: Record<string, string> = {};
    for (const comic of comics) {
      if (comic.filter) {
        settings[comic.id] = comic.filter;
      }
    }
    return settings;
  }

  async deleteComic(id: string): Promise<void> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readwrite");
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.delete(id);

      request.onsuccess = () => {
        console.log(`Comic deleted: ${id}`);
        resolve();
      };
      request.onerror = () => reject(new Error("Failed to delete comic"));
    });
  }

  async clearAll(): Promise<void> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readwrite");
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.clear();

      request.onsuccess = () => {
        console.log("All comics cleared from storage");
        resolve();
      };
      request.onerror = () => reject(new Error("Failed to clear storage"));
    });
  }

  async updateLastAccessed(
    id: string,
    data?: { currentPage?: number; totalPages?: number },
  ): Promise<void> {
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readwrite");
      const objectStore = transaction.objectStore(this.storeName);
      const getRequest = objectStore.get(id);

      getRequest.onsuccess = () => {
        const record = getRequest.result as ComicRecord | undefined;
        if (record) {
          record.lastAccessed = Date.now();
          if (data && typeof data.currentPage === "number") {
            record.currentPage = data.currentPage;
          }
          if (data && typeof data.totalPages === "number") {
            record.totalPages = data.totalPages;
          }
          record.version = this.recordVersion;
          const putRequest = objectStore.put(record);
          putRequest.onsuccess = () => resolve();
          putRequest.onerror = () =>
            reject(new Error("Failed to update last accessed"));
        } else {
          resolve(); // Not found
        }
      };
      getRequest.onerror = () => reject(new Error("Failed to get comic"));
    });
  }

  async updateProgress(
    id: string,
    currentPage: number,
    totalPages?: number,
  ): Promise<void> {
    await this.updateLastAccessed(id, { currentPage, totalPages });
  }

  createFile(storedComic: StoredComic): File {
    const blob = new Blob([storedComic.fileBuffer], {
      type: storedComic.mimeType,
    });
    return new File([blob], storedComic.filename, {
      type: storedComic.mimeType,
      lastModified:
        storedComic.lastAccessed || storedComic.uploadDate || Date.now(),
    });
  }

  async savePageBlob(
    comicId: string,
    pageIndex: number,
    blob: Blob,
  ): Promise<void> {
    const db = await this.ensureDB();
    const key = `${comicId}-${pageIndex}`;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.pagesStoreName, "readwrite");
      const store = transaction.objectStore(this.pagesStoreName);
      const request = store.put({
        key,
        comicId,
        pageIndex,
        blob,
        cachedAt: new Date(),
      });

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async addFileSystemEntry(entry: any): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.fileSystemStoreName, "readwrite");
      const store = transaction.objectStore(this.fileSystemStoreName);
      const request = store.add(entry);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getFileSystemEntriesByParentId(
    parentId: string | null,
  ): Promise<any[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.fileSystemStoreName, "readonly");
      const store = transaction.objectStore(this.fileSystemStoreName);
      const index = store.index("parentId");
      const request = index.getAll(parentId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async getPageBlob(comicId: string, pageIndex: number): Promise<Blob | null> {
    const db = await this.ensureDB();
    const key = `${comicId}-${pageIndex}`;

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.pagesStoreName, "readonly");
      const store = transaction.objectStore(this.pagesStoreName);
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.blob : null);
      };
    });
  }

  async getStorageEstimate(): Promise<{
    usage: number;
    quota: number;
    percentage: number;
  }> {
    if ("storage" in navigator && "estimate" in navigator.storage) {
      const estimate = await navigator.storage.estimate();
      const usage = estimate.usage || 0;
      const quota = estimate.quota || 0;
      const percentage = quota > 0 ? (usage / quota) * 100 : 0;

      return {
        usage,
        quota,
        percentage: Math.round(percentage * 100) / 100,
      };
    }
    return { usage: 0, quota: 0, percentage: 0 };
  }

  private generateId(filename: string, fileSize: number): string {
    return `${filename}-${fileSize}`;
  }

  private formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  }

  private async normalizeRecord(
    record?: ComicRecord,
  ): Promise<StoredComic | null> {
    if (!record) return null;

    let updated = false;
    let fileBuffer = record.fileBuffer;

    // Handle legacy Blob storage
    if (!fileBuffer && record.fileData instanceof Blob) {
      try {
        fileBuffer = await record.fileData.arrayBuffer();
        record.fileBuffer = fileBuffer;
        updated = true;
      } catch (error) {
        console.error("Failed to migrate legacy comic blob:", error);
        return null;
      }
    }

    if (!fileBuffer) {
      console.warn(`Comic record missing file data: ${record.id}`);
      return null;
    }

    const mimeType =
      record.mimeType ||
      (record.fileData instanceof Blob ? record.fileData.type : undefined) ||
      "application/octet-stream";

    const uploadDate = record.uploadDate ?? Date.now();
    const lastAccessed = record.lastAccessed ?? uploadDate;
    const fileSize =
      record.fileSize ??
      (record.fileData instanceof Blob
        ? record.fileData.size
        : fileBuffer.byteLength);
    const currentPage = record.currentPage ?? 0;
    const totalPages = record.totalPages ?? 0;

    if (record.mimeType !== mimeType) {
      record.mimeType = mimeType;
      updated = true;
    }
    if (record.uploadDate !== uploadDate) {
      record.uploadDate = uploadDate;
      updated = true;
    }
    if (record.lastAccessed !== lastAccessed) {
      record.lastAccessed = lastAccessed;
      updated = true;
    }
    if (record.fileSize !== fileSize) {
      record.fileSize = fileSize;
      updated = true;
    }
    if (record.currentPage !== currentPage) {
      record.currentPage = currentPage;
      updated = true;
    }
    if (record.totalPages !== totalPages) {
      record.totalPages = totalPages;
      updated = true;
    }
    if (record.version !== this.recordVersion) {
      record.version = this.recordVersion;
      updated = true;
    }

    // Remove legacy blob to free space once migrated
    if (updated && record.fileData) {
      delete record.fileData;
    }

    if (updated) {
      await this.persistRecord(record);
    }

    return {
      id: record.id,
      filename: record.filename,
      fileBuffer,
      mimeType,
      uploadDate,
      lastAccessed,
      fileSize,
      thumbnail: record.thumbnail,
      currentPage,
      totalPages,
      filter: record.filter,
      title: record.filename.replace(/\.[^/.]+$/, ""),
      pages: [],
      lastRead: new Date(lastAccessed),
    };
  }

  private async persistRecord(record: ComicRecord): Promise<void> {
    const db = await this.ensureDB();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(this.storeName, "readwrite");
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.put(record);

      request.onsuccess = () => resolve();
      request.onerror = () =>
        reject(new Error("Failed to persist comic record"));
    });
  }

  private async migrateLegacyRecords(): Promise<void> {
    const database = await this.ensureDB();

    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(this.storeName, "readonly");
      const store = transaction.objectStore(this.storeName);
      const cursorRequest = store.openCursor();

      cursorRequest.onerror = () =>
        reject(new Error("Failed to iterate comic records"));

      cursorRequest.onsuccess = async () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          resolve();
          return;
        }

        const record = cursor.value as ComicRecord;
        const needsMigration =
          !record.fileBuffer ||
          !record.mimeType ||
          !record.fileSize ||
          record.version !== this.recordVersion;

        if (!needsMigration) {
          cursor.continue();
          return;
        }

        try {
          const normalized = await this.normalizeRecord(record);
          if (normalized) {
            // normalizeRecord already persisted changes if needed
          }
        } catch (error) {
          console.error(`Failed to migrate comic record ${record.id}:`, error);
        } finally {
          cursor.continue();
        }
      };
    });
  }

  async saveComicMetadata(comic: ComicBook): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(this.metadataStoreName, "readwrite");
      const store = transaction.objectStore(this.metadataStoreName);
      const request = store.put(comic);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  private async migrateFromSharedLegacyStore(): Promise<void> {
    return new Promise((resolve) => {
      const request = indexedDB.open("ComicReaderDB");

      request.onerror = () => resolve();

      request.onsuccess = () => {
        const legacyDb = request.result;

        if (!legacyDb.objectStoreNames.contains("comics")) {
          legacyDb.close();
          resolve();
          return;
        }

        const transaction = legacyDb.transaction("comics", "readonly");
        const store = transaction.objectStore("comics");
        const cursorRequest = store.openCursor();

        cursorRequest.onerror = () => {
          legacyDb.close();
          resolve();
        };

        cursorRequest.onsuccess = async () => {
          const cursor = cursorRequest.result;
          if (!cursor) {
            legacyDb.close();
            resolve();
            return;
          }

          const record = cursor.value as ComicRecord;
          const hasFileData =
            record.fileBuffer instanceof ArrayBuffer ||
            record.fileData instanceof Blob;

          if (hasFileData) {
            try {
              await this.normalizeRecord(record);
            } catch (error) {
              console.error(
                `Failed to migrate legacy shared record ${record.id}:`,
                error,
              );
            }
          }

          cursor.continue();
        };
      };
    });
  }
}

// Export singleton instance
export const comicStorage = new ComicStorageManager();
