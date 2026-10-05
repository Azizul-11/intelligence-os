/** Describes where a dataset originated. */
export interface DatasetSource {
  /** Source system, e.g. CMS, CDC, WHO. */
  name: string;

  /** Optional download URL. */
  url?: string;
}