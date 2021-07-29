#!/usr/bin/env bash

"${COMPOSE_CMD[@]}" -f docker-compose.dev.traefik.yml build
"${COMPOSE_CMD[@]}" -f docker-compose.dev.traefik.yml up -d
