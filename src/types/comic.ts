export interface ComicPage {
  filename: string;
  index: number;
  blob?: Blob;
  url?: string;
  // For universal archive support (ZIP/RAR/CBR)
  entry?: any; // Archive entry from archive library
}

export interface ComicMetadata {
  fileName: string;
  totalPages: number;
  archiveType: "zip" | "rar";
  fileSize: number;
}

export interface ComicSession {
  id: string;
  metadata: ComicMetadata;
  pages: ComicPage[];
  currentPageIndex: number;
  lastReadAt: Date;
  archiveType: "zip" | "rar"; // For backward compatibility
}

export interface ComicBook {
  id: string;
  title: string;
  filename: string;
  pages: ComicPage[];
  currentPage: number;
  totalPages: number;
  lastRead: Date;
  coverThumbnail?: string; // Base64 encoded thumbnail
}

export interface ArchiveEntry {
  filename: string;
  index: number;
  size: number;
  compressed_size?: number;
  is_file: boolean;
  isDirectory?: boolean; // For backward compatibility
}

// Worker message types
export interface WorkerMessage {
  id: string;
  type: "LIST_ARCHIVE" | "EXTRACT_PAGE" | "ERROR";
  payload?: any;
}

export interface ListArchiveMessage extends WorkerMessage {
  type: "LIST_ARCHIVE";
  payload: {
    file: File;
  };
}

export interface ExtractPageMessage extends WorkerMessage {
  type: "EXTRACT_PAGE";
  payload: {
    index: number;
  };
}

export interface WorkerResponse {
  id: string;
  type: "ARCHIVE_LISTED" | "PAGE_EXTRACTED" | "ERROR";
  payload?: any;
}

export interface ArchiveListedResponse extends WorkerResponse {
  type: "ARCHIVE_LISTED";
  payload: {
    entries: ArchiveEntry[];
  };
}

export interface PageExtractedResponse extends WorkerResponse {
  type: "PAGE_EXTRACTED";
  payload: {
    index?: number;
    blob: Blob;
  };
}
