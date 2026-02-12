---
allowed-tools:
  - Bash
---

Stop the Memory Editor server running on port 3456.

Run the following bash commands:

```bash
PIDS=$(lsof -ti:3456 2>/dev/null)
if [ -n "$PIDS" ]; then
  echo "$PIDS" | xargs kill
  echo "Memory Editor stopped (PID: $PIDS)"
else
  echo "Memory Editor is not running"
fi
```

Tell the user the result.
