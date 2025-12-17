const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MODELNAME = 'user';

const Schema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    email: { type: String, required: true, unique: true, trim: true },
    password: { type: String, default: 'Interlud2025' },
    role: { type: String, enum: ['user', 'admin', 'economic_actor'], default: 'user' },
    password_reset_token: { type: String, default: '' },
    password_reset_expires: { type: Date },
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    collectivities: [
      {
        id: String,
        name: String,
        role: { type: String, enum: ['user', 'admin', 'economic_actor'], default: 'user' },
        status: { type: String, enum: ['pending', 'approved', 'rejected'] },
      },
    ],
    economic_actor_id: { type: String, default: '', trim: true },
    economic_actor_name: { type: String, trim: true },

    invitation_token: { type: String, default: '' },
    invitation_token_expires: { type: Date },
    invitation_sent_at: { type: Date },
    invitation_accepted_at: { type: Date },
    last_login_at: { type: Date },
  },
  { timestamps: true }
);

Schema.pre('save', function (next) {
  if (this.isModified('password') || this.isNew) {
    bcrypt.hash(this.password, 10, (e, hash) => {
      this.password = hash;
      return next();
    });
  } else {
    return next();
  }
});

Schema.methods.comparePassword = function (p) {
  return bcrypt.compare(p, this.password || '');
};
const OBJ = mongoose.model(MODELNAME, Schema);
module.exports = OBJ;
