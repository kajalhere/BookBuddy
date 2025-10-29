/************************************************************************
 📚 BOOKBUDDY — Node + Express + MySQL (Railway)
************************************************************************/
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

    await db.execute(`
      CREATE TABLE IF NOT EXISTS donations (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255),
        meta VARCHAR(255),
        location VARCHAR(255),
        image TEXT,
        donor VARCHAR(255)
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
  secret: 'super_secret_key',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true }
}));

// ===============================
// User Auth Routes
// ===============================
app.post('/api/signup', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'Missing fields' });

  try {
    const [existing] = await db.query('SELECT * FROM users WHERE username=? OR email=?', [username, email]);
    if (existing.length > 0) return res.status(409).json({ error: 'User already exists' });

    await db.query('INSERT INTO users (username, email, password) VALUES (?, ?, ?)', [username, email, password]);
    req.session.user = { username, email };
    res.json({ success: true, user: { username, email } });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/login', async (req, res) => {
  const { usernameOrEmail, password } = req.body;
  try {
    const [rows] = await db.query(
      'SELECT * FROM users WHERE (username=? OR email=?) AND password=?',
      [usernameOrEmail, usernameOrEmail, password]
    );
    if (rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = rows[0];
    req.session.user = { username: user.username, email: user.email };
    res.json({ success: true, user: { username: user.username, email: user.email } });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

// ===============================
// Books Routes
// ===============================
app.get('/api/books', async (req, res) => {
  const [rows] = await db.query('SELECT * FROM books ORDER BY id DESC');
  res.json(rows.map(b => ({ ...b, condition: b.book_condition })));
});

app.post('/api/books', async (req, res) => {
  const { title, author, publisher, price, image, condition, seller } = req.body;
  if (!title || !author || !publisher)
    return res.status(400).json({ error: 'Missing fields' });

  await db.query(
    'INSERT INTO books (title, author, publisher, price, image, book_condition, seller) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [title, author, publisher, price || 0, image, condition, seller || 'GuestUser']
  );
  res.json({ success: true });
});

// ===============================
// Donations
// ===============================
app.get('/api/donations', async (_, res) => {
  const [rows] = await db.query('SELECT * FROM donations ORDER BY id DESC');
  res.json(rows);
});

app.post('/api/donations', async (req, res) => {
  const { title, meta, location, image, donor } = req.body;
  await db.query(
    'INSERT INTO donations (title, meta, location, image, donor) VALUES (?, ?, ?, ?, ?)',
    [title, meta, location, image, donor || 'GuestUser']
  );
  res.json({ success: true });
});

// ===============================
// Chat Routes (MySQL JSON storage)
// ===============================
app.get('/api/chats', async (_, res) => {
  const [rows] = await db.query('SELECT * FROM chats ORDER BY last_updated DESC');
  res.json(rows);
});

app.post('/api/chats', async (req, res) => {
  const { chat_id, participants, messages } = req.body;
  try {
    await db.query(
      `INSERT INTO chats (chat_id, participants, messages)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE messages=?, last_updated=CURRENT_TIMESTAMP`,
      [chat_id, JSON.stringify(participants), JSON.stringify(messages), JSON.stringify(messages)]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Chat insert error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ===============================
// Frontend Fallback
// ===============================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
