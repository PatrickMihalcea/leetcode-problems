// Heuristic Python member completion — the same idea as javaCompletion.ts, adapted for Python's
// dynamic typing: since there's no `Type name = ...` declaration to read a variable's type off of,
// a variable's type is inferred from (in priority order) a PEP 484 type hint (`nums: List[int]`,
// pervasive in this app's Python starter code) or an obvious literal/constructor assignment
// (`seen = {}`, `dq = deque()`). Falls back to Monaco's default suggestions (returns []) whenever
// neither signal is present, or a chained call's return type isn't tagged in pythonTypeStubs.ts.
import { STATIC_UTILITY_MODULES, getMembers, type TypeMember } from './pythonTypeStubs';
import { extractChainExpression, splitTopLevelDots } from './chainParsing';

const TYPE_HINT_ALIASES: Record<string, string> = {
  List: 'list',
  Dict: 'dict',
  Set: 'set',
  Tuple: 'tuple',
  FrozenSet: 'frozenset',
  Deque: 'deque',
};

/** Strips a module prefix (`typing.List` -> `List`, `collections.deque` -> `deque`), resolves the
 * `typing` aliases to their runtime type, and confirms it's one we actually have stubs for —
 * returns null for anything unrecognized (a custom class like `ListNode`, or `int`/`float`/`bool`,
 * which don't have enough of a chainable method surface in LeetCode code to be worth stubbing). */
function normalizeTypeName(rawName: string): string | null {
  const cleaned = rawName.trim().split('.').pop()!;
  const aliased = TYPE_HINT_ALIASES[cleaned] ?? cleaned;
  return getMembers(aliased).length > 0 ? aliased : null;
}

/** Splits `int, List[int]` into `['int', 'List[int]']` — tracks `[...]` nesting so a nested
 * generic's own comma doesn't split early. */
function splitTopLevelBrackets(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '[') depth++;
    else if (c === ']') depth--;
    else if (c === ',' && depth === 0) {
      parts.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  const last = text.slice(start).trim();
  if (last) parts.push(last);
  return parts;
}

export interface InferredType {
  typeName: string;
  genericArgs?: string[];
}

function parseTypeHint(hint: string): InferredType | null {
  let text = hint.trim();
  const optionalMatch = /^Optional\[([\s\S]*)\]$/.exec(text);
  if (optionalMatch) text = optionalMatch[1].trim();

  const bracketMatch = /^([A-Za-z_][\w.]*)\[([\s\S]*)\]$/.exec(text);
  if (bracketMatch) {
    const typeName = normalizeTypeName(bracketMatch[1]);
    return typeName ? { typeName, genericArgs: splitTopLevelBrackets(bracketMatch[2]) } : null;
  }
  const typeName = normalizeTypeName(text);
  return typeName ? { typeName } : null;
}

/** Finds the first `identifierPattern: TYPE` in the source (a function parameter's or a variable's
 * PEP 484 annotation) and captures TYPE up to the next top-level `,`/`=`/newline/closing paren. A
 * full-text scan for the first occurrence (rather than real scope tracking) is fine here — these
 * are small, single-class solutions where a name's annotation only appears once. */
function captureAnnotationType(source: string, identifierPattern: string): string | null {
  const marker = new RegExp(`\\b${identifierPattern}\\s*:\\s*`);
  const match = marker.exec(source);
  if (!match) return null;

  const start = match.index + match[0].length;
  let i = start;
  let depth = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === '[' || c === '(') depth++;
    else if (c === ']' || c === ')') {
      if (depth === 0) break;
      depth--;
    } else if (depth === 0 && (c === ',' || c === '=' || c === '\n')) break;
    i++;
  }
  const captured = source.slice(start, i).trim();
  return captured || null;
}

function hasTopLevelColon(text: string): boolean {
  let depth = 0;
  for (const c of text) {
    if (c === '{' || c === '[' || c === '(') depth++;
    else if (c === '}' || c === ']' || c === ')') depth--;
    else if (c === ':' && depth === 0) return true;
  }
  return false;
}

/** `{}` (or `{...}` with a top-level `:`) is a dict literal; `{...}` with no colon is a set
 * literal — Python's one genuinely ambiguous piece of literal syntax. */
