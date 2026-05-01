# Local Dev Execution — No Docker Container Needed

## The Insight
This codebase can run Node.js scripts and Knex migrations directly from the host machine without a bot Docker container. The key is running from the correct directory (`app/`) with the right env loading.

## Why This Matters
Without this knowledge, you'll waste time trying to exec into Docker containers that may not be running, or get confusing errors like `Configuration property "X" is not defined` or `Access denied for user ''@'172.19.0.1'`.

## Recognition Pattern
- Need to run a one-off Node.js script (create race, settle bets, query data)
- Need to run Knex migrations
- Bot container (`redive_linebot-bot-1`) is not running
- Errors: `Configuration property "..." is not defined`, DB access denied

## The Approach
1. **Always `cd app/`** before running scripts — config module needs `app/config/default.json` in cwd
2. **Knex migrations**: `npx knex migrate:latest` from `app/` — knexfile.js uses dotenv to load `../.env` automatically
3. **Custom scripts**: Use `require('dotenv').config({ path: '../.env' })` at the top, then require service/model files normally
4. **MySQL is accessible** at `localhost:3306` from host — Docker exposes the port, credentials are in `.env` (`DB_USER`, `DB_USER_PASSWORD`)
5. **SQLite game data** (`app/assets/redive_tw.db`) is accessible directly without Docker

## Example
```js
// From app/ directory:
node -e "
require('dotenv').config({ path: '../.env' });
const RaceService = require('./src/service/RaceService');
(async () => {
  const raceId = await RaceService.createRace();
  console.log('Created race', raceId);
  process.exit(0);
})();
"
```

Infrastructure containers (mysql, redis) must be running, but the app container is NOT required.
