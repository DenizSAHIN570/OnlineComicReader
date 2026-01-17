import { comicStorage } from "../storage/comicStorage";

class FileManager {
  async createFolder(
    name: string,
    parentId: string | null = null,
  ): Promise<void> {
    const newFolder = {
      id: self.crypto.randomUUID(),
      name,
      parentId,
      type: "folder",
    };
    await comicStorage.init();
    await comicStorage.addFileSystemEntry(newFolder);
  }

  async renameItem(id: string, newName: string): Promise<void> {
    console.log("renameItem", id, newName);
  }

  async moveItem(id: string, newParentId: string | null = null): Promise<void> {
    console.log("moveItem", id, newParentId);
  }

  async deleteItem(id: string): Promise<void> {
    console.log("deleteItem", id);
  }

  async getContents(folderId: string | null = null): Promise<any[]> {
    await comicStorage.init();
    const contents =
      await comicStorage.getFileSystemEntriesByParentId(folderId);
    return contents;
  }
}

export const fileManager = new FileManager();
