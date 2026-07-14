import { supabase, supabaseConfigured } from './supabaseClient';

export interface GithubStatus {
  connected: boolean;
  login: string | null;
  repoFullName: string | null;
}

export interface GithubRepo {
  name: string;
  fullName: string;
}

export type CommitResult =
  | { committed: true; path: string; htmlUrl?: string }
  | { skipped: true; reason: 'not_connected' | 'no_repo' };

async function call<T>(action: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke('github', { body: { action, ...args } });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data as T;
}

export function githubOAuthUrl(): string | null {
  const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID as string | undefined;
  if (!clientId || !supabaseConfigured) return null;

  const state = crypto.randomUUID();
  sessionStorage.setItem('githubOAuthState', state);
  const redirectUri = `${window.location.origin}/github/callback`;
  const params = new URLSearchParams({ client_id: clientId, scope: 'repo', redirect_uri: redirectUri, state });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export function consumeGithubOAuthState(): string | null {
  const state = sessionStorage.getItem('githubOAuthState');
  sessionStorage.removeItem('githubOAuthState');
  return state;
}

export function getGithubStatus(): Promise<GithubStatus> {
  return call<GithubStatus>('status');
}

export function connectGithub(code: string): Promise<{ connected: true; login: string }> {
  return call('connect', { code });
}

export async function listGithubRepos(): Promise<GithubRepo[]> {
  const { repos } = await call<{ repos: GithubRepo[] }>('list-repos');
  return repos;
}

export function createGithubRepo(name: string): Promise<{ repoFullName: string }> {
  return call('create-repo', { name });
}

export function selectGithubRepo(repoFullName: string): Promise<{ repoFullName: string }> {
  return call('select-repo', { repoFullName });
}

export async function commitSolutionToGithub(
  frontendId: string,
  title: string,
  language: string,
  code: string
): Promise<CommitResult> {
  return call<CommitResult>('commit', { frontendId, title, language, code });
}
