// ─── Page range parsing & formatting ──────────────────────────────────────────
// Used by PDFMarkerView to translate between human-entered page-range strings
// (e.g. "1-3, 5, 7-9") and zero-based page index arrays, plus format arrays
// back into compact, sorted strings for display in inputs.

export type PageMapping = {
  questionIndex: number;
  pageIndices: number[];
};

/**
 * Parse strings like "1", "1-3", "1, 4-6, 8" into a sorted list of
 * zero-based page indices. Duplicate entries are removed.
 */
export function parsePageRangeString(rangeStr: string): number[] {
  if (!rangeStr.trim()) return [];
  const indices: number[] = [];
  const parts = rangeStr.split(',').map((p) => p.trim());

  for (const part of parts) {
    if (part.includes('-')) {
      const [startRaw, endRaw] = part.split('-').map((n) => parseInt(n.trim(), 10));
      if (!isNaN(startRaw) && !isNaN(endRaw)) {
        for (let i = Math.min(startRaw, endRaw); i <= Math.max(startRaw, endRaw); i++) {
          indices.push(i - 1);
        }
      }
    } else {
      const n = parseInt(part, 10);
      if (!isNaN(n)) {
        indices.push(n - 1);
      }
    }
  }

  return Array.from(new Set(indices)).sort((a, b) => a - b);
}

/**
 * Format zero-based page indices back into a sorted, joined string
 * suitable for showing the user in an input field. Adjacent pages are
 * collapsed into ranges (e.g. "1-3, 5, 7-9").
 */
export function formatPageIndices(pageIndices: number[]): string {
  if (pageIndices.length === 0) return '';

  const sorted = [...pageIndices].sort((a, b) => a - b);
  const result: string[] = [];
  let start = sorted[0];
  let end = sorted[0];

  for (let i = 1; i <= sorted.length; i++) {
    if (i < sorted.length && sorted[i] === end + 1) {
      end = sorted[i];
    } else {
      result.push(start === end ? String(start + 1) : `${start + 1}-${end + 1}`);
      if (i < sorted.length) {
        start = sorted[i];
        end = sorted[i];
      }
    }
  }

  return result.join(', ');
}

/** Read the current page range string for a given question index. */
export function getPageRangeForIndex(
  index: number,
  pageMappings: PageMapping[],
): string {
  const mapping = pageMappings.find((m) => m.questionIndex === index);
  if (!mapping || mapping.pageIndices.length === 0) return '';
  return formatPageIndices(mapping.pageIndices);
}

/** Update the page mapping for a question index from a free-text range. */
export function updatePageMappingForIndex(
  index: number,
  rangeStr: string,
  existing: PageMapping[],
): PageMapping[] {
  const uniqueIndices = parsePageRangeString(rangeStr);

  const existingIdx = existing.findIndex((m) => m.questionIndex === index);
  if (existingIdx !== -1) {
    const next = [...existing];
    next[existingIdx] = { questionIndex: index, pageIndices: uniqueIndices };
    return next;
  }

  return [...existing, { questionIndex: index, pageIndices: uniqueIndices }];
}
