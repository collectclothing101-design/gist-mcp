// src/gistClient.js
//
// GitHub REST API client for Gists with comprehensive error handling
// Docs: https://docs.github.com/en/rest/gists/gists
// Type: ES module (Node.js >=18)

const GITHUB_API = "https://api.github.com";
const USER_AGENT = "gist-mcp/1.0 (+https://modelcontextprotocol.io)";

// ============================================================================
// Custom Error Classes
// ============================================================================

export class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class RateLimitError extends Error {
  constructor(message, remaining, resetTime) {
    super(message);
    this.name = "RateLimitError";
    this.remaining = remaining;
    this.resetTime = resetTime;
  }
}

export class AuthenticationError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthenticationError";
  }
}

// ============================================================================
// Request Utilities
// ============================================================================

function authHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": USER_AGENT,
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

async function githubFetch(path, options = {}) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: authHeaders(),
    ...options,
  });

  if (res.status === 401) {
    throw new AuthenticationError(
      "Invalid or expired GitHub token. Set GITHUB_TOKEN environment variable."
    );
  }

  if (res.status === 403) {
    const remaining = res.headers.get("x-ratelimit-remaining");
    const reset = res.headers.get("x-ratelimit-reset");
    const resetDate = reset ? new Date(Number(reset) * 1000).toISOString() : "?";
    throw new RateLimitError(
      `GitHub API rate limited (remaining=${remaining ?? "0"}, resets=${resetDate}). Set GITHUB_TOKEN to raise limits.`,
      remaining,
      resetDate
    );
  }

  if (res.status === 404) {
    throw new NotFoundError(`Not found: ${path}`);
  }

  if (res.status === 429) {
    const retryAfter = res.headers.get("retry-after");
    throw new RateLimitError(
      `GitHub API rate limit exceeded. Retry after ${retryAfter ?? "60"} seconds.`,
      "0",
      retryAfter
    );
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `GitHub API error ${res.status} for ${path}: ${body.slice(0, 256)}`
    );
  }

  return res.json();
}

// ============================================================================
// Gist Reference Parsing
// ============================================================================

/**
 * Parse gist reference in multiple formats
 * Accepts:
 *   - bare ID:        "aa5a315d61ae9438b18d"
 *   - URL:            "https://gist.github.com/owner/aa5a315d61ae9438b18d"
 *   - owner/id:       "owner/aa5a315d61ae9438b18d"
 *   - with revision:  "aa5a315d61ae9438b18d/v123abc"
 * Returns: { gistId, owner|null, sha|null }
 */
export function parseGistRef(input) {
  if (!input || typeof input !== "string") {
    throw new Error("Gist reference required (ID, URL, or owner/id)");
  }

  let s = input.trim();

  // URL form
  if (s.startsWith("http://") || s.startsWith("https://")) {
    try {
      const u = new URL(s);
      if (!/gist\.github\.com$/i.test(u.hostname)) {
        throw new Error(`Invalid domain (expected gist.github.com): ${s}`);
      }

      const parts = u.pathname.split("/").filter(Boolean);
      // Formats: /gistId, /owner/gistId, /owner/gistId/shaOrFile
      if (parts.length === 1) {
        return { gistId: parts[0], owner: null, sha: null };
      }
      if (parts.length >= 2) {
        return { gistId: parts[1], owner: parts[0], sha: parts[2] || null };
      }
      throw new Error(`Could not parse URL: ${s}`);
    } catch (e) {
      if (e instanceof TypeError) {
        throw new Error(`Invalid URL format: ${s}`);
      }
      throw e;
    }
  }

  // owner/gistId or owner/gistId/sha format
  if (s.includes("/")) {
    const parts = s.split("/").filter(Boolean);
    if (parts.length === 2) {
      return { gistId: parts[1], owner: parts[0], sha: null };
    }
    if (parts.length === 3) {
      return { gistId: parts[1], owner: parts[0], sha: parts[2] };
    }
    if (parts.length === 1) {
      return { gistId: parts[0], owner: null, sha: null };
    }
    throw new Error(`Invalid gist reference format: ${s}`);
  }

  // bare ID (40 hex chars typical)
  if (s.match(/^[a-f0-9]+$/i)) {
    return { gistId: s, owner: null, sha: null };
  }

  throw new Error(
    `Invalid gist ID (expected hex string): ${s}`
  );
}

// ============================================================================
// Core API Methods
// ============================================================================

/**
 * Fetch complete gist metadata including file manifests
 * Large files (>1MB) are truncated and must use fetchFileContent
 */
export async function fetchGist(gistId, sha = null) {
  if (!gistId || typeof gistId !== "string") {
    throw new Error("Gist ID required");
  }

  const path = sha ? `/gists/${encodeURIComponent(gistId)}/${encodeURIComponent(sha)}` : `/gists/${encodeURIComponent(gistId)}`;
  const data = await githubFetch(path);

  const files = {};
  for (const [name, meta] of Object.entries(data.files || {})) {
    files[name] = {
      filename: meta.filename,
      language: meta.language || null,
      type: meta.type,
      size: meta.size,
      truncated: Boolean(meta.truncated),
      raw_url: meta.raw_url,
      content: meta.content ?? null,
    };
  }

  return {
    id: data.id,
    description: data.description || "",
    public: Boolean(data.public),
    owner: data.owner?.login ?? null,
    html_url: data.html_url,
    created_at: data.created_at,
    updated_at: data.updated_at,
    comments: data.comments,
    file_count: Object.keys(files).length,
    files,
  };
}

/**
 * Fetch raw file content
 * Automatically fetches from raw_url if file is truncated or inlined content unavailable
 */
export async function fetchFileContent(file) {
  if (!file || !file.raw_url) {
    throw new Error("Invalid file object");
  }

  // Use inlined content if available and not truncated
  if (file.content !== null && !file.truncated) {
    return file.content;
  }

  const res = await fetch(file.raw_url, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!res.ok) {
    throw new Error(
      `Failed to fetch ${file.filename}: ${res.status} ${res.statusText}`
    );
  }

  return res.text();
}

/**
 * List public gists for a user
 * Paginated: default 3 pages × 100 per page = 300 gists max
 */
export async function listUserGists(username, maxPages = 3) {
  if (!username || typeof username !== "string") {
    throw new Error("Username required");
  }

  if (maxPages < 1 || maxPages > 10) {
    throw new Error("maxPages must be between 1 and 10");
  }

  const results = [];

  for (let page = 1; page <= maxPages; page++) {
    const batch = await githubFetch(
      `/users/${encodeURIComponent(username)}/gists?per_page=100&page=${page}`
    );

    if (!Array.isArray(batch) || batch.length === 0) {
      break;
    }

    results.push(
      ...batch.map((g) => ({
        id: g.id,
        description: g.description || "",
        html_url: g.html_url,
        files: Object.keys(g.files || {}),
        file_count: Object.keys(g.files || {}).length,
        updated_at: g.updated_at,
        created_at: g.created_at,
      }))
    );

    if (batch.length < 100) {
      break;
    }
  }

  return results;
}

/**
 * Advanced: Fetch gist commits/revisions
 */
export async function fetchGistCommits(gistId) {
  if (!gistId || typeof gistId !== "string") {
    throw new Error("Gist ID required");
  }

  return await githubFetch(`/gists/${encodeURIComponent(gistId)}/commits`);
}
