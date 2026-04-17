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

export const MATH_TOKEN_PREFIX = '`QGMATH_TOKEN_';
export const MATH_TOKEN_SUFFIX = '`';

function createMathToken(index: number): string {
  return `${MATH_TOKEN_PREFIX}${index}${MATH_TOKEN_SUFFIX}`;
}

/**
 * Replace inline/display LaTeX math blocks ($...$ / $$...$$) with opaque
 * placeholder tokens so Markdown parsers do not consume or alter LaTeX
 * sequences. Returns the transformed markdown and the list of placeholders.
 *
 * If isStreaming is true, it will attempt to close unclosed math blocks
 * at the end of the content to prevent markdown mangling.
 *
 * @param content - Original markdown containing LaTeX math
 * @param isStreaming - Whether the content is currently being streamed
 */
// eslint-disable-next-line complexity
export function shieldMathForMarkdown(
  content: string,
  isStreaming = false,
): ShieldedMath {
  const placeholders: Array<readonly [string, string]> = [];
  const out: string[] = [];
  const chars = Array.from(content);
  const len = chars.length;

  let i = 0;
  while (i < len) {
    const ch = chars[i];

    // Preserve escaped characters.
    if (ch === '\\' && i + 1 < len) {
      out.push(ch, chars[i + 1]);
      i += 2;
      continue;
    }

    // Skip code blocks - Fenced
    if (
      ch === '`' &&
      i + 2 < len &&
      chars[i + 1] === '`' &&
      chars[i + 2] === '`'
    ) {
      out.push('`', '`', '`');
      i += 3;
      let closed = false;
      while (i < len) {
        if (
          chars[i] === '`' &&
          i + 2 < len &&
          chars[i + 1] === '`' &&
          chars[i + 2] === '`'
        ) {
          out.push('`', '`', '`');
          i += 3;
          closed = true;
          break;
        }
        out.push(chars[i]);
        i++;
      }
      if (!closed && isStreaming) {
        out.push('\n```'); // Auto-close streaming code block
      }
      continue;
    }

    // Skip code blocks - Inline
    if (ch === '`') {
      out.push('`');
      i++;
      let closed = false;
      while (i < len) {
        if (chars[i] === '`') {
          out.push('`');
          i++;
          closed = true;
          break;
        }
        if (chars[i] === '\\' && i + 1 < len) {
          out.push('\\', chars[i + 1]);
          i += 2;
          continue;
        }
        out.push(chars[i]);
        i++;
      }
      if (!closed && isStreaming) {
        out.push('`'); // Auto-close streaming inline code
      }
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
      if (isStreaming) {
        // Auto-close unclosed math block during streaming
        const value =
          chars.slice(start, len).join('') + (isDisplay ? '$$' : '$');
        const token = createMathToken(placeholders.length);
        placeholders.push([token, value]);
        out.push(token);
        break;
      } else {
        out.push(...chars.slice(start));
        break;
      }
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
