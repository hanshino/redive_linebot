#!/usr/bin/env bash

"${COMPOSE_CMD[@]}" -f docker-compose.traefik.yml build
"${COMPOSE_CMD[@]}" -f docker-compose.traefik.yml up -d
