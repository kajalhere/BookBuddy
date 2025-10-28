/**

* ===============================
* BookBuddy — Every Book Deserves a Second Reader
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
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
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

// Add a new book (only title, author, price)
app.post('/api/books', (req, res) => {
const { title, author, price } = req.body;

if (!title || !author || !price) {
return res.status(400).json({ error: 'Title, author, and price are required' });
}

const sql = 'INSERT INTO books (title, author, price) VALUES (?, ?, ?)';
db.query(sql, [title, author, price], (err) => {
if (err) {
console.error('Error adding book:', err);
return res.status(500).json({ error: 'Failed to add book' });
}
res.json({ message: 'Book added successfully' });
});
});

// Fetch all books (only return id, title, author, price)
app.get('/api/books', (req, res) => {
const sql = 'SELECT id, title, author, price FROM books ORDER BY created_at DESC';
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
// Test DB Connection (Fixed)
// ===============================
app.get('/test-db', (req, res) => {
if (!db) {
return res.status(500).json({ status: '❌ DB connection not initialized' });
}

const tests = [
{ sql: 'SELECT 1 AS ok', label: 'select_1' },
{ sql: 'SELECT NOW() AS server_time', label: 'select_now' },
{ sql: 'SELECT CURRENT_TIMESTAMP AS ts', label: 'select_current_timestamp' },
];

function runQuery(q) {
return new Promise((resolve) => {
db.query(q.sql, (err, results) => {
resolve({
label: q.label,
sql: q.sql,
err: err ? err.sqlMessage || err.message : null,
results,
});
});
});
}

(async () => {
const report = [];
for (const t of tests) {
const r = await runQuery(t);
report.push(r);
if (!r.err) {
return res.json({
status: '✅ DB query succeeded',
passed: r.label,
results: r.results,
});
}
}
return res.status(500).json({
status: '❌ All test queries failed',
report,
});
})();
});

// ===============================
// Start server
// ===============================
app.listen(PORT, () => {
console.log(`🚀 Server running on port ${PORT}`);
});
