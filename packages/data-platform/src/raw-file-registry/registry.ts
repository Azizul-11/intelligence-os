import type { FileRecord } from "./file-record";

/**
 * Raw File Registry
 *
 * Responsible for tracking every file entering
 * the IntelligenceOS platform.
 *
 * This registry does NOT parse, validate, or transform
 * datasets. It only manages file metadata.
 */
export class Registry {
  private readonly records = new Map<string, FileRecord>();

  /**
   * Register a new file.
   */
  register(file: FileRecord): void {
    this.records.set(file.id, file);
  }

  /**
   * Find a file by its platform identifier.
   */
  findById(id: string): FileRecord | undefined {
    return this.records.get(id);
  }

  /**
   * Check whether a file exists.
   */
  exists(id: string): boolean {
    return this.records.has(id);
  }

  /**
   * List all registered files.
   */
  list(): FileRecord[] {
    return [...this.records.values()];
  }

  /**
   * Remove a registered file.
   */
  remove(id: string): boolean {
    return this.records.delete(id);
  }

  /**
   * Remove all registered files.
   */
  clear(): void {
    this.records.clear();
  }
}