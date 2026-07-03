# gist-mcp: GitHub Gists → MCP Server

Convert any public GitHub Gist into an AI-ready MCP (Model Context Protocol) server with instant tool access to gist files, metadata, revision history, and user gist collections.

## Overview

**gist-mcp** bridges GitHub Gists and the Model Context Protocol, enabling Claude and other MCP-capable AI clients to:

- Fetch gist metadata and file manifests
- Read complete file contents (handles large files via GitHub raw URLs)
- List all public gists for any user
- Search files within gists by name/pattern
- Access gist revision history and commits
- Batch-process multiple gists with efficient pagination

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    MCP Server (stdio)                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │              Tool Handlers (server.js)               │   │
│  │  - fetch_gist        → Metadata + file manifest      │   │
│  │  - fetch_file_content → Raw file content             │   │
│  │  - list_user_gists   → User's public gists           │   │
│  │  - search_gist_files → Filename pattern matching     │   │
│  │  - get_gist_history  → Commit log + revisions        │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │          GitHub REST API Client (gistClient.js)      │   │
│  │  - parseGistRef()     → Parse ID/URL/owner formats   │   │
│  │  - fetchGist()        → GET /gists/{id}              │   │
│  │  - fetchFileContent() → GET raw file URL             │   │
│  │  - listUserGists()    → GET /users/{u}/gists         │   │
│  │  - fetchGistCommits() → GET /gists/{id}/commits      │   │
│  │  - Error classes      → NotFoundError, RateLimitErr  │   │
│  └──────────────────────────────────────────────────────┘   │
│                           ↓                                   │
└─────────────────────────────────────────────────────────────┘
                          │
                          ↓
              GitHub API (api.github.com)
         ┌────────────────────────────────┐
         │  - Gist metadata (public only) │
         │  - Raw file URLs               │
         │  - User gist listings          │
         │  - Revision history            │
         └────────────────────────────────┘
```

### Data Flow

1. **Tool Request** (JSON-RPC via stdio)
   - Client sends: `{ "method": "tools/call", "params": { "name": "fetch_gist", "arguments": {...} } }`

2. **Argument Validation** (Zod schemas)
   - Schemas: `FetchGistSchema`, `FetchFileContentSchema`, etc.
   - Type-safe parsing with detailed error messages

3. **Reference Parsing** (gistClient.js)
   - Accepts: Bare ID, GitHub URL, owner/id path, with optional SHA
   - Returns: Normalized `{ gistId, owner, sha }`

4. **GitHub API Call** (REST)
   - Includes: GITHUB_TOKEN auth (if set), rate limit headers, proper User-Agent
   - Error handling: 401 (auth), 403/429 (rate limit), 404 (not found), 5xx (server error)

5. **Response Assembly** (JSON)
   - Metadata returned as JSON for tool calls
   - File content returned as formatted text blocks
   - All responses include rich context (language, size, timestamps, etc.)

## Installation

### Prerequisites

- Node.js >=18.0.0
- npm or yarn

### Setup

```bash
# Clone or navigate to repository
cd gist-mcp

# Install dependencies
npm install

# (Optional) Set GitHub token for higher rate limits
export GITHUB_TOKEN="ghp_your_token_here"

# Start the MCP server
npm start

# Or development mode with auto-reload
npm run dev
```

## Usage

### In Claude.ai / Desktop

Add to your Claude configuration (`~/.claude/mcp.json` or Claude Desktop `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "gist": {
      "command": "node",
      "args": ["/path/to/gist-mcp/src/server.js"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token_here"
      }
    }
  }
}
```

Then in Claude, ask:

```
Fetch the gist "https://gist.github.com/owner/aa5a315d61ae9438b18d" 
and show me the file list and metadata.
```

or

```
Get all public gists from user "torvalds" and summarize them.
```

### Programmatically

```javascript
import { parseGistRef, fetchGist, fetchFileContent } from "./src/gistClient.js";

// Parse reference
const ref = parseGistRef("https://gist.github.com/owner/aa5a315d61ae9438b18d");
// → { gistId: "aa5a315d61ae9438b18d", owner: "owner", sha: null }

