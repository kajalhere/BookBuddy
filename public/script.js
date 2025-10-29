/************************************************************************
 Full BookBuddy frontend (restore) + MySQL integration for Sell/Donate
*************************************************************************/

// Utility helpers
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const LS = window.localStorage;

// ==================== FETCH BOOKS FROM MYSQL ====================
async function fetchBooksFromServer() {
  try {
    const res = await fetch('/api/books');
    if (!res.ok) throw new Error('Failed to fetch /api/books: ' + res.status);
    const books = await res.json();
    // Normalize: ensure id and condition exist
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
    LS.setItem('books', JSON.stringify(normalized));
    console.log('✅ Books loaded from server:', normalized);
    refreshAll();
  } catch (err) {
    console.error('❌ Failed to fetch from server, using local data:', err);
  }
}

// ==================== INITIAL STORAGE ====================
const sampleUsers = [
  { username: 'alice', email: 'alice@example.com', pass: 'alice123' },
  { username: 'bob', email: 'bob@example.com', pass: 'bob123' }
];

function initStorage() {
  if (!LS.getItem('books')) LS.setItem('books', JSON.stringify([]));
  if (!LS.getItem('users')) LS.setItem('users', JSON.stringify(sampleUsers));
  if (!LS.getItem('chats')) LS.setItem('chats', JSON.stringify({}));
}
initStorage();

// ==================== Local helpers ====================
function getBooks() { return JSON.parse(LS.getItem('books') || '[]'); }
function saveBooks(arr) { LS.setItem('books', JSON.stringify(arr)); }
function getUsers() { return JSON.parse(LS.getItem('users') || '[]'); }
function saveUsers(u) { LS.setItem('users', JSON.stringify(u)); }
function getChats() { return JSON.parse(LS.getItem('chats') || '{}'); }
function saveChats(c) { LS.setItem('chats', JSON.stringify(c)); }
function getCurrentUser() { return JSON.parse(LS.getItem('currentUser') || 'null'); }
function setCurrentUser(u) { if (u === null) LS.removeItem('currentUser'); else LS.setItem('currentUser', JSON.stringify(u)); }

