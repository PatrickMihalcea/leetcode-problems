import { splitTopLevel } from './exampleParser';

export interface JavaParam {
  name: string;
  type: string;
}

export interface JavaSignature {
  name: string;
  returnType: string;
  params: JavaParam[];
}

/** Scalar Java types this v1 driver knows how to build literals for and compare. */
const SUPPORTED_SCALAR_TYPES = new Set(['int', 'long', 'double', 'boolean', 'char', 'String']);

/** Boxed types allowed at the bottom of a `List<...>` nest (arrays use unboxed scalars instead). */
const SUPPORTED_LIST_ELEMENT_TYPES = new Set(['Integer', 'Long', 'Double', 'String']);

function isSupportedListElementType(type: string): boolean {
  if (SUPPORTED_LIST_ELEMENT_TYPES.has(type)) return true;
  const nestedMatch = /^List<(.+)>$/.exec(type);
  return nestedMatch ? isSupportedListElementType(nestedMatch[1]) : false;
}

/** A type is supported if it's a scalar, an array (any depth) of a scalar, or a `List<...>`
 *  (nested any depth) bottoming out in a boxed scalar — matching what `javaDriver`/`javaLiteral`
 *  can actually build literals for and compare, regardless of nesting depth. */
export function isSupportedJavaType(type: string): boolean {
  if (SUPPORTED_SCALAR_TYPES.has(type)) return true;

  const arrayMatch = /^(\w+)((?:\[\])+)$/.exec(type);
  if (arrayMatch) return SUPPORTED_SCALAR_TYPES.has(arrayMatch[1]);

  const listMatch = /^List<(.+)>$/.exec(type);
  if (listMatch) return isSupportedListElementType(listMatch[1]);

  return false;
}

/** Extracts method name, return type, and typed parameters from a `java` snippet like
 *  `class Solution {\n    public int[] twoSum(int[] nums, int target) {`. */
export function parseJavaSignature(javaSnippet: string): JavaSignature | null {
  const match = javaSnippet.match(/public\s+([\w<>[\],\s]+?)\s+(\w+)\s*\(([^)]*)\)/);
  if (!match) return null;
  const [, rawReturnType, name, rawParams] = match;

  // group 1 may include leading modifiers (static/final/abstract/...) since they're made of the
  // same word characters as a type — the actual return type is always the last token, since
  // modifiers never contain whitespace themselves but can precede one that does.
  const returnType = rawReturnType.trim().split(/\s+/).pop()!;

  const params: JavaParam[] = [];
  for (const raw of splitTopLevel(rawParams)) {
    if (!raw) continue;
    const idx = raw.lastIndexOf(' ');
    if (idx === -1) return null;
    params.push({ type: raw.slice(0, idx).trim(), name: raw.slice(idx + 1).trim() });
  }

  return { name, returnType, params };
}

/** Extracts the top-level class name from a `java` snippet (e.g. `Solution` from
 *  `class Solution {` or `public class Foo {`) — used instead of assuming the class is always
 *  literally named `Solution`, so renaming it doesn't break auto-run. */
export function parseJavaClassName(javaSnippet: string): string | null {
  const match = javaSnippet.match(/\bclass\s+(\w+)/);
  return match ? match[1] : null;
}
