// Supabase Edge Function: all GitHub OAuth + commit actions for LeetLocal's optional
// "sync saved solutions to a GitHub repo" feature. Routed by `action` in the POST body
// so the whole feature is one deployable unit. The GitHub access token never leaves
// this function -- it's stored in `github_connections` (no client-readable RLS policy)
// and only ever used here, via the service-role client.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';

const GITHUB_CLIENT_ID = Deno.env.get('GITHUB_CLIENT_ID');
const GITHUB_CLIENT_SECRET = Deno.env.get('GITHUB_CLIENT_SECRET');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

const EXT_BY_LANGUAGE: Record<string, string> = {
  java: 'java',
  python3: 'py',
  python: 'py',
  cpp: 'cpp',
  c: 'c',
  csharp: 'cs',
  javascript: 'js',
  typescript: 'ts',
  php: 'php',
  swift: 'swift',
  kotlin: 'kt',
  dart: 'dart',
  golang: 'go',
  ruby: 'rb',
  scala: 'scala',
  rust: 'rs',
  racket: 'rkt',
  erlang: 'erl',
  elixir: 'ex',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function sanitizeTitle(title: string): string {
  return title.trim().replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'Problem';
}

function buildFilePath(frontendId: string, title: string, language: string, date: string): string {
  const safeTitle = sanitizeTitle(title);
  const ext = EXT_BY_LANGUAGE[language] ?? 'txt';
  const dirName = `${frontendId}_${safeTitle}`;
  return `${dirName}/${language}/${dirName}_${date}.${ext}`;
}

/** Runs `items` through `fn` with at most `limit` in flight at once. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function githubApi(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'leetlocal-github-sync',
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });

  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer /, '');
    if (!jwt) return json({ error: 'Missing Authorization header' }, 401);

    const authClient = createClient(SUPABASE_URL, ANON_KEY);
    const { data: userData, error: userErr } = await authClient.auth.getUser(jwt);
    if (userErr || !userData.user) return json({ error: 'Not authenticated' }, 401);
    const userId = userData.user.id;

    const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
    const body = await req.json().catch(() => ({}));
    const action = body.action as string | undefined;

    if (action === 'status') {
      const { data } = await db
        .from('github_connections')
        .select('github_login, repo_full_name')
        .eq('user_id', userId)
        .maybeSingle();
      return json({
        connected: !!data,
        login: data?.github_login ?? null,
        repoFullName: data?.repo_full_name ?? null,
      });
    }

    if (action === 'connect') {
      const { code } = body;
      if (!code) return json({ error: 'Missing code' }, 400);

      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code }),
      });
      const tokenJson = await tokenRes.json();
      if (!tokenJson.access_token) {
        return json({ error: tokenJson.error_description ?? 'GitHub token exchange failed' }, 400);
      }
      const accessToken = tokenJson.access_token as string;

      const userRes = await githubApi(accessToken, '/user');
      if (!userRes.ok) return json({ error: 'Failed to fetch GitHub user' }, 400);
      const ghUser = await userRes.json();

      const { error: upsertErr } = await db
        .from('github_connections')
        .upsert({ user_id: userId, access_token: accessToken, github_login: ghUser.login }, { onConflict: 'user_id' });
      if (upsertErr) return json({ error: upsertErr.message }, 500);

      return json({ connected: true, login: ghUser.login });
    }

    // Every remaining action needs an existing connection.
    const { data: conn, error: connErr } = await db
      .from('github_connections')
      .select('access_token, github_login, repo_full_name')
      .eq('user_id', userId)
      .maybeSingle();
    if (connErr) return json({ error: connErr.message }, 500);

    if (action === 'list-repos') {
      if (!conn) return json({ error: 'Not connected' }, 400);
      const res = await githubApi(conn.access_token, '/user/repos?per_page=100&sort=updated&affiliation=owner');
      if (!res.ok) return json({ error: 'Failed to list repos' }, 502);
      const repos = await res.json();
      return json({ repos: repos.map((r: { name: string; full_name: string }) => ({ name: r.name, fullName: r.full_name })) });
    }

    if (action === 'create-repo') {
      if (!conn) return json({ error: 'Not connected' }, 400);
      const { name } = body;
      if (!name) return json({ error: 'Missing repo name' }, 400);
      const res = await githubApi(conn.access_token, '/user/repos', {
        method: 'POST',
        body: JSON.stringify({ name, private: true, auto_init: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return json({ error: err.message ?? 'Failed to create repo' }, 400);
      }
      const repo = await res.json();
      const { error: updateErr } = await db.from('github_connections').update({ repo_full_name: repo.full_name }).eq('user_id', userId);
      if (updateErr) return json({ error: updateErr.message }, 500);
      return json({ repoFullName: repo.full_name });
    }

    if (action === 'select-repo') {
      if (!conn) return json({ error: 'Not connected' }, 400);
      const { repoFullName } = body;
      if (!repoFullName) return json({ error: 'Missing repoFullName' }, 400);
      const { error: updateErr } = await db.from('github_connections').update({ repo_full_name: repoFullName }).eq('user_id', userId);
      if (updateErr) return json({ error: updateErr.message }, 500);
      return json({ repoFullName });
    }

    if (action === 'commit') {
      if (!conn || !conn.repo_full_name) {
        return json({ skipped: true, reason: !conn ? 'not_connected' : 'no_repo' });
      }
      const { frontendId, title, language, code } = body;
      if (!frontendId || !title || !language || typeof code !== 'string') {
        return json({ error: 'Missing frontendId/title/language/code' }, 400);
      }

      const date = new Date().toISOString().slice(0, 10);
      const path = buildFilePath(frontendId, title, language, date).split('/').map(encodeURIComponent).join('/');

      const existingRes = await githubApi(conn.access_token, `/repos/${conn.repo_full_name}/contents/${path}`);
      const existingSha = existingRes.ok ? (await existingRes.json()).sha : undefined;

      const putRes = await githubApi(conn.access_token, `/repos/${conn.repo_full_name}/contents/${path}`, {
        method: 'PUT',
        body: JSON.stringify({
          message: `Solve ${frontendId}. ${title} (${language})`,
          content: encodeBase64(new TextEncoder().encode(code)),
          ...(existingSha ? { sha: existingSha } : {}),
        }),
      });
      if (!putRes.ok) {
        const err = await putRes.json().catch(() => ({}));
        return json({ error: err.message ?? 'Failed to commit' }, 502);
      }
      const result = await putRes.json();
      return json({ committed: true, path, htmlUrl: result.content?.html_url });
    }

    if (action === 'sync-all') {
      if (!conn || !conn.repo_full_name) {
        return json({ skipped: true, reason: !conn ? 'not_connected' : 'no_repo' });
      }
      const items = body.items as
        | Array<{ frontendId: string; title: string; language: string; code: string }>
        | undefined;
      if (!Array.isArray(items) || items.length === 0) {
        return json({ committed: false, reason: 'no_solutions' });
      }

      const repoRes = await githubApi(conn.access_token, `/repos/${conn.repo_full_name}`);
      if (!repoRes.ok) return json({ error: 'Failed to load repo info' }, 502);
      const repoInfo = await repoRes.json();
      const branch = repoInfo.default_branch || 'main';

      const date = new Date().toISOString().slice(0, 10);
      const paths = items.map((item) => buildFilePath(item.frontendId, item.title, item.language, date));

      const blobShas = await mapWithConcurrency(items, 6, async (item) => {
        const blobRes = await githubApi(conn.access_token, `/repos/${conn.repo_full_name}/git/blobs`, {
          method: 'POST',
          body: JSON.stringify({ content: encodeBase64(new TextEncoder().encode(item.code)), encoding: 'base64' }),
        });
        if (!blobRes.ok) throw new Error('Failed to create a blob for one of the solutions');
        return (await blobRes.json()).sha as string;
      });

      const treeEntries = paths.map((path, i) => ({ path, mode: '100644', type: 'blob', sha: blobShas[i] }));

      const refRes = await githubApi(conn.access_token, `/repos/${conn.repo_full_name}/git/ref/heads/${branch}`);
      const baseCommitSha = refRes.ok ? (await refRes.json()).object.sha : null;
      const baseTreeSha = baseCommitSha
        ? (await (await githubApi(conn.access_token, `/repos/${conn.repo_full_name}/git/commits/${baseCommitSha}`)).json()).tree.sha
        : undefined;

      const treeRes = await githubApi(conn.access_token, `/repos/${conn.repo_full_name}/git/trees`, {
        method: 'POST',
        body: JSON.stringify({ tree: treeEntries, ...(baseTreeSha ? { base_tree: baseTreeSha } : {}) }),
      });
      if (!treeRes.ok) return json({ error: 'Failed to create tree' }, 502);
      const newTreeSha = (await treeRes.json()).sha;

      const commitRes = await githubApi(conn.access_token, `/repos/${conn.repo_full_name}/git/commits`, {
        method: 'POST',
        body: JSON.stringify({
          message: `Backfill ${items.length} saved solution${items.length === 1 ? '' : 's'} from LeetLocal`,
          tree: newTreeSha,
          ...(baseCommitSha ? { parents: [baseCommitSha] } : {}),
        }),
      });
      if (!commitRes.ok) return json({ error: 'Failed to create commit' }, 502);
      const newCommitSha = (await commitRes.json()).sha;

      const updateRefRes = await githubApi(
        conn.access_token,
        baseCommitSha
          ? `/repos/${conn.repo_full_name}/git/refs/heads/${branch}`
          : `/repos/${conn.repo_full_name}/git/refs`,
        {
          method: baseCommitSha ? 'PATCH' : 'POST',
          body: JSON.stringify(
            baseCommitSha ? { sha: newCommitSha } : { ref: `refs/heads/${branch}`, sha: newCommitSha }
          ),
        }
      );
      if (!updateRefRes.ok) return json({ error: 'Failed to update branch ref' }, 502);

      return json({
        committed: true,
        fileCount: items.length,
        htmlUrl: `https://github.com/${conn.repo_full_name}/commit/${newCommitSha}`,
      });
    }

    return json({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});