// ==================== RENDER GRID ====================
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
        ${getCurrentUser() && getCurrentUser().username === b.seller
          ? `<button class="btn-small btn-delete" data-id="${b.id}" style="background:#fff;border:1px solid #d9443f;color:#d9443f">Delete</button>`
          : ''}
      </div>
    `;
    container.appendChild(div);
  });

  // Attach listeners
  Array.from(container.querySelectorAll('.btn-chat')).forEach(btn => btn.addEventListener('click', (e) => {
    openListingChat(e.currentTarget.dataset.id);
  }));
  Array.from(container.querySelectorAll('.btn-buy')).forEach(btn => btn.addEventListener('click', (e) => {
    openBuyFlow(e.currentTarget.dataset.id);
  }));
}

// initial render
renderGrid('homeGrid', getBooks().slice(0, 4));
renderGrid('buyGrid', getBooks());

// ==================== SEARCH ====================
const searchInput = $('#globalSearch');
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

if ($('#searchBtn')) $('#searchBtn').addEventListener('click', () => { searchAndShow(searchInput.value); showPage('buy'); });
if (searchInput) searchInput.addEventListener('keyup', e => { if (e.key === 'Enter') { searchAndShow(searchInput.value); showPage('buy'); } else searchAndShow(searchInput.value); });

// ==================== ROUTING ====================
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

$$('.nav-link').forEach(a => {
  a.addEventListener('click', (e) => { e.preventDefault(); showPage(a.dataset.route); });
});
$$('.cta-row button, .top-nav a, .primary-btn[data-route]').forEach(btn => {
  btn.addEventListener('click', (e) => { const route = e.currentTarget.dataset.route; if (route) showPage(route); });
});

// ==================== AUTH (localStorage demo) ====================
const loginNavBtn = document.getElementById('loginNavBtn');
if (loginNavBtn) loginNavBtn.addEventListener('click', (e) => { e.preventDefault(); openAuth(); });
$('#closeAuth')?.addEventListener('click', () => closeAuth());
$('#signupBtn')?.addEventListener('click', doSignup);
$('#loginExistingBtn')?.addEventListener('click', doLogin);

function openAuth() { $('#authModal')?.classList.add('open'); }
function closeAuth() { $('#authModal')?.classList.remove('open'); }

function doSignup() {
  const email = $('#authEmail').value.trim();
  const username = $('#authUser').value.trim();
  const pass = $('#authPass').value;
  if (!email || !username || !pass) { alert('Please fill all fields'); return; }
  const users = getUsers();
  if (users.find(u => u.username === username)) { alert('Username already exists'); return; }
  users.push({ username, email, pass });
  saveUsers(users);
  setCurrentUser({ username, email });
  closeAuth(); updateAuthState(); refreshAll();
  alert('Account created and logged in as ' + username);
}

function doLogin() {
  const email = $('#authEmail').value.trim();
  const username = $('#authUser').value.trim();
  const pass = $('#authPass').value;
  const users = getUsers();
  const found = users.find(u => (u.username === username || u.email === email) && u.pass === pass);
  if (!found) { alert('Invalid credentials'); return; }
  setCurrentUser({ username: found.username, email: found.email });
  closeAuth(); updateAuthState(); alert('Logged in as ' + found.username);
}

function updateAuthState() {
  const cur = getCurrentUser();
  const navBtn = document.getElementById('loginNavBtn');
  if (navBtn) {
    if (cur) {
      navBtn.textContent = cur.username;
      navBtn.onclick = () => { if (confirm('Logout?')) { setCurrentUser(null); updateAuthState(); } };
    } else {
      navBtn.textContent = 'Login / Sign up';
      navBtn.onclick = (e) => { e.preventDefault(); openAuth(); };
    }
  }
  refreshAll();
}
updateAuthState();

// ==================== SELL POSTING (SAVE TO MYSQL) ====================
$('#postListingBtn')?.addEventListener('click', async () => {
  const cur = getCurrentUser();
  if (!cur) {
    if (confirm('You must be logged in to post. Login now?')) openAuth();
    return;
  }

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
    const res = await fetch('/api/books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newBook)
    });
    if (!res.ok) throw new Error('Server error ' + res.status);
    await res.json();
    console.log('✅ Book saved to MySQL');
    await fetchBooksFromServer();
  } catch (err) {
    console.error('❌ Failed to save to DB, fallback to localStorage:', err);
    const books = getBooks();
    const id = 'b' + Date.now();
    books.unshift({ id, ...newBook });
    saveBooks(books);
    refreshAll();
  }

  // clear
  $('#sellTitle').value = '';
  $('#sellAuthor').value = '';
  $('#sellPublisher').value = '';
  $('#sellPrice').value = '';
  $('#sellImage').value = '';
  alert('Listing posted.');
  showPage('buy');
});

// ==================== DONATE POSTING (SAVE TO MYSQL) ====================
$('#postDonateBtn')?.addEventListener('click', async () => {
  const cur = getCurrentUser();
  if (!cur) {
    if (confirm('You must be logged in to donate. Login now?')) openAuth();
    return;
  }
  const title = $('#donateTitle').value.trim();
  const meta = $('#donateMeta').value.trim();
  const loc = $('#donateLocation').value.trim();
  if (!title) { alert('Please add the book title'); return; }

  const image = `https://picsum.photos/seed/${encodeURIComponent(title)}/400/600`;
  const newDonation = {
    title,
    author: meta || 'Unknown',
    publisher: loc || 'Donation',
    price: 0,
    condition: 'Donation',
    image,
    seller: cur.username
  };

  try {
    const res = await fetch('/api/books', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newDonation)
    });
    if (!res.ok) throw new Error('Server error ' + res.status);
    await res.json();
    console.log('✅ Donation saved to MySQL');
    await fetchBooksFromServer();
  } catch (err) {
    console.error('❌ Failed to save donation to DB, fallback to localStorage:', err);
    const books = getBooks();
    const id = 'd' + Date.now();
    books.unshift({ id, ...newDonation });
    saveBooks(books);
    refreshAll();
  }

  $('#donateTitle').value = '';
  $('#donateMeta').value = '';
  $('#donateLocation').value = '';
  alert('Donation posted (free listing).');
  showPage('buy');
});

// ==================== BUY FLOW ====================
function openBuyFlow(bookId) {
  const cur = getCurrentUser();
  if (!cur) { if (confirm('You must be logged in to buy. Login now?')) openAuth(); return; }
  const book = getBooks().find(b => b.id === bookId);
  if (!book) { alert('Item not found'); return; }
  if (!confirm(`Buy "${book.title}" for ₹${numberWithCommas(book.price)} ?`)) return;
  alert('Purchase successful (demo). Please contact seller via chat to arrange pickup/shipping.');
}

