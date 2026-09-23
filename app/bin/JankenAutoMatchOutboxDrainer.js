const JankenAutoMatchOutboxService = require("../src/service/JankenAutoMatchOutboxService");
const { DefaultLogger } = require("../src/util/Logger");

async function main() {
  const result = await JankenAutoMatchOutboxService.drain();
  DefaultLogger.info(
    `[JankenAutoMatchOutboxDrainer] processed=${result.processed} failed=${result.failed}`
  );
  return result;
}

module.exports = main;