function parseBraceLiteral(rhs: string): InferredType | null {
  let depth = 0;
  let i = 0;
  for (; i < rhs.length; i++) {
    if (rhs[i] === '{') depth++;
    else if (rhs[i] === '}') {
      depth--;
      if (depth === 0) {
        i++;
        break;
      }
    }
  }
  const inner = rhs.slice(1, i - 1);
  return { typeName: inner.trim() === '' || hasTopLevelColon(inner) ? 'dict' : 'set' };
}

function parseLiteralOrConstructor(rhs: string): InferredType | null {
  if (rhs.startsWith('[')) return { typeName: 'list' };
  if (rhs.startsWith('"') || rhs.startsWith("'")) return { typeName: 'str' };
  if (rhs.startsWith('{')) return parseBraceLiteral(rhs);
  if (rhs.startsWith('(')) return { typeName: 'tuple' };

  const ctorMatch = /^([A-Za-z_][\w.]*)\s*\(/.exec(rhs);
  if (!ctorMatch) return null;
  const typeName = normalizeTypeName(ctorMatch[1]);
  return typeName ? { typeName } : null;
}

/** Finds the first `identifierPattern = RHS` (not `==`) and captures RHS to end of line — multi-
 * line literals aren't handled, but LeetCode-style initializers are virtually always one line. */
function captureAssignmentRhs(source: string, identifierPattern: string): string | null {
  const re = new RegExp(`\\b${identifierPattern}\\s*=\\s*`, 'g');
  let match: RegExpExecArray | null;
  while ((match = re.exec(source))) {
    const afterMatch = match.index + match[0].length;
    if (source[afterMatch] === '=') continue; // it was `==`, not an assignment
    const newlineIndex = source.indexOf('\n', afterMatch);
    const end = newlineIndex === -1 ? source.length : newlineIndex;
    return source.slice(afterMatch, end).trim();
  }
  return null;
}

function inferPythonType(source: string, identifierPattern: string): InferredType | null {
  const hint = captureAnnotationType(source, identifierPattern);
  const fromHint = hint ? parseTypeHint(hint) : null;
  if (fromHint) return fromHint;

  const rhs = captureAssignmentRhs(source, identifierPattern);
  return rhs ? parseLiteralOrConstructor(rhs) : null;
}

/** Full pipeline, mirroring javaCompletion.ts's getCompletions: resolves a bare receiver (`d.`), a
 * `self.attr.` instance attribute, a bare constructor call (`Counter(arr).`), or a chain of calls
 * (`d.get(k).upper().`) to the member list to suggest. */
export function getCompletions(fullSource: string, lineTextBeforeCursor: string): TypeMember[] {
  const expr = extractChainExpression(lineTextBeforeCursor);
  if (!expr) return [];
  let segments = splitTopLevelDots(expr);
  if (!segments[0]) return [];

  let currentType: string;
  let genericArgs: string[] | undefined;
  let staticOnly = false;

  if (segments[0] === 'self' && segments.length >= 2 && !segments[1].includes('(') && /^[A-Za-z_]\w*$/.test(segments[1])) {
    const inferred = inferPythonType(fullSource, `self\\.${segments[1]}`);
    if (!inferred) return [];
    currentType = inferred.typeName;
    genericArgs = inferred.genericArgs;
    segments = segments.slice(2);
  } else {
    const [first, ...rest] = segments;
    const ctorMatch = /^([A-Za-z_][\w.]*)\s*\(/.exec(first);
    if (ctorMatch) {
      const typeName = normalizeTypeName(ctorMatch[1]);
      if (!typeName) return [];
      currentType = typeName;
    } else if (/^[A-Za-z_]\w*$/.test(first)) {
      if (STATIC_UTILITY_MODULES.has(first)) {
        if (rest.length === 0) return getMembers(first).filter((m) => m.isStatic);
        currentType = first;
        staticOnly = true;
      } else {
        const inferred = inferPythonType(fullSource, first);
        if (!inferred) return [];
        currentType = inferred.typeName;
        genericArgs = inferred.genericArgs;
      }
    } else {
      return [];
    }
    segments = rest;
  }

  for (const call of segments) {
    const parenIndex = call.indexOf('(');
    if (parenIndex === -1) return []; // bare attribute access mid-chain isn't modeled
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
      const parsed = arg ? parseTypeHint(arg) : null;
      if (!parsed) return [];
      currentType = parsed.typeName;
      genericArgs = parsed.genericArgs;
    }
    // 'self' means currentType (and genericArgs) stay as they are.
    staticOnly = false;
  }

  return getMembers(currentType).filter((m) => Boolean(m.isStatic) === staticOnly);
}
