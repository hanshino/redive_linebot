const express = require("express");
const { middleware, SignatureValidationFailed, JSONParseError } = require("@line/bot-sdk");
const { LineContext } = require("./context");
const { run } = require("./router");

function createWebhookHandler({
  app: entry,
  errorHandler,
  client,
  store,
  initialState,
  channelSecret,
  logger = console,
}) {
  if (typeof entry !== "function") throw new TypeError("Missing native bot entry action");
  const handler = express.Router();
  const pending = new Set();
  let closing = false;

  function report(phase, error) {
    // Do not dump SDK errors: they can carry request headers/access tokens.
    try {
      logger.error("Native webhook failure", { phase, name: error?.name, code: error?.code });
    } catch {
      // Logging failures must not turn already-ACKed work into unhandled rejections.
    }
  }

  async function processEvent(rawEvent, destination, source) {
    let phase = "read";
    try {
      const state = await store.read(source);
      const context = new LineContext({
        client,
        rawEvent,
        destination,
        state,
        initialState,
        logger,
      });
      phase = "handler";
      try {
        await run(entry, context);
        phase = "reply";
        await context.handlerDidEnd();
      } catch (error) {
        if (!errorHandler) throw error;
        phase = "errorHandler";
        // Bottender Bot.js:174-178 drives the error action with exactly { error }.
        await run(errorHandler, context, { error });
      }
      phase = "write";
      context.isSessionWritten = true;
      await store.write(source, context.state);
    } catch (error) {
      report(phase, error);
    }
  }

  handler.post(
    "/",
    (req, res, next) => (closing ? res.sendStatus(503) : next()),
    middleware({ channelSecret }),
    (req, res) => {
      const body = req.body;
      if (
        !body ||
        !Array.isArray(body.events) ||
        (body.destination !== undefined && typeof body.destination !== "string") ||
        body.events.some(event => !event || typeof event.type !== "string" || !event.type)
      ) {
        return res.sendStatus(400);
      }
      // A request may have been reading its body when drain started.
      if (closing) return res.sendStatus(503);
      const events = [];
      for (const event of body.events) {
        if (typeof event.replyToken === "string" && /^(0+|f+)$/.test(event.replyToken)) continue;
        try {
          store.sourceKey(event.source);
          // Capture the queue/persistence identity before middleware enriches rawEvent.source.
          events.push({ event, source: { ...event.source } });
        } catch (error) {
          report("source", error);
        }
      }
      res.status(200).end();
      if (!events.length) return;
      // Track the scheduled callback too: store.drain alone misses ACKed, not-yet-enqueued work.
      const work = new Promise(resolve => setImmediate(resolve))
        .then(() =>
          Promise.all(
            events.map(({ event, source }) =>
              store.runSerial(source, () => processEvent(event, body.destination, source))
            )
          )
        )
        .catch(error => report("queue", error));
      pending.add(work);
      work.then(() => pending.delete(work));
    }
  );
  handler.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status =
      error instanceof SignatureValidationFailed
        ? 401
        : error instanceof JSONParseError
          ? 400
          : 500;
    if (status === 500) report("request", error);
    return res.sendStatus(status);
  });
  handler.drain = async () => {
    closing = true;
    await Promise.all(pending);
    await store.drain();
  };
  return handler;
}

function mountWebhook(server, options) {
  const handler = createWebhookHandler(options);
  server.use("/webhooks/line", handler);
  return handler;
}

module.exports = { createWebhookHandler, mountWebhook };
