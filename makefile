build-images: ## 打包所有 Docker images
	@echo "Building images..."
	@docker compose build

build-project: ## 專案環境建置
	@echo "Installing nodejs dependencies..."
	@echo "Backend dependencies..."
	@docker compose run --rm --no-deps bot yarn install
	@echo "Frontend dependencies..."
	@docker compose run --rm --no-deps frontend yarn install
	@echo "Crontab dependencies..."
	@docker compose run --rm --no-deps crontab yarn install

pull-images: ## 拉取所有 Docker images 至最新版本
	@echo "Pulling images..."
	@docker compose pull

build: pull-images build-images build-project ## 拉取所有 Docker images 至最新版本，並打包所有 Docker images

run: ## 啟動專案
	@echo "Running the project..."
	@docker compose up -d

bash: ## 執行 app container 的 bash
	@echo "Opening bash..."
	@docker compose exec -t bot bash

logs: ## 顯示所有 container 的 log
	@echo "Showing logs..."
	@docker compose logs -f

bash-redis: ## 執行 redis container 的 bash
	@echo "Opening bash..."
	@docker compose exec -t redis redis-cli

ngrok-url: ## 查詢 ngrok 公開網址
	@curl -s http://localhost:4040/api/tunnels | python3 -c "import sys,json;print(json.load(sys.stdin)['tunnels'][0]['public_url'])" 2>/dev/null || echo "ngrok is not running"

help: ## 顯示所有可用指令
	@sed \
		-e '/^[a-zA-Z0-9_\-]*:.*##/!d' \
		-e 's/:.*##\s*/:/' \
		-e 's/^\(.\+\):\(.*\)/$(shell tput setaf 6)\1$(shell tput sgr0):\2/' \
		$(MAKEFILE_LIST) | sort | column -c2 -t -s :
