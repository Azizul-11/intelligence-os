/** Deterministic file checksum, used to detect duplicates, verify integrity and spot changes. */
export interface FileChecksum {
  /** Hashing algorithm, e.g. sha256, sha512, md5. */
  algorithm: string;

  /** Generated checksum value. */
  value: string;
}