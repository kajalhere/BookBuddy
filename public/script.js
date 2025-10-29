/************************************************************************
 BookBuddy — Full frontend wired to Railway MySQL backend
 API base: https://bookbuddy-production-364d.up.railway.app
************************************************************************/

// --- CONFIG
const API_BASE = 'https://bookbuddy-production-364d.up.railway.app'; // <= your Railway domain
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const LS = window.localStorage;

// --- HELPERS (local fallback storage kept for offline)
function safeSet(key, val) { try { LS.setItem(key, JSON.stringify(val)); } catch(e) {} }
function safeGet(key, fallback) { try { return JSON.parse(LS.getItem(key) || 'null') || fallback; } catch(e) { return fallback; } }

// --- STATE helpers (prefer server session)
async function fetchCurrentUserFromServer() {
  try {
    const res = await fetch(`${API_BASE}/api/me`, { credentials: 'include' });
    if (!res.ok) return null;
    const data = await res.json();
    if (data && data.user) {
      safeSet('currentUser', data.user);
      return data.user;
    }
    safeSet('currentUser', null);
    return null;
  } catch (err) {
    // network failure -> fallback to local cached
    return safeGet('currentUser', null);
  }
}
function getCurrentUserLocal() { return safeGet('currentUser', null); }
function setCurrentUserLocal(u) { safeSet('currentUser', u); }

// --- FETCH / SYNC FUNCTIONS
async function fetchBooksFromServer() {
  try {
    const res = await fetch(`${API_BASE}/api/books`, { credentials: 'include' });
    if (!res.ok) throw new Error('Bad response');
    const books = await res.json();
    // normalize
    const normalized = (books || []).map(b => ({
      id: b.id ? String(b.id) : 'b' + Date.now(),
      title: b.title || '',
      author: b.author || '',
      publisher: b.publisher || '',
      price: b.price == null ? 0 : Number(b.price),
      image: b.image || b.image_url || `https://picsum.photos/seed/${encodeURIComponent(b.title || Date.now())}/400/600`,
      condition: b.condition || b.book_condition || 'Used - Good',
      seller: b.seller || 'GuestUser'
    }));
    safeSet('books', normalized);
    refreshAll();
    return normalized;
  } catch (err) {
    console.error('fetchBooksFromServer failed', err);
    // fallback to local
    return safeGet('books', []);
  }
}

async function fetchDonationsFromServer() {
  try {
    const res = await fetch(`${API_BASE}/api/donations`, { credentials: 'include' });
    if (!res.ok) throw new Error('Bad response');
    const rows = await res.json();
    safeSet('donations', rows);
    return rows;
  } catch (err) {
    console.error('fetchDonationsFromServer failed', err);
    return safeGet('donations', []);
  }
}

async function fetchChatsFromServer() {
  try {
    const res = await fetch(`${API_BASE}/api/chats`, { credentials: 'include' });
    if (!res.ok) throw new Error('Bad response');
    const rows = await res.json();
    // keep as-is
    safeSet('chats', rows);
    return rows;
  } catch (err) {
    console.error('fetchChatsFromServer failed', err);
    return safeGet('chats', {});
  }
}

// --- local helpers to read/write cached copies
function getBooks() { return safeGet('books', []); }
function saveBooks(arr) { safeSet('books', arr); }
function getUsers() { return safeGet('users', []); } // kept for demo fallback only
function saveUsers(u) { safeSet('users', u); }
function getChatsLocal() { return safeGet('chats', {}); }
function saveChatsLocal(c) { safeSet('chats', c); }

