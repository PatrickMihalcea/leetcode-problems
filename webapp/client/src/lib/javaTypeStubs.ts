// Hand-written member stubs for the JDK vocabulary that actually shows up in LeetCode-style Java
// (collections, String/StringBuilder, boxed primitives, Arrays/Collections/Math). This is a
// heuristic completion source, not a real type checker — see javaCompletion.ts for how a
// variable's declared type is matched up against this table.

export type MemberKind = 'method' | 'field';

/** What a method returns, for resolving another `.` after it — and, transitively, as many more
 * after that as keep resolving (`sb.append(x).append(y).reverse().toString().length()` all just
 * walk this chain one step at a time; there's no depth limit, only "did we tag this method"):
 *  - 'self': returns the same type as the receiver (StringBuilder's fluent methods)
 *  - 'fixed': always returns a specific, receiver-independent type (`sb.toString()` -> String).
 *    `genericArgsFrom` is for the rare case where the fixed type is still generic over the
 *    receiver's own type args (`Map<K,V>.keySet(): Set<K>` is genericArgsFrom: [0]) — without it,
 *    chaining past a 'fixed' return loses track of what its own type parameter is.
 *  - 'generic': returns one of the receiver's own declared generic type arguments
 *    (`List<E>.get(): E` is paramIndex 0; `Map<K,V>.get(): V` is paramIndex 1) */
export type MemberReturnType =
  | { kind: 'self' }
  | { kind: 'fixed'; typeName: string; genericArgsFrom?: number[] }
  | { kind: 'generic'; paramIndex: number };

export interface TypeMember {
  name: string;
  kind: MemberKind;
  /** Snippet inserted after the member name is accepted, e.g. '(${1:key}, ${2:value})' for a
   * method or '' for a field — Monaco's Tab-stop syntax, same as a real IDE's parameter templates. */
  snippet: string;
  /** Short signature shown in the suggestion list, e.g. 'V put(K key, V value)'. */
  detail: string;
  /** Static members (Integer.parseInt, Arrays.sort, ...) vs instance members (someInt.toString()). */
  isStatic?: boolean;
  /** Omitted for methods whose return type isn't tracked (e.g. primitives) — chaining another
   * `.` after one of those falls back to Monaco's default suggestions rather than guessing. */
  returnType?: MemberReturnType;
}

function method(name: string, params: string[], detail: string): TypeMember {
  const snippet = params.length === 0 ? '()' : `(${params.map((p, i) => `\${${i + 1}:${p}}`).join(', ')})`;
  return { name, kind: 'method', snippet, detail };
}

function staticMethod(name: string, params: string[], detail: string): TypeMember {
  return { ...method(name, params, detail), isStatic: true };
}

function field(name: string, detail: string): TypeMember {
  return { name, kind: 'field', snippet: '', detail };
}

function staticField(name: string, detail: string): TypeMember {
  return { ...field(name, detail), isStatic: true };
}

function selfReturning(m: TypeMember): TypeMember {
  return { ...m, returnType: { kind: 'self' } };
}

function fixedReturn(m: TypeMember, typeName: string, genericArgsFrom?: number[]): TypeMember {
  return { ...m, returnType: { kind: 'fixed', typeName, genericArgsFrom } };
}

function genericReturn(m: TypeMember, paramIndex: number): TypeMember {
  return { ...m, returnType: { kind: 'generic', paramIndex } };
}

const ITERABLE: TypeMember[] = [
  fixedReturn(method('iterator', [], 'Iterator<E> iterator()'), 'Iterator', [0]),
  method('forEach', ['action'], 'void forEach(Consumer<? super E> action)'),
];

