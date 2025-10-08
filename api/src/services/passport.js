const passport = require("passport");
const JwtStrategy = require("passport-jwt").Strategy;
const ExtractJwt = require("passport-jwt").ExtractJwt;
const { SECRET } = require("../config");

// load up the user model
const User = require("../models/user");
const Admin = require("../models/admin");

function getToken(req) {
  let token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
  if (!token) token = req.cookies.jwt;
  return token;
}

module.exports = function () {
  const opts = {};
  opts.jwtFromRequest = getToken;
  opts.secretOrKey = SECRET;

  passport.use(
    "user",
    new JwtStrategy(opts, async function (jwtPayload, done) {
      try {
        if (!jwtPayload._id) return done(null, false);
        const user = await User.findOne({ _id: jwtPayload._id });
        if (user) return done(null, user);
        else return done(null, false);
      } catch (error) {
        console.log(error);
      }
      return done(null, false);
    }),
  );

  passport.use(
    "admin",
    new JwtStrategy(opts, async function (jwtPayload, done) {
      try {
        if (!jwtPayload._id) return done(null, false);
        const admin = await Admin.findOne({ _id: jwtPayload._id });
        if (admin) return done(null, admin);
        else return done(null, false);
      } catch (error) {
        console.log(error);
      }
      return done(null, false);
    }),
  );
};
