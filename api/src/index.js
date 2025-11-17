require("dotenv").config();
const cors = require("cors");
const express = require("express");
const morgan = require("morgan");
const bodyParser = require("body-parser");
const cookieParser = require("cookie-parser");
const passport = require("passport");
const { initSentry, setupErrorHandler } = require("./services/sentry");
const { PORT, ENVIRONMENT, APP_URL } = require("./config");

const app = express();
initSentry(app);

if (ENVIRONMENT === "development") {
  app.use(morgan("tiny"));
}

require("./services/mongo");

app.use(cors({ credentials: true, origin: [APP_URL, "your production url because sometimes theres a cors issue"] }));
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const lastDeployedAt = new Date();
app.get("/", async (req, res) => {
  res.status(200).send({
    name: "api",
    environment: ENVIRONMENT,
    last_deployed_at: lastDeployedAt.toLocaleString(),
  });
});

app.use("/user", require("./controllers/user"));
app.use("/action", require("./controllers/action"));
app.use("/action_log", require("./controllers/action_log"));
app.use("/collectivity", require("./controllers/collectivity"));
app.use("/dashboard", require("./controllers/dashboard"));
app.use("/indicator", require("./controllers/indicator"));
app.use("/indicator_value", require("./controllers/indicator_value"));
app.use("/indicator_value_log", require("./controllers/indicator_value_log"));
app.use("/indicator_category", require("./controllers/indicator_category"));
// app.use("/excel", require("./controllers/excel"));
app.use("/user_action_right", require("./controllers/user_action_right"));

setupErrorHandler(app);
require("./services/passport")(app);

app.listen(PORT, () => {
  console.log(`App listening on port ${PORT}`);
});
