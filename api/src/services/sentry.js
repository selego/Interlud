const Sentry = require("@sentry/node");
const Tracing = require("@sentry/tracing");
const { ENVIRONMENT, SENTRY_DSN } = require("../config");

function initSentry(app) {
  if (ENVIRONMENT === "production" && SENTRY_DSN) {
    Sentry.init({
      dsn: SENTRY_DSN,
      environment: "server",
      integrations: [new Sentry.Integrations.Http({ tracing: true }), new Tracing.Integrations.Express({ app })],
      tracesSampleRate: 1.0,
    });

    app.use(Sentry.Handlers.requestHandler());
    app.use(Sentry.Handlers.tracingHandler());

    console.log("Sentry initialized");
  }
}

function setupErrorHandler(app) {
  if (ENVIRONMENT === "production") {
    app.use(Sentry.Handlers.errorHandler());
  }
}

function capture(err) {
  console.log("capture", err);
  if (Sentry && err) {
    Sentry.captureException(err);
  }
}

module.exports = {
  initSentry,
  setupErrorHandler,
  capture,
};
