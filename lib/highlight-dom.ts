export type OverlayRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function compact(value: string) {
  return value.replace(/\s+/g, "");
}

function collectTextNodes(root: Node) {
  const nodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current: Node | null = walker.nextNode();
  while (current) {
    if (current.textContent) nodes.push(current as Text);
    current = walker.nextNode();
  }
  return nodes;
}

function locate(compactHaystack: string, excerpt: string) {
  const needle = compact(excerpt);
  if (needle.length < 2) return -1;
  const direct = compactHaystack.indexOf(needle);
  if (direct >= 0) return direct;
  for (const size of [36, 24, 16, 10]) {
    if (needle.length <= size) continue;
    const idx = compactHaystack.indexOf(needle.slice(0, size));
    if (idx >= 0) return idx;
  }
  return -1;
}

export function findExcerptRange(root: HTMLElement, excerpt: string) {
  const nodes = collectTextNodes(root);
  const map: Array<{ node: Text; offset: number }> = [];
  let haystack = "";
  for (const node of nodes) {
    const text = node.textContent || "";
    for (let i = 0; i < text.length; i += 1) {
      if (/\s/.test(text[i])) continue;
      map.push({ node, offset: i });
      haystack += text[i];
    }
  }
  const startIndex = locate(haystack, excerpt);
  if (startIndex < 0 || !map[startIndex]) return null;
  const needleLen = Math.min(compact(excerpt).length, haystack.length - startIndex);
  const endIndex = Math.max(startIndex, startIndex + needleLen - 1);
  const start = map[startIndex];
  const end = map[Math.min(endIndex, map.length - 1)];
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset + 1);
  return range;
}

export function rectsFromRange(range: Range, root: HTMLElement): OverlayRect[] {
  const rootRect = root.getBoundingClientRect();
  return [...range.getClientRects()]
    .filter((rect) => rect.width > 2 && rect.height > 2)
    .map((rect) => ({
      top: rect.top - rootRect.top + root.scrollTop,
      left: rect.left - rootRect.left + root.scrollLeft,
      width: rect.width,
      height: rect.height,
    }));
}

export function measureExcerpt(root: HTMLElement, excerpt: string) {
  const range = findExcerptRange(root, excerpt);
  if (!range) return [];
  return rectsFromRange(range, root);
}
