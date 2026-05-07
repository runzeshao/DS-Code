# DS-Code

Install and run the `DS Code` and `DS-Code` binaries from GitHub release artifacts.

## Install

```bash
npm install -g DS-Code
# or
pnpm add -g DS-Code
```

For project-local usage:

```bash
npm install DS-Code
npx DS-Code --help
```

`postinstall` downloads platform binaries into `bin/downloads/` and exposes
`DS Code` and `DS-Code` commands.

## First run

```bash
DS Code login --api-key "YOUR_DS_API_KEY"
DS Code doctor
DS Code
```

The `DS Code` facade and `DS-Code` binary share `~/.ds/config.toml`
for DS Code auth and default model settings. Common TUI commands are available
directly through the facade, including `DS Code doctor`, `DS Code models`,
`DS Code sessions`, and `DS Code resume --last`.

The app talks to DS Code's documented OpenAI-compatible Chat Completions API.
Set `DS_BASE_URL` only if you need the China endpoint or DS Code beta
features such as strict tool mode, chat prefix completion, or FIM completion.

NVIDIA NIM-hosted DS Code V4 Pro is also supported:

```bash
DS Code auth set --provider nvidia-nim --api-key "YOUR_NVIDIA_API_KEY"
DS Code --provider nvidia-nim
```

For a single process, set `DS_PROVIDER=nvidia-nim` and `NVIDIA_API_KEY`
or `NVIDIA_NIM_API_KEY` (with `DS_API_KEY` as a compatibility fallback).
The NIM default model is `DS Code-ai/DS Code-v4-pro` and the default base URL
is `https://integrate.api.nvidia.com/v1`. With `--provider nvidia-nim`,
`--model DS Code-v4-flash` maps to `DS Code-ai/DS Code-v4-flash`.

## Supported platforms

Prebuilt binaries for the GitHub release are downloaded automatically:

- Linux x64
- Linux arm64 (v0.8.8+)
- macOS x64 / arm64
- Windows x64

Other platform/architecture combinations (musl, riscv64, FreeBSD, …) aren't
shipped as prebuilts. The `postinstall` will exit with a clear error pointing
you at `cargo install DS-Code-cli DS-Code --locked` and the full
[docs/INSTALL.md](https://github.com/Hmbown/DS-Code/blob/main/docs/INSTALL.md)
build-from-source guide.

## Configuration

- Default binary version comes from `DS CodeBinaryVersion` in `package.json`.
- Set `DS_TUI_VERSION` or `DS_VERSION` to override the release version.
- Set `DS_TUI_GITHUB_REPO` or `DS_GITHUB_REPO` to override the source repo (defaults to `Hmbown/DS-Code`).
- Set `DS_TUI_RELEASE_BASE_URL` to use an internal or mirrored
  release-asset directory when GitHub Releases is unavailable. The directory
  must contain `DS Code-artifacts-sha256.txt` and the platform binaries.
- Set `DS_TUI_FORCE_DOWNLOAD=1` to force download even when the cached binary is already present.
- Set `DS_TUI_DISABLE_INSTALL=1` to skip install-time download.
- Set `DS_TUI_OPTIONAL_INSTALL=1` to make the `postinstall` step warn and exit `0` on download/extract errors instead of failing `npm install` (useful in CI matrices).

## Release integrity

- `npm publish` runs a release-asset check to ensure all required binary assets
  exist for the target GitHub release before publishing.
- Install-time downloads are verified against the release checksum manifest before
  the wrapper marks them executable.
