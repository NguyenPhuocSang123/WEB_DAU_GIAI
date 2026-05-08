const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema(
  {
    tournamentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tournament',
      required: true,
      index: true
    },
    round: {
      type: Number,
      required: true,
      min: 1,
      index: true
    },
    matchIndex: {
      type: Number,
      required: true,
      min: 1,
      index: true
    },
    // order giúp admin sắp xếp lịch thi đấu theo ý muốn
    order: {
      type: Number,
      required: true,
      index: true
    },
    startAt: {
      type: Date,
      default: null
    },

    homeSlotType: {
      type: String,
      enum: ['team', 'winner'],
      required: true
    },
    homeTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null
    },
    homeFromMatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      default: null
    },

    awaySlotType: {
      type: String,
      enum: ['team', 'winner'],
      required: true
    },
    awayTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Team',
      default: null
    },
    awayFromMatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Match', matchSchema);