const COLLECTION: TypeMember[] = [
  ...ITERABLE,
  method('add', ['e'], 'boolean add(E e)'),
  method('remove', ['o'], 'boolean remove(Object o)'),
  method('contains', ['o'], 'boolean contains(Object o)'),
  method('size', [], 'int size()'),
  method('isEmpty', [], 'boolean isEmpty()'),
  method('clear', [], 'void clear()'),
  method('addAll', ['c'], 'boolean addAll(Collection<? extends E> c)'),
  method('removeAll', ['c'], 'boolean removeAll(Collection<?> c)'),
  method('retainAll', ['c'], 'boolean retainAll(Collection<?> c)'),
  method('toArray', [], 'Object[] toArray()'),
  method('stream', [], 'Stream<E> stream()'),
];

const LIST: TypeMember[] = [
  ...COLLECTION,
  genericReturn(method('get', ['index'], 'E get(int index)'), 0),
  method('set', ['index', 'element'], 'E set(int index, E element)'),
  { ...method('add', ['index', 'element'], 'void add(int index, E element)'), name: 'add' },
  { ...method('remove', ['index'], 'E remove(int index)'), name: 'remove' },
  method('indexOf', ['o'], 'int indexOf(Object o)'),
  method('lastIndexOf', ['o'], 'int lastIndexOf(Object o)'),
  fixedReturn(method('subList', ['fromIndex', 'toIndex'], 'List<E> subList(int fromIndex, int toIndex)'), 'List', [0]),
  method('sort', ['comparator'], 'void sort(Comparator<? super E> c)'),
];

const DEQUE: TypeMember[] = [
  ...COLLECTION,
  method('addFirst', ['e'], 'void addFirst(E e)'),
  method('addLast', ['e'], 'void addLast(E e)'),
  genericReturn(method('removeFirst', [], 'E removeFirst()'), 0),
  genericReturn(method('removeLast', [], 'E removeLast()'), 0),
  genericReturn(method('getFirst', [], 'E getFirst()'), 0),
  genericReturn(method('getLast', [], 'E getLast()'), 0),
  genericReturn(method('peekFirst', [], 'E peekFirst()'), 0),
  genericReturn(method('peekLast', [], 'E peekLast()'), 0),
  method('offerFirst', ['e'], 'boolean offerFirst(E e)'),
  method('offerLast', ['e'], 'boolean offerLast(E e)'),
  genericReturn(method('pollFirst', [], 'E pollFirst()'), 0),
  genericReturn(method('pollLast', [], 'E pollLast()'), 0),
  method('push', ['e'], 'void push(E e)'),
  genericReturn(method('pop', [], 'E pop()'), 0),
  genericReturn(method('peek', [], 'E peek()'), 0),
  genericReturn(method('poll', [], 'E poll()'), 0),
  method('offer', ['e'], 'boolean offer(E e)'),
];

const QUEUE: TypeMember[] = [
  ...COLLECTION,
  method('offer', ['e'], 'boolean offer(E e)'),
  genericReturn(method('poll', [], 'E poll()'), 0),
  genericReturn(method('peek', [], 'E peek()'), 0),
  genericReturn(method('element', [], 'E element()'), 0),
];

const MAP: TypeMember[] = [
  method('put', ['key', 'value'], 'V put(K key, V value)'),
  genericReturn(method('get', ['key'], 'V get(Object key)'), 1),
  genericReturn(method('getOrDefault', ['key', 'defaultValue'], 'V getOrDefault(Object key, V defaultValue)'), 1),
  method('containsKey', ['key'], 'boolean containsKey(Object key)'),
  method('containsValue', ['value'], 'boolean containsValue(Object value)'),
  genericReturn(method('remove', ['key'], 'V remove(Object key)'), 1),
  method('size', [], 'int size()'),
  method('isEmpty', [], 'boolean isEmpty()'),
  method('clear', [], 'void clear()'),
  fixedReturn(method('keySet', [], 'Set<K> keySet()'), 'Set', [0]),
  fixedReturn(method('values', [], 'Collection<V> values()'), 'Collection', [1]),
  fixedReturn(method('entrySet', [], 'Set<Map.Entry<K,V>> entrySet()'), 'Set'),
  method('forEach', ['action'], 'void forEach(BiConsumer<? super K,? super V> action)'),
  genericReturn(method('putIfAbsent', ['key', 'value'], 'V putIfAbsent(K key, V value)'), 1),
  genericReturn(method('merge', ['key', 'value', 'remappingFunction'], 'V merge(K key, V value, BiFunction<...> f)'), 1),
  genericReturn(method('computeIfAbsent', ['key', 'mappingFunction'], 'V computeIfAbsent(K key, Function<...> f)'), 1),
  genericReturn(method('compute', ['key', 'remappingFunction'], 'V compute(K key, BiFunction<...> f)'), 1),
];

