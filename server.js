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
    chat_id VARCHAR(255),
    participants TEXT,
    messages JSON,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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

// ===============================
// Signup (Fixed to match frontend)
// ===============================
app.post('/api/signup', async (req, res) => {
  const { username, email, pass } = req.body;
  if (!username || !email || !pass)
    return res.status(400).json({ error: 'Missing fields' });

  try {
    const [existing] = await db.query(
      'SELECT * FROM users WHERE username = ? OR email = ?',
      [username, email]
    );
    if (existing.length > 0)
      return res.status(409).json({ error: 'User already exists' });

    await db.query(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [username, email, pass]
    );

    req.session.user = { username, email };
    res.json({ success: true, user: { username, email } });
  } catch (err) {
    console.error('❌ Signup DB error:', err);
    res.status(500).json({ error: 'Database error during signup' });
  }
});

// ===============================
// Login (Fixed to match frontend)
// ===============================
app.post('/api/login', async (req, res) => {
  const { username, email, pass } = req.body;
  if ((!username && !email) || !pass)
    return res.status(400).json({ error: 'Missing credentials' });

  try {
    const [rows] = await db.query(
      'SELECT * FROM users WHERE (username = ? OR email = ?) AND password = ?',
      [username || email, username || email, pass]
    );

    if (rows.length === 0)
      return res.status(401).json({ error: 'Invalid credentials' });

    const user = rows[0];
    req.session.user = { username: user.username, email: user.email };
    res.json({ success: true, user: { username: user.username, email: user.email } });
  } catch (err) {
    console.error('❌ Login DB error:', err);
    res.status(500).json({ error: 'Database error during login' });
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
// DONATION ROUTES
// ===============================
app.get('/api/donations', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM donations ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    console.error('❌ Donation fetch error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/donations', async (req, res) => {
  const { title, meta, location, image, donor } = req.body;
  if (!title) return res.status(400).json({ error: 'Missing title' });

  try {
    await db.query(
      `INSERT INTO donations (title, meta, location, image, donor)
       VALUES (?, ?, ?, ?, ?)`,
      [
        title,
        meta || 'Unknown',
        location || 'N/A',
        image || `https://picsum.photos/seed/${encodeURIComponent(title)}/400/600`,
        donor || 'GuestUser'
      ]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Donation insert error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});
// ===============================
// CHAT ROUTES
// ===============================
app.get('/api/chats', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM chats ORDER BY last_updated DESC');
    res.json(rows);
  } catch (err) {
    console.error('❌ Chat fetch error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

app.post('/api/chats', async (req, res) => {
  const { chat_id, participants, messages } = req.body;
  if (!chat_id) return res.status(400).json({ error: 'Missing chat_id' });

  try {
    await db.query(
      `INSERT INTO chats (chat_id, participants, messages)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         messages = VALUES(messages), 
         last_updated = CURRENT_TIMESTAMP`,
      [chat_id, JSON.stringify(participants || []), JSON.stringify(messages || [])]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Chat insert error:', err);
    res.status(500).json({ error: 'Database error' });
  }
});

// ===============================
// 📘 Donations API
// ===============================
app.get('/api/donations', async (req, res) => {
  try {
    const [donations] = await db.query('SELECT * FROM donations ORDER BY id DESC');
    res.json(donations);
  } catch (err) {
    console.error('❌ Error fetching donations:', err);
    res.status(500).json({ error: 'Database error fetching donations' });
  }
});

app.post('/api/donations', async (req, res) => {
  const { title, meta, location, image, donor } = req.body;
  if (!title || !meta || !location)
    return res.status(400).json({ error: 'Missing fields' });

  try {
    await db.query(
      `INSERT INTO donations (title, meta, location, image, donor)
       VALUES (?, ?, ?, ?, ?)`,
      [
        title,
        meta,
        location,
        image || `https://picsum.photos/seed/${encodeURIComponent(title)}/400/600`,
        donor || (req.session.user ? req.session.user.username : 'Anonymous')
      ]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Donation insert error:', err);
    res.status(500).json({ error: 'Database error while saving donation' });
  }
});


// ===============================
// 💬 Chat API
// ===============================
app.get('/api/chats/:chatId', async (req, res) => {
  const { chatId } = req.params;
  try {
    const [rows] = await db.query('SELECT * FROM chats WHERE chat_id = ?', [chatId]);
    if (rows.length === 0) return res.json({ chat_id: chatId, messages: [] });

    res.json(rows[0]);
  } catch (err) {
    console.error('❌ Error fetching chat:', err);
    res.status(500).json({ error: 'Database error fetching chat' });
  }
});

app.post('/api/chats/:chatId', async (req, res) => {
  const { chatId } = req.params;
  const { message, sender } = req.body;

  if (!message || !sender)
    return res.status(400).json({ error: 'Missing sender or message' });

  try {
    const [rows] = await db.query('SELECT * FROM chats WHERE chat_id = ?', [chatId]);
    let messages = [];

    if (rows.length > 0) {
      messages = JSON.parse(rows[0].messages);
      messages.push({ sender, message, time: new Date().toISOString() });
      await db.query('UPDATE chats SET messages = ? WHERE chat_id = ?', [JSON.stringify(messages), chatId]);
    } else {
      messages = [{ sender, message, time: new Date().toISOString() }];
      await db.query(
        'INSERT INTO chats (chat_id, participants, messages) VALUES (?, ?, ?)',
        [chatId, JSON.stringify([sender]), JSON.stringify(messages)]
      );
    }

    res.json({ success: true, chat_id: chatId, messages });
  } catch (err) {
    console.error('❌ Chat update error:', err);
    res.status(500).json({ error: 'Database error while updating chat' });
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
