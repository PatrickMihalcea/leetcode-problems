import { splitTopLevel } from './exampleParser';

function stripOuterBrackets(src: string): string {
  const trimmed = src.trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    throw new Error(`Expected an array literal like [..], got: ${trimmed}`);
  }
  return trimmed.slice(1, -1);
}

/** Converts a scalar JS-literal source (number/string/bool) into a Java literal of the given scalar type. */
function scalarLiteral(src: string, type: 'int' | 'long' | 'double' | 'boolean' | 'char' | 'String' | 'Integer' | 'Long' | 'Double'): string {
  const trimmed = src.trim();
  if (type === 'char') {
    const m = /^"(.)"$/.exec(trimmed) || /^'(.)'$/.exec(trimmed);
    if (!m) throw new Error(`Expected a single-character string for char, got: ${trimmed}`);
    return `'${m[1]}'`;
  }
  if ((type === 'long' || type === 'Long') && /^-?\d+$/.test(trimmed)) {
    return `${trimmed}L`;
  }
  // int/double/boolean/String/Integer/Double literals are already valid Java syntax as-is.
  return trimmed;
}

/** Recursively builds a Java array initializer (`new int[]{...}` / nested `{...}`) from a JS array literal. */
function arrayLiteral(src: string, baseType: string, dims: number, isOuter: boolean): string {
  const elements = splitTopLevel(stripOuterBrackets(src));
  const inner =
    dims === 1
      ? elements.map((el) => scalarLiteral(el, baseType as 'int' | 'long' | 'double' | 'boolean' | 'char' | 'String')).join(', ')
      : elements.map((el) => arrayLiteral(el, baseType, dims - 1, false)).join(', ');
  return isOuter ? `new ${baseType}[]${'[]'.repeat(dims - 1)}{${inner}}` : `{${inner}}`;
}

/** Recursively builds a Java `List<...>` literal (`new ArrayList<>(Arrays.asList(...))`) from a JS array literal. */
function listLiteral(src: string, innerType: string): string {
  const elements = splitTopLevel(stripOuterBrackets(src));
  const nestedMatch = /^List<(.+)>$/.exec(innerType);
  const rendered = nestedMatch
    ? elements.map((el) => listLiteral(el, nestedMatch[1]))
    : elements.map((el) => scalarLiteral(el, innerType as 'Integer' | 'Long' | 'Double' | 'String'));
  return `new ArrayList<>(Arrays.asList(${rendered.join(', ')}))`;
}

/**
 * Converts a JS-literal source expression (as pulled from example text) into a valid Java
 * expression for the given declared Java type. Throws if `type` isn't one of the types
 * `isSupportedJavaType` recognizes.
 */
export function jsLiteralToJavaLiteral(src: string, type: string): string {
  const listMatch = /^List<(.+)>$/.exec(type);
  if (listMatch) return listLiteral(src, listMatch[1]);

  const arrayMatch = /^(\w+)((?:\[\])+)$/.exec(type);
  if (arrayMatch) {
    const dims = arrayMatch[2].length / 2;
    return arrayLiteral(src, arrayMatch[1], dims, true);
  }

  return scalarLiteral(src, type as 'int' | 'long' | 'double' | 'boolean' | 'char' | 'String');
}
