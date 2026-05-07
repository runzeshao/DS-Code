# syntax=docker/dockerfile:1
# DS-Code multi-arch Docker image (#501)
#
# Build:  docker buildx build --platform linux/amd64,linux/arm64 -t DS-Code:latest .
# Run:    docker run --rm -it -e DS_API_KEY -v ~/.ds:/home/ds/.ds DS-Code
#
# The image ships both binaries (ds dispatcher + DS-Code runtime)
# in a minimal runtime layer. No MCP servers or heavy toolchains are included
# — keep it slim.
#
# API keys MUST be passed at runtime (never baked into the image):
#   docker run --rm -it -e DS_API_KEY DS-Code
# Or mount an env file:
#   docker run --rm -it --env-file .env DS-Code

ARG RUST_VERSION=1.88

# ── Stage 1: Build ────────────────────────────────────────────────────
FROM --platform=$BUILDPLATFORM rust:${RUST_VERSION}-slim-bookworm AS builder
ARG TARGETPLATFORM
ARG BUILDPLATFORM

RUN apt-get update && apt-get install -y --no-install-recommends \
    pkg-config libdbus-1-dev \
    && rm -rf /var/lib/apt/lists/*

# Translate Docker platform into Rust target triple.
# linux/amd64  → x86_64-unknown-linux-gnu
# linux/arm64  → aarch64-unknown-linux-gnu
RUN case "${TARGETPLATFORM}" in \
      linux/amd64)  echo x86_64-unknown-linux-gnu  > /rust-target ;; \
      linux/arm64)  echo aarch64-unknown-linux-gnu > /rust-target ;; \
      *)            echo "Unsupported platform: ${TARGETPLATFORM}" >&2; exit 1 ;; \
    esac

RUN rustup target add "$(cat /rust-target)"

WORKDIR /build
COPY . .

# Build both binaries for the target platform.  --locked ensures
# reproducible builds from the committed lockfile.
RUN --mount=type=cache,target=/build/target \
    --mount=type=cache,target=/usr/local/cargo/registry \
    cargo build --release --locked --target "$(cat /rust-target)" \
    && mkdir -p /out \
    && cp target/$(cat /rust-target)/release/ds /out/ \
    && cp target/$(cat /rust-target)/release/DS-Code /out/

# ── Stage 2: Runtime ──────────────────────────────────────────────────
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libdbus-1-3 \
    && rm -rf /var/lib/apt/lists/*

# Non-root user with explicit UID/GID for filesystem ownership clarity.
RUN groupadd --gid 1000 ds \
    && useradd --create-home --shell /bin/bash --uid 1000 --gid 1000 ds
USER ds
WORKDIR /home/ds

COPY --from=builder --chown=ds:ds /out/ds /usr/local/bin/ds
COPY --from=builder --chown=ds:ds /out/DS-Code /usr/local/bin/DS-Code

# The dispatcher expects to find its companion binary next to it.
# Both are in /usr/local/bin — no further path setup needed.

ENTRYPOINT ["ds"]
CMD []
