// 先补上 Map 方法，再加载 pdf.js worker。import 按源码顺序执行，不能对调。
import "/pdfjs-map-polyfill.mjs";
import "/pdf.worker.min.mjs";
