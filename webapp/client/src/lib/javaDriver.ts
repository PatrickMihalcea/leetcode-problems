import type { JavaSignature } from './javaSignature';
import { isSupportedJavaType } from './javaSignature';
import { jsLiteralToJavaLiteral } from './javaLiteral';

export interface JavaCase {
  exampleNum: number;
  argSources: string[];
  outputSource: string;
}

export function isJavaSignatureSupported(signature: JavaSignature): boolean {
  return isSupportedJavaType(signature.returnType) && signature.params.every((p) => isSupportedJavaType(p.type));
}

function arrayDims(type: string): { baseType: string; dims: number } | null {
  const m = /^(\w+)((?:\[\])+)$/.exec(type);
  return m ? { baseType: m[1], dims: m[2].length / 2 } : null;
}

function equalityExpr(type: string, a: string, b: string): string {
  const arr = arrayDims(type);
  if (arr) return arr.dims === 1 ? `Arrays.equals(${a}, ${b})` : `Arrays.deepEquals((Object[]) ${a}, (Object[]) ${b})`;
  if (type === 'String' || type.startsWith('List<')) return `${a}.equals(${b})`;
  return `${a} == ${b}`;
}

export function toStrExpr(type: string, v: string): string {
  const arr = arrayDims(type);
  if (arr) return arr.dims === 1 ? `Arrays.toString(${v})` : `Arrays.deepToString(${v})`;
  if (type === 'String') return `("\\"" + ${v} + "\\"")`;
  if (type === 'char') return `("'" + ${v} + "'")`;
  if (type.startsWith('List<')) return `${v}.toString()`;
  return `String.valueOf(${v})`;
}

/** Escapes a Java string expression's *value* for embedding in our own `|`-delimited console
 * output line (escapes backslash, the delimiter, and newlines — not full JSON). */
function escapeForLine(v: string): string {
  return `${v}.replace("\\\\", "\\\\\\\\").replace("|", "\\\\|").replace("\\n", "\\\\n")`;
}

/**
 * Builds the full Main.java source: the user's Solution class plus a generated Main that runs
 * every case and prints one `__CASE__<num>|<PASS|FAIL|ERROR>|<actual>|<expected>|<error>` line
 * per case to stdout (read back out of CheerpJ's `#console` DOM element by the caller).
 */
export function buildJavaProgram(userCode: string, className: string, signature: JavaSignature, cases: JavaCase[]): string {
  const { name, returnType } = signature;

  const caseBlocks = cases.map((c, i) => {
    const args = c.argSources.map((src, j) => jsLiteralToJavaLiteral(src, signature.params[j].type)).join(', ');
    const expectedLiteral = jsLiteralToJavaLiteral(c.outputSource, returnType);
    const actualVar = `__actual${i}`;
    const expectedVar = `__expected${i}`;
    const actualStr = escapeForLine(toStrExpr(returnType, actualVar));
    const expectedStr = escapeForLine(toStrExpr(returnType, expectedVar));

    return (
      `        try {\n` +
      `            ${returnType} ${actualVar} = new ${className}().${name}(${args});\n` +
      `            ${returnType} ${expectedVar} = (${expectedLiteral});\n` +
      `            boolean __pass${i} = ${equalityExpr(returnType, actualVar, expectedVar)};\n` +
      `            System.out.println("__CASE__${c.exampleNum}|" + (__pass${i} ? "PASS" : "FAIL") + "|" + ${actualStr} + "|" + ${expectedStr} + "|");\n` +
      `        } catch (Throwable __e) {\n` +
      `            System.out.println("__CASE__${c.exampleNum}|ERROR|||" + String.valueOf(__e.getMessage()).replace("\\n", " "));\n` +
      `        }\n`
    );
  });

  // Our source file is always named Main.java, so at most zero top-level classes in this
  // compilation unit may be `public` (javac requires the public class's name to match the
  // filename) — strip it from the user's class declaration; same-file visibility is unaffected.
  const userCodeNoPublicClass = userCode.replace(/\bpublic\s+(class\s+\w+)/, '$1');

  return (
    `import java.util.*;\n\n` +
    `${userCodeNoPublicClass}\n\n` +
    `class Main {\n` +
    `    public static void main(String[] args) throws Exception {\n` +
    `${caseBlocks.join('')}` +
    `    }\n` +
    `}\n`
  );
}
