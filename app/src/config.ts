const environment = getEnvironment();

let API_URL = "";
if (environment === "development") API_URL = "http://localhost:8080";
if (environment === "production") API_URL = "https://api.social.pertinence.app";

const SENTRY_URL = "https://7b5d1c08be9fcd7254a4d39cc00a79de@sentry.selego.co/208";

function getEnvironment() {
  if (window.location.href.indexOf("app-staging") !== -1) return "staging";
  if (window.location.href.indexOf("localhost") !== -1 || window.location.href.indexOf("127.0.0.1") !== -1) return "development";
  return "production";
}

export { API_URL, SENTRY_URL, environment };
