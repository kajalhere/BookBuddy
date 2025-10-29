const express = require('express');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = __dirname;
const BOOKS_FILE = path.join(DATA_DIR, 'books.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  name: 'bookbuddy.sid',
  secret: 'replace_this_with_a_secure_secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true }
}));

function loadJson(file, defaultValue) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(defaultValue, null, 2));
    return defaultValue;
  }
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8') || 'null') || defaultValue;
  } catch (e) {
    console.error('Failed to parse', file, e);
    return defaultValue;
  }
}
function saveJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Initialize files
loadJson(BOOKS_FILE, []);
loadJson(USERS_FILE, []);

app.get('/api/me', (req, res) => {
  if (req.session && req.session.user) {
    res.json({ user: { username: req.session.user.username, email: req.session.user.email }});
  } else {
    res.json({ user: null });
  }
});

// Signup
app.post('/api/signup', (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  const users = loadJson(USERS_FILE, []);
  if (users.find(u => u.username === username || u.email === email)) {
    return res.status(409).json({ error: 'User exists' });
  }
  const user = { username, email, password };
  users.push(user);
  saveJson(USERS_FILE, users);
  req.session.user = { username, email };
  res.json({ success: true, user: { username, email } });
});

// Login
app.post('/api/login', (req, res) => {
  const { usernameOrEmail, password } = req.body;
  if (!usernameOrEmail || !password) return res.status(400).json({ error: 'Missing fields' });
  const users = loadJson(USERS_FILE, []);
  const found = users.find(u => (u.username === usernameOrEmail || u.email === usernameOrEmail) && u.password === password);
  if (!found) return res.status(401).json({ error: 'Invalid credentials' });
  req.session.user = { username: found.username, email: found.email };
  res.json({ success: true, user: { username: found.username, email: found.email } });
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Failed to logout' });
    res.json({ success: true });
  });
});

// Get books
app.get('/api/books', (req, res) => {
  const books = loadJson(BOOKS_FILE, []);
  res.json(books);
});

// Create book (requires login)
app.post('/api/books', (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'Auth required' });
  const { title, author, publisher, price, image, condition } = req.body;
  if (!title || !author || !publisher) return res.status(400).json({ error: 'Missing fields' });
  const books = loadJson(BOOKS_FILE, []);
  const book = {
    id: 'b' + Date.now(),
    title, author, publisher,
    price: Number(price) || 0,
    image: image || `https://picsum.photos/seed/${encodeURIComponent(title)} /400/600`.replace(' ', ''),
    condition: condition || 'Used - Good',
    seller: req.session.user.username
  };
  books.unshift(book);
  saveJson(BOOKS_FILE, books);
  res.json({ success: true, book });
});

// Delete book (only seller can delete)
app.delete('/api/books/:id', (req, res) => {
  if (!req.session || !req.session.user) return res.status(401).json({ error: 'Auth required' });
  const id = req.params.id;
  const books = loadJson(BOOKS_FILE, []);
  const book = books.find(b => b.id === id);
  if (!book) return res.status(404).json({ error: 'Book not found' });
  if (book.seller !== req.session.user.username) return res.status(403).json({ error: 'Unauthorized' });
  const updated = books.filter(b => b.id !== id);
  saveJson(BOOKS_FILE, updated);
  res.json({ success: true });
});

// Fallback to index.html for SPA routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`BookBuddy server running at http://localhost:${PORT}`);
});