# Docker

Docker support is currently a local-build/devcontainer path, not a supported
release channel. The release workflow may try an experimental GHCR publish, but
no public `ghcr.io/hmbown/DS-Code` image should be treated as available
until this page says so.

## Local quick start

Build the image locally from a checkout:

```bash
docker build -t DS-Code .
```

Then run it with your existing config directory mounted:

```bash
docker run --rm -it \
  -e DS_API_KEY="$DS_API_KEY" \
  -v ~/.ds:/home/deepseek/.ds \
  DS-Code
```

Docker Hub publishing is not configured.

## Environment variables

| Variable              | Required | Description                                      |
|-----------------------|----------|--------------------------------------------------|
| `DS_API_KEY`    | yes      | DeepSeek API key                                 |
| `DS_BASE_URL`   | no       | Custom API base URL (e.g. `https://api.deepseek.com`) |
| `DS_NO_COLOR`   | no       | Set to `1` to disable terminal colour output     |

## Volumes

Mount `~/.ds` to persist sessions, config, skills, memory, and the offline queue
across container restarts:

```bash
-v ~/.ds:/home/deepseek/.ds
```

Without this mount the container starts fresh each time.

## Non-interactive / pipeline usage

When stdin is not a TTY, `deepseek` drops to the dispatcher's one-shot mode
(`deepseek -c "…"`). Pipe a prompt on stdin:

```bash
echo "Explain the Cargo.toml in structured English." | \
  docker run --rm -i -e DS_API_KEY DS-Code
```

## Building locally

```bash
# Single platform (your host architecture)
docker build -t DS-Code .

# Multi-platform (requires a builder with emulation)
docker buildx create --use
docker buildx build --platform linux/amd64,linux/arm64 -t DS-Code .
```

## Devcontainer

The repository includes a [`.devcontainer/devcontainer.json`](../.devcontainer/devcontainer.json)
configuration for VS Code / GitHub Codespaces. It pre-installs the Rust toolchain,
rust-analyzer, and the `deepseek` binary. Open the repo in a devcontainer to get a
ready-to-use development environment.

## Release status

Docker image publishing is experimental and non-blocking for releases. The
supported distribution channels are npm, Cargo, Homebrew, GitHub Release
assets, and Scoop's independently maintained main-bucket manifest.
