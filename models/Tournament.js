const mongoose = require('mongoose');

const tournamentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    registrationOpenAt: {
      type: Date,
      required: true
    },
    registrationCloseAt: {
      type: Date,
      required: true
    },
    maxTeams: {
      type: Number,
      required: true,
      min: 1
    },
    status: {
      type: String,
      enum: ['draft', 'open', 'closed'],
      default: 'open'
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Tournament', tournamentSchema);
