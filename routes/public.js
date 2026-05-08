const path = require('path');
const express = require('express');
const multer = require('multer');

const Tournament = require('../models/Tournament');
const Team = require('../models/Team');
const Member = require('../models/Member');
const Match = require('../models/Match');
const { createBracketStructure, generateBracketHTML, generateBracketHTMLFromMatches } = require('../utils/bracket');

const router = express.Router();
const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');

const storage = multer.diskStorage({
  destination: uploadDir,
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
  const tournaments = await Tournament.find().sort({ createdAt: -1 });
  
  // Get team count for each tournament
  const tournamentsWithCounts = await Promise.all(
    tournaments.map(async (tournament) => {
      const totalTeams = await Team.countDocuments({ tournamentId: tournament._id });
      const approvedTeams = await Team.countDocuments({ tournamentId: tournament._id, status: 'approved' });
      return {
        ...tournament.toObject(),
        totalTeams,
        approvedTeams,
        displayCount: approvedTeams // Display chỉ số đội đã duyệt
      };
    })
  );

  res.render('home', { title: 'Home', tournaments: tournamentsWithCounts });
});

router.get('/tournament/:id', async (req, res) => {
  const tournament = await Tournament.findById(req.params.id);
  
  if (!tournament) {
    req.session.flash = {
      type: 'error',
      message: 'Khong tim thay giai dau.'
    };
    return res.redirect('/');
  }

  const teams = await Team.find({ tournamentId: tournament._id, status: 'approved' }).sort({ registeredAt: 1 });
  const totalTeams = await Team.countDocuments({ tournamentId: tournament._id });
  const approvedTeams = teams.length;
  const canRegister = totalTeams < tournament.maxTeams;
  
  // Generate bracket if tournament is full or closed
  let bracketData = null;
  let bracketHTML = null;
  let scheduleMatches = [];
  const isTournamentFull = approvedTeams >= tournament.maxTeams;
  
  const matches = await Match.find({ tournamentId: tournament._id }).sort({ round: 1, matchIndex: 1 });
  
  // If schedule has been generated, get matches with team details
  if (tournament.scheduleGeneratedAt) {
    scheduleMatches = await Match.find({ tournamentId: tournament._id })
      .populate('homeTeamId', 'name')
      .populate('awayTeamId', 'name')
      .sort({ round: 1, order: 1 });
  }
  
  if (matches.length > 0) {
    // Use scheduled matches
    const teamIds = new Set();
    matches.forEach((m) => {
      if (m.homeSlotType === 'team' && m.homeTeamId) teamIds.add(String(m.homeTeamId));
      if (m.awaySlotType === 'team' && m.awayTeamId) teamIds.add(String(m.awayTeamId));
    });
    const teamsForBracket = await Team.find({ _id: { $in: [...teamIds] } });
    const teamsById = {};
    teamsForBracket.forEach((t) => {
      teamsById[String(t._id)] = t;
    });
    bracketHTML = generateBracketHTMLFromMatches(matches, teamsById);
  } else if (isTournamentFull && teams.length > 0) {
    bracketData = createBracketStructure(teams);
    bracketHTML = generateBracketHTML(bracketData);
  }

  res.render('tournament-detail', { 
    title: 'Tournament Detail', 
    tournament, 
    teams, 
    totalTeams, 
    approvedTeams, 
    canRegister, 
    displayCount: approvedTeams,
    bracketData,
    bracketHTML,
    isTournamentFull,
    scheduleMatches
  });
});

