# Contributing to claude-memory-editor

Thank you for your interest in contributing to claude-memory-editor!

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/claude-memory-editor.git
   cd claude-memory-editor
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## Development

### Build

```bash
npm run build
```

### Test locally

```bash
node dist/server.js
open http://127.0.0.1:3456
```

### Test with Claude Code

```bash
claude --plugin-dir /path/to/claude-memory-editor
```

## Pull Request Process

1. Ensure your code builds without errors
2. Test your changes locally in the browser
3. Update README.md if you've changed functionality
4. Create a Pull Request with a clear description

## Code Style

- Use TypeScript
- Follow existing code patterns
- Keep functions small and focused
- Add comments for complex logic

## Reporting Issues

- Use GitHub Issues
- Include Claude Code version
- Provide steps to reproduce
- Include error messages if any

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
