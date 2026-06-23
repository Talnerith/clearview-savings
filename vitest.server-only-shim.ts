// Shim for the "server-only" package. Next.js uses it as a build-time guard
// to prevent server-only modules from being bundled into the browser. In
// vitest we run those modules directly, so the import resolves to nothing.
export {};
