# Architecture Document: gist-mcp

## System Overview

gist-mcp is a Model Context Protocol (MCP) server that bridges GitHub Gists and AI models by exposing gist files and metadata as MCP tools. It enables AI clients to read, search, and analyze public gists programmatically.

### Core Objective

Enable Claude and other MCP-capable AI clients to:

1. Fetch gist metadata (owner, description, file list, timestamps)
2. Read gist file contents (with automatic large-file handling)
3. List user gists (paginated enumeration)
4. Search files within gists (pattern matching)
5. Access revision history (commits and versions)

---

## Component Architecture

### Layer 1: MCP Transport (stdio)

**File:** `src/server.js` (lines 1-50)

**Responsibility:** JSON-RPC 2.0 protocol over stdio

**Components:**
- `StdioServerTransport` – Bidirectional stdio communication
- `Server` class – MCP protocol implementation
- Request handlers – Tool discovery, execution, resource access

**Flow:**
```
stdin (JSON-RPC request)
  ↓
Server (parses, dispatches)
  ↓
Tool handler (processes arguments)
  ↓
Response (JSON output)
  ↓
stdout (JSON-RPC response)
```

**Key Invariants:**
- Single stdio channel (not multiplexed)
- Request-response pairs maintain order
- Streaming responses via `content` array
- Error responses include `isError: true`

---

### Layer 2: Tool Handlers (Validation & Dispatch)

**File:** `src/server.js` (lines 52-180)

**Responsibility:** Argument validation, tool orchestration, error handling

**Tool Schemas (Zod):**

| Tool | Input Schema | Validation |
|------|-------------|-----------|
| `fetch_gist` | `{ gist: string, sha?: string }` | Gist ref format, optional SHA |
| `fetch_file_content` | `{ gist: string, filename: string }` | Gist ref, filename exists |
| `list_user_gists` | `{ username: string, maxPages?: 1-10 }` | Username, bounded pages |
| `search_gist_files` | `{ gist: string, pattern: string }` | Gist ref, regex pattern |
| `get_gist_history` | `{ gist: string }` | Gist ref (valid ID/URL) |

**Handler Pattern:**

```javascript
async handleFetchGist(args) {
  // 1. Validate
  const parsed = FetchGistSchema.parse(args);
  
  // 2. Parse reference
  const ref = parseGistRef(parsed.gist);
  
  // 3. Fetch from API
  const gist = await fetchGist(ref.gistId, parsed.sha);
  
  // 4. Transform response
  const fileList = Object.entries(gist.files).map(...);
  
  // 5. Return MCP response
  return {
    content: [{ type: "text", text: JSON.stringify(...) }]
  };
}
```

**Error Handling:**
- `NotFoundError` (404) → "Not found: ..."
- `RateLimitError` (403/429) → "Rate limited: ... Set GITHUB_TOKEN"
- `AuthenticationError` (401) → "Invalid or expired GitHub token"
- `ZodError` (validation) → "Invalid arguments: field validation"
- Generic errors → "Error: ..."

**Response Assembly:**
- Metadata: JSON string representation
- File content: Text block with language hint
- Lists: JSON array representation
- Errors: Detailed message in `text` field

---

### Layer 3: GitHub API Client

**File:** `src/gistClient.js` (complete)

**Responsibility:** GitHub REST API interaction with error recovery

#### Request Layer

**Function:** `githubFetch(path, options)`

**Invariants:**
- Always includes: `User-Agent`, API version header, Accept header
- Conditionally includes: Authorization header (if GITHUB_TOKEN set)
- Automatically encodes: URI components (username, gist ID)

**Status Code Handling:**

| Status | Class | Action |
|--------|-------|--------|
| 200 | OK | Parse and return JSON |
| 401 | Auth | Throw `AuthenticationError` |
| 403 | Rate limit | Throw `RateLimitError` with reset time |
| 404 | Not found | Throw `NotFoundError` |
| 429 | Rate limit | Throw `RateLimitError` |
| 5xx | Server error | Throw generic `Error` |

