// pdfjs 6 会调用 Map.prototype.getOrInsertComputed / getOrInsert（Chrome 145+）
// 和 Math.sumPrecise。Electron 39 的 Chromium 142 都没有。
// 缺 sumPrecise 时内嵌公式字体重建失败，希腊字母、括号和求和号会变成空白或拉丁字母。
// Worker 里的副本在 public/pdfjs-map-polyfill.mjs，两边要一起改。

declare global {
  interface Math {
    sumPrecise?(values: Iterable<number>): number;
  }
}

if (typeof Math.sumPrecise !== "function") {
  Object.defineProperty(Math, "sumPrecise", {
    configurable: true,
    writable: true,
    value(values: Iterable<number>) {
      let sum = 0;
      for (const value of values) {
        if (typeof value !== "number") {
          throw new TypeError("Math.sumPrecise expects numbers");
        }
        sum += value;
      }
      return sum;
    },
  });
}

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
