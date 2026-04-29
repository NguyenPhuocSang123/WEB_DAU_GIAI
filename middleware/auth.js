function requireAdmin(req, res, next) {
  if (!req.session.admin) {
    req.session.flash = {
      type: 'error',
      message: 'Vui long dang nhap admin de tiep tuc.'
    };
    return res.redirect('/admin/login');
  }

  return next();
}

module.exports = {
  requireAdmin
};