// Fetch gist metadata
const gist = await fetchGist(ref.gistId);
console.log(gist.files); // { "example.js": { ... }, ... }

// Fetch file content
const file = gist.files["example.js"];
const content = await fetchFileContent(file);
console.log(content);
```

## Tools Reference

### `fetch_gist`

Fetch complete gist metadata including file manifest.

**Arguments:**
- `gist` (string, required): Gist reference (ID, URL, or owner/id)
- `sha` (string, optional): Specific revision SHA

**Returns:**
```json
{
  "id": "aa5a315d61ae9438b18d",
  "description": "Useful script",
  "owner": "torvalds",
  "public": true,
  "created_at": "2023-10-15T12:34:56Z",
  "updated_at": "2024-01-20T08:22:10Z",
  "comments": 3,
  "file_count": 2,
  "files": [
    {
      "filename": "example.js",
      "language": "JavaScript",
      "size": 1024,
      "truncated": false,
      "type": "text/plain"
    }
  ]
}
```

### `fetch_file_content`

Retrieve raw file content. Automatically fetches from GitHub raw URLs for large files.

**Arguments:**
- `gist` (string, required): Gist reference
- `filename` (string, required): Filename within gist

**Returns:** File content as text with language hint

### `list_user_gists`

List public gists for a GitHub user. Paginated (default 3 pages = ~300 gists).

**Arguments:**
- `username` (string, required): GitHub username
- `maxPages` (number, optional): Pages to fetch (1-10, default: 3)

**Returns:**
```json
[
  {
    "id": "aa5a315d61ae9438b18d",
    "description": "My script",
    "file_count": 2,
    "updated_at": "2024-01-20T08:22:10Z",
    "html_url": "https://gist.github.com/..."
  }
]
```

### `search_gist_files`

Search files within a gist by name/pattern (case-insensitive).

**Arguments:**
- `gist` (string, required): Gist reference
- `pattern` (string, required): Filename pattern (regex)

**Returns:**
```json
{
  "pattern": "*.js",
  "matches": 2,
  "files": [
    {
      "filename": "example.js",
      "language": "JavaScript",
      "size": 1024
    }
  ]
}
```

### `get_gist_history`

Fetch revision history and commit log for a gist.

**Arguments:**
- `gist` (string, required): Gist reference

**Returns:**
```json
{
  "gist_id": "aa5a315d61ae9438b18d",
  "total_commits": 5,
  "commits": [
    {
      "version": "v1",
      "user": "owner",
      "committed_at": "2024-01-20T08:22:10Z",
      "change_status": "modified"
    }
  ]
}
```

## Gist Reference Formats

All tools accept gist references in multiple formats:

| Format | Example | Parsed |
|--------|---------|--------|
| Bare ID | `aa5a315d61ae9438b18d` | `{ gistId: "aa5a315d61ae9438b18d", owner: null, sha: null }` |
| GitHub URL | `https://gist.github.com/owner/aa5a315d61ae9438b18d` | `{ gistId: "aa5a315d61ae9438b18d", owner: "owner", sha: null }` |
| owner/id | `owner/aa5a315d61ae9438b18d` | `{ gistId: "aa5a315d61ae9438b18d", owner: "owner", sha: null }` |
| With SHA | `aa5a315d61ae9438b18d/abc123` | `{ gistId: "aa5a315d61ae9438b18d", owner: null, sha: "abc123" }` |

## Authentication

### GitHub Token (Recommended)

Set `GITHUB_TOKEN` environment variable to increase rate limits and access private gists you own:

```bash
export GITHUB_TOKEN="ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
node src/server.js
```

**Rate limits:**
- Without token: 60 requests/hour
- With token: 5,000 requests/hour

### Getting a Token

1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Select scopes: `gist` (minimum)
4. Copy token and set `GITHUB_TOKEN` environment variable

## Error Handling

### Error Classes

**NotFoundError** – Gist or file doesn't exist (404)
```
Not found: GET /gists/invalid_id
```

