const { supabase } = require('../db');
const { auth } = require('./auth');

// While a project is locked — under review by the team, or waiting on
// payment — a client must not be able to change anything on its
// drawings. Admin, team and contractors can still amend freely.
// This enforces it on the server, so it can't be bypassed by an old open
// browser tab or by calling the API directly. Reading is never blocked.
function clientLockGuard(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  auth(req, res, async () => {
    try {
      if (req.user.role !== 'client') return next();
      const { data: drawing } = await supabase.from('drawings').select('project_id').eq('id', req.params.drawingId).single();
      if (!drawing) return next();
      const { data: project } = await supabase.from('projects').select('locked').eq('id', drawing.project_id).single();
      if (project?.locked) {
        return res.status(403).json({ error: 'Your drawings are with the Xpress Draft team for review, so changes are paused until your updated plans are ready.' });
      }
      next();
    } catch (e) {
      console.error('clientLockGuard error:', e.message);
      return res.status(500).json({ error: 'Could not verify project status' });
    }
  });
}

module.exports = { clientLockGuard };