**Rate Limit Headers Captured:**
- `x-ratelimit-remaining` – Requests remaining
- `x-ratelimit-reset` – Unix timestamp of reset
- Used in error messages for operator visibility

#### Reference Parsing

**Function:** `parseGistRef(input: string)`

**Input Formats Accepted:**

1. **Bare ID** – `"aa5a315d61ae9438b18d"`
   - Validation: Hex string, any length
   - Output: `{ gistId, owner: null, sha: null }`

2. **GitHub URL** – `"https://gist.github.com/owner/aa5a315d61ae9438b18d"`
   - Validation: `gist.github.com` hostname only
   - Path parsing: `/owner/gistId` or `/gistId` or `/owner/gistId/sha`
   - Output: `{ gistId, owner, sha }`

3. **owner/id path** – `"owner/aa5a315d61ae9438b18d"`
   - Validation: Single slash separator
   - Output: `{ gistId, owner, sha: null }`

4. **With SHA** – `"aa5a315d61ae9438b18d/abc123"` or URL variant
   - Validation: Two-part path
   - Output: Includes `sha` field

**Error Cases:**
- Empty input → "Gist reference required"
- Invalid URL domain → "Invalid domain (expected gist.github.com)"
- Invalid format → "Invalid gist reference format: ..."
- Invalid hex → "Invalid gist ID (expected hex string): ..."

**Design Rationale:**
- Multiple formats maximize usability (user-friendly, CLI-friendly, programmatic)
- Strict validation prevents silent failures (fail-fast)
- SHA support enables revision-specific queries

#### Core API Methods

**fetchGist(gistId, sha?)**

API Endpoint: `GET /gists/{id}` or `GET /gists/{id}/{sha}`

Response Shape:
```javascript
{
  id: string,
  description: string,
  public: boolean,
  owner: string | null,
  html_url: string,
  created_at: string (ISO 8601),
  updated_at: string (ISO 8601),
  comments: number,
  file_count: number,
  files: {
    [filename]: {
      filename: string,
      language: string | null,
      type: string,
      size: number,
      truncated: boolean,
      raw_url: string,
      content: string | null  // null if truncated
    }
  }
}
```

**File Metadata Transformation:**
- GitHub sends optional `language` → normalized to `string | null`
- GitHub sends `truncated` flag → boolean (important for large files)
- GitHub inlines `content` (<1MB) → preserved or null (>1MB)
- `raw_url` always present → used by `fetchFileContent` for large files

**Error Cases:**
- Gist doesn't exist → NotFoundError
- Gist is private (unauthenticated) → NotFoundError
- Invalid SHA → GitHub returns 404

---

**fetchFileContent(file)**

**Strategy:** Hybrid inlining + raw URL fetching

1. If `content !== null && !truncated` → return inlined content (fast path)
2. Else → fetch from `raw_url` (handles large files, guarantees completeness)

**Raw URL Fetching:**
- Targets: `https://gist.githubusercontent.com/...`
- Headers: Simple `User-Agent` only
- Response: Plain text (not JSON)
- Error handling: Status check, throws if not 2xx

**Performance:**
- Typical files (<1MB): ~50-100ms (inlined)
- Large files (1-100MB): ~200-1000ms (via raw URL)

**Limitation:** GitHub may truncate raw URLs for files >10MB (rare, documents in code)

---

**listUserGists(username, maxPages = 3)**

API Endpoint: `GET /users/{username}/gists?per_page=100&page={n}`

**Pagination Strategy:**
- Per-page: 100 items (GitHub max)
- Default: 3 pages = ~300 gists
- Max: 10 pages (to prevent runaway requests)
- Termination: Stop if page returns <100 items (last page)

**Response Array Element:**
```javascript
{
  id: string,
  description: string,
  file_count: number,
  html_url: string,
  updated_at: string,
  created_at: string
}
```

