const NORMALIZED_MATH_CACHE_MAX_ENTRIES = 200;
const normalizedMathCache = new Map<string, string>();

export function normalizeMathDelimiters(content: string): string {
  const cached = normalizedMathCache.get(content);
  if (cached !== undefined) {
    return cached;
  }

  const normalized = transformOutsideCode(content, (segment) => {
    return escapeBarePercentInMath(renderCurrencyEscapes(segment));
  });

  if (normalizedMathCache.size >= NORMALIZED_MATH_CACHE_MAX_ENTRIES) {
    const firstKey = normalizedMathCache.keys().next().value;
    if (firstKey !== undefined) {
      normalizedMathCache.delete(firstKey);
    }
  }

  normalizedMathCache.set(content, normalized);
  return normalized;
}

function transformOutsideCode(
  content: string,
  transform: (segment: string) => string
): string {
  return content
    .split(/(```[\s\S]*?```)/g)
    .map((fencedOrPlainChunk) => {
      if (fencedOrPlainChunk.startsWith('```')) {
        return fencedOrPlainChunk;
      }
      return fencedOrPlainChunk
        .split(/(`[^`\n]*`)/g)
        .map((inlineCodeOrPlain) => {
          if (
            inlineCodeOrPlain.startsWith('`') &&
            inlineCodeOrPlain.endsWith('`')
          ) {
            return inlineCodeOrPlain;
          }
          return transform(inlineCodeOrPlain);
        })
        .join('');
    })
    .join('');
}

function renderCurrencyEscapes(content: string): string {
  let result = '';
  let i = 0;
  while (i < content.length) {
    if (content[i] === '$' && content[i + 1] === '$') {
      const close = content.indexOf('$$', i + 2);
      if (close !== -1) {
        result += content.slice(i, close + 2);
        i = close + 2;
        continue;
      }
    }
    if (content[i] === '$' && content[i - 1] !== '\\') {
      const close = content.indexOf('$', i + 1);
      if (close !== -1) {
        result += content.slice(i, close + 1);
        i = close + 1;
        continue;
      }
    }
    if (content[i] === '\\' && content[i + 1] === '$') {
      result += '$';
      i += 2;
      continue;
    }
    result += content[i];
    i += 1;
  }
  return result;
}

function escapeBarePercentInMath(content: string): string {
  return content.replace(
    /(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g,
    (mathSegment: string) => {
      const delimiter = mathSegment.startsWith('$$') ? '$$' : '$';
      const inner = mathSegment.slice(delimiter.length, -delimiter.length);
      return `${delimiter}${escapeUnescapedPercent(inner)}${delimiter}`;
    }
  );
}

function escapeUnescapedPercent(content: string): string {
  let result = '';
  for (let i = 0; i < content.length; i += 1) {
    const char = content[i];
    if (char !== '%') {
      result += char;
      continue;
    }
    let backslashCount = 0;
    for (let j = i - 1; j >= 0 && content[j] === '\\'; j -= 1) {
      backslashCount += 1;
    }
    result += backslashCount % 2 === 0 ? '\\%' : '%';
  }
  return result;
}
