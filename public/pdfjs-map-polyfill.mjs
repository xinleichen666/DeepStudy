// pdfjs 6 会调用 Map.prototype.getOrInsertComputed / getOrInsert（Chrome 145+）。
// Electron 39 的 Chromium 142 没有这两个方法。页面侧的副本在 lib/pdfjs-map-polyfill.ts，两边要一起改。

function installUpsert(prototype) {
  if (typeof prototype.getOrInsert !== "function") {
    Object.defineProperty(prototype, "getOrInsert", {
      configurable: true,
      writable: true,
      value(key, value) {
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
      value(key, callback) {
        if (this.has(key)) return this.get(key);
        const value = callback(key);
        if (!this.has(key)) this.set(key, value);
        return this.has(key) ? this.get(key) : value;
      },
    });
  }
}

installUpsert(Map.prototype);
installUpsert(WeakMap.prototype);