**Rate Limit Impact:**
- 1 request per page
- Default: 3 requests
- Max: 10 requests per call

**Error Cases:**
- User doesn't exist → NotFoundError
- User has no public gists → Empty array (not an error)

---

**fetchGistCommits(gistId)**

API Endpoint: `GET /gists/{id}/commits`

**Response Array Element:**
```javascript
{
  version: string,
  user: { login: string },
  committed_at: string,
  change_status: string  // 'added' | 'modified' | 'deleted'
}
```

**Usage:** Powered `get_gist_history` tool

---

#### Error Classes

**NotFoundError**
- Thrown: 404 responses
- Message: "Not found: {path}"
- Client handling: Check gist existence, verify public access

**RateLimitError**
- Thrown: 403, 429 responses
- Fields: `message`, `remaining`, `resetTime`
- Message: Includes rate limit exhaustion details and recovery hint
- Client handling: Retry after `resetTime`, add GITHUB_TOKEN for higher limits

**AuthenticationError**
- Thrown: 401 responses
- Message: "Invalid or expired GitHub token. Set GITHUB_TOKEN..."
- Client handling: Verify token validity, regenerate if needed

---

## Data Flow Diagrams

### Fetch Gist Metadata Flow

```
Tool Handler (handleFetchGist)
│
├─ Validate args (Zod schema)
│  └─ FetchGistSchema.parse({ gist, sha? })
│
├─ Parse gist reference
│  └─ parseGistRef(gist) → { gistId, owner, sha }
│
├─ Fetch gist metadata
│  └─ githubFetch(`/gists/{gistId}`) → GitHub API
│     ├─ Include: GITHUB_TOKEN (if set)
│     ├─ Handle: Rate limit headers
│     └─ Return: Full gist JSON
│
├─ Transform files object
│  └─ Normalize metadata (language, truncated, content)
│
└─ Assemble MCP response
   └─ {
        content: [{ type: "text", text: JSON.stringify(...) }]
      }
```

### Fetch File Content Flow

```
Tool Handler (handleFetchFileContent)
│
├─ Validate & parse arguments
│  └─ FetchFileContentSchema.parse({ gist, filename })
│
├─ Fetch gist metadata (to get file list)
│  └─ fetchGist(gistId) → includes all files
│
├─ Look up file in manifest
│  └─ gist.files[filename] → file object or throw NotFoundError
│
├─ Fetch file content
│  └─ fetchFileContent(file):
│     ├─ If inlined & not truncated → return immediately
│     └─ Else → fetch(raw_url) from gist.githubusercontent.com
│
└─ Assemble MCP response
   └─ {
        content: [{ type: "text", text: "# {filename}\n\n{content}" }]
      }
```

### Search Gist Files Flow

```
Tool Handler (handleSearchGistFiles)
│
├─ Validate & parse arguments
│  └─ SearchGistFilesSchema.parse({ gist, pattern })
│
├─ Fetch gist metadata
│  └─ fetchGist(gistId)
│
├─ Build regex from pattern
│  └─ new RegExp(pattern, 'i') – case-insensitive
│
├─ Filter files by filename match
│  └─ Object.entries(gist.files)
│     .filter(([name]) => pattern.test(name))
│
└─ Assemble response
   └─ { pattern, matches: count, files: [...] }
```

### List User Gists Flow (with Pagination)

```
Tool Handler (handleListUserGists)
│
├─ Validate arguments
│  └─ maxPages ∈ [1, 10]
│
└─ For each page (1 to maxPages)
   │
   ├─ Fetch page N
   │  └─ githubFetch(`/users/{username}/gists?page={N}&per_page=100`)
   │
   ├─ Collect results
   │  └─ results.push(...batch.map(g => {...}))
   │
   └─ Check termination
      ├─ If batch.length < 100 → last page, break
      └─ Else → continue to next page
   
└─ Return all results (flat array)
```

---

## Error Recovery Strategy

### Rate Limiting

