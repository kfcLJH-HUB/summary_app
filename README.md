# AI Session Summary

A local macOS Electron app that reads Codex and Claude Code JSONL sessions, optionally imports Doubao web conversations, and writes a daily Markdown summary through an OpenAI-compatible API.

## Development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run typecheck
npm test
npm run build
npm start
```

No raw conversation database is created. Source sessions are read on demand and only the generated Markdown report is written to disk.
