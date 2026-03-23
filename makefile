infra: ## 啟動基礎設施（MySQL、Redis）
	@docker compose up -d mysql redis

infra-stop: ## 停止基礎設施
	@docker compose down

dev: infra ## 啟動開發環境（基礎設施 + app + frontend）
	@echo "基礎設施已啟動"
	@echo "請在各自目錄執行 yarn dev："
	@echo "  cd app && yarn dev"
	@echo "  cd frontend && yarn dev"

migrate: ## 執行資料庫 migration
	@cd app && yarn migrate

logs: ## 查看基礎設施日誌
	@docker compose logs -f

bash-redis: ## 開啟 Redis CLI
	@docker compose exec -t redis redis-cli

ngrok-url: ## 查詢 ngrok 公開網址
	@curl -s http://localhost:4040/api/tunnels | python3 -c "import sys,json;print(json.load(sys.stdin)['tunnels'][0]['public_url'])" 2>/dev/null || echo "ngrok is not running"

help: ## 顯示所有可用指令
	@sed \
		-e '/^[a-zA-Z0-9_\-]*:.*##/!d' \
		-e 's/:.*##\s*/:/' \
		-e 's/^\(.\+\):\(.*\)/$(shell tput setaf 6)\1$(shell tput sgr0):\2/' \
		$(MAKEFILE_LIST) | sort | column -c2 -t -s :
