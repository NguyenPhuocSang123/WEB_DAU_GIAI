const mongoose = require('mongoose');
const Tournament = require('./models/Tournament');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/lien-quan-tournament';

async function updateTournament() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Update the tournament to have registration open now
    const result = await Tournament.findOneAndUpdate(
      { name: 'Trầu nhậu' },
      {
        registrationOpenAt: new Date('2026-01-01T00:00:00.000Z'),
        registrationCloseAt: new Date('2026-12-31T23:59:59.000Z'),
        status: 'open'
      },
      { new: true }
    );

    if (result) {
      console.log('Updated tournament:', {
        name: result.name,
        status: result.status,
        registrationOpenAt: result.registrationOpenAt,
        registrationCloseAt: result.registrationCloseAt,
        maxTeams: result.maxTeams
      });
    } else {
      console.log('Tournament not found');
    }

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

updateTournament();
