const Sentry = require("@sentry/node");
// or use es6 import statements
// import * as Sentry from '@sentry/node';

Sentry.init({ dsn: process.env.SENTRY_DSN });

module.exports = async function HandleError(context, props) {
  console.error(props.error.stack);

  if (process.env.NODE_ENV === "production") {
    Sentry.captureException(props.error);
  }
};
