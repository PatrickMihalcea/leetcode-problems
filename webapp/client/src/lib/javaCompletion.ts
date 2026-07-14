// Heuristic Java member completion: given the full source and the text typed on the current line,
// figures out what's being completed on (`map.`, or a chain like `sb.append(x).`) and what type it
// resolves to, by regex-scanning the document rather than real parsing/type-checking. Good enough
// for the small, single-class solutions this app's editor holds; it never makes completion worse
// than the editor's default word-based suggestions — it only returns [] when it doesn't recognize
// something, in which case Monaco's own default suggestions still apply.
import { ARRAY_MEMBERS, STATIC_UTILITY_CLASSES, getMembers, type TypeMember } from './javaTypeStubs';

/** Classes with static members that are also commonly used as a declared variable's type
 * (`Integer x = ...; x.` should offer instance members, not `Integer.parseInt`). */
const BOXED_PRIMITIVES = new Set(['Integer', 'Long', 'Double', 'Character', 'Boolean']);

export interface InferredType {
  typeName: string;
  isArray: boolean;
  /** The declared type's own generic arguments, e.g. `Map<Integer, String>` -> `['Integer', 'String']`
   * — used to resolve one more `.` after a generic-returning method (`map.get(k).`). */
  genericArgs?: string[];
}

/** Splits `Integer, List<String>` into `['Integer', 'List<String>']` — a plain `,`-split would
 * break on the nested generic's own comma, so this tracks `<...>` nesting depth. */
function splitTopLevelGenerics(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '<') depth++;
    else if (c === '>') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = text.slice(start).trim();
  if (last) parts.push(last);
  return parts;
}

function extractGenericArgs(rawType: string): string[] | undefined {
  const match = /<([\s\S]*)>/.exec(rawType);
  return match ? splitTopLevelGenerics(match[1]) : undefined;
}

/** Scans the whole document for a declaration of `identifier` — local var, field, method
 * parameter, or for-each loop variable — and returns its generic-erased declared type. A full-text
 * scan (rather than real scope tracking) is fine here since these are small, single-method
 * solutions, not large multi-scope files. */
export function inferDeclaredType(fullSource: string, identifier: string): InferredType | null {
  const declRe = new RegExp(`(?:^|[^.\\w])([A-Za-z_]\\w*(?:<[^;={}]*>)?(?:\\[\\])*)\\s+${identifier}\\s*(?:=|;|,|\\))`);
  const forRe = new RegExp(`for\\s*\\(\\s*([A-Za-z_]\\w*(?:<[^;={}]*>)?(?:\\[\\])*)\\s+${identifier}\\s*:`);

  const rawType = declRe.exec(fullSource)?.[1] ?? forRe.exec(fullSource)?.[1];
  if (!rawType) return null;

  if (rawType === 'var') {
    const newRe = new RegExp(`\\bvar\\s+${identifier}\\s*=\\s*new\\s+([A-Za-z_]\\w*)(<[^()]*>)?`);
    const newMatch = newRe.exec(fullSource);
    if (!newMatch) return null;
    return { typeName: newMatch[1], isArray: false, genericArgs: newMatch[2] ? splitTopLevelGenerics(newMatch[2].slice(1, -1)) : undefined };
  }

  return {
    typeName: rawType.replace(/<[\s\S]*>/, '').replace(/\[\]/g, ''),
    isArray: /\[\]/.test(rawType),
    genericArgs: extractGenericArgs(rawType),
  };
}

/** Splits `a.b(x).c(y)` into `['a', 'b(x)', 'c(y)']`, respecting parens so a `.` inside a call's
 * arguments doesn't split the chain. */
function splitTopLevelDots(expr: string): string[] {
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
 * `;`, an unmatched `(`, ...) — deliberately doesn't handle `this.`, casts, or ternaries. */
function extractChainExpression(lineTextBeforeCursor: string): string | null {
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
  // The scan above stops at whitespace, which sits right between `new` and the type name in
  // `new StringBuilder()...` — extend back over a trailing `new` keyword so it isn't dropped.
  const newKeyword = /new\s+$/.exec(lineTextBeforeCursor.slice(0, i));
  if (newKeyword) i -= newKeyword[0].length;

  const expr = lineTextBeforeCursor.slice(i, end);
  return expr || null;
}

/** Full pipeline: what's being typed on this line, in this document -> the member list to suggest.
 * Handles both a bare receiver (`map.`) and a chain of calls (`sb.append(x).append(y).`,
 * `list.get(0).`, `map.get(k).`), resolving each call's return type via javaTypeStubs' `returnType`
 * tags. Bails to `[]` (falling back to Monaco's default suggestions) as soon as it hits a call it
 * doesn't have return-type info for, or anything that isn't a simple identifier/call chain. */
export function getCompletions(fullSource: string, lineTextBeforeCursor: string): TypeMember[] {
  const expr = extractChainExpression(lineTextBeforeCursor);
  if (!expr) return [];
  const [first, ...calls] = splitTopLevelDots(expr);

  let currentType: string;
  let genericArgs: string[] | undefined;
  let staticOnly = false;

  const newMatch = /^new\s+([A-Za-z_]\w*)(<[^()]*>)?\s*\(/.exec(first.trim());
  if (newMatch) {
    currentType = newMatch[1];
    genericArgs = newMatch[2] ? splitTopLevelGenerics(newMatch[2].slice(1, -1)) : undefined;
  } else if (/^[A-Za-z_]\w*$/.test(first)) {
    if ((STATIC_UTILITY_CLASSES.has(first) || BOXED_PRIMITIVES.has(first)) && calls.length === 0) {
      return getMembers(first).filter((m) => m.isStatic);
    }
    if (STATIC_UTILITY_CLASSES.has(first) || BOXED_PRIMITIVES.has(first)) {
      currentType = first;
      staticOnly = true;
    } else {
      const inferred = inferDeclaredType(fullSource, first);
      if (!inferred) return [];
      if (inferred.isArray) return calls.length === 0 ? ARRAY_MEMBERS : [];
      currentType = inferred.typeName;
      genericArgs = inferred.genericArgs;
    }
  } else {
    return [];
  }

  for (const call of calls) {
    const parenIndex = call.indexOf('(');
    if (parenIndex === -1) return []; // a bare field access mid-chain isn't modeled
    const methodName = call.slice(0, parenIndex).trim();

    const member = getMembers(currentType)
      .filter((m) => m.name === methodName && Boolean(m.isStatic) === staticOnly)
      .find((m) => m.returnType);
    if (!member?.returnType) return [];

    if (member.returnType.kind === 'fixed') {
      const { typeName, genericArgsFrom } = member.returnType;
      const resolvedArgs = genericArgsFrom?.map((idx) => genericArgs?.[idx]);
      currentType = typeName;
      genericArgs = resolvedArgs?.every((a): a is string => Boolean(a)) ? resolvedArgs : undefined;
    } else if (member.returnType.kind === 'generic') {
      const arg = genericArgs?.[member.returnType.paramIndex];
      if (!arg) return [];
      currentType = arg.replace(/<[\s\S]*>/, '').replace(/\[\]/g, '');
      genericArgs = extractGenericArgs(arg);
    }
    // 'self' means currentType (and genericArgs) stay as they are.
    staticOnly = false; // every call after the first resolves an instance, never a static class name
  }

  return getMembers(currentType).filter((m) => Boolean(m.isStatic) === staticOnly);
}