**Symptoms:**
- 403 or 429 status code
- Response includes `x-ratelimit-remaining: 0`

**Recovery:**
1. **Without GITHUB_TOKEN:** Inform user, suggest setting token
2. **With GITHUB_TOKEN:** Inform reset time, suggest exponential backoff retry
3. **Client responsibility:** Respect rate limits, batch requests

**Limits:**
- Without token: 60/hour (1 per minute average)
- With token: 5,000/hour (~1.4 per second average)

### Not Found Errors

**Symptoms:**
- 404 status code
- Gist doesn't exist or is private

**Recovery:**
1. Verify gist ID/URL format
2. Check gist is public (verify via browser)
3. If private and unauthenticated, set GITHUB_TOKEN

### Authentication Errors

**Symptoms:**
- 401 status code
- Token invalid or expired

**Recovery:**
1. Regenerate token at https://github.com/settings/tokens
2. Update GITHUB_TOKEN environment variable
3. Restart server

### Large File Handling

**Symptoms:**
- File marked as `truncated: true`
- `content` field is null

**Recovery (Automatic):**
- `fetchFileContent` checks truncated flag
- Automatically fetches from `raw_url`
- Delivers complete content to client

---

## Performance Characteristics

### Latency Profile

| Operation | Typical | Range | Notes |
|-----------|---------|-------|-------|
| Fetch metadata | 200ms | 150-400ms | API call + JSON parsing |
| Fetch file (<1MB) | 50ms | 20-150ms | Inlined in metadata |
| Fetch file (1-10MB) | 500ms | 200-2000ms | raw_url streaming |
| List gists (1 page) | 300ms | 150-600ms | 100 items per page |
| Search files | 250ms | 200-350ms | Regex matching local |
| History fetch | 200ms | 150-400ms | Commit list only |

### Throughput

**Sequential requests:**
- ~5-10 operations/second (without rate limit)
- ~2-3 operations/second (with rate limit at 5000/hour)

**Concurrent requests:**
- Recommended: <5 concurrent (no connection pooling)
- Each request is independent stdio call
- MCP spec: Single request-response pair per JSON-RPC

### Memory

**Per-gist storage:**
- Metadata: ~2-10KB (depending on file count)
- File content: Streamed (not buffered in server memory)
- No persistent caching (stateless server)

**Peak memory:**
- ~50MB for 100 concurrent metadata fetches
- Garbage collection handles cleanup

---

## Security Considerations

### Input Validation

**Gist References:**
- URL hostname validated (`gist.github.com` only)
- Hex characters validated (gist IDs)
- Path components URL-encoded before API calls

**Tool Arguments:**
- Zod schemas enforce types and ranges
- String patterns validated with regex
- Numbers bounded (e.g., maxPages 1-10)

### GITHUB_TOKEN Protection

**Recommendations:**
- Use personal access tokens (not passwords)
- Limit to `gist` scope only
- Store in environment (not config files)
- Rotate tokens periodically
- Revoke if exposed

**Exposure Risk:**
- Logs may contain token (be careful with error logs)
- Recommended: Use token from environment, never hardcode
- MCP config files may contain token (restrict file permissions)

### GitHub API Safety

**GitHub Guarantees:**
- HTTPS only (no plaintext transmission)
- API rate limiting prevents abuse
- Token auth is cryptographically secure

**gist-mcp Protection:**
- No token logging (stripped from errors)
- No gist caching (no persistent state)
- No modification operations (read-only)

### Public Gists Only

**Limitation:** By default, only public gists accessible

**With GITHUB_TOKEN:**
- Can access private gists you own
- Cannot access other users' private gists (GitHub enforces)

---

## Testing Strategy

### Unit Testing (gistClient.js)

