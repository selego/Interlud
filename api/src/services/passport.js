const passport = require("passport");
const JwtStrategy = require("passport-jwt").Strategy;
const ExtractJwt = require("passport-jwt").ExtractJwt;
const { SECRET } = require("../config");
const Sentry = require("@sentry/node");
const User = require("../models/user");

function getToken(req) {
  let token = ExtractJwt.fromAuthHeaderWithScheme("JWT")(req);
  if (!token) token = req.cookies.jwt;
  return token;
}

module.exports = function (app) {
  const opts = {};
  opts.jwtFromRequest = getToken;
  opts.secretOrKey = SECRET;

  passport.use(
    "user",
    new JwtStrategy(opts, async function (jwtPayload, done) {
      try {
        const user = await User.findOne({ _id: jwtPayload._id });
        if (!user) return done(null, false);
        if (user.role !== "user") return done(null, false);
        Sentry.setUser({ id: user._id.toString(), username: user.first_name + user.last_name, email: user.email });
        return done(null, user);
      } catch (error) {
        return done(error, false);
      }
    }),
  );

  passport.use(
    "admin",
    new JwtStrategy(opts, async function (jwtPayload, done) {
      try {
        const user = await User.findOne({ _id: jwtPayload._id });
        if (!user) return done(null, false);
        if (user.role !== "admin") return done(null, false);
        Sentry.setUser({ id: user._id.toString(), username: user.first_name + user.last_name, email: user.email });
        return done(null, user);
      } catch (error) {
        return done(error, false);
      }
    }),
  );

  app.use(passport.initialize());
};
