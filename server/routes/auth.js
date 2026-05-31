const express = require('express');
const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { v4: uuidv4 } = require('uuid');
const dataStore = require('../utils/dataStore');

// ── Passport configuration ────────────────────────────────────────────────────

passport.use(new GoogleStrategy(
  {
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${process.env.BASE_URL}/auth/google/callback`,
    passReqToCallback: true,
  },
  (req, _accessToken, _refreshToken, profile, done) => {
    try {
      // Returning user
      const existing = dataStore.getUserByGoogleId(profile.id);
      if (existing) return done(null, existing);

      const email = profile.emails?.[0]?.value || '';
      const users = dataStore.getUsers();

      // Bootstrap: first user ever becomes admin without needing an invite
      if (users.length === 0) {
        const admin = {
          id: uuidv4(),
          googleId: profile.id,
          name: profile.displayName,
          email,
          role: 'admin',
          joinedAt: new Date().toISOString(),
        };
        users.push(admin);
        dataStore.saveUsers(users);
        return done(null, admin);
      }

      // All subsequent users need a valid invite
      const token = req.session.inviteToken;
      if (!token) return done(null, false, { message: 'no-invite' });

      const invite = dataStore.getInviteByToken(token);
      if (!invite || invite.usedAt) return done(null, false, { message: 'invalid-invite' });

      // Soft email match — warn but don't block if emails differ
      if (invite.email && email && invite.email.toLowerCase() !== email.toLowerCase()) {
        return done(null, false, { message: 'email-mismatch' });
      }

      const newUser = {
        id: uuidv4(),
        googleId: profile.id,
        name: profile.displayName,
        email,
        role: 'user',
        joinedAt: new Date().toISOString(),
      };
      users.push(newUser);
      dataStore.saveUsers(users);

      const invites = dataStore.getInvites();
      const idx = invites.findIndex(i => i.token === token);
      if (idx !== -1) {
        invites[idx].usedAt = new Date().toISOString();
        invites[idx].usedBy = newUser.id;
        dataStore.saveInvites(invites);
      }

      delete req.session.inviteToken;
      return done(null, newUser);
    } catch (err) {
      return done(err);
    }
  }
));

passport.serializeUser((user, done) => done(null, user.id));

passport.deserializeUser((id, done) => {
  const user = dataStore.getUserById(id);
  done(null, user || false);
});

// ── Routes ────────────────────────────────────────────────────────────────────

const router = express.Router();

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/access-denied' }),
  (req, res) => res.redirect('/')
);

router.get('/logout', (req, res, next) => {
  req.logout(err => {
    if (err) return next(err);
    res.redirect('/login');
  });
});

router.get('/me', (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  res.json(req.user);
});

module.exports = router;
