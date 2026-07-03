# Quick Start Guide

Get gist-mcp running in 5 minutes.

## Prerequisites

- Node.js 18+ (`node --version`)
- npm (`npm --version`)
- GitHub account (free, for public gists)

## Step 1: Clone or Extract

```bash
# Extract or clone the repository
unzip gist-mcp.zip
cd gist-mcp
```

## Step 2: Install Dependencies

```bash
npm install
```

**Expected output:**
```
added XX packages, in Xs
```

## Step 3: (Optional) Generate GitHub Token

For higher rate limits (5,000/hour instead of 60/hour):

1. Go to https://github.com/settings/tokens/new
2. Token name: "gist-mcp"
3. Select scope: `gist`
4. Click "Generate token"
5. Copy the token (starts with `ghp_`)

## Step 4: Set GitHub Token

```bash
# Create .env file
cp .env.example .env

# Edit .env and add your token
# Or set environment variable:
export GITHUB_TOKEN="ghp_your_token_here"
```

## Step 5: Start the Server

```bash
npm start
```

**Expected output:**
```
[gist-mcp] Server connected on stdio transport
```

The server is now running and waiting for MCP requests.

---

## Integration with Claude

### Claude Desktop (macOS)

1. **Edit config file:**
   ```bash
   nano ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```

2. **Add gist-mcp:**
   ```json
   {
     "mcpServers": {
       "gist-mcp": {
         "command": "node",
         "args": ["/absolute/path/to/gist-mcp/src/server.js"],
         "env": {
           "GITHUB_TOKEN": "ghp_your_token_here"
         }
       }
     }
   }
   ```

3. **Replace paths:**
   - Get absolute path: `pwd` (in gist-mcp directory)
   - Update config with full path

4. **Restart Claude** (fully close and reopen)

5. **In Claude:**
   ```
   Fetch the gist https://gist.github.com/torvalds/de11361daae787ff5441
   ```

### Claude Windows

Same steps, but config file location:
```
%APPDATA%\Claude\claude_desktop_config.json
```

---

## First Test

### Via Command Line

```bash
# Fetch a famous gist
node -e "
import { parseGistRef, fetchGist } from './src/gistClient.js';
const ref = parseGistRef('https://gist.github.com/torvalds/de11361daae787ff5441');
const gist = await fetchGist(ref.gistId);
console.log('Gist:', gist.description);
console.log('Files:', Object.keys(gist.files).length);
"
```

### Via Claude

Ask Claude:

```
List the first 5 gists from user "torvalds"
```

or

```
What files are in gist https://gist.github.com/torvalds/de11361daae787ff5441?
```

---

## Common Issues

### "GITHUB_TOKEN not found"

**Symptom:** Rate limit error immediately

**Fix:**
```bash
export GITHUB_TOKEN="ghp_your_token"
npm start
```

### "Module not found"

**Symptom:** `Cannot find module @modelcontextprotocol/sdk`

**Fix:**
```bash
npm install
# Or reinstall
npm ci
```

### "Gist not found"

**Symptom:** Error: NotFoundError

**Check:**
- Gist URL is correct and public
- Gist exists on gist.github.com
- You have network access

### Claude says "Unknown tool"

**Symptom:** "Unknown tool: fetch_gist"

**Fix:**
1. Close Claude completely
2. Restart Claude
3. Verify config file has `gist-mcp` section
4. Check Node.js path is correct

---

## Useful Gists to Test

```bash
# Linux/Mac cheat sheet
fetch_gist "https://gist.github.com/search?l=shell" 

# Famous gists
fetch_gist "https://gist.github.com/torvalds/de11361daae787ff5441"  # Linux kernel email
fetch_gist "https://gist.github.com/ryanb/534416"  # Git tips

# By user
list_user_gists "torvalds"
list_user_gists "gvanrossum"
```

---

## Next Steps

1. **Read documentation:**
   - `README.md` – Full feature guide
   - `ARCHITECTURE.md` – System design
   - `CONFIG.md` – Configuration options

2. **Try advanced features:**
   - `search_gist_files` – Find files by name
   - `get_gist_history` – See revision history
   - `list_user_gists` – Browse user's gists

3. **Integrate with workflows:**
   - Reference gists in Claude conversations
   - Analyze gist code with AI
   - Batch process gist collections

---

## Support

**Issues?** Check:
- GitHub token validity (https://github.com/settings/tokens)
- Node.js version (`node --version` ≥18)
- Network connectivity (can you visit gist.github.com?)
- Claude version (latest recommended)

**Questions?** See README.md or ARCHITECTURE.md

Enjoy! 🚀
