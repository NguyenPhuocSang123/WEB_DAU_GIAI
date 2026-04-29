const express = require('express');

const Team = require('../models/Team');
const Member = require('../models/Member');
const { requireAdmin } = require('../middleware/auth');
const { sendTeamStatusEmail } = require('../utils/mailer');

const router = express.Router();

router.get('/login', (req, res) => {
  res.render('admin/login', { title: 'Admin dang nhap' });
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

router.get('/dashboard', requireAdmin, async (req, res) => {
  const [totalTeams, pendingTeams, approvedTeams, rejectedTeams, teams] = await Promise.all([
    Team.countDocuments(),
    Team.countDocuments({ status: 'pending' }),
    Team.countDocuments({ status: 'approved' }),
    Team.countDocuments({ status: 'rejected' }),
    Team.find().sort({ registeredAt: -1 })
  ]);

  res.render('admin/dashboard', {
    title: 'Admin dashboard',
    totalTeams,
    pendingTeams,
    approvedTeams,
    rejectedTeams,
    teams
  });
});

router.get('/teams/:id', requireAdmin, async (req, res) => {
  const team = await Team.findById(req.params.id);
  if (!team) {
    req.session.flash = {
      type: 'error',
      message: 'Khong tim thay doi.'
    };
    return res.redirect('/admin/dashboard');
  }

  const members = await Member.find({ teamId: team._id }).sort({ createdAt: 1 });
  return res.render('admin/team-detail', {
    title: `Chi tiet ${team.name}`,
    team,
    members
  });
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

module.exports = router;
