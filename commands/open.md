---
allowed-tools:
  - Bash
---

Open the Memory Editor in the browser. This starts a local HTTP server and opens the web-based markdown editor for Claude Code auto memory files.

Steps:
1. Check if the server is already running on port 3456
2. If not, start the server in the background
3. Open the browser to the editor URL

Run the following bash commands:

```bash
# Check if already running
if curl -s http://127.0.0.1:3456/ > /dev/null 2>&1; then
  echo "Memory Editor is already running"
  open http://127.0.0.1:3456
else
  # Start server in background
  node "${CLAUDE_PLUGIN_ROOT}/dist/server.js" &
  SERVER_PID=$!

  # Wait for server to be ready
  for i in $(seq 1 10); do
    if curl -s http://127.0.0.1:3456/ > /dev/null 2>&1; then
      break
    fi
    sleep 0.3
  done

  # Open browser
  open http://127.0.0.1:3456
  echo "Memory Editor started (PID: $SERVER_PID)"
  echo "URL: http://127.0.0.1:3456"
fi
```

Tell the user: "Memory Editor is running at http://127.0.0.1:3456"
