const path = require('path');
const express = require('express');
const session = require('express-session');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

const Tournament = require('./models/Tournament');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/lien-quan-tournament';
const isProduction = process.env.NODE_ENV === 'production';

async function ensureTournament() {
  const total = await Tournament.countDocuments();
  if (total > 0) {
    return;
  }

  await Tournament.create({
    name: process.env.TOURNAMENT_NAME || 'Giai Lien Quan Mua He 2026',
    registrationOpenAt: new Date(process.env.REGISTRATION_OPEN_AT || '2026-01-01T00:00:00.000Z'),
    registrationCloseAt: new Date(process.env.REGISTRATION_CLOSE_AT || '2026-12-31T23:59:59.000Z'),
    maxTeams: Number(process.env.MAX_TEAMS || 32),
    status: 'open'
  });
}

function formatDate(value) {
  if (!value) {
    return '';
  }

  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(value));
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

if (isProduction) {
  app.set('trust proxy', 1);
}

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use(
  session({
    secret: process.env.SESSION_SECRET || 'fallback-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProduction,
      sameSite: isProduction ? 'lax' : 'strict',
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

app.use((req, res, next) => {
  res.locals.flash = req.session.flash;
  res.locals.admin = req.session.admin || null;
  res.locals.currentPath = req.path;
  res.locals.formatDate = formatDate;
  delete req.session.flash;
  next();
});

app.use('/', publicRoutes);
app.use('/admin', adminRoutes);

app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use((req, res) => {
  res.status(404).render('404', { title: 'Khong tim thay trang' });
});

async function start() {
  try {
    await mongoose.connect(MONGODB_URI);
    await ensureTournament();
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Khoi dong that bai:', error.message);
    process.exit(1);
  }
}

start();
