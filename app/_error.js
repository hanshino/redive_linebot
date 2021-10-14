const Sentry = require("@sentry/node");
// or use es6 import statements
// import * as Sentry from '@sentry/node';

Sentry.init({ dsn: process.env.SENTRY_DSN });

module.exports = async function HandleError(context, props) {
  if (process.env.NODE_ENV === "development") {
    await context.replyText(props.error.stack);
  }

  console.error(props.error);
  // or you can choose not to reply any error messages
  await context.replyText("人家現在忙不過來.. 麻煩再過一段時間再度嘗試！");

  if (process.env.NODE_ENV === "production") {
    Sentry.captureException(props.error);
  }
};