// ==================== CHAT LOGIC ====================
let activeChatId = null;

function openListingChat(bookId) {
  const cur = getCurrentUser();
  if (!cur) { if (confirm('You must be logged in to chat. Login now?')) openAuth(); return; }
  const book = getBooks().find(b => b.id === bookId);
  if (!book) return;
  const seller = book.seller;
  const buyer = cur.username;
  const chatId = `chat_${bookId}_${buyer}_${seller}`;
  activeChatId = chatId;
  openChatModal(`Chat — ${book.title} (with ${seller})`);
  renderChatMessages(chatId);
}

function openGlobalChats() {
  const cur = getCurrentUser();
  if (!cur) { if (confirm('You must be logged in to view chats. Login now?')) openAuth(); return; }
  activeChatId = null;
  openChatModal(`Your Chats — ${cur.username}`);
  const chats = getChats();
  const area = $('#messagesArea');
  area.innerHTML = '';
  const entries = Object.entries(chats).filter(([k, v]) => v.participants && v.participants.includes(cur.username)).sort((a, b) => (b[1].lastUpdated || 0) - (a[1].lastUpdated || 0));
  if (entries.length === 0) {
    area.innerHTML = `<div style="color:var(--muted);padding:12px">No chats yet. Click "Chat" on a listing to start a private chat with the seller.</div>`;
    return;
  }
  entries.forEach(([k, chat]) => {
    const other = chat.participants.filter(p => p !== cur.username).join(', ');
    const last = chat.messages && chat.messages.length ? chat.messages[chat.messages.length - 1].text : '(no messages)';
    const btn = document.createElement('div');
    btn.style.padding = '12px';
    btn.style.borderRadius = '10px';
    btn.style.cursor = 'pointer';
    btn.style.background = '#fff';
    btn.style.marginBottom = '8px';
    btn.style.boxShadow = '0 6px 18px rgba(0,0,0,0.03)';
    btn.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><div><strong>${escapeHtml(chat.title || k)}</strong><div style="font-size:13px;color:var(--muted)">With: ${escapeHtml(other)}</div></div><div style="font-size:13px;color:var(--muted)">${chat.lastUpdated ? new Date(chat.lastUpdated).toLocaleString() : ''}</div></div>
                     <div style="margin-top:8px;color:var(--muted);font-size:14px">${escapeHtml(truncate(last, 80))}</div>`;
    btn.addEventListener('click', () => { activeChatId = k; renderChatMessages(k); });
    area.appendChild(btn);
  });
}

function openChatModal(title) {
  $('#chatTitle').textContent = title;
  $('#chatModal').classList.add('open');
}
$('#closeChat')?.addEventListener('click', () => { $('#chatModal')?.classList.remove('open'); activeChatId = null; });
$('#openChats')?.addEventListener('click', openGlobalChats);

$('#sendChatBtn')?.addEventListener('click', sendMessage);
$('#chatInput')?.addEventListener('keyup', (e) => { if (e.key === 'Enter') sendMessage(); });

function sendMessage() {
  const cur = getCurrentUser();
  if (!cur) { openAuth(); return; }
  const txt = $('#chatInput').value.trim();
  if (!txt) return;
  if (!activeChatId) { alert('Select or open a chat first.'); return; }
  const chats = getChats();
  const now = Date.now();
  if (!chats[activeChatId]) chats[activeChatId] = { title: activeChatId, participants: [cur.username], messages: [], lastUpdated: now };
  const chatObj = chats[activeChatId];
  if (!chatObj.participants.includes(cur.username)) chatObj.participants.push(cur.username);
  const msg = { from: cur.username, text: txt, ts: now };
  chatObj.messages.push(msg);
  chatObj.lastUpdated = now;
  saveChats(chats);
  $('#chatInput').value = '';
  renderChatMessages(activeChatId);
}

function renderChatMessages(chatId) {
  const cur = getCurrentUser();
  if (!cur) { openAuth(); return; }
  if (!chatId) { $('#messagesArea').innerHTML = '<div style="color:var(--muted);padding:12px">Select a chat from list.</div>'; return; }
  const chats = getChats();
  if (!chats[chatId]) {
    const parts = chatId.split('_');
    if (parts[0] === 'chat' && parts.length >= 4) {
      const bookId = parts[1], buyer = parts[2], seller = parts[3];
      chats[chatId] = { title: `Chat about ${bookId}`, participants: [buyer, seller], messages: [], lastUpdated: Date.now() };
      saveChats(chats);
    } else {
      chats[chatId] = { title: chatId, participants: [cur.username], messages: [], lastUpdated: Date.now() };
      saveChats(chats);
    }
  }
  const chat = chats[chatId];
  $('#chatTitle').textContent = chat.title || ('Chat ' + chatId);
  const area = $('#messagesArea');
  area.innerHTML = '';
  (chat.messages || []).forEach(m => {
    const el = document.createElement('div');
    el.className = 'bubble ' + (m.from === cur.username ? 'me' : 'them');
    el.innerHTML = `<div style="font-size:13px;margin-bottom:6px;color:var(--muted)">${escapeHtml(m.from)} • ${new Date(m.ts).toLocaleString()}</div><div>${escapeHtml(m.text)}</div>`;
    area.appendChild(el);
  });
  area.scrollTop = area.scrollHeight;
}

// attach openListingChat globally for other inline triggers
window.openListingChat = openListingChat;

// delegated clicks for card title -> chat
document.addEventListener('click', function (e) {
  const target = e.target;
  if (target && target.classList && target.classList.contains('title')) {
    const card = target.closest('.card');
    if (card) {
      const idBtn = card.querySelector('.btn-chat');
      if (idBtn) idBtn.click();
    }
  }
});

// privacy link
$('#privacyLink')?.addEventListener('click', (e) => { e.preventDefault(); alert('Privacy Policy (demo):\n\nThis is a demo app. Data is stored locally in your browser and optionally in the connected DB. Do not use for production.'); });

// ==================== DELETE LISTING (local+server) ====================
function deleteBook(id) {
  const cur = getCurrentUser();
  if (!cur) { alert('Login required'); openAuth(); return; }
  const books = getBooks();
  const book = books.find(b => b.id === id);
  if (!book) return alert('Book not found.');
  if (book.seller !== cur.username) return alert('You can only delete your own listings.');
  if (!confirm(`Are you sure you want to delete "${book.title}"?`)) return;

  // Try server delete first
  fetch(`/api/books/${id}`, { method: 'DELETE' })
    .then(res => {
      if (res.ok) {
        // refresh from server
        fetchBooksFromServer();
        alert('Book deleted.');
      } else {
        // fallback to local removal
        const updated = books.filter(b => b.id !== id);
        saveBooks(updated);
        refreshAll();
        alert('Book deleted locally.');
      }
    })
    .catch(() => {
      const updated = books.filter(b => b.id !== id);
      saveBooks(updated);
      refreshAll();
      alert('Book deleted locally (network error).');
    });
}

// delegated delete button handling
document.addEventListener('click', function (e) {
  const el = e.target;
  if (el && el.classList && el.classList.contains('btn-delete')) {
    const id = el.dataset.id;
    deleteBook(id);
  }
});

// ==================== UTILITIES ====================
function numberWithCommas(x) { return x == null ? '0' : x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function escapeHtml(str) { if (!str) return ''; return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
function truncate(s, n) { if (!s) return ''; return s.length > n ? s.slice(0, n - 1) + '…' : s; }

function refreshAll() {
  renderGrid('homeGrid', getBooks().slice(0, 4));
  renderGrid('buyGrid', getBooks());
}

// Accessibility: close modals via Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    $('#authModal')?.classList.remove('open');
    $('#chatModal')?.classList.remove('open');
  }
});

// initial page
document.addEventListener('DOMContentLoaded', async function () {
  const initial = (document.body && document.body.dataset && document.body.dataset.page) ? document.body.dataset.page : 'home';
  showPage(initial);
  updateAuthState();
  await fetchBooksFromServer();
});

// helper to expose quickOpenChat
function quickOpenChatFor(bookId) {
  const b = getBooks().find(x => x.id === bookId);
  if (!b) return;
  const cur = getCurrentUser();
  if (!cur) { openAuth(); return; }
  const chatId = `chat_${bookId}_${cur.username}_${b.seller}`;
  activeChatId = chatId;
  openChatModal(`Chat — ${b.title} (with ${b.seller})`);
  renderChatMessages(chatId);
}
window.quickOpenChatFor = quickOpenChatFor;
