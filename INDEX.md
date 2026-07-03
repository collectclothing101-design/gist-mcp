# gist-mcp: Complete Project Index

## Navigation Guide

Start here to understand the system and get up and running.

---

## 📋 Quick Reference

**What is gist-mcp?** Convert any public GitHub Gist into an AI-ready MCP (Model Context Protocol) server with instant tool access to gist files, metadata, and revision history.

**Why?** Enable Claude and other AI models to analyze, read, and work with gist collections programmatically.

**How?** Node.js server exposing 5 tools: fetch metadata, read files, list user gists, search files, view history.

---

## 📁 File Structure

```
gist-mcp/
├── src/                          # Source code
│   ├── server.js                 # MCP server + tool handlers
│   └── gistClient.js             # GitHub API client
├── QUICKSTART.md                 # ⭐ START HERE (5-minute setup)
├── README.md                     # Complete feature guide
├── ARCHITECTURE.md               # System design specification
├── CONFIG.md                     # Configuration examples
├── PROJECT_SUMMARY.md            # This project overview
├── package.json                  # Node.js dependencies
└── .env.example                  # Environment variables template
```

---

## 📖 Documentation Map

### For Users (Getting Started)

**1. QUICKSTART.md** (10 minutes)
- Prerequisites (Node.js 18+)
- 5-step installation
- GitHub token setup (optional)
- Claude Desktop integration
- First test examples
- Common issues

→ **Read this first!**

### For Developers (Using the API)

**2. README.md** (30 minutes)
- System overview with diagrams
- Complete tool reference
- Tool argument examples
- All gist reference formats
- Performance characteristics
- Troubleshooting guide

→ **Read this for features**

### For Architects (Understanding Design)

**3. ARCHITECTURE.md** (60 minutes)
- Layer-by-layer design
- Data flow diagrams
- Error recovery strategies
- Performance analysis
- Security considerations
- Testing strategy
- Scalability limits
- Future roadmap

→ **Read this for deep dive**

### For Operations (Deploying)

**4. CONFIG.md** (20 minutes)
- Claude Desktop setup
- Docker configuration
- Systemd service
- Kubernetes examples
- Environment variables
- Production hardening

→ **Read this for deployment**

### For Project Overview

**5. PROJECT_SUMMARY.md** (15 minutes)
- What changed from original
- Feature matrix
- Technical specifications
- File statistics
- Design principles
- Getting started checklist

→ **Read this for context**

---

## 🚀 Getting Started (TL;DR)

```bash
# 1. Install
npm install

# 2. (Optional) Generate GitHub token
# https://github.com/settings/tokens → scope: gist

# 3. Set token
export GITHUB_TOKEN="ghp_your_token"

# 4. Run
npm start

# 5. Integrate with Claude Desktop
# Edit: ~/Library/Application Support/Claude/claude_desktop_config.json
# Add: "gist-mcp" entry with node + server.js path

# 6. Restart Claude and try:
# "Fetch gist https://gist.github.com/torvalds/de11361daae787ff5441"
```

---

## 🛠️ Source Code Guide

### src/server.js

**Main Entry Point**

```
GistMCPServer
├── setupHandlers()
│   ├── ListToolsRequestSchema
│   │   └─→ 5 tools: fetch_gist, fetch_file_content, etc.
│   ├── CallToolRequestSchema
│   │   ├─→ handleFetchGist()
│   │   ├─→ handleFetchFileContent()
│   │   ├─→ handleListUserGists()
│   │   ├─→ handleSearchGistFiles()
│   │   └─→ handleGetGistHistory()
│   └── ReadResourceRequestSchema
│       └─→ gist:// URI support
└── run()
    └─→ StdioServerTransport
```

**Key Components:**
- `FetchGistSchema` (Zod) – Input validation
- Error handling with `NotFoundError`, `RateLimitError`
- JSON response assembly
- MIME type detection

**Usage:** This runs as the MCP server process

---

### src/gistClient.js

**GitHub API Layer**

```
parseGistRef(input)              // Parse gist references
├─→ Bare ID: "aa5a315d"
├─→ URL: "https://gist.github.com/owner/id"
├─→ owner/id: "owner/aa5a315d"
└─→ Returns: { gistId, owner, sha }

fetchGist(gistId, sha?)          // Get gist metadata
├─→ GET /gists/{id}
└─→ Returns: metadata + file manifest

fetchFileContent(file)           // Read file
├─→ Use inlined content (if not truncated)
└─→ Or fetch from raw_url

listUserGists(username)          // Paginated user gists
├─→ GET /users/{user}/gists?page=n
└─→ Returns: array of gists (default 3 pages)

fetchGistCommits(gistId)         // Revision history
├─→ GET /gists/{id}/commits
└─→ Returns: array of commits
```

