const { supabase } = require('../db');
const { auth } = require('./auth');
const { recordClientAccess } = require('../utils/clientAccess');

// When a client opens a drawing, the viewer asks for that drawing's
// markups once. That request is how we know the client has actually
// opened it, so it triggers the first-open handling. It never delays or
// changes the request itself.
function clientOpenTracker(req, res, next) {
  if (req.method !== 'GET' || req.path !== '/markups') return next();
  auth(req, res, async () => {
    next(); // let the real request carry on straight away
    try {
      if (req.user.role !== 'client') return;
      const { data: drawing } = await supabase.from('drawings').select('project_id').eq('id', req.params.drawingId).single();
      if (drawing) await recordClientAccess(drawing.project_id, req.user.id);
    } catch (e) {
      console.error('clientOpenTracker error:', e.message);
    }
  });
}

module.exports = { clientOpenTracker };