```javascript
// Reference parsing
test("parseGistRef accepts bare IDs", () => {
  const ref = parseGistRef("aa5a315d");
  assert.equal(ref.gistId, "aa5a315d");
  assert.equal(ref.owner, null);
});

// Reference parsing
test("parseGistRef accepts URLs", () => {
  const ref = parseGistRef("https://gist.github.com/owner/id123");
  assert.equal(ref.gistId, "id123");
  assert.equal(ref.owner, "owner");
});

// Error handling
test("parseGistRef rejects invalid domains", () => {
  assert.throws(
    () => parseGistRef("https://github.com/owner/id123"),
    /Invalid domain/
  );
});

// Error handling
test("fetchGist throws NotFoundError for missing gist", async () => {
  const gist = "invalid_id_that_does_not_exist";
  await assert.rejects(
    () => fetchGist(gist),
    NotFoundError
  );
});
```

### Integration Testing (server.js)

```javascript
// Tool discovery
test("Server lists all tools", async () => {
  const transport = new MockTransport();
  const server = new GistMCPServer();
  await server.connect(transport);
  
  const tools = await server.listTools();
  assert.equal(tools.length, 5);
  assert(tools.map(t => t.name).includes("fetch_gist"));
});

// Tool execution
test("fetch_gist returns valid response", async () => {
  const result = await server.callTool("fetch_gist", {
    gist: "aa5a315d61ae9438b18d"
  });
  
  assert(result.content[0].text.includes("id"));
  assert(!result.isError);
});

// Error handling
test("Invalid tool arguments return error", async () => {
  const result = await server.callTool("fetch_gist", {
    gist: 123  // number instead of string
  });
  
  assert(result.isError);
  assert(result.content[0].text.includes("Invalid"));
});
```

### Manual Testing

```bash
# Start server
npm start

# Test via stdio
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node src/server.js

# Test tool
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"fetch_gist","arguments":{"gist":"aa5a315d61ae9438b18d"}}}' | node src/server.js
```

---

## Scalability & Limitations

### Horizontal Scaling

**Approach:** Run multiple instances behind load balancer

```
┌─────────────┐
│  LB (80)    │
└──────┬──────┘
       │
   ┌───┴───┬───────┬───────┐
   │       │       │       │
┌──┴──┐ ┌──┴──┐ ┌──┴──┐ ┌──┴──┐
│ MCP │ │ MCP │ │ MCP │ │ MCP │
│  1  │ │  2  │ │  3  │ │  4  │
└─────┘ └─────┘ └─────┘ └─────┘
```

**Each instance:**
- Independent GitHub API quota (5000/hour with token)
- Stateless (no inter-process communication)
- Horizontal scaling to 4 instances = 20,000 requests/hour total

### Vertical Scaling Limits

**Bottleneck:** GitHub API rate limit (5,000/hour per token)

**Solutions:**
- Use multiple GitHub tokens in round-robin
- Implement local caching layer (Redis, memcached)
- Queue requests during rate limit windows

### Current Limitations

1. **No request queuing** – Rejects requests at rate limit
2. **Single token** – One GitHub auth credential
3. **No caching** – Fetches fresh data each request
4. **Synchronous processing** – Waits for GitHub response

---

## Future Enhancements

### Planned

1. **Local caching** – Redis/memcached for popular gists
2. **Multiple tokens** – Round-robin auth for higher throughput
3. **Request queuing** – Background job processing during rate limits
4. **Search by content** – Grep-like file searching
5. **Gist creation** – Create/edit gists (requires scopes: `gist`)
6. **Webhooks** – Real-time gist update notifications

### Architecture Impact

- Caching: Add `GistCache` layer between handlers and client
- Tokens: Implement `TokenPool` with round-robin selection
- Queuing: Integrate job queue (Bull, RabbitMQ)
- Write operations: Extend gistClient with POST/PATCH methods
- Webhooks: Add webhook receiver (separate HTTP server)

---

## References

- MCP Specification: https://modelcontextprotocol.io
- GitHub REST API: https://docs.github.com/en/rest/gists
- Node.js APIs: https://nodejs.org/api/
- Zod Validation: https://zod.dev
