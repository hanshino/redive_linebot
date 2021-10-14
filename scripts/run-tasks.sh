#!/usr/bin/env bash

set -eo pipefail
shopt -s extglob

function get_container_id {
    "${COMPOSE_CMD[@]}" ps -q "${1}"
}

export PARENT_DIR

EXEC_PATH="${BASH_SOURCE[0]}"
[ -L "${BASH_SOURCE[0]}" ] && EXEC_PATH="$(readlink "${BASH_SOURCE[0]}")"
PARENT_DIR="$(dirname "${EXEC_PATH}")"
PARENT_DIR="$(cd "${PARENT_DIR}" && cd ../ && pwd)"

export TASK_SECTION="${1}"
export PROJECT_NAME="${PROJECT_NAME:-}"

export COMPOSE_CMD=("docker-compose")

if [[ ! -z "${PROJECT_NAME}" ]]; then
    COMPOSE_CMD+=("-p" "${PROJECT_NAME}")
fi

export COMPOSE_RUN_CMD=("${COMPOSE_CMD[@]}" "run" "--rm")
export COMPOSE_EXEC_CMD=("${COMPOSE_CMD[@]}" "exec" "-T")

echo "running task section - [ ${TASK_SECTION} ]."
SCRIPT_FOLDER="${PARENT_DIR}/scripts/${TASK_SECTION}"
if [[ ! -d "${SCRIPT_FOLDER}" ]]; then
    echo "task section folder is not exists. exit."
    exit 1
fi

SCRIPT_FILES=(${SCRIPT_FOLDER}/*.sh)
for task in "${SCRIPT_FILES[@]}"; do
    filename="${task##*/}"
    echo ""
    echo "running task ${filename%.*} ..."
    echo ""
    # shellcheck disable=SC1090
    source "${task}" "$@"
    echo ""
done

exit 0
