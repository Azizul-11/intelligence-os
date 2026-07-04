/**
 * Describes where a dataset originated.
 */
export interface DatasetSource {
  /**
   * Source system.
   * Example: CMS, CDC, WHO
   */
  name: string;

  /**
   * Optional download URL.
   */
  url?: string;
}