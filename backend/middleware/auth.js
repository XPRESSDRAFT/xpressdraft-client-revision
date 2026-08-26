const jwt = require('jsonwebtoken');
const { supabase } = require('../db');
const auth = async (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', decoded.userId)
      .single();
    if (error || !user) return res.status(401).json({ error: 'Invalid token' });
    // Enforced live on every request — suspending an account takes effect
    // immediately, even for a session that's already logged in, since
    // nothing here is cached between requests.
    if (user.active === false) return res.status(401).json({ error: 'This account has been suspended. Please contact Xpress Draft.' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};
const teamOnly = (req, res, next) => {
  if (!['team', 'admin', 'contractor'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Team access only' });
  }
  next();
};
const adminOnly = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access only' });
  }
  next();
};
module.exports = { auth, teamOnly, adminOnly };
