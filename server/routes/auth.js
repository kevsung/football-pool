const express = require('express');
const passport = require('passport');
const { Strategy: GoogleStrategy } = require('passport-google-oauth20');
const { v4: uuidv4 } = require('uuid');
const dataStore = require('../utils/dataStore');

// ── Logging helper ────────────────────────────────────────────────────────────

function log(label, data) {
  console.log(`[auth] ${label}`, JSON.stringify(data, null, 2));
}

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
      const email = profile.emails?.[0]?.value || '';

      log('strategy invoked', {
        googleId: profile.id,
        displayName: profile.displayName,
        email,
        sessionId: req.sessionID,
        sessionKeys: Object.keys(req.session),
        inviteToken: req.session.inviteToken || null,
      });

      // Returning user
      const existing = dataStore.getUserByGoogleId(profile.id);
      if (existing) {
        log('returning user found', { userId: existing.id, role: existing.role });
        return done(null, existing);
      }

      const users = dataStore.getUsers();

      // Bootstrap: first user ever becomes admin without needing an invite
      if (users.length === 0) {
        log('bootstrap: creating first admin', { email });
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
      if (!token) {
        log('rejected: no invite token in session', { sessionId: req.sessionID });
        return done(null, false, { message: 'no-invite' });
      }

      const invite = dataStore.getInviteByToken(token);
      if (!invite || invite.usedAt) {
        log('rejected: invalid or already-used invite', { token, invite: invite || null });
        return done(null, false, { message: 'invalid-invite' });
      }

      if (invite.email && email && invite.email.toLowerCase() !== email.toLowerCase()) {
        log('rejected: email mismatch', { inviteEmail: invite.email, googleEmail: email });
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
      log('new user created', { userId: newUser.id, email });
      return done(null, newUser);
    } catch (err) {
      log('strategy threw', { message: err.message, stack: err.stack });
      return done(err);
    }
  }
));

passport.serializeUser((user, done) => {
  log('serializeUser', { userId: user.id });
  done(null, user.id);
});

passport.deserializeUser((id, done) => {
  const user = dataStore.getUserById(id);
  if (!user) log('deserializeUser: user not found', { id });
  done(null, user || false);
});

// ── Routes ────────────────────────────────────────────────────────────────────

const router = express.Router();

router.get('/google', (req, res, next) => {
  log('initiating OAuth redirect', {
    sessionId: req.sessionID,
    inviteToken: req.session.inviteToken || null,
    referer: req.get('referer') || null,
  });
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

router.get('/google/callback', (req, res, next) => {
  log('callback hit', {
    url: req.url,
    query: req.query,            // includes 'code', 'state', or 'error' from Google
    sessionId: req.sessionID,
    sessionKeys: Object.keys(req.session),
    inviteToken: req.session.inviteToken || null,
    headers: {
      host: req.get('host'),
      referer: req.get('referer') || null,
      'x-forwarded-proto': req.get('x-forwarded-proto') || null,
    },
  });

  // Log any OAuth error returned by Google before Passport sees it
  if (req.query.error) {
    log('Google returned OAuth error', {
      error: req.query.error,
      error_description: req.query.error_description || null,
    });
  }

  passport.authenticate('google', {
    failureRedirect: '/access-denied',
    failWithError: true,          // surface failures as errors so the handler below can log them
  })(req, res, err => {
    if (err) {
      log('passport.authenticate failed', {
        message: err.message,
        stack: err.stack,
        user: req.user || null,
      });
      return res.redirect('/access-denied');
    }

    log('authentication succeeded — saving session before redirect', { userId: req.user?.id });

    // Explicitly save the session before redirecting. Without this, the
    // file-store write may not complete before the browser follows the redirect,
    // causing the next request to arrive with no session and kicking the user
    // back to the login page.
    req.session.save(saveErr => {
      if (saveErr) {
        log('session save failed', { message: saveErr.message, stack: saveErr.stack });
        return res.redirect('/access-denied');
      }
      res.redirect('/');
    });
  });
});

// Catch-all error handler scoped to the auth router — logs anything that
// slips past the route handlers (session save errors, unexpected throws, etc.)
router.use((err, req, res, _next) => {
  log('unhandled error in auth router', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    sessionId: req.sessionID,
  });
  res.redirect('/access-denied');
});

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
