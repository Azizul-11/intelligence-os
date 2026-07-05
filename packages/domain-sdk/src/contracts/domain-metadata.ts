export interface DomainMetadata {
  id: string;
  name: string;
  displayName: string;
  description: string;

  version: string;

  vendor: string;

  supportedDatasets: string[];

  author?: string;
  website?: string;
  license?: string;

  keywords?: string[];
}