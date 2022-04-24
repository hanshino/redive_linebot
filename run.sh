#!/usr/bin/env bash

export COMPOSE_CMD=("docker-compose")

"${COMPOSE_CMD[@]}" -f docker-compose.traefik.yml build
"${COMPOSE_CMD[@]}" -f docker-compose.traefik.yml up -d