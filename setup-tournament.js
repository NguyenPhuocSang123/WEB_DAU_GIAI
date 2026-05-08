const mongoose = require('mongoose');
const Tournament = require('./models/Tournament');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/lien-quan-tournament';

async function setupTournament() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const count = await Tournament.countDocuments();
    console.log(`Current tournaments: ${count}`);

    if (count === 0) {
      const tournament = await Tournament.create({
        name: process.env.TOURNAMENT_NAME || 'Giai Lien Quan Mua He 2026',
        registrationOpenAt: new Date(process.env.REGISTRATION_OPEN_AT || '2026-01-01T00:00:00.000Z'),
        registrationCloseAt: new Date(process.env.REGISTRATION_CLOSE_AT || '2026-12-31T23:59:59.000Z'),
        maxTeams: Number(process.env.MAX_TEAMS || 32),
        status: 'open'
      });
      console.log('Created tournament:', tournament);
    } else {
      const tournament = await Tournament.findOne().sort({ createdAt: -1 });
      console.log('Existing tournament:', {
        name: tournament.name,
        status: tournament.status,
        registrationOpenAt: tournament.registrationOpenAt,
        registrationCloseAt: tournament.registrationCloseAt,
        maxTeams: tournament.maxTeams
      });
      
      const now = new Date();
      const isOpen = now >= tournament.registrationOpenAt && now <= tournament.registrationCloseAt;
      console.log(`Registration is ${isOpen ? 'OPEN' : 'CLOSED'}`);
      console.log(`Current time: ${now}`);
      console.log(`Open at: ${tournament.registrationOpenAt}`);
      console.log(`Close at: ${tournament.registrationCloseAt}`);
    }

    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

setupTournament();
