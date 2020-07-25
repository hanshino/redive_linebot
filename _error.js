const Sentry = require("@sentry/node");
// or use es6 import statements
// import * as Sentry from '@sentry/node';

Sentry.init({ dsn: process.env.SENTRY_DSN });

module.exports = async function HandleError(context, props) {
  if (process.env.NODE_ENV === "development") {
    await context.sendText(props.error.stack);
  }

  console.error(props.error);
  // or you can choose not to reply any error messages
  await context.sendText(
    "There are some unexpected errors happened. Please try again later, sorry for the inconvenience."
  );

  if (process.env.NODE_ENV === "production") {
    Sentry.captureException(props.error);
  }
};