**RateLimitError** – GitHub API rate limit exceeded (403/429)
```
GitHub API rate limited (remaining=0, resets=2024-01-20T09:15:00Z). Set GITHUB_TOKEN to raise limits.
```

**AuthenticationError** – Invalid or expired token (401)
```
Invalid or expired GitHub token. Set GITHUB_TOKEN environment variable.
```

### Recovery Strategies

- **Rate limited**: Wait until reset time, or set GITHUB_TOKEN
- **Not found**: Verify gist is public (private gists require authentication)
- **Network errors**: Retry with exponential backoff
- **Truncated files**: `fetch_file_content` automatically handles large files

## Performance

### Characteristics

- **Fetch gist metadata**: ~100-300ms (network dependent)
- **Fetch file content**: ~50-200ms for typical files, ~1-3s for large files (>10MB)
- **List user gists**: ~100-400ms per page
- **GitHub rate limit**: 5,000/hour with token, 60/hour without

### Optimization

- Use `GITHUB_TOKEN` to 83× rate limit (5000 vs 60 per hour)
- Batch multiple file reads in single `fetch_gist` call (returns all metadata)
- Cache gist metadata locally to avoid redundant API calls
- Use `maxPages` parameter to limit pagination

## API Compliance

### GitHub REST API

- **Endpoint**: https://api.github.com/gists/...
- **Version**: 2022-11-28
- **Docs**: https://docs.github.com/en/rest/gists/gists

### MCP Protocol

- **Transport**: stdio (JSON-RPC 2.0)
- **Version**: Supports latest MCP SDK (@modelcontextprotocol/sdk)
- **Spec**: https://modelcontextprotocol.io

## Development

### Project Structure

```
gist-mcp/
├── src/
│   ├── server.js          # MCP server + tool handlers
│   └── gistClient.js      # GitHub API client
├── package.json
├── README.md
├── ARCHITECTURE.md
├── CONFIG.md
├── QUICKSTART.md
├── INDEX.md
├── PROJECT_SUMMARY.md
├── LICENSE
├── .env.example
└── .gitignore
```

### Key Design Decisions

1. **ES Modules** – Node.js `"type": "module"` for modern syntax
2. **Zod Validation** – Runtime type safety for tool arguments
3. **Error Recovery** – Graceful handling of API errors with context
4. **Pagination** – Safe defaults (3 pages) to avoid rate limits
5. **File Streaming** – `fetch_file_content` streams large files via raw URLs
6. **No State** – Stateless server (scalable, cacheable, reproducible)

### Testing

```bash
# Manual testing (requires GITHUB_TOKEN)
node -e "
import { parseGistRef, fetchGist } from './src/gistClient.js';
const ref = parseGistRef('https://gist.github.com/torvalds/de11361daae787ff5441');
const gist = await fetchGist(ref.gistId);
console.log(gist);
"
```

## Troubleshooting

### "Rate limit exceeded"
→ Set `GITHUB_TOKEN` environment variable

### "Gist not found"
→ Verify gist URL is public (https://gist.github.com/...) and valid

### "GITHUB_TOKEN rejected"
→ Token expired or revoked. Generate new token at https://github.com/settings/tokens

### "File truncated"
→ `fetch_file_content` automatically handles truncation. If still empty, file may exceed GitHub's raw URL size limit (very rare).

### "Connection timeout"
→ GitHub API may be slow. Retry with backoff, or check https://www.githubstatus.com

## Contributing

Contributions welcome:

1. Enhance gist client (additional GitHub API methods)
2. Add new MCP tools (e.g., gist statistics, search by content)
3. Improve error messages and recovery
4. Performance optimizations
5. Documentation improvements

## License

MIT – See LICENSE file

## Resources

- [Model Context Protocol](https://modelcontextprotocol.io)
- [GitHub Gists API](https://docs.github.com/en/rest/gists/gists)
- [GitHub REST API Docs](https://docs.github.com/en/rest)
- [Gist.github.com](https://gist.github.com)
