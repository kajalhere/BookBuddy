// ===============================
// BookBuddy — Every Book Deserves a Second Reader
// ===============================

// Import dependencies
const express = require("express");
const bodyParser = require("body-parser");
const path = require("path");
const mysql = require("mysql2/promise");
const session = require("express-session");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// ===============================
// Middleware
// ===============================
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env.SESSION_SECRET || "bookbuddysecret",
    resave: false,
    saveUninitialized: true,
  })
);

// Serve static frontend files from /public
app.use(express.static(path.join(__dirname, "public")));

// ===============================
// Database Connection
// ===============================
let pool = null;

(async () => {
  try {
    if (process.env.DB_HOST) {
      pool = mysql.createPool({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 3306,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
      });

      const conn = await pool.getConnection();
      await conn.ping();
      conn.release();
      console.log("✅ Connected to MySQL database");
    } else {
      console.log("⚠️ No MySQL credentials found — using JSON fallback (users.json/books.json)");
    }
  } catch (err) {
    console.error("❌ Database connection error:", err.message);
  }
})();

// ===============================
// Helper: Load/Save JSON fallback
// ===============================
function loadJSON(file) {
  const filePath = path.join(__dirname, file);
  if (!fs.existsSync(filePath)) return [];
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function saveJSON(file, data) {
  const filePath = path.join(__dirname, file);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ===============================
// API Routes
// ===============================

// --- SIGNUP ---
app.post("/api/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password)
      return res.status(400).json({ error: "All fields required" });

    if (pool) {
      // MySQL version
      const [existing] = await pool.query(
        "SELECT id FROM users WHERE username = ? OR email = ?",
        [username, email]
      );
      if (existing.length > 0)
        return res.status(409).json({ error: "User already exists" });

      await pool.query(
        "INSERT INTO users (username, email, password) VALUES (?, ?, ?)",
        [username, email, password]
      );

      res.json({ success: true, message: "Signup successful" });
    } else {
      // JSON fallback
      const users = loadJSON("users.json");
      if (users.find((u) => u.username === username || u.email === email))
        return res.status(409).json({ error: "User already exists" });

      users.push({ username, email, password });
      saveJSON("users.json", users);
      res.json({ success: true });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Signup failed" });
  }
});

// --- LOGIN ---
app.post("/api/login", async (req, res) => {
  try {
    const { usernameOrEmail, password } = req.body;
    if (!usernameOrEmail || !password)
      return res.status(400).json({ error: "All fields required" });

    if (pool) {
      const [rows] = await pool.query(
        "SELECT username, email FROM users WHERE (username = ? OR email = ?) AND password = ?",
        [usernameOrEmail, usernameOrEmail, password]
      );
      if (rows.length === 0)
        return res.status(401).json({ error: "Invalid credentials" });

      req.session.user = rows[0];
      res.json({ success: true, user: rows[0] });
    } else {
      const users = loadJSON("users.json");
      const user = users.find(
        (u) =>
          (u.username === usernameOrEmail || u.email === usernameOrEmail) &&
          u.password === password
      );
      if (!user) return res.status(401).json({ error: "Invalid credentials" });

      req.session.user = user;
      res.json({ success: true, user });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Login failed" });
  }
});

// --- FETCH BOOKS ---
app.get("/api/books", async (req, res) => {
  try {
    if (pool) {
      const [rows] = await pool.query("SELECT * FROM books ORDER BY created_at DESC");
      res.json(rows);
    } else {
      const books = loadJSON("books.json");
      res.json(books);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Could not fetch books" });
  }
});

// --- ADD BOOK ---
app.post("/api/books", async (req, res) => {
  try {
    if (!req.session || !req.session.user)
      return res.status(401).json({ error: "Login required" });

    const { title, author, publisher, price, image, condition } = req.body;
    if (!title || !author || !publisher)
      return res.status(400).json({ error: "Missing required fields" });

    const id = "b" + Date.now();
    const seller = req.session.user.username;
    const img =
      image || `https://picsum.photos/seed/${encodeURIComponent(title)}/400/600`;

    if (pool) {
      await pool.query(
        "INSERT INTO books (id, title, author, publisher, price, image, condition, seller) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [id, title, author, publisher, price || 0, img, condition || "Used - Good", seller]
      );
    } else {
      const books = loadJSON("books.json");
      books.push({
        id,
        title,
        author,
        publisher,
        price,
        image: img,
        condition,
        seller,
      });
      saveJSON("books.json", books);
    }

    res.json({ success: true, message: "Book added successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add book" });
  }
});

// --- DELETE BOOK ---
app.delete("/api/books/:id", async (req, res) => {
  try {
    if (!req.session || !req.session.user)
      return res.status(401).json({ error: "Login required" });

    const bookId = req.params.id;

    if (pool) {
      const [rows] = await pool.query("SELECT seller FROM books WHERE id = ?", [bookId]);
      if (rows.length === 0) return res.status(404).json({ error: "Book not found" });
      if (rows[0].seller !== req.session.user.username)
        return res.status(403).json({ error: "Unauthorized" });

      await pool.query("DELETE FROM books WHERE id = ?", [bookId]);
    } else {
      const books = loadJSON("books.json");
      const filtered = books.filter((b) => b.id !== bookId);
      saveJSON("books.json", filtered);
    }

    res.json({ success: true, message: "Book deleted" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Delete failed" });
  }
});

// --- LOGOUT ---
app.post("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// ===============================
// Frontend Fallback
// ===============================
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===============================
// Start Server
// ===============================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