const SORTED_SET_EXTRA: TypeMember[] = [
  method('first', [], 'E first()'),
  method('last', [], 'E last()'),
  method('floor', ['e'], 'E floor(E e)'),
  method('ceiling', ['e'], 'E ceiling(E e)'),
  method('higher', ['e'], 'E higher(E e)'),
  method('lower', ['e'], 'E lower(E e)'),
  method('pollFirst', [], 'E pollFirst()'),
  method('pollLast', [], 'E pollLast()'),
];

const SORTED_MAP_EXTRA: TypeMember[] = [
  method('firstKey', [], 'K firstKey()'),
  method('lastKey', [], 'K lastKey()'),
  method('floorKey', ['key'], 'K floorKey(K key)'),
  method('ceilingKey', ['key'], 'K ceilingKey(K key)'),
  method('higherKey', ['key'], 'K higherKey(K key)'),
  method('lowerKey', ['key'], 'K lowerKey(K key)'),
  method('pollFirstEntry', [], 'Map.Entry<K,V> pollFirstEntry()'),
  method('pollLastEntry', [], 'Map.Entry<K,V> pollLastEntry()'),
];

const STACK: TypeMember[] = [
  ...COLLECTION,
  genericReturn(method('push', ['item'], 'E push(E item)'), 0),
  genericReturn(method('pop', [], 'E pop()'), 0),
  genericReturn(method('peek', [], 'E peek()'), 0),
  method('empty', [], 'boolean empty()'),
  method('search', ['o'], 'int search(Object o)'),
];

const ITERATOR: TypeMember[] = [
  method('hasNext', [], 'boolean hasNext()'),
  genericReturn(method('next', [], 'E next()'), 0),
  method('remove', [], 'void remove()'),
];

const STRING: TypeMember[] = [
  method('length', [], 'int length()'),
  method('charAt', ['index'], 'char charAt(int index)'),
  fixedReturn({ ...method('substring', ['beginIndex'], 'String substring(int beginIndex)'), name: 'substring' }, 'String'),
  method('indexOf', ['str'], 'int indexOf(String str)'),
  method('lastIndexOf', ['str'], 'int lastIndexOf(String str)'),
  method('contains', ['s'], 'boolean contains(CharSequence s)'),
  method('equals', ['other'], 'boolean equals(Object other)'),
  method('equalsIgnoreCase', ['other'], 'boolean equalsIgnoreCase(String other)'),
  method('compareTo', ['other'], 'int compareTo(String other)'),
  method('toCharArray', [], 'char[] toCharArray()'),
  method('split', ['regex'], 'String[] split(String regex)'),
  fixedReturn(method('trim', [], 'String trim()'), 'String'),
  fixedReturn(method('strip', [], 'String strip()'), 'String'),
  fixedReturn(method('toLowerCase', [], 'String toLowerCase()'), 'String'),
  fixedReturn(method('toUpperCase', [], 'String toUpperCase()'), 'String'),
  fixedReturn(method('replace', ['target', 'replacement'], 'String replace(CharSequence target, CharSequence replacement)'), 'String'),
  method('startsWith', ['prefix'], 'boolean startsWith(String prefix)'),
  method('endsWith', ['suffix'], 'boolean endsWith(String suffix)'),
  method('isEmpty', [], 'boolean isEmpty()'),
  method('isBlank', [], 'boolean isBlank()'),
  method('chars', [], 'IntStream chars()'),
  method('matches', ['regex'], 'boolean matches(String regex)'),
  fixedReturn(method('concat', ['str'], 'String concat(String str)'), 'String'),
  fixedReturn(method('toString', [], 'String toString()'), 'String'),
  fixedReturn(method('repeat', ['count'], 'String repeat(int count)'), 'String'),
  fixedReturn(staticMethod('format', ['format', 'args'], 'static String format(String format, Object... args)'), 'String'),
  fixedReturn(staticMethod('valueOf', ['obj'], 'static String valueOf(Object obj)'), 'String'),
  fixedReturn(staticMethod('join', ['delimiter', 'elements'], 'static String join(CharSequence delimiter, CharSequence... elements)'), 'String'),
];

