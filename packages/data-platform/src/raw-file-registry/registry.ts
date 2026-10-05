import type { FileRecord } from "./file-record";

/** Raw File Registry: tracks every file entering the platform; manages file metadata only, never parses, validates or transforms datasets. */
export class Registry {
  private readonly records = new Map<string, FileRecord>();

  /** Register a new file. */
  register(file: FileRecord): void {
    this.records.set(file.id, file);
  }

  /** Find a file by its platform identifier. */
  findById(id: string): FileRecord | undefined {
    return this.records.get(id);
  }

  /** Check whether a file exists. */
  exists(id: string): boolean {
    return this.records.has(id);
  }

  /** List all registered files. */
  list(): FileRecord[] {
    return [...this.records.values()];
  }

  /** Remove a registered file. */
  remove(id: string): boolean {
    return this.records.delete(id);
  }

  /** Remove all registered files. */
  clear(): void {
    this.records.clear();
  }
}