**Error Classes:**
- `NotFoundError` (404)
- `RateLimitError` (403/429)
- `AuthenticationError` (401)

**Usage:** Import this in server.js for API calls

---

## 🔧 Configuration

### .env File (Optional)

```bash
GITHUB_TOKEN=ghp_your_personal_access_token_here
```

**Why?** Increases rate limit from 60/hour to 5000/hour

**How to get?** https://github.com/settings/tokens (select `gist` scope)

---

## 📊 Tool Reference

### Available Tools (5 Total)

```
Tool                    Input                   Output
────────────────────────────────────────────────────────
fetch_gist              gist, sha?              JSON metadata
fetch_file_content      gist, filename          File text
list_user_gists         username, maxPages?     JSON array
search_gist_files       gist, pattern           Matching files
get_gist_history        gist                    Commits list
```

### Example Calls

**From Claude:**
```
"Fetch gist https://gist.github.com/owner/id123"
"List all gists from user torvalds"
"Get file example.js from gist owner/id123"
```

**From code:**
```javascript
const result = await callTool("fetch_gist", {
  gist: "https://gist.github.com/owner/id"
});
```

---

## 🔐 Security

✓ **Input Validation** – All arguments validated with Zod
✓ **Token Safety** – Environment variable (not hardcoded)
✓ **HTTPS Only** – All API calls use HTTPS
✓ **Read-Only** – No write operations
✓ **Public Access** – Private gists require GitHub token
✓ **Error Safety** – No sensitive data in error messages

---

## 🚨 Common Issues

| Issue | Solution |
|-------|----------|
| "Rate limit exceeded" | Set `GITHUB_TOKEN` environment variable |
| "Gist not found" | Verify URL is public on gist.github.com |
| "Module not found" | Run `npm install` |
| Claude says "Unknown tool" | Restart Claude, verify config path |
| "GITHUB_TOKEN rejected" | Token may be expired, regenerate at github.com/settings/tokens |

See QUICKSTART.md for more troubleshooting.

---

## 📈 Performance

**Typical Latencies:**
- Metadata: 200ms
- Small file (<1MB): 50ms (inlined)
- Large file (1-10MB): 500ms (streaming)
- List gists: 300ms/page

**Rate Limits:**
- Without token: 60 requests/hour
- With token: 5,000 requests/hour
- Cost: Each operation ~1 request

**Scalability:**
- Stateless: Can run multiple instances
- Each instance: Independent quota
- 4 instances with tokens: 20,000 requests/hour total

---

## 🔄 Deployment Options

### Claude Desktop (Easiest)
Edit `~/.claude/...` → add `gist-mcp` server entry

### Docker
```bash
docker build -t gist-mcp .
docker run -e GITHUB_TOKEN="ghp_..." gist-mcp
```

### Systemd (Linux)
Create unit file → systemctl enable/start

### Kubernetes
Helm chart → stateless deployment → 1 pod per token

See CONFIG.md for detailed examples.

---

## 📚 Further Reading

**Learn more about:**
- MCP Protocol: https://modelcontextprotocol.io
- GitHub Gist API: https://docs.github.com/en/rest/gists
- Node.js Streams: https://nodejs.org/api/stream.html
- Zod Validation: https://zod.dev

---

## ✅ Checklist: Getting Started

- [ ] Read QUICKSTART.md (this file, 5 min)
- [ ] Run `npm install` (1 min)
- [ ] (Optional) Generate GITHUB_TOKEN (5 min)
- [ ] Run `npm start` (30 sec)
- [ ] Configure Claude Desktop (5 min)
- [ ] Test with a gist URL in Claude
- [ ] Read README.md for features (30 min)
- [ ] Explore ARCHITECTURE.md for design (60 min)

**Total time to first working test: ~15-20 minutes**

---

## 🎯 What's Next?

1. **Immediate** – Run the server, integrate with Claude
2. **Next** – Read README.md to understand all tools
3. **Deep dive** – Study ARCHITECTURE.md for system design
4. **Advanced** – Explore deployment options in CONFIG.md
5. **Customize** – Extend with new tools or features

---

## 📞 Support

**Questions?**
- Check QUICKSTART.md (getting started)
- See README.md (features & usage)
- Read ARCHITECTURE.md (design details)
- Review CONFIG.md (deployment)

**Issues?**
- Verify Node.js version: `node --version` ≥18
- Check network: Can you visit gist.github.com?
- Validate token: https://github.com/settings/tokens
- Check path: Ensure absolute path in config

---

**Ready? Start with QUICKSTART.md!** 🚀
