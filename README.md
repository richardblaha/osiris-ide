<div align="center">

<img src="packages/branding/assets/osiris.svg" width="120" alt="Osiris IDE" />

# Osiris IDE

**A custom, open-source developer platform built from VS Code (Code - OSS / VSCodium core) — for desktop and the browser.**

[![CI](https://github.com/richardblaha/osiris-ide/actions/workflows/ci.yml/badge.svg)](https://github.com/richardblaha/osiris-ide/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-informational.svg)](LICENSE)

</div>

---

## What is this?

Osiris IDE is a **downstream distribution** of [Code - OSS](https://github.com/microsoft/vscode)
(assembled through the [VSCodium](https://github.com/VSCodium/vscodium) pipeline) with:

- **Osiris branding** — product name, icons, theme defaults (`Osiris Dark` / `Osiris Light`).
- **First-party extensions** shipped in the box:
  - `osiris-ai` — AI agent orchestration with **MCP (Model Context Protocol)** support and a custom agent panel.
  - `osiris-workspace` — DevContainer enforcement and session handover.
- Two delivery targets:
  - `apps/osiris-desktop` — Electron packages for Linux, macOS and Windows.
  - `apps/osiris-web` — a browser-served runtime following the OpenVSCode Server pattern.

> The upstream VS Code source is **never vendored** into this repo. The desktop/web
> builds clone a pinned upstream tag at build time and apply Osiris overlays + patches.

This is the IDE half of Osiris. The agent/platform half — CLI, `osiris-kind-operator`,
`osiris-server` API, and the crew/backlog/memory engine — lives in
[`osiris-ai`](https://github.com/richardblaha/osiris).

## Repository layout

```text
osiris-ide/
├── apps/
│   ├── osiris-desktop/   # Electron wrapper, OS packaging, branding entrypoint
│   └── osiris-web/       # Web runtime / standalone server
├── packages/
│   ├── branding/         # Icons, themes, product.json overlay, asset metadata
│   ├── shell-theme/      # Theme provider + OS / host theme detection
│   ├── desktop-host/     # Electron main-process host (agent bootstrap, guard rails)
│   ├── container-sync/   # DevContainer template sync + digest tracking
│   ├── lm-proxy/         # OpenAI-compatible shim over the editor Language Model API
│   └── orchestrator/     # Container lifecycle runner used by desktop-host
├── extensions/
│   ├── osiris-ai/        # AI agent orchestration + MCP + agent panel
│   └── osiris-workspace/ # DevContainer enforcement + session handover
├── features/
│   └── src/web-ide/      # DevContainer feature: openvscode-server + launcher
└── toolchain/
    ├── eslint-config/    # Shared flat ESLint config
    └── tsconfig/         # Shared TypeScript base configs
```

## Shared packages come from `osiris-ai`

`shared-core`, `protocol`, `agent-core`, `mcp`, `dot-osiris` and `telemetry` are used
on both sides of the split (server/cli/crew in `osiris-ai`, extensions here), so they
live in `osiris-ai` and are published to **GitHub Packages** under the
`@richardblaha` scope instead of being duplicated. This repo consumes them as normal
versioned `dependencies` (see `.npmrc` and the `package.json` of `extensions/osiris-ai`,
`extensions/osiris-workspace`, `packages/desktop-host`, `packages/container-sync`,
`packages/lm-proxy`, `packages/orchestrator`).

To install locally or in CI you need a token with `read:packages` scope for
`npm.pkg.github.com`:

```bash
export NODE_AUTH_TOKEN=<a classic PAT with read:packages>
pnpm install
```

CI reads the same token from the `PACKAGES_READ_TOKEN` repository secret — the
default `GITHUB_TOKEN` only grants same-repo package access, and these packages are
published from `osiris-ai`, a different repo under the same account.

## Prerequisites

- **Node.js 22 LTS** (`nvm use` reads `.nvmrc`)
- **pnpm 9** (`corepack enable`)
- For desktop builds: the platform toolchain VS Code itself requires
  (`git`, Python 3, a C/C++ compiler, and on Linux the `libx11`/`libsecret` dev packages).

## Quickstart

```bash
corepack enable
export NODE_AUTH_TOKEN=<a classic PAT with read:packages>  # see above
pnpm install

pnpm build        # build every package + extension (Turborepo)
pnpm test         # vitest across packages + extension logic
pnpm lint         # eslint (flat config)
pnpm typecheck    # tsc -b across the workspace
pnpm package      # produce .vsix / dist_electron artifacts
```

## License

MIT — see [LICENSE](LICENSE). Osiris IDE is a downstream distribution built from
Microsoft's Code - OSS via the VSCodium build pipeline; the upstream source is fetched
at build time and is not redistributed within this repository.
