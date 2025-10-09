const ENVIRONMENT = getEnvironment();

let API_URL = "";
let APP_URL = "";

if (ENVIRONMENT === "development") {
  API_URL = "http://localhost:8080";
  APP_URL = "http://localhost:3000";
}

if (ENVIRONMENT === "production") {
  APP_URL = "https://talent-r-app.cleverapps.io/ ";
  API_URL = "https://talent-r-api.cleverapps.io/";
}

const SENTRY_URL = "https://84e1a8e74a5da2bbdb86adefd51e5a68@sentry.selego.co/153";
const PAPERS_API_KEY = "071d3e22c9571fb4ecf0d52fd78015d91b3d83ec635e378e";
const PAPERS_API_BASE_URL = "https://api.pappers.fr/v1";

function getEnvironment() {
  if (window.location.href.indexOf("app-staging") !== -1) return "staging";
  if (window.location.href.indexOf("localhost") !== -1 || window.location.href.indexOf("127.0.0.1") !== -1) return "development";
  return "production";
}

export { API_URL, APP_URL, SENTRY_URL, ENVIRONMENT, PAPERS_API_KEY, PAPERS_API_BASE_URL };
