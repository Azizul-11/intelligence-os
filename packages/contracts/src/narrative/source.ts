/**
 * Describes where a piece of information originated.
 */
export interface Source {
  /**
   * Name of the originating system or dataset.
   */
  name: string;

  /**
   * Optional URL or document reference.
   */
  uri?: string;

  /**
   * Dataset version or publication.
   */
  version?: string;
}