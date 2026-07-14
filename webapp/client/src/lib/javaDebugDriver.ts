import type { JavaSignature } from './javaSignature';
import { jsLiteralToJavaLiteral } from './javaLiteral';
import { toStrExpr } from './javaDriver';

export interface JavaDebugCase {
  argSources: string[];
}

/**
 * Runtime helper compiled alongside the user's Solution class. Accumulates a step trace
 * (method enter/exit + per-line locals snapshots) in memory and dumps it to stdout as
 * \`__STEP__\`-prefixed lines once the program finishes. Uses a single flat \`|\`-delimited
 * field list per line (not a nested \`;\`/\`=\` sub-protocol) — a variable's stringified value
 * (e.g. a HashMap's own \`{k=v}\` toString) can itself contain \`=\`/\`;\`, and layering a second
 * escaped delimiter on top of the first breaks once the outer split's generic "backslash
 * escapes whatever follows" rule consumes the inner delimiter's escaping before the inner split
 * ever runs. One delimiter, one escaping pass — the same scheme already proven correct for the
 * existing \`__CASE__\` protocol in javaDriver.ts — avoids that entirely.
 */
export const DBG_HELPER_JAVA_SOURCE = `
class __Dbg {
    static final int MAX_STEPS = 5000;
    static final java.util.List<String> __trace = new java.util.ArrayList<>();
    static boolean __truncated = false;
    static int __depth = 0;

    static String esc(String s) {
        if (s == null) return "";
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '\\\\' || c == '|') b.append('\\\\').append(c);
            else if (c == '\\n') b.append("\\\\n");
            else b.append(c);
        }
        return b.toString();
    }

    static String stringify(Object v) {
        if (v == null) return "null";
        if (v instanceof int[]) return java.util.Arrays.toString((int[]) v);
        if (v instanceof long[]) return java.util.Arrays.toString((long[]) v);
        if (v instanceof double[]) return java.util.Arrays.toString((double[]) v);
        if (v instanceof boolean[]) return java.util.Arrays.toString((boolean[]) v);
        if (v instanceof char[]) return java.util.Arrays.toString((char[]) v);
        if (v instanceof Object[]) return java.util.Arrays.deepToString((Object[]) v);
        if (v instanceof String) return "\\"" + v + "\\"";
        if (v instanceof Character) return "'" + v + "'";
        return String.valueOf(v);
    }

    static void onEnter(String method) {
        if (__trace.size() >= MAX_STEPS) { __truncated = true; return; }
        __depth++;
        __trace.add("E|" + __depth + "|" + esc(method));
    }

    static void onExit(String method) {
        if (__trace.size() >= MAX_STEPS) { __truncated = true; return; }
        __trace.add("X|" + __depth + "|" + esc(method));
        if (__depth > 0) __depth--;
    }

    static void onLine(int line, String namesCsv, Object[] values) {
        if (__trace.size() >= MAX_STEPS) { __truncated = true; return; }
        String[] names = namesCsv.isEmpty() ? new String[0] : namesCsv.split(",", -1);
        StringBuilder sb = new StringBuilder();
        sb.append("L|").append(__depth).append("|").append(line);
        for (int i = 0; i < names.length; i++) {
            sb.append("|").append(esc(names[i])).append("|").append(esc(stringify(values[i])));
        }
        __trace.add(sb.toString());
    }

    static void dump() {
        System.out.println("__STEP_META__" + __trace.size() + "|" + __truncated);
        for (String s : __trace) System.out.println("__STEP__" + s);
    }
}
`;

/**
 * Bytecode instrumenter: rewrites a compiled Solution class in place, inserting calls into
 * \`__Dbg\` at every line-number entry (with a snapshot of in-scope locals, read from the
 * LocalVariableTable that \`-g\` makes javac emit) and at every method enter/return. Only the
 * Solution class is touched — calls into JDK/stdlib code are never instrumented, so "step
 * into" naturally only descends into the user's own methods. Uses ASM's tree API with
 * COMPUTE_MAXS only (not COMPUTE_FRAMES): our injected sequences always leave the operand
 * stack exactly as they found it, so the class's original stack-map frames stay valid without
 * needing frame recomputation (which would require classloading ASM doesn't have available in
 * this sandboxed environment anyway).
 */
