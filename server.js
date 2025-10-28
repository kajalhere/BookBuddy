//////////////////////////////////////////////////////
// BookBuddy — Every Book Deserves a Second Reader //
//////////////////////////////////////////////////////

// ===============================
// Import dependencies
// ===============================
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const mysql = require('mysql2');
const session = require('express-session');
const fs = require('fs');

// ===============================
// Express setup
// ===============================
const app = express();
const PORT = process.env.PORT || 3000;

// ===============================
// Middleware
// ===============================
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

// Serve homepage
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ========== USER AUTH ==========

// Register
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

// Login
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

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ message: 'Logged out successfully' });
});

// ========== BOOKS MANAGEMENT ==========

// Add Book
app.post('/api/books', (req, res) => {
  const { title, author, genre, price, seller_email } = req.body;
  const sql =
    'INSERT INTO books (title, author, genre, price, seller_email) VALUES (?, ?, ?, ?, ?)';
  db.query(sql, [title, author, genre, price, seller_email], (err) => {
    if (err) {
      console.error('Error adding book:', err);
      return res.status(500).json({ error: 'Failed to add book' });
    }
    res.json({ message: 'Book added successfully' });
  });
});

// Fetch all books
app.get('/api/books', (req, res) => {
  const sql = 'SELECT * FROM books ORDER BY created_at DESC';
  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Could not fetch books' });
    res.json(rows);
  });
});

// Delete a book
app.delete('/api/books/:id', (req, res) => {
  const sql = 'DELETE FROM books WHERE id = ?';
  db.query(sql, [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: 'Failed to delete book' });
    res.json({ message: 'Book deleted successfully' });
  });
});

// ===============================
// Fallback route
// ===============================
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// ===============================
// Start server
// ===============================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
