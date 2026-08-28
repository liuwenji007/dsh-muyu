/**
 * Type-only seam: defineStore lives on dsh-client-store (platform seed /
 * shell-own). The package is a peer and is not installed in this checkout.
 */
declare module '@deepseek-ai/dsh-client-store' {
  // Keep loose: full StoreSpec lives in ui-slots; we only need the call shape.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type EngineStoreHandle<T = any, A = any> = {
    create(scopeKey?: string): unknown
  }

  export function defineStore<T, A>(decl: {
    init: () => T
    persist?: string
    actions: A
  }): EngineStoreHandle<T, A>
}
