const path = require('path');
const express = require('express');
const multer = require('multer');

const Tournament = require('../models/Tournament');
const Team = require('../models/Team');
const Member = require('../models/Member');

const router = express.Router();

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', 'uploads'),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/\s+/g, '-').toLowerCase();
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 }
});

function normalizeName(value) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validPhone(value) {
  return /^(\+84|0)\d{9,10}$/.test(value);
}

function getRoster(body) {
  const names = Array.isArray(body.memberName) ? body.memberName : [body.memberName];
  const uids = Array.isArray(body.memberUid) ? body.memberUid : [body.memberUid];
  const ranks = Array.isArray(body.memberRank) ? body.memberRank : [body.memberRank];
  const roles = Array.isArray(body.memberRole) ? body.memberRole : [body.memberRole];

  return names
    .map((name, index) => ({
      fullName: (name || '').trim(),
      uid: (uids[index] || '').trim(),
      rank: (ranks[index] || '').trim(),
      role: (roles[index] || '').trim()
    }))
    .filter((member) => member.fullName || member.uid || member.rank || member.role);
}

async function getTournamentState() {
  const tournament = await Tournament.findOne().sort({ createdAt: -1 });
  const approvedTeams = await Team.countDocuments({ tournamentId: tournament?._id, status: 'approved' });
  const totalTeams = await Team.countDocuments({ tournamentId: tournament?._id });
  return { tournament, approvedTeams, totalTeams };
}

router.get('/', async (req, res) => {
  const { tournament, approvedTeams, totalTeams } = await getTournamentState();
  res.render('home', {
    title: 'Trang chu',
    tournament,
    approvedTeams,
    totalTeams
  });
});

router.get('/register', async (req, res) => {
  const { tournament, totalTeams } = await getTournamentState();
  res.render('register', {
    title: 'Dang ky doi',
    tournament,
    totalTeams,
    formData: null,
    errors: []
  });
});

router.post('/register', upload.single('logo'), async (req, res) => {
  const { tournament, totalTeams } = await getTournamentState();
  const errors = [];

  if (!tournament) {
    errors.push('Chua co giai dau nao duoc cau hinh.');
  }

  const teamName = (req.body.teamName || '').trim();
  const area = (req.body.area || '').trim();
  const captainName = (req.body.captainName || '').trim();
  const captainEmail = (req.body.captainEmail || '').trim().toLowerCase();
  const phone = (req.body.phone || '').trim();
  const captainUid = (req.body.captainUid || '').trim();
  const agreeTerms = req.body.agreeTerms === 'on';
  const roster = getRoster(req.body);

  if (!teamName) {
    errors.push('Ten doi khong duoc de trong.');
  }

  if (!validEmail(captainEmail)) {
    errors.push('Email doi truong khong dung dinh dang.');
  }

  if (!validPhone(phone)) {
    errors.push('So dien thoai khong hop le.');
  }

  if (!captainUid) {
    errors.push('UID doi truong khong duoc de trong.');
  }

  if (roster.length < 5) {
    errors.push('Danh sach thanh vien phai co it nhat 5 nguoi.');
  }

  if (roster.length > 7) {
    errors.push('Danh sach thanh vien toi da 7 nguoi.');
  }

  const missingRequiredMember = roster.some((member) => !member.fullName || !member.uid);
  if (missingRequiredMember) {
    errors.push('Moi thanh vien can co ho ten va UID.');
  }

  const allUids = [captainUid, ...roster.map((member) => member.uid)].map((item) => item.trim()).filter(Boolean);
  if (new Set(allUids).size !== allUids.length) {
    errors.push('UID doi truong va thanh vien khong duoc trung nhau.');
  }

  if (!agreeTerms) {
    errors.push('Ban can dong y dieu khoan tham gia.');
  }

  if (tournament) {
    const now = new Date();
    if (tournament.status !== 'open' || now < tournament.registrationOpenAt || now > tournament.registrationCloseAt) {
      errors.push('Giai dau hien khong trong thoi gian mo dang ky.');
    }

    if (totalTeams >= tournament.maxTeams) {
      errors.push('So doi dang ky da dat toi da.');
    }

    const sameNameTeam = await Team.findOne({
      tournamentId: tournament._id,
      normalizedName: normalizeName(teamName)
    });
    if (sameNameTeam) {
      errors.push('Ten doi da ton tai trong giai dau.');
    }

    const captainConflict = await Team.findOne({
      $or: [{ captainUid }, { captainEmail }, { phone }]
    });
    if (captainConflict) {
      errors.push('Email, so dien thoai hoac UID doi truong da thuoc doi khac.');
    }

    const memberConflict = await Member.findOne({ uid: { $in: roster.map((member) => member.uid) } });
    if (memberConflict) {
      errors.push(`UID ${memberConflict.uid} da thuoc doi khac.`);
    }

    const captainVsMemberConflict = await Member.findOne({ uid: captainUid });
    if (captainVsMemberConflict) {
      errors.push('UID doi truong da thuoc danh sach thanh vien cua doi khac.');
    }
  }

  if (errors.length > 0) {
    return res.status(400).render('register', {
      title: 'Dang ky doi',
      tournament,
      totalTeams,
      errors,
      formData: req.body
    });
  }

  const team = await Team.create({
    tournamentId: tournament._id,
    name: teamName,
    normalizedName: normalizeName(teamName),
    logoPath: req.file ? `/uploads/${req.file.filename}` : '',
    area,
    captainName,
    captainEmail,
    phone,
    captainUid,
    status: 'pending'
  });

  await Member.insertMany(
    roster.map((member) => ({
      ...member,
      teamId: team._id
    }))
  );

  req.session.flash = {
    type: 'success',
    message: 'Dang ky thanh cong, vui long cho duyet.'
  };
  return res.redirect('/status');
});

router.get('/status', async (req, res) => {
  const identifier = (req.query.identifier || '').trim().toLowerCase();
  let team = null;
  let members = [];

  if (identifier) {
    team = await Team.findOne({
      $or: [{ captainEmail: identifier }, { phone: req.query.identifier?.trim() || '' }]
    }).sort({ registeredAt: -1 });

    if (team) {
      members = await Member.find({ teamId: team._id }).sort({ createdAt: 1 });
    }
  }

  res.render('status', {
    title: 'Tra cuu trang thai',
    identifier: req.query.identifier || '',
    team,
    members
  });
});

module.exports = router;
