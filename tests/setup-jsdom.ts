// This jsdom build exposes neither a working localStorage nor matchMedia. The
// viewer guards both at runtime, but the tests need real implementations to
// assert against, so minimal standards-shaped stand-ins are installed here.
//
// Presence checks are not enough: Node defines a `localStorage` global that is
// unusable without --localstorage-file, so each API is probed by calling it.

function install(target: object, key: string, value: unknown): void {
  Object.defineProperty(target, key, { value, configurable: true, writable: true });
}

function usable(probe: () => void): boolean {
  try {
    probe();
    return true;
  } catch {
    return false;
  }
}

if (typeof window !== "undefined") {
  const storageWorks = usable(() => {
    const store = window.localStorage;
    if (!store) throw new Error("absent");
    store.setItem("__probe__", "1");
    store.removeItem("__probe__");
  });

  if (!storageWorks) {
    const store = new Map<string, string>();
    const storage: Storage = {
      get length() {
        return store.size;
      },
      clear: () => store.clear(),
      getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
      key: (index: number) => Array.from(store.keys())[index] ?? null,
      removeItem: (key: string) => void store.delete(key),
      setItem: (key: string, value: string) => void store.set(key, String(value)),
    };
    // vitest copies jsdom's window keys onto globalThis when the environment is
    // created, which is before this file runs — so both targets need the stub.
    install(window, "localStorage", storage);
    install(globalThis, "localStorage", storage);
  }

  const matchMediaWorks = usable(() => {
    if (typeof window.matchMedia !== "function") throw new Error("absent");
    window.matchMedia("(prefers-color-scheme: dark)");
  });

  if (!matchMediaWorks) {
    const matchMedia = (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList;
    install(window, "matchMedia", matchMedia);
    install(globalThis, "matchMedia", matchMedia);
  }
}
