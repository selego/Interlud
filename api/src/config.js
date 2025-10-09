/* eslint-disable no-undef */
const ENVIRONMENT = process.env.ENVIRONMENT || "development";
const PORT = process.env.PORT || 8080;
const MONGODB_ENDPOINT = process.env.MONGODB_ENDPOINT;
const SECRET = process.env.SECRET || "not-so-secret";
const APP_URL = process.env.APP_URL || "http://localhost:3000";
const SENTRY_DSN = process.env.SENTRY_DSN || "https://cb113131239df8207706baaf99145330@sentry.selego.co/212";

const S3_ENDPOINT = process.env.S3_ENDPOINT || "";
const S3_ACCESSKEYID = process.env.S3_ACCESSKEYID || "";
const S3_SECRETACCESSKEY = process.env.S3_SECRETACCESSKEY || "";

const BREVO_KEY = process.env.BREVO_KEY || "";

const CONFIG = {
  ENVIRONMENT,
  PORT,
  MONGODB_ENDPOINT,
  SECRET,
  APP_URL,
  SENTRY_DSN,
  S3_ENDPOINT,
  S3_ACCESSKEYID,
  S3_SECRETACCESSKEY,
  BREVO_KEY,
};

if (ENVIRONMENT === "development") console.log(CONFIG);

module.exports = CONFIG;
