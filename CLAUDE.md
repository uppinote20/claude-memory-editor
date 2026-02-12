# claude-memory-editor

Web-based markdown editor for Claude Code auto memory files.

## Build

```bash
npm run build
```

## Test

```bash
# Start server
node dist/server.js

# Open browser
open http://127.0.0.1:3456
```

## Architecture

- Node.js HTTP server (no frameworks)
- Vanilla JS frontend (no frameworks)
- esbuild for bundling
- dist/ is committed for plugin distribution

## Security

- Server binds to 127.0.0.1 only
- Path validation: reads only under `~/.claude/`
- Write validation: only `~/.claude/projects/*/memory/*.md`
- Markdown preview: escapeHtml on all text, URL sanitization, event handler stripping
