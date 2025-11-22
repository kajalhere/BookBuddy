/************************************************************************
 📚 BOOKBUDDY – Node + Express + MySQL (Railway) - AUTO_INCREMENT FIX
************************************************************************/
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const session = require('express-session');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for correct secure cookie handling when behind Railway/Heroku-style proxies
if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

// ===============================
// MySQL Connection (Railway)
// ===============================
let db;
let dbInitialized = false;

(async () => {
  try {
    db = await mysql.createConnection({
      host: process.env.MYSQLHOST,
      user: process.env.MYSQLUSER,
      password: process.env.MYSQLPASSWORD,
      database: process.env.MYSQLDATABASE,
      port: process.env.MYSQLPORT,
    });

    console.log('✅ MySQL connected successfully!');
    console.log("🌐 Connected to host:", process.env.MYSQL_HOST);
    
    // ----------------------------
    // CRITICAL FIX: Repair existing tables to support AUTO_INCREMENT
    // ----------------------------
    
    // Check if users table exists and fix AUTO_INCREMENT
    const [userTableExists] = await db.query(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users'",
      [process.env.MYSQL_DATABASE]
    );

    if (userTableExists.length > 0) {
      console.log('🔧 Users table exists - fixing AUTO_INCREMENT...');
      
      // Modify existing id column to be AUTO_INCREMENT
      try {
        await db.query(`
          ALTER TABLE users 
          MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT
        `);
        console.log('✅ Users table id column fixed!');
      } catch (err) {
        console.log('ℹ️ Users table already has correct structure or needs recreation');
      }
    } else {
      // Create new table with proper structure
      await db.execute(`
        CREATE TABLE users (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(255) UNIQUE NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log('✅ Users table created!');
    }

    // Check if books table exists and fix AUTO_INCREMENT
    const [bookTableExists] = await db.query(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'books'",
      [process.env.MYSQL_DATABASE]
    );

    if (bookTableExists.length > 0) {
      console.log('🔧 Books table exists - fixing AUTO_INCREMENT...');
      
      try {
        await db.query(`
          ALTER TABLE books 
          MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT
        `);
        console.log('✅ Books table id column fixed!');
      } catch (err) {
        console.log('ℹ️ Books table already has correct structure');
      }
    } else {
      await db.execute(`
        CREATE TABLE books (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          author VARCHAR(255) NOT NULL,
          price DECIMAL(10,2) DEFAULT 0,
          image TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log('✅ Books table created!');
    }

    // Check if donations table exists and fix AUTO_INCREMENT
    const [donationTableExists] = await db.query(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'donations'",
      [process.env.MYSQL_DATABASE]
    );

    if (donationTableExists.length > 0) {
      console.log('🔧 Donations table exists - fixing AUTO_INCREMENT...');
      
      try {
        await db.query(`
          ALTER TABLE donations 
          MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT
        `);
        console.log('✅ Donations table id column fixed!');
      } catch (err) {
        console.log('ℹ️ Donations table already has correct structure');
      }
    } else {
      await db.execute(`
        CREATE TABLE donations (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          title VARCHAR(255) NOT NULL,
          meta VARCHAR(255),
          location VARCHAR(255),
          image TEXT,
          donor VARCHAR(255),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log('✅ Donations table created!');
    }

    // Check if chats table exists and fix AUTO_INCREMENT
    const [chatTableExists] = await db.query(
      "SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'chats'",
      [process.env.MYSQL_DATABASE]
    );

    if (chatTableExists.length > 0) {
      console.log('🔧 Chats table exists - fixing AUTO_INCREMENT...');
      
      try {
        await db.query(`
          ALTER TABLE chats 
          MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT
        `);
        console.log('✅ Chats table id column fixed!');
      } catch (err) {
        console.log('ℹ️ Chats table already has correct structure');
      }
    } else {
      await db.execute(`
        CREATE TABLE chats (
          id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
          chat_id VARCHAR(255) UNIQUE NOT NULL,
          participants JSON,
          messages JSON,
          last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
      `);
      console.log('✅ Chats table created!');
    }

    console.log('✅ Base tables ready.');

    // ----------------------------
    // AUTO-FIX MISSING COLUMNS (BOOKS TABLE)
    // ----------------------------
    const requiredColumns = {
      publisher: "VARCHAR(255)",
      book_condition: "VARCHAR(100)",
      seller: "VARCHAR(255)",
      buyer: "VARCHAR(255)"
    };

    for (const [col, type] of Object.entries(requiredColumns)) {
      const [rows] = await db.query(`SHOW COLUMNS FROM books LIKE ?`, [col]);
      if (rows.length === 0) {
        console.log(`🛠 Adding missing column '${col}' to books...`);
        await db.query(`ALTER TABLE books ADD COLUMN ${col} ${type}`);
      }
    }

    console.log('✅ Books table columns verified/fixed.');
    console.log('✅ All tables ready - Database fully initialized!');
    
    dbInitialized = true;

  } catch (err) {
    console.error('❌ MySQL connection/setup failed:', err);
    dbInitialized = false;
  }
})();

// ===============================
// Middleware
// ===============================
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  name: 'bookbuddy.sid',
  secret: process.env.SESSION_SECRET || 'super_secret_key_replace_this',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: (process.env.NODE_ENV === 'production'),
    sameSite: (process.env.NODE_ENV === 'production') ? 'none' : 'lax'
  }
}));

// Helper: ensure DB ready before queries
function requireDb(res) {
  if (!db || !dbInitialized) {
    console.error('❌ Database not ready yet - rejecting request');
    res.status(503).json({ 
      error: 'Database is initializing. Please wait a moment and try again.' 
    });
    return false;
  }
  return true;
}

// ===============================
// Health Check
// ===============================
app.get('/api/health', (req, res) => {
  res.json({ 
    status: (db && dbInitialized) ? 'ready' : 'initializing',
    database: !!db,
    initialized: dbInitialized
  });
});

// ===============================
// Utility: /api/me
// ===============================
app.get('/api/me', (req, res) => {
  if (req.session && req.session.user) {
    return res.json({ 
      user: { 
        username: req.session.user.username, 
        email: req.session.user.email 
      } 
    });
  }
  return res.json({ user: null });
});

// ===============================
// User Auth Routes (FIXED - No id in INSERT)
// ===============================

app.post('/api/signup', async (req, res) => {
  if (!requireDb(res)) return;
  
  const { username, email, password } = req.body;
  
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Check if user already exists
    const [existing] = await db.query(
      'SELECT id FROM users WHERE name = ? OR email = ?', 
      [username, email]
    );
    
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }

    // FIXED: Don't include id in INSERT - let AUTO_INCREMENT handle it
    const [result] = await db.query(
      'INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)', 
      [username, email, password]
    );
    
    // Create session with correct field mapping
    req.session.user = { username: username, email: email };
    
    console.log('✅ User signed up:', username, '(ID:', result.insertId, ')');
    
    return res.json({ 
      success: true, 
      user: { username: username, email: email } 
    });
    
  } catch (err) {
    console.error('❌ Signup error:', err);
    return res.status(500).json({ 
      error: 'Database error during signup',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

app.post('/api/login', async (req, res) => {
  if (!requireDb(res)) return;
  
  const { usernameOrEmail, password } = req.body;
  
  if (!usernameOrEmail || !password) {
    return res.status(400).json({ error: 'Missing credentials' });
  }

  try {
    // Query user by username or email
    const [rows] = await db.query(
      'SELECT * FROM users WHERE (name = ? OR email = ?) AND password_hash = ?',
      [usernameOrEmail, usernameOrEmail, password]
    );
    
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username/email or password' });
    }
    
    const user = rows[0];
    
    // Create session using user.name (the actual DB column)
    req.session.user = { username: user.name, email: user.email };
    
    console.log('✅ User logged in:', user.name);
    
    return res.json({ 
      success: true, 
      user: { username: user.name, email: user.email } 
    });
    
  } catch (err) {
    console.error('❌ Login error:', err);
    return res.status(500).json({ error: 'Database error during login' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      console.error('❌ Logout error:', err);
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.clearCookie('bookbuddy.sid');
    console.log('✅ User logged out');
    return res.json({ success: true });
  });
});

// ===============================
// Books Routes
// ===============================
app.get('/api/books', async (req, res) => {
  if (!requireDb(res)) return;
  
  try {
    const [rows] = await db.query('SELECT * FROM books ORDER BY id DESC');
    
    // Map book_condition to condition for frontend compatibility
    const books = rows.map(b => ({ 
      ...b, 
      condition: b.book_condition 
    }));
    
    return res.json(books);
    
  } catch (err) {
    console.error('❌ Fetch books error:', err);
    return res.status(500).json({ error: 'Database error fetching books' });
  }
});

app.post('/api/books', async (req, res) => {
  if (!requireDb(res)) return;
  
  const { title, author, publisher, price, image, condition, seller } = req.body;
  
  if (!title || !author || !publisher) {
    return res.status(400).json({ error: 'Missing required fields: title, author, publisher' });
  }

  // Use session username as seller, fallback to provided seller or 'GuestUser'
  const sellerName = (req.session && req.session.user && req.session.user.username) 
    ? req.session.user.username 
    : (seller || 'GuestUser');

  try {
    // FIXED: Don't include id in INSERT
    const [result] = await db.query(
      'INSERT INTO books (title, author, publisher, price, image, book_condition, seller) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        title, 
        author, 
        publisher, 
        Number(price) || 0, 
        image || `https://picsum.photos/seed/${encodeURIComponent(title)}/400/600`, 
        condition || 'Used - Good', 
        sellerName
      ]
    );
    
    console.log('✅ Book added:', title, 'by', sellerName, '(ID:', result.insertId, ')');
    
    return res.json({ success: true });
    
  } catch (err) {
    console.error('❌ Insert book error:', err);
    return res.status(500).json({ error: 'Database error adding book' });
  }
});

app.delete('/api/books/:id', async (req, res) => {
  if (!requireDb(res)) return;
  
  const id = req.params.id;
  
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    // Check if book exists and belongs to user
    const [rows] = await db.query('SELECT * FROM books WHERE id = ?', [id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: 'Book not found' });
    }
    
    const book = rows[0];
    
    if (book.seller !== req.session.user.username) {
      return res.status(403).json({ error: 'Unauthorized: You can only delete your own books' });
    }
    
    await db.query('DELETE FROM books WHERE id = ?', [id]);
    
    console.log('✅ Book deleted:', id, 'by', req.session.user.username);
    
    return res.json({ success: true });
    
  } catch (err) {
    console.error('❌ Delete book error:', err);
    return res.status(500).json({ error: 'Database error deleting book' });
  }
});

// ===============================
// Donations Routes
// ===============================
app.get('/api/donations', async (req, res) => {
  if (!requireDb(res)) return;
  
  try {
    const [rows] = await db.query('SELECT * FROM donations ORDER BY id DESC');
    return res.json(rows);
    
  } catch (err) {
    console.error('❌ Fetch donations error:', err);
    return res.status(500).json({ error: 'Database error fetching donations' });
  }
});

app.post('/api/donations', async (req, res) => {
  if (!requireDb(res)) return;
  
  const { title, meta, location, image, donor } = req.body;
  
  if (!title) {
    return res.status(400).json({ error: 'Missing required field: title' });
  }

  // Use session username as donor, fallback to provided donor or 'GuestUser'
  const donorName = (req.session && req.session.user && req.session.user.username) 
    ? req.session.user.username 
    : (donor || 'GuestUser');

  try {
    // FIXED: Don't include id in INSERT
    const [result] = await db.query(
      'INSERT INTO donations (title, meta, location, image, donor) VALUES (?, ?, ?, ?, ?)',
      [
        title, 
        meta || 'Unknown', 
        location || 'N/A', 
        image || `https://picsum.photos/seed/${encodeURIComponent(title)}/400/600`, 
        donorName
      ]
    );
    
    console.log('✅ Donation added:', title, 'by', donorName, '(ID:', result.insertId, ')');
    
    return res.json({ success: true });
    
  } catch (err) {
    console.error('❌ Insert donation error:', err);
    return res.status(500).json({ error: 'Database error adding donation' });
  }
});

// ===============================
// Chat Routes (MySQL JSON storage)
// ===============================
app.get('/api/chats', async (req, res) => {
  if (!requireDb(res)) return;
  
  try {
    const [rows] = await db.query('SELECT * FROM chats ORDER BY last_updated DESC');
    return res.json(rows);
    
  } catch (err) {
    console.error('❌ Fetch chats error:', err);
    return res.status(500).json({ error: 'Database error fetching chats' });
  }
});

app.post('/api/chats', async (req, res) => {
  if (!requireDb(res)) return;
  
  const { chat_id, participants, messages } = req.body;
  
  console.log('📥 Received chat save request:', {
    chat_id,
    participants,
    messageCount: Array.isArray(messages) ? messages.length : 0
  });
  
  if (!chat_id) {
    return res.status(400).json({ success: false, error: 'Missing required field: chat_id' });
  }

  if (!Array.isArray(messages)) {
    return res.status(400).json({ success: false, error: 'Messages must be an array' });
  }

  try {
    // Upsert chat row by unique chat_id
    const [result] = await db.query(
      `INSERT INTO chats (chat_id, participants, messages)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE 
         participants = VALUES(participants), 
         messages = VALUES(messages), 
         last_updated = CURRENT_TIMESTAMP`,
      [
        chat_id, 
        JSON.stringify(participants || []), 
        JSON.stringify(messages || [])
      ]
    );
    
    console.log('✅ Chat saved/updated:', chat_id, 'Messages:', messages.length);
    
    // Return success immediately - don't wait for verification
    return res.status(200).json({ 
      success: true, 
      chat_id: chat_id,
      messageCount: messages.length
    });
    
  } catch (err) {
    console.error('❌ Chat insert/upsert error:', err);
    console.error('❌ Error details:', err.message);
    return res.status(500).json({ 
      success: false,
      error: 'Database error saving chat',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Delete a specific message from a chat (using timestamp)
app.delete('/api/chats/:chat_id/messages/:message_time', async (req, res) => {
  if (!requireDb(res)) return;
  
  const { chat_id, message_time } = req.params;
  
  console.log('🗑️ Delete message request:', { chat_id, message_time });
  
  if (!req.session || !req.session.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  
  try {
    // Fetch the chat
    const [chats] = await db.query('SELECT * FROM chats WHERE chat_id = ?', [chat_id]);
    
    if (chats.length === 0) {
      return res.status(404).json({ success: false, error: 'Chat not found' });
    }
    
    const chat = chats[0];
    
    // Parse messages
    let messages = [];
    try {
      const parsed = typeof chat.messages === 'string' 
        ? JSON.parse(chat.messages) 
        : chat.messages;
      messages = Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return res.status(500).json({ success: false, error: 'Failed to parse messages' });
    }
    
    console.log('📥 Total messages before delete:', messages.length);
    
    // Find message by timestamp
    const msgTime = parseInt(message_time);
    const msgIndex = messages.findIndex(m => m.time === msgTime);
    
    console.log('🔍 Looking for message with time:', msgTime);
    console.log('🔍 Found at index:', msgIndex);
    
    // Check if message exists
    if (msgIndex === -1) {
      console.log('❌ Message not found in chat');
      return res.status(404).json({ success: false, error: 'Message not found' });
    }
    
    const message = messages[msgIndex];
    
    // Check if user is the sender of the message
    if (message.sender !== req.session.user.username) {
      return res.status(403).json({ success: false, error: 'You can only delete your own messages' });
    }
    
    // Remove the message
    messages.splice(msgIndex, 1);
    
    console.log('📥 Total messages after delete:', messages.length);
    
    // Update the chat in database
    await db.query(
      `UPDATE chats SET messages = ?, last_updated = CURRENT_TIMESTAMP WHERE chat_id = ?`,
      [JSON.stringify(messages), chat_id]
    );
    
    console.log('✅ Message deleted from chat:', chat_id);
    
    return res.status(200).json({ 
      success: true, 
      messageCount: messages.length
    });
    
  } catch (err) {
    console.error('❌ Delete message error:', err);
    return res.status(500).json({ 
      success: false,
      error: 'Database error deleting message',
      details: err.message
    });
  }
});


// ===============================
// Frontend Fallback (SPA routing)
// ===============================
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ONE-TIME MIGRATION: Add timestamps to old messages
app.post('/api/migrate-timestamps', async (req, res) => {
  if (!requireDb(res)) return;
  
  console.log('🔄 Starting timestamp migration...');
  
  try {
    // Fetch all chats
    const [chats] = await db.query('SELECT * FROM chats');
    
    let updatedCount = 0;
    let skippedCount = 0;
    
    for (const chat of chats) {
      let messages = [];
      
      try {
        const parsed = typeof chat.messages === 'string' 
          ? JSON.parse(chat.messages) 
          : chat.messages;
        messages = Array.isArray(parsed) ? parsed : [];
      } catch (err) {
        console.warn('Failed to parse messages for chat:', chat.chat_id);
        continue;
      }
      
      // Check if any message is missing timestamp
      const needsUpdate = messages.some(m => !m.time);
      
      if (!needsUpdate) {
        skippedCount++;
        continue;
      }
      
      // Add timestamps to messages that don't have them
      const baseTime = Date.now() - (messages.length * 60000); // 1 minute apart
      messages.forEach((m, index) => {
        if (!m.time) {
          m.time = baseTime + (index * 60000);
          console.log(`✅ Added timestamp ${m.time} to message: "${m.text.substring(0, 30)}"`);
        }
      });
      
      // Update chat in database
      await db.query(
        'UPDATE chats SET messages = ? WHERE chat_id = ?',
        [JSON.stringify(messages), chat.chat_id]
      );
      
      updatedCount++;
      console.log(`✅ Updated chat ${chat.chat_id} with ${messages.length} messages`);
    }
    
    console.log('✅ Migration complete!');
    console.log(`   Updated: ${updatedCount} chats`);
    console.log(`   Skipped: ${skippedCount} chats (already had timestamps)`);
    
    return res.json({ 
      success: true, 
      updated: updatedCount,
      skipped: skippedCount,
      total: chats.length
    });
    
  } catch (err) {
    console.error('❌ Migration failed:', err);
    return res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// ===============================
// Start Server
// ===============================
app.listen(PORT, () => {
  console.log(`🚀 BookBuddy Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Ready to accept connections...`);
});