router.get('/register', async (req, res) => {
  const tournaments = await Tournament.find({ status: 'open' }).sort({ createdAt: -1 });
  const now = new Date();
  
  // Lọc chỉ những giải đấu còn trong thời gian đăng ký
  const availableTournaments = tournaments.filter(t => 
    now >= new Date(t.registrationOpenAt) && now <= new Date(t.registrationCloseAt)
  );

  // Lấy số đội đã đăng ký cho mỗi giải
  const tournamentsWithCounts = await Promise.all(
    availableTournaments.map(async (tournament) => {
      const totalTeams = await Team.countDocuments({ tournamentId: tournament._id });
      const approvedTeams = await Team.countDocuments({ tournamentId: tournament._id, status: 'approved' });
      return {
        ...tournament.toObject(),
        totalTeams,
        approvedTeams,
        isFull: totalTeams >= tournament.maxTeams
      };
    })
  );

  const selectedTournamentId = req.query.tournament || (tournamentsWithCounts[0]?._id.toString() || null);
  const selectedTournament = tournamentsWithCounts.find(t => t._id.toString() === selectedTournamentId);

  res.render('register', { title: 'Register', tournaments: tournamentsWithCounts, selectedTournament, formData: null, errors: [] });
});

router.post('/register', upload.single('logo'), async (req, res) => {
  try {
    const tournamentId = req.body.tournamentId?.trim() || '';
    
    // Validate tournamentId format early
    if (!tournamentId || !tournamentId.match(/^[0-9a-fA-F]{24}$/)) {
      const tournaments = await Tournament.find({ status: 'open' }).sort({ createdAt: -1 });
      const now = new Date();
      const availableTournaments = tournaments.filter(t => 
        now >= new Date(t.registrationOpenAt) && now <= new Date(t.registrationCloseAt)
      );
      const tournamentsWithCounts = await Promise.all(
        availableTournaments.map(async (t) => {
          const total = await Team.countDocuments({ tournamentId: t._id });
          const approved = await Team.countDocuments({ tournamentId: t._id, status: 'approved' });
          return {
            ...t.toObject(),
            totalTeams: total,
            approvedTeams: approved,
            isFull: total >= t.maxTeams
          };
        })
      );
      
      return res.status(400).render('register', {
        title: 'Dang ky doi',
        tournaments: tournamentsWithCounts,
        selectedTournament: null,
        errors: ['Vui long chon giai dau truoc khi dang ky.'],
        formData: req.body
      });
    }

    const tournament = await Tournament.findById(tournamentId);
    const totalTeams = await Team.countDocuments({ tournamentId });
    
    const errors = [];

    if (!tournament) {
      errors.push('Giai dau khong hop le hoac khong ton tai.');
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

    // Check team name uniqueness within same tournament only
    const sameNameTeam = await Team.findOne({
      tournamentId: tournament._id,
      normalizedName: normalizeName(teamName)
    });
    if (sameNameTeam) {
      errors.push('Ten doi da ton tai trong giai dau nay.');
    }

    // Check captain conflict within same tournament only
    const captainConflict = await Team.findOne({
      tournamentId: tournament._id,
      $or: [{ captainUid }, { captainEmail }]
    });
    if (captainConflict) {
      errors.push('Email hoac UID doi truong da dang ky trong giai dau nay.');
    }

    // Phone can be unique across all tournaments for safety
    const phoneConflict = await Team.findOne({ phone });
    if (phoneConflict) {
      errors.push('So dien thoai nay da duoc su dung.');
    }

    // Check member conflicts - members cannot be in multiple teams
    const memberConflict = await Member.findOne({ uid: { $in: roster.map((member) => member.uid) } });
    if (memberConflict) {
      errors.push(`UID ${memberConflict.uid} da thuoc doi khac.`);
    }

    // Check captain vs member conflicts globally
    const captainVsMemberConflict = await Member.findOne({ uid: captainUid });
    if (captainVsMemberConflict) {
      errors.push('UID doi truong da thuoc danh sach thanh vien cua doi khac.');
    }
  }

  if (errors.length > 0) {
    const tournaments = await Tournament.find({ status: 'open' }).sort({ createdAt: -1 });
    const now = new Date();
    const availableTournaments = tournaments.filter(t => 
      now >= new Date(t.registrationOpenAt) && now <= new Date(t.registrationCloseAt)
    );
    const tournamentsWithCounts = await Promise.all(
      availableTournaments.map(async (t) => {
        const total = await Team.countDocuments({ tournamentId: t._id });
        const approved = await Team.countDocuments({ tournamentId: t._id, status: 'approved' });
        return {
          ...t.toObject(),
          totalTeams: total,
          approvedTeams: approved,
          isFull: total >= t.maxTeams
        };
      })
    );

    return res.status(400).render('register', {
      title: 'Dang ky doi',
      tournaments: tournamentsWithCounts,
      selectedTournament: tournament?.toObject(),
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
  } catch (error) {
    console.error('Loi trong qua trinh dang ky:', error);
    const tournaments = await Tournament.find({ status: 'open' }).sort({ createdAt: -1 });
    const now = new Date();
    const availableTournaments = tournaments.filter(t => 
      now >= new Date(t.registrationOpenAt) && now <= new Date(t.registrationCloseAt)
    );
    const tournamentsWithCounts = await Promise.all(
      availableTournaments.map(async (t) => {
        const total = await Team.countDocuments({ tournamentId: t._id });
        const approved = await Team.countDocuments({ tournamentId: t._id, status: 'approved' });
        return {
          ...t.toObject(),
          totalTeams: total,
          approvedTeams: approved,
          isFull: total >= t.maxTeams
        };
      })
    );
    
    return res.status(500).render('register', {
      title: 'Dang ky doi',
      tournaments: tournamentsWithCounts,
      selectedTournament: null,
      errors: ['Loi he thong: ' + error.message],
      formData: req.body
    });
  }
});

router.get('/status', async (req, res) => {
  const identifier = (req.query.identifier || '').trim().toLowerCase();
  let team = null;
  let members = [];

  if (identifier) {
    team = await Team.findOne({
      $or: [{ captainEmail: identifier }, { phone: req.query.identifier?.trim() || '' }]
    }).populate('tournamentId').sort({ registeredAt: -1 });

    if (team) {
      members = await Member.find({ teamId: team._id }).sort({ createdAt: 1 });
    }
  }

  res.render('status', { title: 'Status', identifier: req.query.identifier || '', team, members });
});

// Route to display tournament bracket
router.get('/tournament/:id/bracket', async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    
    if (!tournament) {
      req.session.flash = {
        type: 'error',
        message: 'Khong tim thay giai dau.'
      };
      return res.redirect('/');
    }

    const teams = await Team.find({ tournamentId: tournament._id, status: 'approved' }).sort({ registeredAt: 1 });
    const approvedTeams = teams.length;
    const isTournamentFull = approvedTeams >= tournament.maxTeams;
    
    // Generate bracket if tournament is full or closed
    let bracketData = null;
    let bracketHTML = null;
    
    const matches = await Match.find({ tournamentId: tournament._id }).sort({ round: 1, matchIndex: 1 });
    if (matches.length > 0) {
      // Use scheduled matches
      const teamIds = new Set();
      matches.forEach((m) => {
        if (m.homeSlotType === 'team' && m.homeTeamId) teamIds.add(String(m.homeTeamId));
        if (m.awaySlotType === 'team' && m.awayTeamId) teamIds.add(String(m.awayTeamId));
      });
      const teamsForBracket = await Team.find({ _id: { $in: [...teamIds] } });
      const teamsById = {};
      teamsForBracket.forEach((t) => {
        teamsById[String(t._id)] = t;
      });
      bracketHTML = generateBracketHTMLFromMatches(matches, teamsById);
    } else if (isTournamentFull && teams.length > 0) {
      bracketData = createBracketStructure(teams);
      bracketHTML = generateBracketHTML(bracketData);
    }

    res.render('bracket', { 
      title: 'Tournament Bracket', 
      tournament,
      teams,
      approvedTeams,
      bracketData,
      bracketHTML,
      isTournamentFull,
      formatDate: (value) => {
        if (!value) return '';
        return new Intl.DateTimeFormat('vi-VN', {
          dateStyle: 'medium',
          timeStyle: 'short'
        }).format(new Date(value));
      }
    });
  } catch (error) {
    console.error(error);
    req.session.flash = {
      type: 'error',
      message: 'Loi trong qua trinh tai sơ đồ trận đấu.'
    };
    res.redirect(`/tournament/${req.params.id}`);
  }
});

module.exports = router;
