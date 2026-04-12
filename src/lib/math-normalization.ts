/**
 * Normalize math delimiters in a string.
 *
 * Currently a passthrough because normalization is handled server-side,
 * but kept as a stable API for callers.
 *
 * @param content - Input markdown/LaTeX content
 * @returns Normalized content
 */
export function normalizeMathDelimiters(content: string): string {
  // Normalization now happens in Rust (`clean_field`) before content reaches
  // the UI. Keep this as a stable frontend API and passthrough.
  return content;
}

export type ShieldedMath = {
  markdown: string;
  placeholders: Array<readonly [token: string, value: string]>;
};

const MATH_TOKEN_PREFIX = 'QG_MATH_TOKEN_START_';
const MATH_TOKEN_SUFFIX = '_QG_MATH_TOKEN_END';

function createMathToken(index: number): string {
  return `${MATH_TOKEN_PREFIX}${index}${MATH_TOKEN_SUFFIX}`;
}

// Replace $...$ and $$...$$ blocks with placeholders so markdown parsers
// cannot consume backslashes inside LaTeX commands.
/**
 * Replace inline/display LaTeX math blocks ($...$ / $$...$$) with opaque
 * placeholder tokens so Markdown parsers do not consume or alter LaTeX
 * sequences. Returns the transformed markdown and the list of placeholders.
 *
 * @param content - Original markdown containing LaTeX math
 */
export function shieldMathForMarkdown(content: string): ShieldedMath {
  const placeholders: Array<readonly [string, string]> = [];
  const out: string[] = [];
  const chars = Array.from(content);
  const len = chars.length;

  let i = 0;
  while (i < len) {
    const ch = chars[i];

    // Preserve escaped characters while scanning for delimiters.
    if (ch === '\\' && i + 1 < len) {
      out.push(ch, chars[i + 1]);
      i += 2;
      continue;
    }

    if (ch !== '$') {
      out.push(ch);
      i += 1;
      continue;
    }

    const isDisplay = i + 1 < len && chars[i + 1] === '$';
    const start = i;
    i += isDisplay ? 2 : 1;

    let found = false;
    while (i < len) {
      if (chars[i] === '\\' && i + 1 < len) {
        i += 2;
        continue;
      }

      if (isDisplay) {
        if (i + 1 < len && chars[i] === '$' && chars[i + 1] === '$') {
          i += 2;
          found = true;
          break;
        }
      } else if (chars[i] === '$') {
        i += 1;
        found = true;
        break;
      }

      i += 1;
    }

    if (!found) {
      out.push(...chars.slice(start));
      break;
    }

    const value = chars.slice(start, i).join('');
    const token = createMathToken(placeholders.length);
    placeholders.push([token, value]);
    out.push(token);
  }

  return {
    markdown: out.join(''),
    placeholders,
  };
}

export function restoreMathPlaceholders(
  text: string,
  placeholders: ReadonlyArray<readonly [token: string, value: string]>,
): string {
  /**
   * Restore math placeholder tokens back to their original LaTeX fragments.
   * @param text - Markdown text containing tokens
   * @param placeholders - Array of [token, value] pairs to restore
   * @returns Restored markdown with LaTeX fragments reinserted
   */
  let output = text;
  for (const [token, value] of placeholders) {
    if (output.includes(token)) {
      output = output.split(token).join(value);
    }
  }
  return output;
}
