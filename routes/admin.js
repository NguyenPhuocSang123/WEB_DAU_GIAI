const express = require('express');

const Team = require('../models/Team');
const Member = require('../models/Member');
const Tournament = require('../models/Tournament');
const Match = require('../models/Match');
const { requireAdmin } = require('../middleware/auth');
const { sendTeamStatusEmail } = require('../utils/mailer');

const router = express.Router();

function nextPowerOfTwo(n) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

function shuffleArray(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function parseDatetimeLocal(value) {
  // value format: YYYY-MM-DDTHH:mm (không có timezone)
  // Trả về Date theo giờ hệ thống.
  if (!value || typeof value !== 'string') return null;
  const [datePart, timePart] = value.split('T');
  if (!datePart || !timePart) return null;
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return new Date(y, m - 1, d, hh, mm);
}

function toDatetimeLocalValue(date) {
  if (!date) return '';
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function generateBracketSchedule({ tournamentId, seedingMethod, startAt, matchIntervalMinutes }) {
  const approvedTeams = await Team.find({ tournamentId, status: 'approved' }).sort({ registeredAt: 1 });
  const teams = approvedTeams.map((t) => t._id);
  const n = teams.length;
  if (n < 2) {
    throw new Error('Chưa đủ đội đã duyệt để tạo lịch đấu.');
  }

  const m = nextPowerOfTwo(n); // kích thước bracket (lũy thừa 2)
  const rounds = Math.log2(m);

  const seededTeams =
    seedingMethod === 'random'
      ? shuffleArray(approvedTeams).map((t) => t._id)
      : approvedTeams.map((t) => t._id);

  // participants slots: mỗi slot là { type: 'team', teamId } hoặc null
  let participants = Array.from({ length: m }).map((_, i) => (i < n ? { type: 'team', teamId: seededTeams[i] } : null));

  // Xóa lịch cũ trước khi tạo mới
  await Match.deleteMany({ tournamentId });

  const createdMatches = [];
  let globalOrder = 1;
  const baseStartAt = startAt ? parseDatetimeLocal(startAt) : null;
  const intervalMs = Number(matchIntervalMinutes) > 0 ? Number(matchIntervalMinutes) * 60 * 1000 : 0;

  for (let round = 1; round <= rounds; round++) {
    const nextParticipants = [];
    for (let i = 0; i < participants.length / 2; i++) {
      const left = participants[i * 2];
      const right = participants[i * 2 + 1];

      if (!left && !right) {
        nextParticipants.push(null);
        continue;
      }
      if (!left && right) {
        nextParticipants.push(right);
        continue;
      }
      if (left && !right) {
        nextParticipants.push(left);
        continue;
      }

      // Tạo trận khi 2 bên đều đã biết slot
      const startAtValue = baseStartAt && intervalMs ? new Date(baseStartAt.getTime() + (globalOrder - 1) * intervalMs) : null;

      const homeSlotType = left.type;
      const awaySlotType = right.type;

      const match = await Match.create({
        tournamentId,
        round,
        matchIndex: i + 1,
        order: globalOrder++,
        startAt: startAtValue,

        homeSlotType,
        homeTeamId: homeSlotType === 'team' ? left.teamId : null,
        homeFromMatchId: homeSlotType === 'winner' ? left.matchId : null,

        awaySlotType,
        awayTeamId: awaySlotType === 'team' ? right.teamId : null,
        awayFromMatchId: awaySlotType === 'winner' ? right.matchId : null
      });

      createdMatches.push(match);
      nextParticipants.push({ type: 'winner', matchId: match._id });
    }
    participants = nextParticipants;
  }

  return createdMatches;
}

router.get('/login', (req, res) => {
  res.render('admin/login', { title: 'Admin Login' });
});

router.post('/login', (req, res) => {
  const email = (req.body.email || '').trim().toLowerCase();
  const password = (req.body.password || '').trim();
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@lienquan.local').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || '12345678';

  if (email !== adminEmail || password !== adminPassword) {
    req.session.flash = {
      type: 'error',
      message: 'Thong tin dang nhap khong chinh xac.'
    };
    return res.redirect('/admin/login');
  }

  req.session.admin = { email };
  req.session.flash = {
    type: 'success',
    message: 'Dang nhap admin thanh cong.'
  };
  return res.redirect('/admin/dashboard');
});

router.post('/logout', requireAdmin, (req, res) => {
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

// Dashboard route
router.get('/dashboard', requireAdmin, async (req, res) => {
  try {
    const totalTournaments = await Tournament.countDocuments();
    const totalTeams = await Team.countDocuments();
    const pendingTeams = await Team.countDocuments({ status: 'pending' });
    const approvedTeams = await Team.countDocuments({ status: 'approved' });
    const rejectedTeams = await Team.countDocuments({ status: 'rejected' });
    const tournament = await Tournament.findOne().sort({ createdAt: -1 });
    const teams = await Team.find().populate('tournamentId').sort({ registeredAt: -1 });
    
    // Get all tournaments with team counts for the new list
    const tournaments = await Tournament.find().sort({ createdAt: -1 });
    const tournamentsWithCounts = await Promise.all(
      tournaments.map(async (t) => {
        const totalTeams = await Team.countDocuments({ tournamentId: t._id });
        const approvedTeams = await Team.countDocuments({ tournamentId: t._id, status: 'approved' });
        return {
          ...t.toObject(),
          totalTeams,
          approvedTeams
        };
      })
    );

    res.render('admin/dashboard', {
      title: 'Admin Dashboard',
      totalTournaments,
      totalTeams,
      pendingTeams,
      approvedTeams,
      rejectedTeams,
      tournament,
      teams,
      tournaments: tournamentsWithCounts
    });
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

router.get('/teams/:id', requireAdmin, async (req, res) => {
  const team = await Team.findById(req.params.id).populate('tournamentId');
  if (!team) {
    req.session.flash = {
      type: 'error',
      message: 'Khong tim thay doi.'
    };
    return res.redirect('/admin/dashboard');
  }

  const members = await Member.find({ teamId: team._id }).sort({ createdAt: 1 });
  return res.render('admin/team-detail', { title: 'Team Detail', team, members });
});

router.post('/teams/:id/approve', requireAdmin, async (req, res) => {
  const team = await Team.findById(req.params.id);
  if (!team) {
    req.session.flash = {
      type: 'error',
      message: 'Khong tim thay doi can duyet.'
    };
    return res.redirect('/admin/dashboard');
  }

  const tournament = await Tournament.findOne().sort({ createdAt: -1 });
  if (tournament && tournament.status === 'closed') {
    req.session.flash = {
      type: 'error',
      message: 'Lịch thi đấu đã được chốt. Vui lòng tạo lại lịch sau khi duyệt thêm đội.'
    };
    return res.redirect(`/admin/teams/${team._id}`);
  }

  team.status = 'approved';
  team.rejectionReason = '';
  await team.save();
  await sendTeamStatusEmail({
    to: team.captainEmail,
    teamName: team.name,
    status: 'approved'
  });

  req.session.flash = {
    type: 'success',
    message: `Da duyet doi ${team.name}. Email thong bao da duoc mo phong trong console.`
  };
  return res.redirect(`/admin/teams/${team._id}`);
});

router.post('/teams/:id/reject', requireAdmin, async (req, res) => {
  const reason = (req.body.reason || '').trim();
  const team = await Team.findById(req.params.id);

  if (!team) {
    req.session.flash = {
      type: 'error',
      message: 'Khong tim thay doi can tu choi.'
    };
    return res.redirect('/admin/dashboard');
  }

  if (!reason) {
    req.session.flash = {
      type: 'error',
      message: 'Can nhap ly do tu choi.'
    };
    return res.redirect(`/admin/teams/${team._id}`);
  }

  team.status = 'rejected';
  team.rejectionReason = reason;
  await team.save();
  await sendTeamStatusEmail({
    to: team.captainEmail,
    teamName: team.name,
    status: 'rejected',
    reason
  });

  req.session.flash = {
    type: 'success',
    message: `Da tu choi doi ${team.name}. Email thong bao da duoc mo phong trong console.`
  };
  return res.redirect(`/admin/teams/${team._id}`);
});

router.get('/schedule', requireAdmin, async (req, res) => {
  let tournament;
  
  // Nếu có tournamentId trong query, dùng nó. Nếu không, lấy giải đấu mới nhất
  if (req.query.tournamentId) {
    tournament = await Tournament.findById(req.query.tournamentId);
  } else {
    tournament = await Tournament.findOne().sort({ createdAt: -1 });
  }
  
  const tournamentId = tournament?._id;

  if (!tournamentId) {
    return res.render('admin/schedule', {
      title: 'Lịch thi đấu',
      tournament: null,
      approvedTeams: 0,
      totalTeams: 0,
      matches: []
    });
  }

  const [totalTeams, approvedTeams, matches] = await Promise.all([
    Team.countDocuments({ tournamentId }),
    Team.countDocuments({ tournamentId, status: 'approved' }),
    Match.find({ tournamentId }).sort({ order: 1, round: 1, matchIndex: 1 })
  ]);

  const teamIds = new Set();
  matches.forEach((m) => {
    if (m.homeSlotType === 'team' && m.homeTeamId) teamIds.add(String(m.homeTeamId));
    if (m.awaySlotType === 'team' && m.awayTeamId) teamIds.add(String(m.awayTeamId));
  });
  const teams = await Team.find({ _id: { $in: [...teamIds] } });
  const teamsById = {};
  teams.forEach((t) => {
    teamsById[String(t._id)] = t;
  });

  // map matchId -> label thông tin vòng/trận
  const matchMetaById = {};
  matches.forEach((m) => {
    matchMetaById[String(m._id)] = { round: m.round, matchIndex: m.matchIndex };
  });

  const matchViews = matches.map((m) => {
    const homeLabel =
      m.homeSlotType === 'team'
        ? teamsById[String(m.homeTeamId)]?.name || 'TBD'
        : `Người thắng trận R${matchMetaById[String(m.homeFromMatchId)]?.round || '?'}-M${
            matchMetaById[String(m.homeFromMatchId)]?.matchIndex || '?'
          }`;

    const awayLabel =
      m.awaySlotType === 'team'
        ? teamsById[String(m.awayTeamId)]?.name || 'TBD'
        : `Người thắng trận R${matchMetaById[String(m.awayFromMatchId)]?.round || '?'}-M${
            matchMetaById[String(m.awayFromMatchId)]?.matchIndex || '?'
          }`;

    return {
      id: String(m._id),
      round: m.round,
      matchIndex: m.matchIndex,
      order: m.order,
      startAtValue: toDatetimeLocalValue(m.startAt),
      homeLabel,
      awayLabel
    };
  });

  return res.render('admin/schedule', {
    title: 'Lịch thi đấu',
    tournament,
    totalTeams,
    approvedTeams,
    matches: matchViews
  });
});

router.post('/schedule/generate', requireAdmin, async (req, res) => {
  let tournament;
  
  // Nếu có tournamentId trong body hoặc query, dùng nó. Nếu không, lấy giải đấu mới nhất
  if (req.body.tournamentId || req.query.tournamentId) {
    tournament = await Tournament.findById(req.body.tournamentId || req.query.tournamentId);
  } else {
    tournament = await Tournament.findOne().sort({ createdAt: -1 });
  }
  
  if (!tournament) {
    req.session.flash = { type: 'error', message: 'Chưa có giải đấu.' };
    return res.redirect('/admin/schedule');
  }

  const seedingMethod = req.body.seedingMethod || 'registeredAtAsc';
  const startAt = req.body.startAt || '';
  const matchIntervalMinutes = req.body.matchIntervalMinutes || '5';

  try {
    await generateBracketSchedule({
      tournamentId: tournament._id,
      seedingMethod: seedingMethod === 'random' ? 'random' : 'registeredAtAsc',
      startAt,
      matchIntervalMinutes
    });

    tournament.status = 'closed';
    tournament.scheduleGeneratedAt = new Date();
    await tournament.save();

    req.session.flash = { type: 'success', message: 'Đã tạo lịch thi đấu. Bạn có thể sắp xếp thứ tự/thời gian bên dưới.' };
    return res.redirect('/admin/schedule?tournamentId=' + tournament._id);
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message || 'Tạo lịch thất bại.' };
    return res.redirect('/admin/schedule?tournamentId=' + tournament._id);
  }
});

router.post('/schedule/update', requireAdmin, async (req, res) => {
  let tournament;
  
  // Nếu có tournamentId trong body hoặc query, dùng nó. Nếu không, lấy giải đấu mới nhất
  if (req.body.tournamentId || req.query.tournamentId) {
    tournament = await Tournament.findById(req.body.tournamentId || req.query.tournamentId);
  } else {
    tournament = await Tournament.findOne().sort({ createdAt: -1 });
  }
  
  if (!tournament) {
    req.session.flash = { type: 'error', message: 'Chưa có giải đấu.' };
    return res.redirect('/admin/schedule');
  }

  const updates = req.body.matches || {};

  const matchIds = Object.keys(updates);
  if (matchIds.length === 0) {
    req.session.flash = { type: 'error', message: 'Không có thay đổi nào để lưu.' };
    return res.redirect('/admin/schedule?tournamentId=' + tournament._id);
  }

  const matches = await Match.find({ tournamentId: tournament._id, _id: { $in: matchIds } });
  const matchesById = {};
  matches.forEach((m) => {
    matchesById[String(m._id)] = m;
  });

  for (const matchId of matchIds) {
    const payload = updates[matchId] || {};
    const match = matchesById[matchId];
    if (!match) continue;

    const orderRaw = payload.order;
    const order = orderRaw !== undefined && orderRaw !== '' ? Number(orderRaw) : null;
    if (order !== null && !Number.isNaN(order)) {
      match.order = order;
    }

    const startAt = payload.startAt || '';
    const parsedStartAt = parseDatetimeLocal(startAt);
    match.startAt = parsedStartAt;

    await match.save();
  }

  req.session.flash = { type: 'success', message: 'Đã lưu lịch thi đấu.' };
  return res.redirect('/admin/schedule?tournamentId=' + tournament._id);
});

// Route để chốt lịch đấu cho một giải đấu cụ thể
router.post('/tournaments/:id/schedule/generate', requireAdmin, async (req, res) => {
  const tournament = await Tournament.findById(req.params.id);
  if (!tournament) {
    req.session.flash = { type: 'error', message: 'Không tìm thấy giải đấu.' };
    return res.redirect('/admin/dashboard');
  }

  const seedingMethod = req.body.seedingMethod || 'registeredAtAsc';
  const startAt = req.body.startAt || '';
  const matchIntervalMinutes = req.body.matchIntervalMinutes || '5';

  try {
    await generateBracketSchedule({
      tournamentId: tournament._id,
      seedingMethod: seedingMethod === 'random' ? 'random' : 'registeredAtAsc',
      startAt,
      matchIntervalMinutes
    });

    tournament.status = 'closed';
    tournament.scheduleGeneratedAt = new Date();
    await tournament.save();

    // Gửi email tới các đội trưởng
    const approvedTeams = await Team.find({ tournamentId: tournament._id, status: 'approved' }).populate('members');
    const { sendScheduleEmail } = require('../utils/mailer');
    
    for (const team of approvedTeams) {
      await sendScheduleEmail({
        to: team.captainEmail,
        teamName: team.name,
        tournamentName: tournament.name,
        scheduleUrl: `${req.protocol}://${req.get('host')}/tournament/${tournament._id}/bracket`
      });
    }

    req.session.flash = { 
      type: 'success', 
      message: `Đã chốt lịch thi đấu và gửi email thông báo tới ${approvedTeams.length} đội trưởng.` 
    };
    return res.redirect(`/admin/tournaments/${tournament._id}/detail`);
  } catch (err) {
    req.session.flash = { type: 'error', message: err.message || 'Chốt lịch thất bại.' };
    return res.redirect(`/admin/tournaments/${tournament._id}/detail`);
  }
});

// Route để xem lịch đấu của một giải đấu cụ thể
router.get('/tournaments/:id/schedule', requireAdmin, async (req, res) => {
  const tournament = await Tournament.findById(req.params.id);
  
  if (!tournament) {
    req.session.flash = { type: 'error', message: 'Không tìm thấy giải đấu.' };
    return res.redirect('/admin/dashboard');
  }

  const [totalTeams, approvedTeams, matches] = await Promise.all([
    Team.countDocuments({ tournamentId: tournament._id }),
    Team.countDocuments({ tournamentId: tournament._id, status: 'approved' }),
    Match.find({ tournamentId: tournament._id }).sort({ order: 1, round: 1, matchIndex: 1 })
  ]);

  const teamIds = new Set();
  matches.forEach((m) => {
    if (m.homeSlotType === 'team' && m.homeTeamId) teamIds.add(String(m.homeTeamId));
    if (m.awaySlotType === 'team' && m.awayTeamId) teamIds.add(String(m.awayTeamId));
  });
  const teams = await Team.find({ _id: { $in: [...teamIds] } });
  const teamsById = {};
  teams.forEach((t) => {
    teamsById[String(t._id)] = t;
  });

  const matchMetaById = {};
  matches.forEach((m) => {
    matchMetaById[String(m._id)] = { round: m.round, matchIndex: m.matchIndex };
  });

  const matchViews = matches.map((m) => {
    const homeLabel =
      m.homeSlotType === 'team'
        ? teamsById[String(m.homeTeamId)]?.name || 'TBD'
        : `Người thắng trận R${matchMetaById[String(m.homeFromMatchId)]?.round || '?'}-M${
            matchMetaById[String(m.homeFromMatchId)]?.matchIndex || '?'
          }`;

    const awayLabel =
      m.awaySlotType === 'team'
        ? teamsById[String(m.awayTeamId)]?.name || 'TBD'
        : `Người thắng trận R${matchMetaById[String(m.awayFromMatchId)]?.round || '?'}-M${
            matchMetaById[String(m.awayFromMatchId)]?.matchIndex || '?'
          }`;

    return {
      id: String(m._id),
      round: m.round,
      matchIndex: m.matchIndex,
      order: m.order,
      startAtValue: toDatetimeLocalValue(m.startAt),
      homeLabel,
      awayLabel
    };
  });

  return res.render('admin/schedule', {
    title: 'Lịch thi đấu',
    tournament: tournament.toObject(),
    totalTeams,
    approvedTeams,
    matches: matchViews,
    tournamentId: tournament._id.toString()
  });
});

// Route để cập nhật lịch đấu của một giải đấu cụ thể
router.post('/tournaments/:id/schedule/update', requireAdmin, async (req, res) => {
  const tournament = await Tournament.findById(req.params.id);
  if (!tournament) {
    req.session.flash = { type: 'error', message: 'Không tìm thấy giải đấu.' };
    return res.redirect('/admin/dashboard');
  }

  const updates = req.body.matches || {};
  const matchIds = Object.keys(updates);
  
  if (matchIds.length === 0) {
    req.session.flash = { type: 'error', message: 'Không có thay đổi nào để lưu.' };
    return res.redirect(`/admin/tournaments/${tournament._id}/schedule`);
  }

  const matches = await Match.find({ tournamentId: tournament._id, _id: { $in: matchIds } });
  const matchesById = {};
  matches.forEach((m) => {
    matchesById[String(m._id)] = m;
  });

  for (const matchId of matchIds) {
    const payload = updates[matchId] || {};
    const match = matchesById[matchId];
    if (!match) continue;

    const orderRaw = payload.order;
    const order = orderRaw !== undefined && orderRaw !== '' ? Number(orderRaw) : null;
    if (order !== null && !Number.isNaN(order)) {
      match.order = order;
    }

    const startAt = payload.startAt || '';
    const parsedStartAt = parseDatetimeLocal(startAt);
    match.startAt = parsedStartAt;

    await match.save();
  }

  req.session.flash = { type: 'success', message: 'Đã lưu lịch thi đấu.' };
  return res.redirect(`/admin/tournaments/${tournament._id}/schedule`);
});

router.get('/tournament/create', requireAdmin, (req, res) => {
  res.render('admin/create-tournament', { title: 'Create Tournament' });
});

router.post('/tournament/create', requireAdmin, async (req, res) => {
  const { name, registrationOpenAt, registrationCloseAt, maxTeams, status } = req.body;

  // Validate inputs
  if (!name || !name.trim()) {
    req.session.flash = {
      type: 'error',
      message: 'Vui long nhap ten giai dau.'
    };
    return res.redirect('/admin/tournament/create');
  }

  if (!registrationOpenAt) {
    req.session.flash = {
      type: 'error',
      message: 'Vui long chon thoi diem mo dang ky.'
    };
    return res.redirect('/admin/tournament/create');
  }

  if (!registrationCloseAt) {
    req.session.flash = {
      type: 'error',
      message: 'Vui long chon thoi diem dong dang ky.'
    };
    return res.redirect('/admin/tournament/create');
  }

  const openDate = parseDatetimeLocal(registrationOpenAt);
  const closeDate = parseDatetimeLocal(registrationCloseAt);

  if (!openDate || !closeDate) {
    req.session.flash = {
      type: 'error',
      message: 'Thoi diem khong hop le.'
    };
    return res.redirect('/admin/tournament/create');
  }

  if (closeDate <= openDate) {
    req.session.flash = {
      type: 'error',
      message: 'Thoi diem dong dang ky phai sau thoi diem mo.'
    };
    return res.redirect('/admin/tournament/create');
  }

  const max = Number(maxTeams);
  if (!max || max < 2) {
    req.session.flash = {
      type: 'error',
      message: 'So toi da cac doi phai >= 2.'
    };
    return res.redirect('/admin/tournament/create');
  }

  const statusValue = ['draft', 'open', 'closed'].includes(status) ? status : 'open';

  try {
    const tournament = await Tournament.create({
      name: name.trim(),
      registrationOpenAt: openDate,
      registrationCloseAt: closeDate,
      maxTeams: max,
      status: statusValue
    });

    req.session.flash = {
      type: 'success',
      message: `Da tao giai dau "${tournament.name}" thanh cong.`
    };
    return res.redirect('/admin/dashboard');
  } catch (err) {
    req.session.flash = {
      type: 'error',
      message: 'Tao giai dau that bai: ' + err.message
    };
    return res.redirect('/admin/tournament/create');
  }
});

// Route to start a tournament
router.post('/tournaments/:id/start', requireAdmin, async (req, res) => {
  try {
    const tournamentId = req.params.id;
    const tournament = await Tournament.findById(tournamentId);

    if (!tournament) {
      return res.status(404).send('Tournament not found');
    }

    tournament.started = true;
    await tournament.save();

    res.redirect('/admin/dashboard');
  } catch (error) {
    console.error(error);
    res.status(500).send('Internal Server Error');
  }
});

// Chi tiết giải đấu - xem danh sách đội và chốt lịch đấu
router.get('/tournaments/:id/detail', requireAdmin, async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) {
      req.session.flash = { type: 'error', message: 'Không tìm thấy giải đấu.' };
      return res.redirect('/admin/dashboard');
    }
    
    const [totalTeams, approvedTeams, teams, matches] = await Promise.all([
      Team.countDocuments({ tournamentId: tournament._id }),
      Team.countDocuments({ tournamentId: tournament._id, status: 'approved' }),
      Team.find({ tournamentId: tournament._id }).sort({ status: 1, registeredAt: -1 }),
      Match.find({ tournamentId: tournament._id }).sort({ order: 1, round: 1, matchIndex: 1 })
    ]);
    
    res.render('admin/tournament-detail', {
      title: 'Chi tiết giải đấu',
      tournament: tournament.toObject(),
      totalTeams,
      approvedTeams,
      teams,
      hasMatches: matches.length > 0,
      formatDate: (date) => {
        if (!date) return 'N/A';
        return new Date(date).toLocaleString('vi-VN');
      }
    });
  } catch (error) {
    console.error(error);
    req.session.flash = { type: 'error', message: 'Lỗi khi tải chi tiết giải đấu.' };
    res.redirect('/admin/dashboard');
  }
});

// Quản lý giải đấu
router.get('/tournaments', requireAdmin, async (req, res) => {
  try {
    const tournaments = await Tournament.find().sort({ createdAt: -1 });
    const tournamentsWithCounts = await Promise.all(
      tournaments.map(async (tournament) => {
        const totalTeams = await Team.countDocuments({ tournamentId: tournament._id });
        const approvedTeams = await Team.countDocuments({ tournamentId: tournament._id, status: 'approved' });
        return {
          ...tournament.toObject(),
          totalTeams,
          approvedTeams
        };
      })
    );
    res.render('admin/tournaments-list', { title: 'Quản lý giải đấu', tournaments: tournamentsWithCounts });
  } catch (error) {
    console.error(error);
    req.session.flash = { type: 'error', message: 'Lỗi khi lấy danh sách giải đấu.' };
    res.redirect('/admin/dashboard');
  }
});

router.get('/tournaments/:id/edit', requireAdmin, async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) {
      req.session.flash = { type: 'error', message: 'Không tìm thấy giải đấu.' };
      return res.redirect('/admin/tournaments');
    }
    
    const totalTeams = await Team.countDocuments({ tournamentId: tournament._id });
    const approvedTeams = await Team.countDocuments({ tournamentId: tournament._id, status: 'approved' });
    
    res.render('admin/edit-tournament', {
      title: 'Chỉnh sửa giải đấu',
      tournament: tournament.toObject(),
      toDatetimeLocalValue,
      totalTeams,
      approvedTeams
    });
  } catch (error) {
    console.error(error);
    req.session.flash = { type: 'error', message: 'Lỗi khi tải form chỉnh sửa.' };
    res.redirect('/admin/tournaments');
  }
});