export const INSTRUMENTER_JAVA_SOURCE = `
class __Instrumenter {
    public static void main(String[] args) throws Exception {
        String path = args[0];
        byte[] bytes = Files.readAllBytes(Paths.get(path));
        ClassReader cr = new ClassReader(bytes);
        ClassNode cn = new ClassNode();
        cr.accept(cn, 0);

        for (Object mo : cn.methods) {
            MethodNode mn = (MethodNode) mo;
            if (mn.name.equals("<init>") || mn.name.equals("<clinit>")) continue;
            if ((mn.access & Opcodes.ACC_ABSTRACT) != 0) continue;
            instrument(mn);
        }

        ClassWriter cw = new ClassWriter(ClassWriter.COMPUTE_MAXS);
        cn.accept(cw);
        Files.write(Paths.get(path), cw.toByteArray());
    }

    static void instrument(MethodNode mn) {
        InsnList insns = mn.instructions;

        InsnList entry = new InsnList();
        entry.add(new LdcInsnNode(mn.name));
        entry.add(new MethodInsnNode(Opcodes.INVOKESTATIC, "__Dbg", "onEnter", "(Ljava/lang/String;)V", false));
        insns.insert(entry);

        AbstractInsnNode insn = insns.getFirst();
        while (insn != null) {
            AbstractInsnNode next = insn.getNext();
            int op = insn.getOpcode();
            if (op == Opcodes.RETURN || op == Opcodes.IRETURN || op == Opcodes.LRETURN
                || op == Opcodes.FRETURN || op == Opcodes.DRETURN || op == Opcodes.ARETURN) {
                InsnList exit = new InsnList();
                exit.add(new LdcInsnNode(mn.name));
                exit.add(new MethodInsnNode(Opcodes.INVOKESTATIC, "__Dbg", "onExit", "(Ljava/lang/String;)V", false));
                insns.insertBefore(insn, exit);
            }
            insn = next;
        }

        for (AbstractInsnNode i2 = insns.getFirst(); i2 != null; i2 = i2.getNext()) {
            if (i2 instanceof LineNumberNode) {
                LineNumberNode lnn = (LineNumberNode) i2;
                insns.insert(i2, buildLineHook(mn, lnn));
            }
        }
    }

    static InsnList buildLineHook(MethodNode mn, LineNumberNode lnn) {
        InsnList list = new InsnList();
        list.add(new LdcInsnNode(lnn.line));

        List<LocalVariableNode> inScope = new ArrayList<>();
        if (mn.localVariables != null) {
            int at = mn.instructions.indexOf(lnn.start);
            for (Object lo : mn.localVariables) {
                LocalVariableNode lv = (LocalVariableNode) lo;
                if (lv.name.equals("this")) continue;
                int start = mn.instructions.indexOf(lv.start);
                int end = mn.instructions.indexOf(lv.end);
                if (start <= at && at < end) inScope.add(lv);
            }
        }

        StringBuilder names = new StringBuilder();
        for (int k = 0; k < inScope.size(); k++) {
            if (k > 0) names.append(",");
            names.append(inScope.get(k).name);
        }
        list.add(new LdcInsnNode(names.toString()));

        list.add(new LdcInsnNode(inScope.size()));
        list.add(new TypeInsnNode(Opcodes.ANEWARRAY, "java/lang/Object"));
        for (int k = 0; k < inScope.size(); k++) {
            LocalVariableNode lv = inScope.get(k);
            list.add(new InsnNode(Opcodes.DUP));
            list.add(new LdcInsnNode(k));
            Type t = Type.getType(lv.desc);
            list.add(new VarInsnNode(t.getOpcode(Opcodes.ILOAD), lv.index));
            box(list, t);
            list.add(new InsnNode(Opcodes.AASTORE));
        }

        list.add(new MethodInsnNode(Opcodes.INVOKESTATIC, "__Dbg", "onLine", "(ILjava/lang/String;[Ljava/lang/Object;)V", false));
        return list;
    }

    static void box(InsnList list, Type t) {
        switch (t.getSort()) {
            case Type.INT:
                list.add(new MethodInsnNode(Opcodes.INVOKESTATIC, "java/lang/Integer", "valueOf", "(I)Ljava/lang/Integer;", false));
                break;
            case Type.LONG:
                list.add(new MethodInsnNode(Opcodes.INVOKESTATIC, "java/lang/Long", "valueOf", "(J)Ljava/lang/Long;", false));
                break;
            case Type.DOUBLE:
                list.add(new MethodInsnNode(Opcodes.INVOKESTATIC, "java/lang/Double", "valueOf", "(D)Ljava/lang/Double;", false));
                break;
            case Type.FLOAT:
                list.add(new MethodInsnNode(Opcodes.INVOKESTATIC, "java/lang/Float", "valueOf", "(F)Ljava/lang/Float;", false));
                break;
            case Type.BOOLEAN:
                list.add(new MethodInsnNode(Opcodes.INVOKESTATIC, "java/lang/Boolean", "valueOf", "(Z)Ljava/lang/Boolean;", false));
                break;
            case Type.CHAR:
                list.add(new MethodInsnNode(Opcodes.INVOKESTATIC, "java/lang/Character", "valueOf", "(C)Ljava/lang/Character;", false));
                break;
            case Type.SHORT:
                list.add(new MethodInsnNode(Opcodes.INVOKESTATIC, "java/lang/Short", "valueOf", "(S)Ljava/lang/Short;", false));
                break;
            case Type.BYTE:
                list.add(new MethodInsnNode(Opcodes.INVOKESTATIC, "java/lang/Byte", "valueOf", "(B)Ljava/lang/Byte;", false));
                break;
            default:
                // objects and arrays are already references — no boxing needed
        }
    }
}
`;

