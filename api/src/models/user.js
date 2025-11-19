
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const MODELNAME = "user";

const Schema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    email: { type: String, required: true, unique: true, trim: true },
    password: { type: String, default: "Interlud2025" },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    password_reset_token: { type: String, default: "" },
    password_reset_expires: { type: Date },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    collectivities : [{ 
      id : String, 
      name : String, 
      role : { type: String, enum: ["user", "admin", "actor"], default: "user" },
      status: { type: String, enum: ["pending", "approved", "rejected"]},
    }],

  },
  { timestamps: true },
);

Schema.pre("save", function (next) {
  if (this.isModified("password") || this.isNew) {
    bcrypt.hash(this.password, 10, (e, hash) => {
      this.password = hash;
      return next();
    });
  } else {
    return next();
  }
});

Schema.methods.comparePassword = function (p) {
  return bcrypt.compare(p, this.password || "");
};
const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
