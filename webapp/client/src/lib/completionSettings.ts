// Whether the heuristic member-completion providers (javaCompletion.ts, pythonCompletion.ts) are
// active. A plain module-level flag rather than React state since Monaco's completion providers
// (registered once, at module load, in monacoSetup.ts) need to read it outside of any component's
// render cycle. One flag covers both languages — it's the same feature/toggle from the user's
// point of view, just applied to whichever language they're editing.
const STORAGE_KEY = 'memberAutocompleteEnabled';

let enabled = localStorage.getItem(STORAGE_KEY) !== 'false';
const listeners = new Set<() => void>();

export function isMemberAutocompleteEnabled(): boolean {
  return enabled;
}

export function setMemberAutocompleteEnabled(value: boolean): void {
  enabled = value;
  localStorage.setItem(STORAGE_KEY, String(value));
  listeners.forEach((listener) => listener());
}

/** For useSyncExternalStore, so toggling the setting re-renders whatever's showing its state. */
export function subscribeMemberAutocompleteEnabled(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