// --- UI rendering logic (kept same)
function numberWithCommas(x) { return x == null ? '0' : x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function escapeHtml(str) { if (!str) return ''; return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
function truncate(s, n) { if (!s) return ''; return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function renderGrid(containerId, books) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  if (!books || books.length === 0) {
    const empty = document.createElement('div');
    empty.style.padding = '22px';
    empty.style.textAlign = 'center';
    empty.style.color = 'var(--muted)';
    empty.style.gridColumn = '1/-1';
    empty.innerHTML = '<strong>No listings yet</strong><div style="font-size:13px;margin-top:6px">Post a book from the Sell page to see it here.</div>';
    container.appendChild(empty);
    return;
  }

  books.forEach(b => {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <div class="thumb"><img src="${escapeHtml(b.image)}" alt="${escapeHtml(b.title)} cover" loading="lazy"></div>
      <div class="meta">
        <div class="title">${escapeHtml(b.title)}</div>
        <div class="author">${escapeHtml(b.author)} • ${escapeHtml(b.publisher)}</div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div class="price">₹ ${numberWithCommas(b.price || 0)}</div>
          <div class="condition" style="font-size:13px;color:var(--muted)">${escapeHtml(b.condition || '')}</div>
        </div>
      </div>
      <div class="actions">
        <button class="btn-small btn-buy" data-id="${b.id}">Buy</button>
        <button class="btn-small btn-chat" data-id="${b.id}">Chat</button>
        ${getCurrentUserLocal() && getCurrentUserLocal().username === b.seller
          ? `<button class="btn-small btn-delete" data-id="${b.id}" style="background:#fff;border:1px solid #d9443f;color:#d9443f">Delete</button>`
          : ''}
      </div>
    `;
    container.appendChild(div);
  });

  container.querySelectorAll('.btn-chat').forEach(btn => {
    btn.addEventListener('click', e => openListingChat(e.currentTarget.dataset.id));
  });
  container.querySelectorAll('.btn-buy').forEach(btn => {
    btn.addEventListener('click', e => openBuyFlow(e.currentTarget.dataset.id));
  });
}

// --- Search / routing / UI wiring (kept same)
const sampleUsers = [
  { username: 'alice', email: 'alice@example.com', pass: 'alice123' },
  { username: 'bob', email: 'bob@example.com', pass: 'bob123' }
];
if (!safeGet('users', null)) safeSet('users', sampleUsers);

function searchAndShow(q) {
  q = (q || '').trim().toLowerCase();
  const books = getBooks();
  if (!q) {
    renderGrid('homeGrid', books.slice(0, 4));
    renderGrid('buyGrid', books);
    return;
  }
  const matched = books.filter(b =>
    (b.title || '').toLowerCase().includes(q) ||
    (b.author || '').toLowerCase().includes(q) ||
    (b.publisher || '').toLowerCase().includes(q) ||
    (b.seller || '').toLowerCase().includes(q)
  );
  renderGrid('homeGrid', matched.slice(0, 8));
  renderGrid('buyGrid', matched);
}
$('#searchBtn')?.addEventListener('click', () => { searchAndShow($('#globalSearch').value); showPage('buy'); });
$('#globalSearch')?.addEventListener('keyup', (e) => { if (e.key === 'Enter') { searchAndShow($('#globalSearch').value); showPage('buy'); } else searchAndShow($('#globalSearch').value); });

function showPage(id) {
  $$('.page').forEach(p => p.classList.remove('active'));
  $$('#homePage, #buyPage, #sellPage, #donatePage').forEach(p => {
    if (p.id === id + 'Page') p.classList.add('active');
    else p.classList.remove('active');
  });
  $$('.nav-link').forEach(a => a.classList.toggle('active', a.dataset.route === id));
  if (id === 'buy') renderGrid('buyGrid', getBooks());
  if (id === 'home') renderGrid('homeGrid', getBooks().slice(0, 4));
}
showPage('home');
$$('.nav-link').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); showPage(a.dataset.route); }));
$$('.cta-row button, .top-nav a, .primary-btn[data-route]').forEach(btn => btn.addEventListener('click', (e) => { const route = e.currentTarget.dataset.route; if (route) showPage(route); }));

// --- Auth: use server endpoints

// ======================== SIGNUP (MySQL Integrated) =========================
async function doSignup() {
  const email = $('#authEmail').value.trim();
  const username = $('#authUser').value.trim();
  const pass = $('#authPass').value;

  if (!email || !username || !pass) {
    alert('Please fill all fields');
    return;
  }

  try {
    const res = await fetch('/api/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username, pass })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Signup failed');

    setCurrentUser(data.user);
    closeAuth();
    updateAuthState();
    alert('Account created and logged in as ' + username);
  } catch (err) {
    console.error('❌ Signup error:', err);
    alert('Signup failed: ' + err.message);
  }
}

// ======================== LOGIN (MySQL Integrated) =========================
async function doLogin() {
  const email = $('#authEmail').value.trim();
  const username = $('#authUser').value.trim();
  const pass = $('#authPass').value;

  if ((!email && !username) || !pass) {
    alert('Please fill all fields');
    return;
  }

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, username, pass })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');

    setCurrentUser(data.user);
    closeAuth();
    updateAuthState();
    alert('Logged in as ' + data.user.username);
  } catch (err) {
    console.error('❌ Login error:', err);
    alert('Login failed: ' + err.message);
  }
}


async function doLogout() {
  try {
    await fetch(`${API_BASE}/api/logout`, { method: 'POST', credentials: 'include' });
  } catch (_) {}
  setCurrentUserLocal(null);
  updateAuthState();
}

// UI auth wiring
$('#signupBtn')?.addEventListener('click', doSignup);
$('#loginExistingBtn')?.addEventListener('click', doLogin);
$('#closeAuth')?.addEventListener('click', () => closeAuth());
const loginNavBtn = $('#loginNavBtn');
if (loginNavBtn) loginNavBtn.addEventListener('click', (e) => { e.preventDefault(); openAuth(); });

function openAuth() { $('#authModal')?.classList.add('open'); }
function closeAuth() { $('#authModal')?.classList.remove('open'); }

async function updateAuthState() {
  const user = await fetchCurrentUserFromServer();
  const navBtn = $('#loginNavBtn');
  if (navBtn) {
    if (user) {
      navBtn.textContent = user.username;
      navBtn.onclick = () => {
        if (confirm('Logout?')) doLogout();
      };
    } else {
      navBtn.textContent = 'Login / Sign up';
      navBtn.onclick = (e) => { e.preventDefault(); openAuth(); };
    }
  }
  refreshAll();
}
updateAuthState();

// --- Post listing (Sell) -> server
$('#postListingBtn')?.addEventListener('click', async () => {
  const cur = await fetchCurrentUserFromServer();
  if (!cur) { if (confirm('You must be logged in to post. Login now?')) openAuth(); return; }

  const title = $('#sellTitle').value.trim();
  const author = $('#sellAuthor').value.trim();
  const publisher = $('#sellPublisher').value.trim();
  const price = Number($('#sellPrice').value || 0);
  const condition = $('#sellCondition').value;
  let image = $('#sellImage').value.trim();
  if (!image) image = `https://picsum.photos/seed/${encodeURIComponent(title || Date.now())}/400/600`;
  if (!title || !author || !publisher || !price) { alert('Please fill all required fields'); return; }

  const newBook = { title, author, publisher, price, condition, image, seller: cur.username };

  try {
    const res = await fetch(`${API_BASE}/api/books`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newBook)
    });
    if (!res.ok) throw new Error('Server error');
    await fetchBooksFromServer();
    $('#sellTitle').value = ''; $('#sellAuthor').value = ''; $('#sellPublisher').value = ''; $('#sellPrice').value = ''; $('#sellImage').value = '';
    alert('Listing posted.');
    showPage('buy');
  } catch (err) {
    console.error('Post book failed', err);
    // fallback to local
    const books = getBooks();
    const id = 'b' + Date.now();
    books.unshift({ id, ...newBook });
    saveBooks(books);
    refreshAll();
    alert('Listing posted locally (server unavailable).');
  }
});

// --- Donate -> server
$('#postDonateBtn')?.addEventListener('click', async () => {
  const cur = await fetchCurrentUserFromServer();
  if (!cur) { if (confirm('You must be logged in to donate. Login now?')) openAuth(); return; }
  const title = $('#donateTitle').value.trim();
  const meta = $('#donateMeta').value.trim();
  const loc = $('#donateLocation').value.trim();
  if (!title) { alert('Please add the book title'); return; }

  const newDonation = { title, meta, location: loc, image: `https://picsum.photos/seed/${encodeURIComponent(title)}/400/600`, donor: cur.username };

  try {
    const res = await fetch(`${API_BASE}/api/donations`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newDonation)
    });
    if (!res.ok) throw new Error('Server error');
    await fetchDonationsFromServer();
    $('#donateTitle').value = ''; $('#donateMeta').value = ''; $('#donateLocation').value = '';
    alert('Donation posted (free listing).');
    showPage('buy');
  } catch (err) {
    console.error('Post donate failed', err);
    // fallback local
    const d = safeGet('donations', []);
    d.unshift(newDonation);
    safeSet('donations', d);
    alert('Donation posted locally (server unavailable).');
  }
});

