# Contributing to Helm

Thanks for your interest in contributing. This doc covers everything you need to get the project running locally.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 20 | [nodejs.org](https://nodejs.org) or `brew install node` |
| Rust | stable | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Tauri CLI | v2 | included as a dev dependency (`npm run tauri`) |
| Xcode CLI Tools | (macOS) | `xcode-select --install` |

Verify your Rust setup:
```sh
rustc --version
cargo --version
```

> **Note:** This project uses npm. Do not use pnpm or yarn — they will generate incompatible lock files.

### Debian Setup

See [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/#linux).

---

## Running Locally

```sh
# Install JS dependencies
npm install

# Start the Tauri dev window (also starts the Vite dev server)
npm start
```

This opens a native app window backed by a hot-reloading React frontend. Rust changes require a full recompile; frontend changes hot-reload instantly.

To run just the Vite frontend in a browser (no Tauri APIs):
```sh
npm run dev
# Open http://localhost:1420
```

> **Note:** File system operations (reading/writing notes) require the full Tauri dev environment. The browser-only mode is useful for UI work that doesn't touch the vault.

---

## Building

### Development build (debug)

```sh
npm run tauri build -- --debug
```

Output: `src-tauri/target/debug/bundle/`

### Production build

```sh
npm run tauri build
```

Output: `src-tauri/target/release/bundle/`

On macOS this produces:
- `macos/Helm.app` — the app bundle
- `dmg/Helm_<version>_aarch64.dmg` — the distributable disk image

For Debian systems, use the .deb build found in the output and run `sudo dpkg -i <filename>.deb`.

---

## Creating a DMG (macOS)

The DMG is built automatically as part of `npm run tauri build`. You'll find it at:

```
src-tauri/target/release/bundle/dmg/Helm_<version>_aarch64.dmg
```

To distribute the DMG, you'll need to **sign and notarize** it. Set these environment variables before building:

```sh
export APPLE_CERTIFICATE="Developer ID Application: Your Name (TEAMID)"
export APPLE_CERTIFICATE_PASSWORD="keychain-password"
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"
export APPLE_ID="you@example.com"
export APPLE_PASSWORD="app-specific-password"   # from appleid.apple.com
export APPLE_TEAM_ID="YOURTEAMID"
```

Then build normally:
```sh
npm run tauri build
```

Tauri handles code signing, notarization, and stapling automatically when those variables are present.

For an **unsigned** local build (no Apple Developer account needed), just run `npm run tauri build` without setting those variables. The app will work on your own machine but macOS Gatekeeper will block it on other machines by default.

---

## Releasing

**Always use `release.sh` to cut a release.** Do not bump versions or build manually.

```sh
./release.sh patch   # 0.3.0 → 0.3.1
./release.sh minor   # 0.3.0 → 0.4.0
./release.sh major   # 0.3.0 → 1.0.0
```

The script:
1. Sources `sign.sh` and validates the Apple signing credentials: all four of `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD`, and `APPLE_TEAM_ID` must be exported, and the signing identity must exist in the keychain. It aborts otherwise — a partial `sign.sh` produces a build that Gatekeeper rejects on other machines.
2. Bumps the version in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`
3. Generates a changelog entry in `CHANGELOG.md` from commits since the last tag
4. Commits the version bump
5. Runs `npm run tauri build` to produce the `.dmg` (Tauri signs and notarizes using the credentials from step 1)
6. **Verifies the artifacts**: `codesign --verify` and `xcrun stapler validate` on `Helm.app`, plus a Gatekeeper assessment (`spctl`) that must report *Notarized Developer ID*. If any check fails, the script aborts without committing artifacts.
7. Copies the DMG to `releases/vX.Y.Z/`, commits it, and tags `vX.Y.Z`

`sign.sh` lives at the repo root, is git-ignored, and must export the four Apple signing environment variables (see the Creating a DMG section below).

When prompted, answer **y** to push and create a draft GitHub Release (attaches the `.dmg`).
CI builds Linux packages, uploads them, and publishes the Release.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server only (browser, no Tauri) |
| `npm run tauri dev` | Full Tauri dev window with hot reload |
| `npm run build` | TypeScript check + Vite production build |
| `npm run tauri build` | Full native app + DMG (release mode) |
| `npm run test` | Run Vitest unit tests once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:ui` | Vitest browser UI |

---

## Project Structure

```
helm/
├── src/                    # React + TypeScript frontend
│   ├── components/         # UI components (editor, sidebar, settings)
│   ├── lib/                # Utilities (parser, themes, search)
│   ├── store/              # Zustand state (notes, ui, theme, settings)
│   ├── types/              # TypeScript type definitions
│   ├── views/              # Full-page views (Dashboard, Eisenhower, Kanban, Graph)
│   └── App.tsx             # Root component
├── src-tauri/              # Rust backend
│   ├── src/                # Tauri commands (file I/O, vault operations)
│   ├── tauri.conf.json     # App config, bundle settings, permissions
│   └── Cargo.toml          # Rust dependencies
├── docs/
│   ├── FEATURES.md         # Full feature documentation
│   └── plans/              # Design docs and implementation plans
└── package.json
```

---

## IDE Setup

Recommended extensions for VS Code:

- [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode)
- [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)
- [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint)
- [Tailwind CSS IntelliSense](https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss)
