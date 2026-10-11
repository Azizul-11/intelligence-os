declare const Deno: { env: { get(name: string): string | undefined }; [key: string]: any };
declare const EdgeRuntime: { waitUntil?(task: Promise<unknown>): void } | undefined;
