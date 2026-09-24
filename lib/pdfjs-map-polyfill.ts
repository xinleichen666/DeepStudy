// pdfjs 6 会调用 Map.prototype.getOrInsertComputed / getOrInsert（Chrome 145+）。
// Electron 39 的 Chromium 142 没有这两个方法，打开 PDF 会抛
// “getOrInsertComputed is not a function”。
// Worker 里的副本在 public/pdfjs-map-polyfill.mjs，两边要一起改。

type UpsertTarget = {
  has: (key: unknown) => boolean;
  get: (key: unknown) => unknown;
  set: (key: unknown, value: unknown) => unknown;
  getOrInsert?: (key: unknown, value: unknown) => unknown;
  getOrInsertComputed?: (key: unknown, callback: (key: unknown) => unknown) => unknown;
};

function installUpsert(prototype: UpsertTarget) {
  if (typeof prototype.getOrInsert !== "function") {
    Object.defineProperty(prototype, "getOrInsert", {
      configurable: true,
      writable: true,
      value(this: UpsertTarget, key: unknown, value: unknown) {
        if (this.has(key)) return this.get(key);
        this.set(key, value);
        return value;
      },
    });
  }
  if (typeof prototype.getOrInsertComputed !== "function") {
    Object.defineProperty(prototype, "getOrInsertComputed", {
      configurable: true,
      writable: true,
      value(this: UpsertTarget, key: unknown, callback: (key: unknown) => unknown) {
        if (this.has(key)) return this.get(key);
        const value = callback(key);
        if (!this.has(key)) this.set(key, value);
        return this.has(key) ? this.get(key) : value;
      },
    });
  }
}

export function installPdfjsMapPolyfill() {
  installUpsert(Map.prototype as unknown as UpsertTarget);
  installUpsert(WeakMap.prototype as unknown as UpsertTarget);
}