const STRING_BUILDER: TypeMember[] = [
  selfReturning(method('append', ['x'], 'StringBuilder append(...)')),
  selfReturning(method('insert', ['offset', 'x'], 'StringBuilder insert(int offset, ...)')),
  selfReturning(method('reverse', [], 'StringBuilder reverse()')),
  selfReturning(method('deleteCharAt', ['index'], 'StringBuilder deleteCharAt(int index)')),
  selfReturning(method('delete', ['start', 'end'], 'StringBuilder delete(int start, int end)')),
  method('length', [], 'int length()'),
  method('charAt', ['index'], 'char charAt(int index)'),
  method('setCharAt', ['index', 'ch'], 'void setCharAt(int index, char ch)'),
  fixedReturn(method('toString', [], 'String toString()'), 'String'),
  method('indexOf', ['str'], 'int indexOf(String str)'),
  selfReturning(method('replace', ['start', 'end', 'str'], 'StringBuilder replace(int start, int end, String str)')),
  method('capacity', [], 'int capacity()'),
  method('setLength', ['newLength'], 'void setLength(int newLength)'),
];

function boxedPrimitive(
  instance: TypeMember[],
  parse: { name: string; params: string[]; detail: string },
  extraStatics: TypeMember[] = []
): TypeMember[] {
  return [
    ...instance,
    staticMethod(parse.name, parse.params, parse.detail),
    selfReturning(staticMethod('valueOf', ['s'], 'static T valueOf(...)')),
    staticMethod('compare', ['a', 'b'], 'static int compare(T a, T b)'),
    fixedReturn(staticMethod('toString', ['value'], 'static String toString(T value)'), 'String'),
    ...extraStatics,
  ];
}

const INTEGER: TypeMember[] = boxedPrimitive(
  [
    method('intValue', [], 'int intValue()'),
    fixedReturn(method('toString', [], 'String toString()'), 'String'),
    method('equals', ['other'], 'boolean equals(Object other)'),
  ],
  { name: 'parseInt', params: ['s'], detail: 'static int parseInt(String s)' },
  [
    staticField('MAX_VALUE', 'static final int MAX_VALUE'),
    staticField('MIN_VALUE', 'static final int MIN_VALUE'),
    staticMethod('max', ['a', 'b'], 'static int max(int a, int b)'),
    staticMethod('min', ['a', 'b'], 'static int min(int a, int b)'),
    staticMethod('sum', ['a', 'b'], 'static int sum(int a, int b)'),
    staticMethod('bitCount', ['i'], 'static int bitCount(int i)'),
    staticMethod('toBinaryString', ['i'], 'static String toBinaryString(int i)'),
    staticMethod('toHexString', ['i'], 'static String toHexString(int i)'),
  ]
);

