require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors({
  origin: [
    'https://review.xpressdraft.com.au',
    'https://xpressdraft-frontend.onrender.com',
    'http://localhost:3000'
  ],
  credentials: true
}));
app.use('/api/monday/stripe-webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.get('/health', (req, res) => res.json({ status: 'ok', service: 'xpressdraft-api' }));
app.use('/api/auth',       require('./routes/auth'));
app.use('/api/users',      require('./routes/users'));
app.use('/api/projects',   require('./routes/projects'));
app.use('/api/projects/:projectId/drawings', require('./routes/drawings'));
app.use('/api/drawings/:drawingId/comments', require('./routes/comments'));
app.use('/api/drawings/:drawingId/markups',  require('./routes/markups'));
app.use('/api/monday',     require('./routes/monday'));
app.use('/api/health',     require('./routes/health'));
app.use('/api/proposals',  require('./routes/proposals'));
app.use('/api/contractor', require('./routes/contractor'));
app.use('/api/contractor', require('./routes/contractor'));
app.use('/api/contractor-files', require('./routes/contractor-files'));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong' });
});
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Xpress Draft API running on port ${PORT}`));
