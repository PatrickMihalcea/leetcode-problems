// Language-agnostic lexical helpers for parsing a dotted call chain out of raw source text —
// shared by javaCompletion.ts and pythonCompletion.ts, since "find the expression right before the
// cursor" and "split it into a.b(x).c(y)" don't depend on which language it's written in.

/** Splits `a.b(x).c(y)` into `['a', 'b(x)', 'c(y)']`, respecting parens so a `.` inside a call's
 * arguments doesn't split the chain. */
export function splitTopLevelDots(expr: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === '.' && depth === 0) {
      parts.push(expr.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(expr.slice(start));
  return parts;
}

/** Walks backward from the cursor (which sits right after the `.` the user just typed) to find the
 * full receiver expression, e.g. `"sb.append(x).append(y)"` out of `"... sb.append(x).append(y)."`.
 * Stops at the first character that can't be part of an identifier/call chain (whitespace, `=`,
 * `;`, an unmatched `(`, ...) — deliberately doesn't handle `this.`, casts, or ternaries.
 *
 * `leadingKeyword`, if given, is re-attached across the whitespace the scan otherwise stops at —
 * e.g. Java's `new` in `new StringBuilder()...` (the scan alone stops between `new` and the type
 * name, since whitespace isn't part of the identifier/call charset). */
export function extractChainExpression(lineTextBeforeCursor: string, leadingKeyword?: string): string | null {
  if (!lineTextBeforeCursor.endsWith('.')) return null;
  const end = lineTextBeforeCursor.length - 1;

  let i = end;
  let depth = 0;
  while (i > 0) {
    const c = lineTextBeforeCursor[i - 1];
    if (c === ')') {
      depth++;
      i--;
      continue;
    }
    if (c === '(') {
      if (depth === 0) break;
      depth--;
      i--;
      continue;
    }
    if (depth > 0) {
      i--;
      continue;
    }
    if (/[A-Za-z0-9_$.]/.test(c)) {
      i--;
      continue;
    }
    break;
  }

  if (leadingKeyword) {
    const keywordMatch = new RegExp(`${leadingKeyword}\\s+$`).exec(lineTextBeforeCursor.slice(0, i));
    if (keywordMatch) i -= keywordMatch[0].length;
  }

  const expr = lineTextBeforeCursor.slice(i, end);
  return expr || null;
}
