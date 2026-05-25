# syntax=docker/dockerfile:1.4

FROM rust:1.82-bookworm AS builder

ARG GOOSE_REPO=https://github.com/aaif-goose/goose
ARG GOOSE_REF=ba16de9738ec5bc319adbddeb9dd6523475fc7c0

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      cmake \
      git \
      libclang-dev \
      libdbus-1-dev \
      libprotobuf-dev \
      libssl-dev \
      pkg-config \
      protobuf-compiler && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /build
RUN git clone "${GOOSE_REPO}" goose && \
    cd goose && \
    git checkout "${GOOSE_REF}"
WORKDIR /build/goose

ENV CARGO_REGISTRIES_CRATES_IO_PROTOCOL=sparse
ENV CARGO_PROFILE_RELEASE_LTO=true
ENV CARGO_PROFILE_RELEASE_CODEGEN_UNITS=1
ENV CARGO_PROFILE_RELEASE_OPT_LEVEL=z
ENV CARGO_PROFILE_RELEASE_STRIP=true

RUN cargo build --release \
      --package goose-server \
      --bin goosed \
      --no-default-features \
      --features portable-default

FROM debian:bookworm-slim@sha256:b1a741487078b369e78119849663d7f1a5341ef2768798f7b7406c4240f86aef

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      bash \
      ca-certificates \
      curl \
      git \
      libdbus-1-3 \
      libgomp1 \
      libssl3 \
      libxcb1 && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/goose/target/release/goosed /usr/local/bin/goosed

RUN useradd -m -u 1000 -s /bin/bash goose && \
    mkdir -p /data/home /data/workspace && \
    chown -R goose:goose /data /home/goose

ENV PATH="/usr/local/bin:${PATH}"
ENV HOME="/data/home"
WORKDIR /data/workspace

CMD ["/usr/local/bin/goosed", "agent"]
