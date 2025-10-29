const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 3000;

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
        password VARCHAR(255)
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS books (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255),
        author VARCHAR(255),
        publisher VARCHAR(255),
        price DECIMAL(10,2),
        image TEXT,
        book_condition VARCHAR(100),
        seller VARCHAR(255)
      )
    `);

    console.log('✅ Tables verified or created.');
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
  secret: 'replace_this_with_a_secure_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true }
}));

// ===============================
// Test DB Route
// ===============================
app.get('/test-db', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT 1');
    res.send('✅ Database connected successfully!');
  } catch (err) {
    console.error(err);
    res.status(500).send('❌ Database connection failed!');
  }
});

// ===============================
// API Routes
// ===============================

// Get logged-in user
app.get('/api/me', (req, res) => {
  if (req.session && req.session.user) {
    res.json({ user: { username: req.session.user.username, email: req.session.user.email }});
  } else {
    res.json({ user: null });
  }
});

// Signup
app.post('/api/signup', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'Missing fields' });

  try {
    const [existing] = await db.query(
      'SELECT * FROM users WHERE username = ? OR email = ?',
      [username, email]
    );
    if (existing.length > 0) return res.status(409).json({ error: 'User exists' });

    await db.query(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [username, email, password]
    );

    req.session.user = { username, email };
    res.json({ success: true, user: { username, email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  const { usernameOrEmail, password } = req.body;
  if (!usernameOrEmail || !password) return res.status(400).json({ error: 'Missing fields' });

  try {
    const [rows] = await db.query(
      'SELECT * FROM users WHERE (username = ? OR email = ?) AND password = ?',
      [usernameOrEmail, usernameOrEmail, password]
    );

    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = rows[0];
    req.session.user = { username: user.username, email: user.email };
    res.json({ success: true, user: { username: user.username, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Failed to logout' });
    res.json({ success: true });
  });
});

// Get all books
// Get all books (normalize field name for frontend)
app.get('/api/books', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM books ORDER BY id DESC');
    const books = rows.map(b => ({
      ...b,
      condition: b.book_condition // rename to match frontend
    }));
    res.json(books);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});


// Create book (requires login)
// Create book (public — compatible with frontend script.js)
app.post('/api/books', async (req, res) => {
  const { title, author, publisher, price, image, condition, seller } = req.body;
  if (!title || !author || !publisher)
    return res.status(400).json({ error: 'Missing fields' });

  try {
    await db.query(
      `INSERT INTO books (title, author, publisher, price, image, book_condition, seller)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        title,
        author,
        publisher,
        Number(price) || 0,
        image || `https://picsum.photos/seed/${encodeURIComponent(title)}/400/600`,
        condition || 'Used - Good',
        seller || 'GuestUser'
      ]
    );

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});


// Delete book (only seller can delete)
app.delete('/api/books/:id', async (req, res) => {
  if (!req.session || !req.session.user)
    return res.status(401).json({ error: 'Auth required' });

  const id = req.params.id;

  try {
    const [rows] = await db.query('SELECT * FROM books WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Book not found' });

    const book = rows[0];
    if (book.seller !== req.session.user.username)
      return res.status(403).json({ error: 'Unauthorized' });

    await db.query('DELETE FROM books WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ===============================
// Frontend fallback
// ===============================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===============================
// Start Server
// ===============================
app.listen(PORT, () => {
  console.log(`🚀 BookBuddy server running on port ${PORT}`);
  console.log(`🌐 Live on: ${process.env.RAILWAY_PUBLIC_DOMAIN || 'http://localhost:' + PORT}`);
});
