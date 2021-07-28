#!/usr/bin/env bash

"${COMPOSE_CMD[@]}" -f docker-compose.dev.yml build
"${COMPOSE_CMD[@]}" -f docker-compose.dev.yml up -d
