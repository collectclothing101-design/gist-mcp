# Configuration Examples

## Claude Desktop (macOS / Windows)

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "gist-mcp": {
      "command": "node",
      "args": ["/path/to/gist-mcp/src/server.js"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_personal_access_token_here"
      }
    }
  }
}
```

### Example with Absolute Path (macOS)

```json
{
  "mcpServers": {
    "gist-mcp": {
      "command": "node",
      "args": ["/Users/yourname/projects/gist-mcp/src/server.js"],
      "env": {
        "GITHUB_TOKEN": "ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

### Example with npm (if installed globally)

```json
{
  "mcpServers": {
    "gist-mcp": {
      "command": "npm",
      "args": ["--prefix", "/path/to/gist-mcp", "start"],
      "env": {
        "GITHUB_TOKEN": "ghp_your_token"
      }
    }
  }
}
```

## Environment Variables

### GITHUB_TOKEN (Required for Higher Rate Limits)

Generate at: https://github.com/settings/tokens/new

**Minimum scopes:** `gist` (read public gists)

**Optional scopes:** (if you want to access your own private gists)
- `gist` – Full gist access

**Rate limits:**
- Without token: 60 requests/hour (unauthenticated)
- With token: 5,000 requests/hour (authenticated)

## Development Configuration

### .env File

Create `.env` in project root (optional, auto-loaded):

```bash
GITHUB_TOKEN=ghp_your_personal_access_token_here
```

### Node.js Environment

```bash
# Direct
export GITHUB_TOKEN="ghp_..."
node src/server.js

# Or via npm
GITHUB_TOKEN="ghp_..." npm start
```

## Docker Deployment

### Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY src/ ./src/

# Run server
CMD ["node", "src/server.js"]
```

### docker-compose.yml

```yaml
version: '3.9'

services:
  gist-mcp:
    build: .
    environment:
      GITHUB_TOKEN: ${GITHUB_TOKEN}
    stdin_open: true
    tty: true
    # For stdio communication
    volumes:
      - /dev/stdin:/dev/stdin
      - /dev/stdout:/dev/stdout
      - /dev/stderr:/dev/stderr
```

### Run

```bash
docker build -t gist-mcp .
docker run -it -e GITHUB_TOKEN="ghp_..." gist-mcp
```

## Systemd Service (Linux)

### /etc/systemd/user/gist-mcp.service

```ini
[Unit]
Description=gist-mcp MCP Server
Documentation=https://github.com/gist-mcp/gist-mcp

[Service]
Type=simple
Environment="GITHUB_TOKEN=ghp_your_token"
ExecStart=/usr/bin/node /opt/gist-mcp/src/server.js
Restart=on-failure
RestartSec=10s

[Install]
WantedBy=default.target
```

### Enable and Start

```bash
systemctl --user enable gist-mcp
systemctl --user start gist-mcp
systemctl --user status gist-mcp
```

## Multiple MCP Servers

Configure alongside other MCP servers:

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem"]
    },
    "gist-mcp": {
      "command": "node",
      "args": ["/path/to/gist-mcp/src/server.js"],
      "env": {
        "GITHUB_TOKEN": "ghp_..."
      }
    },
    "fetch": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-fetch"]
    }
  }
}
```

## Troubleshooting Configuration

### "Module not found" Error

Ensure Node.js path is correct:

```bash
# Find Node.js
which node
# /usr/local/bin/node

# Use absolute path in config
```

### "Permission denied"

Make server executable:

```bash
chmod +x /path/to/gist-mcp/src/server.js
```

Or run via `node` command (see examples above).

### "GITHUB_TOKEN not recognized"

Verify environment variable is set:

```bash
# Check
echo $GITHUB_TOKEN

# Set if missing
export GITHUB_TOKEN="ghp_..."

# Verify in subprocess
node -e "console.log(process.env.GITHUB_TOKEN)"
```

## Production Hardening

### Resource Limits

```json
{
  "mcpServers": {
    "gist-mcp": {
      "command": "node",
      "args": ["--max-old-space-size=512", "/path/to/gist-mcp/src/server.js"],
      "env": {
        "GITHUB_TOKEN": "ghp_..."
      }
    }
  }
}
```

### Error Logging

```bash
# Redirect stderr to file
node src/server.js 2>/tmp/gist-mcp-error.log
```

### Health Checks

Wrap with supervisor:

```bash
# Install supervisor
npm install -g supervisor

# Run with auto-restart
supervisor -e js -n error /path/to/gist-mcp/src/server.js
```

## Performance Tuning

### Node.js Flags

```json
{
  "mcpServers": {
    "gist-mcp": {
      "command": "node",
      "args": [
        "--no-warnings",
        "--enable-source-maps",
        "/path/to/gist-mcp/src/server.js"
      ]
    }
  }
}
```

### Connection Pooling

For high-throughput use cases, consider running multiple instances behind a load balancer. Each instance maintains independent GitHub API quotas.
