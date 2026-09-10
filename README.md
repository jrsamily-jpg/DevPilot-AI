# DevPilot AI

DevPilot AI is an AI software-engineering command center that can plan, implement, verify, and summarize work inside an approved local workspace.

## Features

- Mission briefs for build, debug, and review workflows
- A live five-stage execution graph
- Mission history, policy controls, memory, and audit views
- Integration connection flows with realistic OAuth states
- A local Node.js backend that launches engineering work through the Codex CLI
- Workspace path isolation and a two-mission concurrency limit
- Optional bearer-token protection for every private runtime endpoint

## Run locally

Requirements: Node.js 18 or newer and a signed-in Codex CLI installation.

1. Set any environment values you want to override from `.env.example` in your terminal or hosting provider.
2. Start the app with `npm start`.
3. Open `http://127.0.0.1:4173`.

The server reads `PORT`, `HOST`, `DEVPILOT_WORKSPACE_ROOT`, `CODEX_BIN`, and `DEVPILOT_API_TOKEN` from the environment. When `DEVPILOT_API_TOKEN` is set, all runtime endpoints except the health check require that secret as a bearer token. Local mission state is stored in `data/state.json` and is intentionally excluded from Git.

## Deployment note

The public build automatically uses a safe browser-based portfolio demo and does not receive repository access. Real engineering missions remain in the private Node.js runtime and require an authenticated, isolated worker with the Codex CLI available. Do not expose a personal Codex session or unrestricted filesystem access on a public server.

## Validation

Run `npm test` before publishing changes.
