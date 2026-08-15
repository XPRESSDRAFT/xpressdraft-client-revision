const express = require('express');
const router = express.Router();
const { supabase } = require('../db');
const { auth } = require('../middleware/auth');

router.get('/system', auth, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });

  const result = { supabase: {}, resend: {} };

  try {
    // Count total rows across key tables
    const tables = ['projects', 'drawings', 'comments', 'users', 'deliveries'];
    let totalRows = 0;
    for (const t of tables) {
      const { count } = await supabase.from(t).select('*', { count: 'exact', head: true });
      totalRows += count || 0;
    }
    result.supabase.rows = totalRows + ' total rows';
    result.supabase.warn = totalRows > 40000;

    // Count storage files
    const { data: files } = await supabase.storage.from('drawings').list('', { limit: 1000 });
    result.supabase.storageUsed = files ? files.length + ' files in drawings bucket' : '—';

  } catch (e) {
    result.supabase.error = e.message;
  }

  // Resend - we can't query usage via API easily, show static info
  result.resend = {
    sent: 'Check resend.com dashboard',
    warn: false
  };

  res.json(result);
});

module.exports = router;
