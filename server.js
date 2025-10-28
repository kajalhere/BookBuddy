//////////////////////////////////////////////////////
// BookBuddy — Every Book Deserves a Second Reader //
//////////////////////////////////////////////////////

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const mysql = require('mysql2');
const session = require('express-session');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'BookBuddySecretKey',
    resave: false,
    saveUninitialized: true,
  })
);

// ===============================
// Database Connection (Railway Compatible)
// ===============================
let db;
try {
  db = mysql.createConnection({
    host: process.env.MYSQLHOST,
    user: process.env.MYSQLUSER,
    password: process.env.MYSQLPASSWORD,
    database: process.env.MYSQLDATABASE,
    port: process.env.MYSQLPORT || 3306,
  });

  db.connect((err) => {
    if (err) {
      console.error('❌ MySQL connection failed:', err.message);
    } else {
      console.log('✅ Connected to MySQL database');
    }
  });
} catch (err) {
  console.error('⚠️ MySQL not connected — using fallback JSON storage');
}

// ===============================
// Routes
// ===============================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== USER AUTH ==========

app.post('/api/register', (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password)
    return res.status(400).json({ error: 'All fields required' });

  const sql = 'INSERT INTO users (username, email, password) VALUES (?, ?, ?)';
  db.query(sql, [username, email, password], (err) => {
    if (err) return res.status(500).json({ error: 'User registration failed' });
    res.json({ message: 'User registered successfully' });
  });
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const sql = 'SELECT * FROM users WHERE email = ? AND password = ?';
  db.query(sql, [email, password], (err, result) => {
    if (err || result.length === 0)
      return res.status(401).json({ error: 'Invalid credentials' });

    req.session.user = result[0];
    res.json({ message: 'Login successful', user: result[0] });
  });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'Logged out successfully' });
});

// ========== BOOKS MANAGEMENT ==========

// Add Book (supports optional image_url field)
app.post('/api/books', (req, res) => {
  const { title, author, genre, price, seller_email, image_url } = req.body;
  const sql =
    'INSERT INTO books (title, author, genre, price, seller_email, image_url) VALUES (?, ?, ?, ?, ?, ?)';
  db.query(sql, [title, author, genre, price, seller_email, image_url || '/default-book.png'], (err) => {
    if (err) {
      console.error('Error adding book:', err);
      return res.status(500).json({ error: 'Failed to add book' });
    }
    res.json({ message: 'Book added successfully' });
  });
});

app.get('/api/books', (req, res) => {
  const sql = 'SELECT * FROM books ORDER BY created_at DESC';
  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Could not fetch books' });
    res.json(rows);
  });
});

app.delete('/api/books/:id', (req, res) => {
  const sql = 'DELETE FROM books WHERE id = ?';
  db.query(sql, [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: 'Failed to delete book' });
    res.json({ message: 'Book deleted successfully' });
  });
});

// ===============================
// Test DB Connection
// ===============================
app.get('/test-db', (req, res) => {
  if (!db) {
    return res.status(500).json({ status: '❌ DB connection not initialized' });
  }

  db.query('SELECT NOW() AS current_time', (err, results) => {
    if (err) {
      console.error('Database test error:', err);
      return res.status(500).json({ status: '❌ DB query failed', error: err.message });
    }
    res.json({
      status: '✅ Database connected successfully',
      server_time: results[0].current_time,
    });
  });
});

// ===============================
// Start server
// ===============================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