// --- Buy flow (client-only)
function openBuyFlow(bookId) {
  const cur = getCurrentUserLocal();
  if (!cur) { if (confirm('You must be logged in to buy. Login now?')) openAuth(); return; }
  const book = getBooks().find(b => b.id === bookId);
  if (!book) { alert('Item not found'); return; }
  if (!confirm(`Buy "${book.title}" for ₹${numberWithCommas(book.price)} ?`)) return;
  alert('Purchase successful (demo). Please contact seller via chat to arrange pickup/shipping.');
}

// --- CHAT: store in DB
/************************************************************************
 📩 CHAT MODULE — Buy Page Popup Chat (MySQL + Auto Refresh)
************************************************************************/
let activeChatId = null;
let activeChatPartner = null;
let chatPoll = null;

// Open chat popup for a specific seller/book
async function openListingChat(bookId) {
  const books = getBooks();
  const book = books.find(b => b.id == bookId);
  if (!book) return alert('Book not found');

  const curUser = getCurrentUserLocal();
  if (!curUser) {
    alert('Please log in to start chat.');
    openAuth();
    return;
  }

  activeChatPartner = book.seller;
  const chatUsers = [curUser.username, book.seller].sort();
  activeChatId = chatUsers.join('_');

  document.getElementById('chatTitle').textContent = `Chat with ${book.seller}`;
  document.getElementById('chatModal').classList.add('open');

  loadChatMessages();
  if (chatPoll) clearInterval(chatPoll);
  chatPoll = setInterval(loadChatMessages, 5000); // refresh every 5s
}

