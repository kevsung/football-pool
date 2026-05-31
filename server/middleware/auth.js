function isAuthenticated(req, res, next) {
  if (req.isAuthenticated()) return next();

  const wantsJson =
    req.xhr ||
    (req.headers.accept && req.headers.accept.includes('application/json')) ||
    req.path.startsWith('/api');

  if (wantsJson) return res.status(401).json({ error: 'Not authenticated' });
  res.redirect('/login');
}

module.exports = { isAuthenticated };