const LONG: TypeMember[] = boxedPrimitive(
  [method('longValue', [], 'long longValue()'), fixedReturn(method('toString', [], 'String toString()'), 'String')],
  { name: 'parseLong', params: ['s'], detail: 'static long parseLong(String s)' },
  [
    staticField('MAX_VALUE', 'static final long MAX_VALUE'),
    staticField('MIN_VALUE', 'static final long MIN_VALUE'),
    staticMethod('max', ['a', 'b'], 'static long max(long a, long b)'),
    staticMethod('min', ['a', 'b'], 'static long min(long a, long b)'),
  ]
);

const DOUBLE: TypeMember[] = boxedPrimitive(
  [method('doubleValue', [], 'double doubleValue()'), fixedReturn(method('toString', [], 'String toString()'), 'String')],
  { name: 'parseDouble', params: ['s'], detail: 'static double parseDouble(String s)' },
  [
    staticField('MAX_VALUE', 'static final double MAX_VALUE'),
    staticField('MIN_VALUE', 'static final double MIN_VALUE'),
    staticMethod('isNaN', ['v'], 'static boolean isNaN(double v)'),
  ]
);

const CHARACTER: TypeMember[] = boxedPrimitive(
  [method('charValue', [], 'char charValue()')],
  { name: 'isDigit', params: ['c'], detail: 'static boolean isDigit(char c)' },
  [
    staticMethod('isLetter', ['c'], 'static boolean isLetter(char c)'),
    staticMethod('isLetterOrDigit', ['c'], 'static boolean isLetterOrDigit(char c)'),
    staticMethod('isUpperCase', ['c'], 'static boolean isUpperCase(char c)'),
    staticMethod('isLowerCase', ['c'], 'static boolean isLowerCase(char c)'),
    staticMethod('isWhitespace', ['c'], 'static boolean isWhitespace(char c)'),
    staticMethod('toUpperCase', ['c'], 'static char toUpperCase(char c)'),
    staticMethod('toLowerCase', ['c'], 'static char toLowerCase(char c)'),
    staticMethod('getNumericValue', ['c'], 'static int getNumericValue(char c)'),
  ]
);

const BOOLEAN: TypeMember[] = boxedPrimitive(
  [method('booleanValue', [], 'boolean booleanValue()')],
  { name: 'parseBoolean', params: ['s'], detail: 'static boolean parseBoolean(String s)' },
  [staticField('TRUE', 'static final Boolean TRUE'), staticField('FALSE', 'static final Boolean FALSE')]
);

const ARRAYS: TypeMember[] = [
  staticMethod('sort', ['a'], 'static void sort(int[] a)'),
  staticMethod('binarySearch', ['a', 'key'], 'static int binarySearch(int[] a, int key)'),
  staticMethod('fill', ['a', 'val'], 'static void fill(int[] a, int val)'),
  staticMethod('copyOf', ['original', 'newLength'], 'static int[] copyOf(int[] original, int newLength)'),
  staticMethod('copyOfRange', ['original', 'from', 'to'], 'static int[] copyOfRange(int[] original, int from, int to)'),
  staticMethod('equals', ['a', 'b'], 'static boolean equals(int[] a, int[] b)'),
  staticMethod('deepEquals', ['a', 'b'], 'static boolean deepEquals(Object[] a, Object[] b)'),
  fixedReturn(staticMethod('asList', ['a'], 'static List<T> asList(T... a)'), 'List'),
  staticMethod('toString', ['a'], 'static String toString(int[] a)'),
  staticMethod('deepToString', ['a'], 'static String deepToString(Object[] a)'),
  staticMethod('stream', ['a'], 'static IntStream stream(int[] a)'),
];

