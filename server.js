/************************************************************************
 📚 BOOKBUDDY — Node + Express + MySQL (Railway) - Clean server.js
************************************************************************/
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 3000;

// trust proxy for correct secure cookie handling when behind Railway/Heroku-style proxies
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

// ===============================
// MySQL Connection (Railway)
// ===============================
let db;
(async () => {
  try {
    db = await mysql.createConnection({
      host: process.env.MYSQLHOST || process.env.MYSQL_HOST,
      user: process.env.MYSQLUSER || process.env.MYSQL_USER,
      password: process.env.MYSQLPASSWORD || process.env.MYSQL_PASSWORD,
      database: process.env.MYSQLDATABASE || process.env.MYSQL_DATABASE,
      port: process.env.MYSQLPORT || process.env.MYSQL_PORT
    });

    console.log('✅ MySQL connected successfully!');

    // Create tables if not exist
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(255) UNIQUE,
        email VARCHAR(255) UNIQUE,
        password VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS books (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255),
        author VARCHAR(255),
        publisher VARCHAR(255),
        price DECIMAL(10,2) DEFAULT 0,
        image TEXT,
        book_condition VARCHAR(100),
        seller VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS donations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255),
        meta VARCHAR(255),
        location VARCHAR(255),
        image TEXT,
        donor VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS chats (
        id INT AUTO_INCREMENT PRIMARY KEY,
        chat_id VARCHAR(255) UNIQUE,
        participants JSON,
        messages JSON,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    console.log('✅ Tables ready.');
  } catch (err) {
    console.error('❌ MySQL connection failed:', err);
  }
})();

// ===============================
// Middleware
// ===============================
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  name: 'bookbuddy.sid',
  secret: process.env.SESSION_SECRET || 'super_secret_key_replace_this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: (process.env.NODE_ENV === 'production'), // secure cookies in production (Railway)
    sameSite: (process.env.NODE_ENV === 'production') ? 'none' : 'lax'
  }
}));

// Helper: ensure DB ready before queries
function requireDb(res) {
  if (!db) {
    res.status(500).json({ error: 'Database not initialized' });
    return false;
  }
  return true;
}

// ===============================
// Utility: /api/me
// ===============================
app.get('/api/me', (req, res) => {
  if (req.session && req.session.user) {
    // expose only username & email to frontend
    return res.json({ user: { username: req.session.user.username, email: req.session.user.email } });
  }
  return res.json({ user: null });
});

// ===============================
// User Auth Routes
// ===============================
app.post('/api/signup', async (req, res) => {
  if (!requireDb(res)) return;
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'Missing fields' });

  try {
    const [existing] = await db.query('SELECT id FROM users WHERE username = ? OR email = ?', [username, email]);
    if (existing.length > 0) return res.status(409).json({ error: 'User already exists' });

    await db.query('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, password]);
    req.session.user = { username, email };
    return res.json({ success: true, user: { username, email } });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/login', async (req, res) => {
  if (!requireDb(res)) return;
  const { usernameOrEmail, password } = req.body;
  if (!usernameOrEmail || !password) return res.status(400).json({ error: 'Missing credentials' });

  try {
    const [rows] = await db.query(
      'SELECT * FROM users WHERE (username = ? OR email = ?) AND password = ?',
      [usernameOrEmail, usernameOrEmail, password]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = rows[0];
    req.session.user = { username: user.username, email: user.email };
    return res.json({ success: true, user: { username: user.username, email: user.email } });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('Logout error', err);
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.clearCookie('bookbuddy.sid');
    return res.json({ success: true });
  });
});

// ===============================
// Books Routes
// ===============================
app.get('/api/books', async (req, res) => {
  if (!requireDb(res)) return;
  try {
    const [rows] = await db.query('SELECT * FROM books ORDER BY id DESC');
    // match frontend expected field name 'condition'
    const books = rows.map(b => ({ ...b, condition: b.book_condition }));
    return res.json(books);
  } catch (err) {
    console.error('Fetch books error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/books', async (req, res) => {
  if (!requireDb(res)) return;
  const { title, author, publisher, price, image, condition, seller } = req.body;
  if (!title || !author || !publisher) return res.status(400).json({ error: 'Missing fields' });

  // prefer session user for seller when available
  const sellerName = (req.session && req.session.user && req.session.user.username) ? req.session.user.username : (seller || 'GuestUser');

  try {
    await db.query(
      'INSERT INTO books (title, author, publisher, price, image, book_condition, seller) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [title, author, publisher, Number(price) || 0, image || `https://picsum.photos/seed/${encodeURIComponent(title)}/400/600`, condition || 'Used - Good', sellerName]
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('Insert book error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

app.delete('/api/books/:id', async (req, res) => {
  if (!requireDb(res)) return;
  const id = req.params.id;
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'Auth required' });

  try {
    const [rows] = await db.query('SELECT * FROM books WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Book not found' });
    const book = rows[0];
    if (book.seller !== req.session.user.username) return res.status(403).json({ error: 'Unauthorized' });
    await db.query('DELETE FROM books WHERE id = ?', [id]);
    return res.json({ success: true });
  } catch (err) {
    console.error('Delete book error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

// ===============================
// Donations Routes
// ===============================
app.get('/api/donations', async (req, res) => {
  if (!requireDb(res)) return;
  try {
    const [rows] = await db.query('SELECT * FROM donations ORDER BY id DESC');
    return res.json(rows);
  } catch (err) {
    console.error('Fetch donations error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/donations', async (req, res) => {
  if (!requireDb(res)) return;
  const { title, meta, location, image, donor } = req.body;
  if (!title) return res.status(400).json({ error: 'Missing title' });

  // prefer session user for donor when available
  const donorName = (req.session && req.session.user && req.session.user.username) ? req.session.user.username : (donor || 'GuestUser');

  try {
    await db.query(
      'INSERT INTO donations (title, meta, location, image, donor) VALUES (?, ?, ?, ?, ?)',
      [title, meta || 'Unknown', location || 'N/A', image || `https://picsum.photos/seed/${encodeURIComponent(title)}/400/600`, donorName]
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('Insert donation error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

// ===============================
// Chat Routes (MySQL JSON storage)
// ===============================
app.get('/api/chats', async (req, res) => {
  if (!requireDb(res)) return;
  try {
    const [rows] = await db.query('SELECT * FROM chats ORDER BY last_updated DESC');
    return res.json(rows);
  } catch (err) {
    console.error('Fetch chats error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/chats', async (req, res) => {
  if (!requireDb(res)) return;
  const { chat_id, participants, messages } = req.body;
  if (!chat_id) return res.status(400).json({ error: 'Missing chat_id' });

  try {
    // upsert chat row by unique chat_id
    await db.query(
      `INSERT INTO chats (chat_id, participants, messages)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE participants = VALUES(participants), messages = VALUES(messages), last_updated = CURRENT_TIMESTAMP`,
      [chat_id, JSON.stringify(participants || []), JSON.stringify(messages || [])]
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('Chat insert/upsert error:', err);
    return res.status(500).json({ error: 'Database error' });
  }
});

// ===============================
// Frontend Fallback
// ===============================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===============================
// Start Server
// ===============================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