// Close chat
document.getElementById('closeChat')?.addEventListener('click', () => {
  document.getElementById('chatModal').classList.remove('open');
  if (chatPoll) clearInterval(chatPoll);
  chatPoll = null;
  activeChatId = null;
  activeChatPartner = null;
});

// Load messages from DB
async function loadChatMessages() {
  if (!activeChatId) return;
  try {
    const res = await fetch(`${API_BASE}/api/chats`);
    const chats = await res.json();
    const chat = chats.find(c => c.chat_id === activeChatId);
    const messagesArea = document.getElementById('messagesArea');
    messagesArea.innerHTML = '';

    if (chat && chat.messages) {
      const msgs = JSON.parse(chat.messages);
      msgs.forEach(msg => {
        const div = document.createElement('div');
        div.className = 'message ' + (msg.sender === getCurrentUserLocal().username ? 'me' : 'them');
        div.textContent = `${msg.sender}: ${msg.text}`;
        messagesArea.appendChild(div);
      });
      messagesArea.scrollTop = messagesArea.scrollHeight;
    } else {
      messagesArea.innerHTML = '<div style="color:gray;text-align:center;margin-top:10px;">Start chatting...</div>';
    }
  } catch (err) {
    console.error('❌ Chat load error:', err);
  }
}

// Send message
document.getElementById('sendChatBtn')?.addEventListener('click', async () => {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  const curUser = getCurrentUserLocal();
  if (!curUser) {
    alert('Please log in first');
    openAuth();
    return;
  }

  try {
    // Load current messages first
    const res = await fetch(`${API_BASE}/api/chats`);
    const chats = await res.json();
    const existingChat = chats.find(c => c.chat_id === activeChatId);
    const oldMsgs = existingChat && existingChat.messages ? JSON.parse(existingChat.messages) : [];

    const newMsg = { sender: curUser.username, text, timestamp: Date.now() };
    const updatedMsgs = [...oldMsgs, newMsg];

    await fetch(`${API_BASE}/api/chats`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: activeChatId,
        participants: [curUser.username, activeChatPartner],
        messages: updatedMsgs
      })
    });

    input.value = '';
    await loadChatMessages();
  } catch (err) {
    console.error('❌ Chat send error:', err);
  }
});


// --- Delete listing (server)
async function deleteBook(id) {
  const user = await fetchCurrentUserFromServer();
  if (!user) { openAuth(); return; }
  if (!confirm('Confirm delete?')) return;
  try {
    const res = await fetch(`${API_BASE}/api/books/${id}`, { method: 'DELETE', credentials: 'include' });
    if (!res.ok) throw new Error('Delete failed');
    await fetchBooksFromServer();
    alert('Book deleted');
  } catch (err) {
    console.error('deleteBook failed', err);
    // fallback local
    const books = getBooks().filter(b => b.id !== id);
    saveBooks(books);
    refreshAll();
    alert('Book deleted locally');
  }
}
document.addEventListener('click', function (e) {
  const el = e.target;
  if (el && el.classList && el.classList.contains('btn-delete')) {
    const id = el.dataset.id;
    deleteBook(id);
  }
});

// --- Refresh UI
function refreshAll() {
  renderGrid('homeGrid', getBooks().slice(0, 4));
  renderGrid('buyGrid', getBooks());
}

// --- initial load
document.addEventListener('DOMContentLoaded', async () => {
  const initial = (document.body && document.body.dataset && document.body.dataset.page) ? document.body.dataset.page : 'home';
  showPage(initial);
  // get current user and data
  await fetchCurrentUserFromServer();
  await Promise.all([fetchBooksFromServer(), fetchDonationsFromServer(), fetchChatsFromServer()]);
  updateAuthState();
});

// --- accessibility
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    $('#authModal')?.classList.remove('open');
    $('#chatModal')?.classList.remove('open');
  }
});

// expose some helpers globally for inline html usage
window.openListingChat = openListingChat;
window.quickOpenChatFor = function(bookId) { openListingChat(bookId); };