const COLLECTIONS: TypeMember[] = [
  staticMethod('sort', ['list'], 'static void sort(List<T> list)'),
  staticMethod('reverse', ['list'], 'static void reverse(List<?> list)'),
  staticMethod('max', ['coll'], 'static T max(Collection<? extends T> coll)'),
  staticMethod('min', ['coll'], 'static T min(Collection<? extends T> coll)'),
  staticMethod('shuffle', ['list'], 'static void shuffle(List<?> list)'),
  fixedReturn(staticMethod('unmodifiableList', ['list'], 'static List<T> unmodifiableList(List<? extends T> list)'), 'List'),
  fixedReturn(staticMethod('emptyList', [], 'static List<T> emptyList()'), 'List'),
  fixedReturn(staticMethod('singletonList', ['o'], 'static List<T> singletonList(T o)'), 'List'),
  staticMethod('frequency', ['c', 'o'], 'static int frequency(Collection<?> c, Object o)'),
  staticMethod('swap', ['list', 'i', 'j'], 'static void swap(List<?> list, int i, int j)'),
  fixedReturn(staticMethod('nCopies', ['n', 'o'], 'static List<T> nCopies(int n, T o)'), 'List'),
];

const MATH: TypeMember[] = [
  staticMethod('abs', ['a'], 'static int abs(int a)'),
  staticMethod('max', ['a', 'b'], 'static int max(int a, int b)'),
  staticMethod('min', ['a', 'b'], 'static int min(int a, int b)'),
  staticMethod('pow', ['base', 'exp'], 'static double pow(double base, double exp)'),
  staticMethod('sqrt', ['a'], 'static double sqrt(double a)'),
  staticMethod('ceil', ['a'], 'static double ceil(double a)'),
  staticMethod('floor', ['a'], 'static double floor(double a)'),
  staticMethod('round', ['a'], 'static long round(double a)'),
  staticMethod('random', [], 'static double random()'),
  staticMethod('log', ['a'], 'static double log(double a)'),
  staticMethod('log10', ['a'], 'static double log10(double a)'),
  staticMethod('exp', ['a'], 'static double exp(double a)'),
  staticField('PI', 'static final double PI'),
  staticField('E', 'static final double E'),
];

export const ARRAY_MEMBERS: TypeMember[] = [field('length', 'int length')];

/** Own members plus (for concrete classes) an `extends` parent whose members get merged in. */
const TYPE_TABLE: Record<string, { own: TypeMember[]; extends?: string }> = {
  List: { own: LIST },
  ArrayList: { own: [], extends: 'List' },
  LinkedList: { own: DEQUE, extends: 'List' },
  Map: { own: MAP },
  HashMap: { own: [], extends: 'Map' },
  LinkedHashMap: { own: [], extends: 'Map' },
  TreeMap: { own: SORTED_MAP_EXTRA, extends: 'Map' },
  Collection: { own: COLLECTION },
  Set: { own: [], extends: 'Collection' },
  HashSet: { own: [], extends: 'Set' },
  LinkedHashSet: { own: [], extends: 'Set' },
  TreeSet: { own: SORTED_SET_EXTRA, extends: 'Set' },
  Deque: { own: DEQUE },
  ArrayDeque: { own: [], extends: 'Deque' },
  Queue: { own: QUEUE },
  PriorityQueue: { own: [], extends: 'Queue' },
  Stack: { own: STACK },
  Iterator: { own: ITERATOR },
  String: { own: STRING },
  StringBuilder: { own: STRING_BUILDER },
  StringBuffer: { own: [], extends: 'StringBuilder' },
  Integer: { own: INTEGER },
  Long: { own: LONG },
  Double: { own: DOUBLE },
  Character: { own: CHARACTER },
  Boolean: { own: BOOLEAN },
  Arrays: { own: ARRAYS },
  Collections: { own: COLLECTIONS },
  Math: { own: MATH },
};

/** Class names that are only ever used as a static receiver (`Arrays.sort(...)`), never
 * instantiated as a variable's type — used to short-circuit straight to static members. */
export const STATIC_UTILITY_CLASSES = new Set(['Arrays', 'Collections', 'Math']);

export function getMembers(typeName: string): TypeMember[] {
  const entry = TYPE_TABLE[typeName];
  if (!entry) return [];
  const parentMembers = entry.extends ? getMembers(entry.extends) : [];
  return [...parentMembers, ...entry.own];
}
