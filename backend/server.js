require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/health', (req, res) => res.json({ status: 'ok', service: 'xpressdraft-api' }));

app.use('/api/auth',    require('./routes/auth'));
app.use('/api/users',   require('./routes/users'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/projects/:projectId/drawings', require('./routes/drawings'));
app.use('/api/drawings/:drawingId/comments', require('./routes/comments'));
app.use('/api/drawings/:drawingId/markups',  require('./routes/markups'));

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong' });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Xpress Draft API running on port ${PORT}`));
