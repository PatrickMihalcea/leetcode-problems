// Whether the heuristic Java member-completion provider (javaCompletion.ts) is active. A plain
// module-level flag rather than React state since Monaco's completion provider (registered once,
// at module load, in monacoSetup.ts) needs to read it outside of any component's render cycle.
const STORAGE_KEY = 'javaAutocompleteEnabled';

let enabled = localStorage.getItem(STORAGE_KEY) !== 'false';
const listeners = new Set<() => void>();

export function isJavaAutocompleteEnabled(): boolean {
  return enabled;
}

export function setJavaAutocompleteEnabled(value: boolean): void {
  enabled = value;
  localStorage.setItem(STORAGE_KEY, String(value));
  listeners.forEach((listener) => listener());
}

/** For useSyncExternalStore, so toggling the setting re-renders whatever's showing its state. */
export function subscribeJavaAutocompleteEnabled(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
