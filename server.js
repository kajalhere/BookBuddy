/**

* ===============================
* BookBuddy — Every Book Deserves a Second Reader
* Backend with MySQL + Image Upload Support
* ===============================
  */

const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const mysql = require('mysql2');
const session = require('express-session');
const app = express();

const PORT = process.env.PORT || 10000;

// ===============================
// Middleware
// ===============================
app.use(bodyParser.json({ limit: '10mb' })); // allow base64 images
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(
session({
secret: 'bookbuddy_secret',
resave: false,
saveUninitialized: true,
})
);

// ===============================
// Database Connection
// ===============================
const db = mysql.createConnection({
host: process.env.MYSQLHOST || 'localhost',
user: process.env.MYSQLUSER || 'root',
password: process.env.MYSQLPASSWORD || '',
database: process.env.MYSQLDATABASE || 'bookbuddy_db',
port: process.env.MYSQLPORT || 3306,
});

db.connect((err) => {
if (err) {
console.error('❌ Database connection failed:', err.message);
} else {
console.log('✅ Connected to MySQL database');
}
});

// ===============================
// Routes
// ===============================

// Add a new book (with optional image)
app.post('/api/books', (req, res) => {
const { title, author, price, image } = req.body;

if (!title || !author || !price)
return res.status(400).json({ error: 'Missing required fields' });

const sql =
'INSERT INTO books (title, author, price, image) VALUES (?, ?, ?, ?)';
db.query(sql, [title, author, price, image || null], (err) => {
if (err) {
console.error('Error adding book:', err);
return res.status(500).json({ error: 'Failed to add book' });
}
res.json({ message: 'Book added successfully' });
});
});

// Fetch all books
app.get('/api/books', (req, res) => {
const sql = 'SELECT id, title, author, price, image FROM books ORDER BY created_at DESC';
db.query(sql, (err, rows) => {
if (err) return res.status(500).json({ error: 'Could not fetch books' });
res.json(rows);
});
});

// Delete a book by ID
app.delete('/api/books/:id', (req, res) => {
const sql = 'DELETE FROM books WHERE id = ?';
db.query(sql, [req.params.id], (err) => {
if (err)
return res.status(500).json({ error: 'Failed to delete book' });
res.json({ message: 'Book deleted successfully' });
});
});

// ===============================
// Test DB Connection
// ===============================
app.get('/test-db', (req, res) => {
db.query('SELECT NOW() AS server_time', (err, results) => {
if (err) {
console.error('Database test error:', err);
return res.status(500).json({ status: '❌ DB query failed', error: err.message });
}
res.json({ status: '✅ DB connected', server_time: results[0].server_time });
});
});

// ===============================
// Start server
// ===============================
app.listen(PORT, () => {
console.log(`🚀 Server running on port ${PORT}`);
});
