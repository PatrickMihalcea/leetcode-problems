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

/** Java types this v1 driver knows how to build literals for and compare. */
export const SUPPORTED_JAVA_TYPES = new Set([
  'int', 'long', 'double', 'boolean', 'char', 'String',
  'int[]', 'long[]', 'double[]', 'boolean[]', 'char[]', 'String[]',
  'int[][]', 'long[][]', 'double[][]', 'boolean[][]', 'String[][]',
  'List<Integer>', 'List<Long>', 'List<Double>', 'List<String>', 'List<List<Integer>>',
]);

export function isSupportedJavaType(type: string): boolean {
  return SUPPORTED_JAVA_TYPES.has(type);
}

/** Extracts method name, return type, and typed parameters from a `java` snippet like
 *  `class Solution {\n    public int[] twoSum(int[] nums, int target) {`. */
export function parseJavaSignature(javaSnippet: string): JavaSignature | null {
  const match = javaSnippet.match(/public\s+([\w<>[\],\s]+?)\s+(\w+)\s*\(([^)]*)\)/);
  if (!match) return null;
  const [, returnType, name, rawParams] = match;

  const params: JavaParam[] = [];
  for (const raw of splitTopLevel(rawParams)) {
    if (!raw) continue;
    const idx = raw.lastIndexOf(' ');
    if (idx === -1) return null;
    params.push({ type: raw.slice(0, idx).trim(), name: raw.slice(idx + 1).trim() });
  }

  return { name, returnType: returnType.trim(), params };
}
