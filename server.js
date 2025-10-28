// ===============================
// BookBuddy — Every Book Deserves a Second Reader
// ===============================

// Import dependencies
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const mysql = require('mysql2');
const session = require('express-session');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ===============================
// Middleware
// ===============================
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'bookbuddysecret',
    resave: false,
    saveUninitialized: true,
  })
);

// Serve static frontend files from /public
app.use(express.static(path.join(__dirname, 'public')));

// ===============================
// Database (MySQL or JSON fallback)
// ===============================
let db;
if (process.env.DB_HOST) {
  // Use Railway MySQL
  db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });

  db.connect((err) => {
    if (err) {
      console.error('❌ Database connection failed:', err.message);
    } else {
      console.log('✅ Connected to MySQL database');
    }
  });
} else {
  console.log('⚠️ No database credentials found — using JSON storage (users.json)');
}

// ===============================
// API Routes
// ===============================

// Example route — get all books
app.get('/api/books', (req, res) => {
  if (db) {
    db.query('SELECT * FROM books', (err, results) => {
      if (err) return res.status(500).json({ error: 'Database error' });
      res.json(results);
    });
  } else {
    const filePath = path.join(__dirname, 'users.json');
    if (!fs.existsSync(filePath)) return res.json([]);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    res.json(data);
  }
});

// Example route — add user
app.post('/api/signup', (req, res) => {
  const { username, email, password } = req.body;
  if (db) {
    const sql = 'INSERT INTO users (username, email, password) VALUES (?, ?, ?)';
    db.query(sql, [username, email, password], (err) => {
      if (err) return res.status(500).json({ error: 'Signup failed' });
      res.json({ success: true });
    });
  } else {
    const filePath = path.join(__dirname, 'users.json');
    const users = fs.existsSync(filePath)
      ? JSON.parse(fs.readFileSync(filePath, 'utf8'))
      : [];
    users.push({ username, email, password });
    fs.writeFileSync(filePath, JSON.stringify(users, null, 2));
    res.json({ success: true });
  }
});

// ===============================
// Serve frontend (index.html) for all routes
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
