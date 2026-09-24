// pdfjs 6 会调用 Map.prototype.getOrInsertComputed / getOrInsert（Chrome 145+）
// 和 Math.sumPrecise。Electron 39 的 Chromium 142 都没有。
// 缺 sumPrecise 时内嵌公式字体重建失败，希腊字母、括号和求和号会变成空白或拉丁字母。
// 页面侧的副本在 lib/pdfjs-map-polyfill.ts，两边要一起改。

if (typeof Math.sumPrecise !== "function") {
  Object.defineProperty(Math, "sumPrecise", {
    configurable: true,
    writable: true,
    value(values) {
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
