// Hand-written member stubs for the Python vocabulary that actually shows up in LeetCode-style
// Python (builtins, collections/heapq/itertools/functools/bisect, math/random). A heuristic
// completion source, not a real type checker — see pythonCompletion.ts for how a variable's type
// is inferred (from a PEP 484 type hint or an obvious literal/constructor assignment) and matched
// up against this table.

export type MemberKind = 'method' | 'field';

/** Same idea as the Java stub table's returnType (see javaTypeStubs.ts for the full rationale):
 * lets a `.` after a call resolve to another type's members, without a real type checker.
 * Python rarely needs 'generic' — dict.get/pop/setdefault are the main case, since (unlike Java's
 * List.get(i)) sequence element access is `[i]` subscript syntax, not a dotted method call. */
export type MemberReturnType =
  | { kind: 'self' }
  | { kind: 'fixed'; typeName: string; genericArgsFrom?: number[] }
  | { kind: 'generic'; paramIndex: number };

export interface TypeMember {
  name: string;
  kind: MemberKind;
  snippet: string;
  detail: string;
  isStatic?: boolean;
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

function fixedReturn(m: TypeMember, typeName: string, genericArgsFrom?: number[]): TypeMember {
  return { ...m, returnType: { kind: 'fixed', typeName, genericArgsFrom } };
}

function genericReturn(m: TypeMember, paramIndex: number): TypeMember {
  return { ...m, returnType: { kind: 'generic', paramIndex } };
}

const DICT: TypeMember[] = [
  genericReturn(method('get', ['key', 'default'], 'get(key, default=None)'), 1),
  genericReturn(method('setdefault', ['key', 'default'], 'setdefault(key, default=None)'), 1),
  genericReturn(method('pop', ['key', 'default'], 'pop(key, default=None)'), 1),
  method('popitem', [], 'popitem() -> (key, value)'),
  method('update', ['other'], 'update(other)'),
  method('keys', [], 'keys() -> dict_keys'),
  method('values', [], 'values() -> dict_values'),
  method('items', [], 'items() -> dict_items'),
  fixedReturn(method('copy', [], 'copy() -> dict'), 'dict', [0, 1]),
  method('clear', [], 'clear()'),
];

const LIST: TypeMember[] = [
  method('append', ['x'], 'append(x)'),
  method('extend', ['iterable'], 'extend(iterable)'),
  method('insert', ['i', 'x'], 'insert(i, x)'),
  method('remove', ['x'], 'remove(x)'),
  genericReturn(method('pop', ['i'], 'pop(i=-1)'), 0),
  method('index', ['x'], 'index(x) -> int'),
  method('count', ['x'], 'count(x) -> int'),
  method('sort', ['key'], 'sort(key=None, reverse=False)'),
  method('reverse', [], 'reverse()'),
  fixedReturn(method('copy', [], 'copy() -> list'), 'list', [0]),
  method('clear', [], 'clear()'),
];

const SET: TypeMember[] = [
  method('add', ['x'], 'add(x)'),
  method('remove', ['x'], 'remove(x)'),
  method('discard', ['x'], 'discard(x)'),
  genericReturn(method('pop', [], 'pop()'), 0),
  fixedReturn(method('union', ['other'], 'union(other) -> set'), 'set', [0]),
  fixedReturn(method('intersection', ['other'], 'intersection(other) -> set'), 'set', [0]),
  fixedReturn(method('difference', ['other'], 'difference(other) -> set'), 'set', [0]),
  fixedReturn(method('symmetric_difference', ['other'], 'symmetric_difference(other) -> set'), 'set', [0]),
  method('update', ['other'], 'update(other)'),
  method('issubset', ['other'], 'issubset(other) -> bool'),
  method('issuperset', ['other'], 'issuperset(other) -> bool'),
  fixedReturn(method('copy', [], 'copy() -> set'), 'set', [0]),
  method('clear', [], 'clear()'),
];

const TUPLE: TypeMember[] = [method('count', ['x'], 'count(x) -> int'), method('index', ['x'], 'index(x) -> int')];

const STR: TypeMember[] = [
  fixedReturn(method('split', ['sep'], 'split(sep=None) -> list[str]'), 'list'),
  fixedReturn(method('rsplit', ['sep'], 'rsplit(sep=None) -> list[str]'), 'list'),
  fixedReturn(method('splitlines', [], 'splitlines() -> list[str]'), 'list'),
  fixedReturn(method('join', ['iterable'], 'join(iterable) -> str'), 'str'),
  fixedReturn(method('strip', ['chars'], 'strip(chars=None) -> str'), 'str'),
  fixedReturn(method('lstrip', ['chars'], 'lstrip(chars=None) -> str'), 'str'),
  fixedReturn(method('rstrip', ['chars'], 'rstrip(chars=None) -> str'), 'str'),
  fixedReturn(method('replace', ['old', 'new'], 'replace(old, new) -> str'), 'str'),
  method('find', ['sub'], 'find(sub) -> int'),
  method('rfind', ['sub'], 'rfind(sub) -> int'),
  method('index', ['sub'], 'index(sub) -> int'),
  fixedReturn(method('upper', [], 'upper() -> str'), 'str'),
  fixedReturn(method('lower', [], 'lower() -> str'), 'str'),
  fixedReturn(method('capitalize', [], 'capitalize() -> str'), 'str'),
  fixedReturn(method('title', [], 'title() -> str'), 'str'),
  method('startswith', ['prefix'], 'startswith(prefix) -> bool'),
  method('endswith', ['suffix'], 'endswith(suffix) -> bool'),
  method('isdigit', [], 'isdigit() -> bool'),
  method('isalpha', [], 'isalpha() -> bool'),
  method('isalnum', [], 'isalnum() -> bool'),
  method('isspace', [], 'isspace() -> bool'),
  method('islower', [], 'islower() -> bool'),
  method('isupper', [], 'isupper() -> bool'),
  method('count', ['sub'], 'count(sub) -> int'),
  fixedReturn(method('format', ['args'], 'format(*args) -> str'), 'str'),
  fixedReturn(method('zfill', ['width'], 'zfill(width) -> str'), 'str'),
  fixedReturn(method('ljust', ['width'], 'ljust(width) -> str'), 'str'),
  fixedReturn(method('rjust', ['width'], 'rjust(width) -> str'), 'str'),
  fixedReturn(method('center', ['width'], 'center(width) -> str'), 'str'),
];

const DEQUE: TypeMember[] = [
  method('append', ['x'], 'append(x)'),
  method('appendleft', ['x'], 'appendleft(x)'),
  genericReturn(method('pop', [], 'pop()'), 0),
  genericReturn(method('popleft', [], 'popleft()'), 0),
  method('extend', ['iterable'], 'extend(iterable)'),
  method('extendleft', ['iterable'], 'extendleft(iterable)'),
  method('rotate', ['n'], 'rotate(n=1)'),
  method('count', ['x'], 'count(x) -> int'),
  method('clear', [], 'clear()'),
];

const COUNTER_EXTRA: TypeMember[] = [
  fixedReturn(method('most_common', ['n'], 'most_common(n=None) -> list'), 'list'),
  method('update', ['iterable'], 'update(iterable)'),
  method('subtract', ['iterable'], 'subtract(iterable)'),
];

const ORDERED_DICT_EXTRA: TypeMember[] = [
  method('move_to_end', ['key', 'last'], 'move_to_end(key, last=True)'),
  fixedReturn(method('popitem', ['last'], 'popitem(last=True) -> (key, value)'), 'tuple'),
];

const MATH: TypeMember[] = [
  staticMethod('sqrt', ['x'], 'sqrt(x) -> float'),
  staticMethod('isqrt', ['x'], 'isqrt(x) -> int'),
  staticMethod('pow', ['x', 'y'], 'pow(x, y) -> float'),
  staticMethod('floor', ['x'], 'floor(x) -> int'),
  staticMethod('ceil', ['x'], 'ceil(x) -> int'),
  staticMethod('fabs', ['x'], 'fabs(x) -> float'),
  staticMethod('trunc', ['x'], 'trunc(x) -> int'),
  staticMethod('gcd', ['a', 'b'], 'gcd(a, b) -> int'),
  staticMethod('factorial', ['x'], 'factorial(x) -> int'),
  staticMethod('log', ['x', 'base'], 'log(x, base=e) -> float'),
  staticMethod('log2', ['x'], 'log2(x) -> float'),
  staticMethod('log10', ['x'], 'log10(x) -> float'),
  staticMethod('comb', ['n', 'k'], 'comb(n, k) -> int'),
  staticMethod('perm', ['n', 'k'], 'perm(n, k=None) -> int'),
  staticField('inf', 'float'),
  staticField('pi', 'float'),
  staticField('e', 'float'),
];

const RANDOM: TypeMember[] = [
  staticMethod('randint', ['a', 'b'], 'randint(a, b) -> int'),
  staticMethod('random', [], 'random() -> float'),
  staticMethod('choice', ['seq'], 'choice(seq)'),
  staticMethod('shuffle', ['seq'], 'shuffle(seq)'),
  staticMethod('sample', ['population', 'k'], 'sample(population, k) -> list'),
  staticMethod('uniform', ['a', 'b'], 'uniform(a, b) -> float'),
  staticMethod('seed', ['a'], 'seed(a=None)'),
];

const ITERTOOLS: TypeMember[] = [
  staticMethod('permutations', ['iterable', 'r'], 'permutations(iterable, r=None)'),
  staticMethod('combinations', ['iterable', 'r'], 'combinations(iterable, r)'),
  staticMethod('combinations_with_replacement', ['iterable', 'r'], 'combinations_with_replacement(iterable, r)'),
  staticMethod('product', ['iterables', 'repeat'], 'product(*iterables, repeat=1)'),
  staticMethod('accumulate', ['iterable', 'func'], 'accumulate(iterable, func=None)'),
  staticMethod('chain', ['iterables'], 'chain(*iterables)'),
  staticMethod('groupby', ['iterable', 'key'], 'groupby(iterable, key=None)'),
  staticMethod('count', ['start', 'step'], 'count(start=0, step=1)'),
  staticMethod('islice', ['iterable', 'stop'], 'islice(iterable, stop)'),
];

const FUNCTOOLS: TypeMember[] = [
  staticMethod('reduce', ['function', 'iterable'], 'reduce(function, iterable)'),
  staticMethod('lru_cache', ['maxsize'], 'lru_cache(maxsize=128)'),
  staticMethod('cache', ['func'], 'cache(func)'),
  staticMethod('cmp_to_key', ['func'], 'cmp_to_key(func)'),
  staticMethod('partial', ['func', 'args'], 'partial(func, *args)'),
];

const HEAPQ: TypeMember[] = [
  staticMethod('heappush', ['heap', 'item'], 'heappush(heap, item)'),
  staticMethod('heappop', ['heap'], 'heappop(heap)'),
  staticMethod('heapify', ['x'], 'heapify(x)'),
  staticMethod('heappushpop', ['heap', 'item'], 'heappushpop(heap, item)'),
  staticMethod('heapreplace', ['heap', 'item'], 'heapreplace(heap, item)'),
  staticMethod('nlargest', ['n', 'iterable'], 'nlargest(n, iterable)'),
  staticMethod('nsmallest', ['n', 'iterable'], 'nsmallest(n, iterable)'),
  staticMethod('merge', ['iterables'], 'merge(*iterables)'),
];

const BISECT: TypeMember[] = [
  staticMethod('bisect_left', ['a', 'x'], 'bisect_left(a, x) -> int'),
  staticMethod('bisect_right', ['a', 'x'], 'bisect_right(a, x) -> int'),
  staticMethod('bisect', ['a', 'x'], 'bisect(a, x) -> int'),
  staticMethod('insort', ['a', 'x'], 'insort(a, x)'),
  staticMethod('insort_left', ['a', 'x'], 'insort_left(a, x)'),
  staticMethod('insort_right', ['a', 'x'], 'insort_right(a, x)'),
];

/** Not really "static methods" — `collections.Counter(...)`/`collections.deque(...)` are
 * constructor calls — but for autocomplete purposes, offering them when you type `collections.`
 * is exactly the same shape as Java's static-utility classes, so they're modeled the same way. */
const COLLECTIONS: TypeMember[] = [
  staticMethod('Counter', ['iterable'], 'Counter(iterable=None)'),
  staticMethod('deque', ['iterable'], 'deque(iterable=())'),
  staticMethod('defaultdict', ['default_factory'], 'defaultdict(default_factory=None)'),
  staticMethod('OrderedDict', [], 'OrderedDict()'),
  staticMethod('namedtuple', ['typename', 'field_names'], 'namedtuple(typename, field_names)'),
];

/** Own members plus (for concrete classes) an `extends` parent whose members get merged in. */
const TYPE_TABLE: Record<string, { own: TypeMember[]; extends?: string }> = {
  dict: { own: DICT },
  list: { own: LIST },
  set: { own: SET },
  frozenset: { own: [], extends: 'set' },
  tuple: { own: TUPLE },
  str: { own: STR },
  deque: { own: DEQUE },
  Counter: { own: COUNTER_EXTRA, extends: 'dict' },
  defaultdict: { own: [], extends: 'dict' },
  OrderedDict: { own: ORDERED_DICT_EXTRA, extends: 'dict' },
  math: { own: MATH },
  random: { own: RANDOM },
  itertools: { own: ITERTOOLS },
  functools: { own: FUNCTOOLS },
  heapq: { own: HEAPQ },
  bisect: { own: BISECT },
  collections: { own: COLLECTIONS },
};

/** Module names that are only ever used as a static receiver (`math.sqrt(...)`,
 * `collections.Counter(...)`), never instantiated as a variable's own type. */
export const STATIC_UTILITY_MODULES = new Set(['math', 'random', 'itertools', 'functools', 'heapq', 'bisect', 'collections']);

export function getMembers(typeName: string): TypeMember[] {
  const entry = TYPE_TABLE[typeName];
  if (!entry) return [];
  const parentMembers = entry.extends ? getMembers(entry.extends) : [];
  return [...parentMembers, ...entry.own];
}
