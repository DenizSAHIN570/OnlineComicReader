import { comicStorage } from "../storage/comicStorage";

class FileManager {
  async createFolder(
    name: string,
    parentId: string | null = null,
  ): Promise<void> {
    console.log("createFolder", name, parentId);
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
    console.log("getContents", folderId);
    return [];
  }
}

export const fileManager = new FileManager();
