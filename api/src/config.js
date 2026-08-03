/* eslint-disable no-undef */
const ENVIRONMENT = process.env.ENVIRONMENT || 'development';
const PORT = process.env.PORT || 8080;
const MONGODB_ENDPOINT = process.env.MONGODB_ENDPOINT;
const SECRET = process.env.SECRET;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';
const SENTRY_DSN = process.env.SENTRY_DSN;

const S3_ENDPOINT = process.env.S3_ENDPOINT || '';
const S3_ACCESSKEYID = process.env.S3_ACCESSKEYID || '';
const S3_SECRETACCESSKEY = process.env.S3_SECRETACCESSKEY || '';

const BREVO_KEY = process.env.BREVO_KEY;

// SSO Joptimiz (OAuth 2.0) — préprod par défaut, prod : JOPTIMIZ_URL=https://login.joptimiz.green
const JOPTIMIZ_URL = process.env.JOPTIMIZ_URL || 'https://account.joptimiz.preprod.allohouston.fr';
const JOPTIMIZ_CLIENT_ID = process.env.JOPTIMIZ_CLIENT_ID || 'evalud';
const JOPTIMIZ_CLIENT_SECRET = process.env.JOPTIMIZ_CLIENT_SECRET;
const JOPTIMIZ_REDIRECT_URI = process.env.JOPTIMIZ_REDIRECT_URI || 'http://localhost:8080/user/sso/joptimiz';

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
  JOPTIMIZ_URL,
  JOPTIMIZ_CLIENT_ID,
  JOPTIMIZ_CLIENT_SECRET,
  JOPTIMIZ_REDIRECT_URI,
};

if (ENVIRONMENT === 'development');

module.exports = CONFIG;
