#!/usr/bin/env bash

"${COMPOSE_CMD[@]}" -f docker-compose.traefik.yml pull
"${COMPOSE_CMD[@]}" -f docker-compose.traefik.yml build
"${COMPOSE_CMD[@]}" -f docker-compose.traefik.yml up -d
"${COMPOSE_CMD[@]}" -f docker-compose.traefik.yml restart bot
# Wait for the MySQL to start
sleep 10
"${COMPOSE_CMD[@]}" -f docker-compose.traefik.yml exec -T bot yarn migrate