router.post('/tournaments/:id/edit', requireAdmin, async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) {
      req.session.flash = { type: 'error', message: 'Không tìm thấy giải đấu.' };
      return res.redirect('/admin/tournaments');
    }

    const { name, registrationOpenAt, registrationCloseAt, maxTeams, status } = req.body;

    if (!name || !name.trim()) {
      req.session.flash = { type: 'error', message: 'Vui lòng nhập tên giải đấu.' };
      return res.redirect(`/admin/tournaments/${tournament._id}/edit`);
    }

    if (!registrationOpenAt) {
      req.session.flash = { type: 'error', message: 'Vui lòng chọn thời điểm mở đăng ký.' };
      return res.redirect(`/admin/tournaments/${tournament._id}/edit`);
    }

    if (!registrationCloseAt) {
      req.session.flash = { type: 'error', message: 'Vui lòng chọn thời điểm đóng đăng ký.' };
      return res.redirect(`/admin/tournaments/${tournament._id}/edit`);
    }

    const openDate = parseDatetimeLocal(registrationOpenAt);
    const closeDate = parseDatetimeLocal(registrationCloseAt);

    if (!openDate || !closeDate) {
      req.session.flash = { type: 'error', message: 'Thời điểm không hợp lệ.' };
      return res.redirect(`/admin/tournaments/${tournament._id}/edit`);
    }

    if (closeDate <= openDate) {
      req.session.flash = { type: 'error', message: 'Thời điểm đóng đăng ký phải sau thời điểm mở.' };
      return res.redirect(`/admin/tournaments/${tournament._id}/edit`);
    }

    const max = Number(maxTeams);
    if (!max || max < 2) {
      req.session.flash = { type: 'error', message: 'Số tối đa các đội phải >= 2.' };
      return res.redirect(`/admin/tournaments/${tournament._id}/edit`);
    }

    tournament.name = name.trim();
    tournament.registrationOpenAt = openDate;
    tournament.registrationCloseAt = closeDate;
    tournament.maxTeams = max;
    tournament.status = ['draft', 'open', 'closed'].includes(status) ? status : 'open';
    
    await tournament.save();

    req.session.flash = { type: 'success', message: `Đã cập nhật giải đấu "${tournament.name}" thành công.` };
    res.redirect('/admin/tournaments');
  } catch (error) {
    console.error(error);
    req.session.flash = { type: 'error', message: 'Cập nhật giải đấu thất bại: ' + error.message };
    res.redirect(`/admin/tournaments/${req.params.id}/edit`);
  }
});

router.post('/tournaments/:id/delete', requireAdmin, async (req, res) => {
  try {
    const tournament = await Tournament.findById(req.params.id);
    if (!tournament) {
      req.session.flash = { type: 'error', message: 'Không tìm thấy giải đấu.' };
      return res.redirect('/admin/tournaments');
    }

    const totalTeams = await Team.countDocuments({ tournamentId: tournament._id });
    if (totalTeams > 0) {
      req.session.flash = { type: 'error', message: 'Không thể xoá giải đấu có đội đã đăng ký. Vui lòng xoá các đội trước.' };
      return res.redirect('/admin/tournaments');
    }

    const tournamentName = tournament.name;
    await Tournament.deleteOne({ _id: tournament._id });
    await Match.deleteMany({ tournamentId: tournament._id });

    req.session.flash = { type: 'success', message: `Đã xoá giải đấu "${tournamentName}" thành công.` };
    res.redirect('/admin/tournaments');
  } catch (error) {
    console.error(error);
    req.session.flash = { type: 'error', message: 'Xoá giải đấu thất bại: ' + error.message };
    res.redirect('/admin/tournaments');
  }
});

module.exports = router;