export interface JavaDebugProgram {
  source: string;
  /** Number of lines the compiled file's header adds before the user's own first line — line
   * numbers read back out of the LineNumberTable are in *compiled-file* coordinates, so this
   * has to be subtracted before comparing against breakpoints set on the (unmodified) editor
   * content, or before highlighting a line in the editor. */
  userCodeLineOffset: number;
}

/**
 * Builds the combined Main.java-equivalent source for a debug run: the user's Solution class,
 * \`__Dbg\`, \`__Instrumenter\`, and a Main that runs exactly one test case (debugging is
 * inherently single-case) then always dumps the trace, even if the call throws.
 */
export function buildJavaDebugProgram(
  userCode: string,
  className: string,
  signature: JavaSignature,
  testCase: JavaDebugCase
): JavaDebugProgram {
  const args = testCase.argSources.map((src, j) => jsLiteralToJavaLiteral(src, signature.params[j].type)).join(', ');
  const userCodeNoPublicClass = userCode.replace(/\bpublic\s+(class\s+\w+)/, '$1');

  const header =
    `import java.util.*;\n` +
    `import java.nio.file.*;\n` +
    `import org.objectweb.asm.*;\n` +
    `import org.objectweb.asm.tree.*;\n\n`;
  const userCodeLineOffset = header.split('\n').length - 1;

  const source =
    header +
    `${userCodeNoPublicClass}\n\n` +
    `${DBG_HELPER_JAVA_SOURCE}\n` +
    `${INSTRUMENTER_JAVA_SOURCE}\n` +
    `class Main {\n` +
    `    public static void main(String[] args) throws Exception {\n` +
    `        try {\n` +
    `            ${signature.returnType} __result = new ${className}().${signature.name}(${args});\n` +
    `            System.out.println("__DEBUG_RESULT__" + __Dbg.esc(${toStrExpr(signature.returnType, '__result')}));\n` +
    `            System.out.println("__DEBUG_STATUS__OK");\n` +
    `        } catch (Throwable __e) {\n` +
    `            System.out.println("__DEBUG_STATUS__ERROR|" + __Dbg.esc(String.valueOf(__e.getMessage())));\n` +
    `        } finally {\n` +
    `            __Dbg.dump();\n` +
    `        }\n` +
    `    }\n` +
    `}\n`;

  return { source, userCodeLineOffset };
}
