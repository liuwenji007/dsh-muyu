/**
 * Type-only seam: client `apply` takes a Cordis Context. The package is a peer
 * and is not installed in this checkout.
 */
declare module '@deepseek-ai/cordis' {
  // Minimal surface used by this plugin's client entry.
  export interface Context {
    effect(fn: () => (() => void) | void, name?: string): void
    get(name: string): unknown
    locale: {
      register(ns: string, dict: Record<string, Record<string, string>>): () => void
    }
    slots: {
      inject(name: string, factory: () => unknown): void
      register(meta: Record<string, unknown>, component: unknown): unknown
    }
  }
}
