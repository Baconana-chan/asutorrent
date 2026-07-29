# syntax=docker/dockerfile:1
# AsuTorrent — Docker build
#
# NOTE: The current binary always starts a Tauri desktop window.
# A headless/CLI mode (--headless) needs to be implemented in the
# Rust entry point before this image can run standalone on a server.
# For now this Dockerfile compiles the binary for testing purposes.
#
# Build:
#   docker build -f docker/Dockerfile -t asutorrent:latest .
#
# Run (requires X11/Wayland for the Tauri window):
#   docker run --rm -it \
#     -e DISPLAY=$DISPLAY \
#     -v /tmp/.X11-unix:/tmp/.X11-unix \
#     asutorrent:latest

FROM rust:1-slim-bookworm AS builder

# Tauri needs webkit2gtk even for build.rs / tauri-build macro expansion
RUN apt-get update && apt-get install -y \
    libwebkit2gtk-4.1-dev \
    libappindicator3-dev \
    librsvg2-dev \
    libssl-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ── Cache dependencies ──────────────────────────────────────────
# Copy only manifest files so Cargo can fetch/bundle dependencies.
# Cargo.lock must exist in the source tree. Run `cargo generate-lockfile`
# in src-tauri/ if it's missing.
COPY asutorrent/src-tauri/Cargo.toml asutorrent/src-tauri/Cargo.lock asutorrent/src-tauri/build.rs ./

# Create dummy lib.rs and main.rs — the crate type requires both.
RUN mkdir src && \
    printf 'fn main() {}\n' > src/main.rs && \
    printf '#[allow(dead_code)]\nfn _dummy() {}\n' > src/lib.rs && \
    cargo build --release 2>/dev/null || true && \
    rm -rf src

# ── Build the real binary ───────────────────────────────────────
COPY asutorrent/src-tauri/src ./src
COPY asutorrent/src-tauri/icons ./icons
RUN cargo build --release && \
    strip target/release/asutorrent

# =================================================================
FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y \
    ca-certificates tzdata libssl3 libwebkit2gtk-4.1-0 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/target/release/asutorrent /usr/local/bin/asutorrent

EXPOSE 8080
EXPOSE 6881

ENTRYPOINT ["/usr/local/bin/asutorrent"]
# Show help by default until --headless mode is implemented
CMD ["--help"]

LABEL org.opencontainers.image.title="AsuTorrent" \
      org.opencontainers.image.description="BitTorrent client" \
      org.opencontainers.image.version="0.1.0" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.source="https://github.com/Baconana-chan/asutorrent"
