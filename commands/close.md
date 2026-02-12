---
allowed-tools:
  - Bash
---

Stop the Memory Editor server running on port 3456.

Run the following bash commands:

```bash
PID=$(lsof -ti:3456 2>/dev/null)
if [ -n "$PID" ]; then
  kill $PID
  echo "Memory Editor stopped (PID: $PID)"
else
  echo "Memory Editor is not running"
fi
```

Tell the user the result.
