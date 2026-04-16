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

get-webhook: ## 查詢目前 LINE webhook 設定
	@TOKEN=$$(grep '^LINE_ACCESS_TOKEN=' .env | cut -d'=' -f2-) && \
	curl -s https://api.line.me/v2/bot/channel/webhook/endpoint \
		-H "Authorization: Bearer $$TOKEN" | python3 -m json.tool

get-liff: ## 查詢目前 LIFF 設定
	@TOKEN=$$(grep '^LINE_ACCESS_TOKEN=' .env | cut -d'=' -f2-) && \
	curl -s https://api.line.me/liff/v1/apps \
		-H "Authorization: Bearer $$TOKEN" | python3 -m json.tool

tunnel: ## 一鍵設定 ngrok URL 到 LINE webhook + LIFF
	@NGROK_URL=$$(curl -s http://localhost:4040/api/tunnels | python3 -c "import sys,json;print(json.load(sys.stdin)['tunnels'][0]['public_url'])" 2>/dev/null) && \
	if [ -z "$$NGROK_URL" ]; then echo "❌ ngrok is not running"; exit 1; fi && \
	TOKEN=$$(grep '^LINE_ACCESS_TOKEN=' .env | cut -d'=' -f2-) && \
	if [ -z "$$TOKEN" ]; then echo "❌ LINE_ACCESS_TOKEN not found in .env"; exit 1; fi && \
	WEBHOOK_URL="$$NGROK_URL/webhooks/line" && \
	curl -s -X PUT https://api.line.me/v2/bot/channel/webhook/endpoint \
		-H "Authorization: Bearer $$TOKEN" \
		-H "Content-Type: application/json" \
		-d "{\"endpoint\": \"$$WEBHOOK_URL\"}" > /dev/null && \
	echo "✅ Webhook: $$WEBHOOK_URL" && \
	LIFF_ID=$$(grep '^LINE_LIFF_ID=' .env | cut -d'=' -f2-) && \
	LOGIN_ID=$$(grep '^LINE_LOGIN_CHANNEL_ID=' .env | cut -d'=' -f2-) && \
	LOGIN_SECRET=$$(grep '^LINE_LOGIN_CHANNEL_SECRET=' .env | cut -d'=' -f2-) && \
	if [ -n "$$LIFF_ID" ] && [ -n "$$LOGIN_ID" ] && [ -n "$$LOGIN_SECRET" ]; then \
		LIFF_TOKEN=$$(curl -s -X POST https://api.line.me/oauth2/v3/token \
			-d "grant_type=client_credentials&client_id=$$LOGIN_ID&client_secret=$$LOGIN_SECRET" \
			| python3 -c "import sys,json;print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null) && \
		if [ -n "$$LIFF_TOKEN" ]; then \
			curl -s -X PUT "https://api.line.me/liff/v1/apps/$$LIFF_ID" \
				-H "Authorization: Bearer $$LIFF_TOKEN" \
				-H "Content-Type: application/json" \
				-d "{\"view\":{\"type\":\"full\",\"url\":\"$$NGROK_URL\"}}" > /dev/null && \
			echo "✅ LIFF:    $$NGROK_URL ($$LIFF_ID)"; \
		else \
			echo "❌ Failed to issue LINE Login token, check LINE_LOGIN_CHANNEL_ID/SECRET"; \
		fi; \
	else \
		echo "⚠️  LIFF update skipped (missing LINE_LIFF_ID or LINE_LOGIN_CHANNEL_ID/SECRET)"; \
	fi

help: ## 顯示所有可用指令
	@sed \
		-e '/^[a-zA-Z0-9_\-]*:.*##/!d' \
		-e 's/:.*##\s*/:/' \
		-e 's/^\(.\+\):\(.*\)/$(shell tput setaf 6)\1$(shell tput sgr0):\2/' \
		$(MAKEFILE_LIST) | sort | column -c2 -t -s :
