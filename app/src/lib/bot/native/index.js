const { chain, withProps, router, route, text, line } = require("./router");
const { Context, LineContext } = require("./context");
const { getClient } = require("./client");

let stateStore;
function getStateStore() {
  if (!stateStore) {
    const { createStateStore } = require("./state-store");
    stateStore = createStateStore({ redis: require("../../../util/redis") });
  }
  return stateStore;
}

function clearLineSession(groupId) {
  const store = getStateStore();
  const source = { type: "group", groupId };
  return store.runSerial(source, () => store.destroy(source));
}

function mountWebhook(server, options) {
  return require("./server").mountWebhook(server, {
    ...options,
    client: options.client || getClient("line"),
    store: getStateStore(),
  });
}

module.exports = {
  chain,
  withProps,
  getClient,
  Context,
  LineContext,
  router,
  route,
  text,
  line,
  clearLineSession,
  mountWebhook,
};
