import {
  init,
  withSentryRouting,
  captureException as sentryCaptureException,
  captureMessage as sentryCaptureMessage,
  makeBrowserOfflineTransport,
  makeFetchTransport,
  SeverityLevel,
} from "@sentry/react";
import { environment, SENTRY_URL } from "../config";
import { Route } from "react-router-dom";

interface CaptureContext {
  level?: SeverityLevel;
  tags?: Record<string, string>;
  extra?: Record<string, any>;
  [key: string]: any;
}

const SentryRoute = withSentryRouting(Route);

function initSentry(): void {
  if (environment === "production") {
    init({
      enabled: Boolean(SENTRY_URL),
      dsn: SENTRY_URL,
      environment: "app-prod",
      normalizeDepth: 16,
      transport: makeBrowserOfflineTransport(makeFetchTransport),
      tracesSampleRate: Number(1.0),
    });
  }
}

function capture(err: unknown, contexte: CaptureContext = {}): void {
  if (!err) {
    sentryCaptureMessage("Error not defined");
    return;
  }

  if (err instanceof Error) {
    sentryCaptureException(err, contexte);
  } else if (typeof err === 'object' && err !== null && 'error' in err && err.error instanceof Error) {
    sentryCaptureException(err.error, contexte);
  } else if (typeof err === 'object' && err !== null && 'message' in err && typeof err.message === 'string') {
    sentryCaptureMessage(err.message, contexte);
  } else {
    sentryCaptureMessage("Error not defined well", { extra: { error: err, contexte: contexte } });
  }
}
function captureMessage(mess: string | null | undefined, contexte?: CaptureContext): void {
  if (!mess) {
    sentryCaptureMessage("Message not defined");
    return;
  }

  sentryCaptureMessage(mess, contexte);
}

export { initSentry, capture, captureMessage, SentryRoute };
