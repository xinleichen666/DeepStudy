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
  if (needle.length < 2) return null;
  const direct = compactHaystack.indexOf(needle);
  if (direct >= 0) return { index: direct, length: needle.length };
  for (const size of [36, 24, 16, 10]) {
    if (needle.length <= size) continue;
    const idx = compactHaystack.indexOf(needle.slice(0, size));
    if (idx >= 0) return { index: idx, length: size };
  }
  return null;
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
  const found = locate(haystack, excerpt);
  if (!found || !map[found.index]) return null;
  const startIndex = found.index;
  const endIndex = Math.min(haystack.length - 1, startIndex + found.length - 1);
  const start = map[startIndex];
  const end = map[Math.min(endIndex, map.length - 1)];
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset + 1);
  return range;
}

function spanElement(node: Node | null) {
  if (!node) return null;
  const element = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : node.parentElement;
  return element?.closest("span") ?? null;
}

function spanBox(span: Element, range: Range, partial: boolean) {
  const content = span.textContent || "";
  const rect = span.getBoundingClientRect();
  if (!content || rect.width < 0.5 || rect.height < 0.5) return null;
  let start = 0;
  let stop = content.length;
  const text = span.firstChild;
  if (partial && text) {
    if (range.startContainer === text || range.startContainer === span) start = range.startOffset;
    if (range.endContainer === text || range.endContainer === span) stop = range.endOffset;
    if (stop < start) [start, stop] = [stop, start];
  }
  if (stop <= start) return null;
  return {
    left: rect.left + (rect.width * start) / content.length,
    top: rect.top,
    width: (rect.width * (stop - start)) / content.length,
    height: rect.height,
  };
}

// Chromium 142 splits a transformed PDF text layer into stripe-sized
// client rects. Draw one bar per visual line from the span boxes instead.
export function textLayerLineBoxes(range: Range, layer: Element, origin: HTMLElement): OverlayRect[] {
  const originRect = origin.getBoundingClientRect();
  const layerRect = layer.getBoundingClientRect();
  const startSpan = layer.contains(range.startContainer) ? spanElement(range.startContainer) : null;
  const endSpan = layer.contains(range.endContainer) ? spanElement(range.endContainer) : null;
  const startBox = startSpan
    ? spanBox(startSpan, range, true)
    : { left: layerRect.left, top: layerRect.top, width: layerRect.width, height: 1 };
  const endBox = endSpan
    ? spanBox(endSpan, range, true)
    : { left: layerRect.left, top: layerRect.bottom - 1, width: layerRect.width, height: 1 };
  if (!startBox || !endBox) return [];
  const upper = startBox.top <= endBox.top ? startBox : endBox;
  const lower = startBox.top <= endBox.top ? endBox : startBox;
  const upperMid = upper.top + upper.height / 2;
  const lowerMid = lower.top + lower.height / 2;
  const sameLine = Math.abs(upperMid - lowerMid) < Math.max(upper.height, lower.height) * 0.8;
  const hits: Array<NonNullable<ReturnType<typeof spanBox>>> = [];
  layer.querySelectorAll("span").forEach((span) => {
    const box = spanBox(span, range, span === startSpan || span === endSpan);
    if (!box) return;
    const mid = box.top + box.height / 2;
    if (mid < upper.top - 2 || mid > lower.top + lower.height + 2) return;
    if (sameLine) {
      const left = Math.min(upper.left, lower.left);
      const right = Math.max(upper.left + upper.width, lower.left + lower.width);
      if (box.left + box.width < left - 1 || box.left > right + 1) return;
    } else if (mid <= upper.top + upper.height) {
      if (box.left + box.width < upper.left - 1) return;
    } else if (mid >= lower.top) {
      if (box.left > lower.left + lower.width + 1) return;
    }
    hits.push(box);
  });
  const lines: typeof hits = [];
  for (const box of hits.sort((a, b) => a.top - b.top || a.left - b.left)) {
    const line = lines.find((item) => {
      const overlap = Math.min(item.top + item.height, box.top + box.height) - Math.max(item.top, box.top);
      return overlap > Math.min(item.height, box.height) * 0.35;
    });
    if (!line) {
      lines.push({ ...box });
      continue;
    }
    const right = Math.max(line.left + line.width, box.left + box.width);
    const bottom = Math.max(line.top + line.height, box.top + box.height);
    line.left = Math.min(line.left, box.left);
    line.top = Math.min(line.top, box.top);
    line.width = right - line.left;
    line.height = bottom - line.top;
  }
  return lines.map((box) => ({
    left: box.left - originRect.left + origin.scrollLeft,
    top: box.top - originRect.top + origin.scrollTop,
    width: box.width,
    height: box.height,
  }));
}

export function rectsFromRange(range: Range, root: HTMLElement): OverlayRect[] {
  const layer = spanElement(range.startContainer)?.closest(".textLayer");
  if (layer) return textLayerLineBoxes(range, layer, root);
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
