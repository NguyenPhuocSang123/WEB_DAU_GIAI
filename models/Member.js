const mongoose = require('mongoose');

const memberSchema = new mongoose.Schema(
  {
    teamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      required: true,
      index: true
    },
    fullName: {
      type: String,
      required: true,
      trim: true
    },
    uid: {
      type: String,
      required: true,
      trim: true,
      unique: true
    },
    rank: {
      type: String,
      default: '',
      trim: true
    },
    role: {
      type: String,
      default: '',
      trim: true
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Member', memberSchema);
