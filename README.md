# DevPilot AI

DevPilot AI is an AI software-engineering command center that can plan, implement, verify, and summarize work inside an approved local workspace.

## Features

- Mission briefs for build, debug, and review workflows
- A live five-stage execution graph
- Mission history, policy controls, memory, and audit views
- Integration connection flows with realistic OAuth states
- A local Node.js backend that launches engineering work through the Codex CLI
- Workspace path isolation and a two-mission concurrency limit

## Run locally

Requirements: Node.js 18 or newer and a signed-in Codex CLI installation.

1. Set any environment values you want to override from `.env.example` in your terminal or hosting provider.
2. Start the app with `npm start`.
3. Open `http://127.0.0.1:4173`.

The server reads `PORT`, `HOST`, `DEVPILOT_WORKSPACE_ROOT`, and `CODEX_BIN` from the environment. Local mission state is stored in `data/state.json` and is intentionally excluded from Git.

## Deployment note

The interface and API can be hosted with any Node.js-compatible platform. Real engineering missions require a secured worker environment with the Codex CLI available, authenticated, and isolated per user. Do not expose a personal Codex session or unrestricted filesystem access on a public server.

## Validation

Run `npm test` before publishing changes.
