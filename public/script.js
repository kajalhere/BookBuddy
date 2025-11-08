/************************************************************************
📚 BookBuddy — Unified frontend (SPA) wired to Railway MySQL backend
 API_BASE: uses window.location.origin so it works on Railway or locally
************************************************************************/

const API_BASE = window.location.origin;
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

/* ---------------------------
   Global state
   --------------------------- */
let currentUser = null;        // { username, email } when logged in
let activeChatId = null;
let activeChatPartner = null;
let chatPollInterval = null;
const CHAT_REFRESH_MS = 4000;

/* ---------------------------
   Helpers: UI / formatting
   --------------------------- */
function numberWithCommas(x) { return (x == null) ? '0' : x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function escapeHtml(str) { if (!str) return ''; return String(str).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }

/* ---------------------------
   SPA Navigation
   --------------------------- */
function showPage(id) {
  $$('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(id + 'Page');
  if (page) page.classList.add('active');
  $$('.nav-link').forEach(a => a.classList.toggle('active', a.dataset.route === id));
}

function initNavHandlers() {
  $$('.nav-link').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const route = a.dataset.route;
      if (route) showPage(route);
    });
  });



  // 🔧 FIX: Add listeners for the red CTA buttons on home page
  $$('button[data-route]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const route = btn.dataset.route;
      if (route) showPage(route);
    });
  });
}

/* ---------------------------
   Auth: signup/login/logout + current user
   --------------------------- */

async function fetchCurrentUser() {
  try {
    const res = await fetch(`${API_BASE}/api/me`, { credentials: 'include' });
    if (!res.ok) { currentUser = null; return null; }
    const json = await res.json();
    currentUser = json.user || null;
    return currentUser;
  } catch (err) {
    console.error('fetchCurrentUser error', err);
    currentUser = null;
    return null;
  }
}

async function updateAuthState() {
  await fetchCurrentUser();
  const navBtn = $('#loginNavBtn');
  if (navBtn) {
    if (currentUser) {
      navBtn.textContent = currentUser.username;
      navBtn.onclick = () => {
        if (confirm('Logout?')) doLogout();
      };
    } else {
      navBtn.textContent = 'Login / Sign up';
      navBtn.onclick = (e) => { e.preventDefault(); openAuth(); };
    }
  }
}

/* Signup expects { username, email, password } in body (server uses these) */
async function doSignup() {
  const username = $('#authUser')?.value.trim();
  const email = $('#authEmail')?.value.trim();
  const password = $('#authPass')?.value;
  if (!username || !email || !password) { alert('Please fill all fields'); return; }

  try {
    const res = await fetch(`${API_BASE}/api/signup`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Signup failed');
    await fetchCurrentUser();
    closeAuth();
    updateAuthState();
    alert('Account created and logged in as ' + username);
  } catch (err) {
    console.error('Signup error', err);
    alert('Signup failed: ' + (err.message || err));
  }
}

/* Login expects { usernameOrEmail, password } in body (server route uses that) */
async function doLogin() {
  const usernameOrEmail = $('#authUser')?.value.trim() || $('#authEmail')?.value.trim();
  const password = $('#authPass')?.value;
  if (!usernameOrEmail || !password) { alert('Please fill all fields'); return; }

  try {
    const res = await fetch(`${API_BASE}/api/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernameOrEmail, password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    await fetchCurrentUser();
    closeAuth();
    updateAuthState();
    alert('Logged in as ' + currentUser.username);
    await fetchBooks(); // refresh book listing / seller info
  } catch (err) {
    console.error('Login error', err);
    alert('Login failed: ' + (err.message || err));
  }
}

async function doLogout() {
  try {
    await fetch(`${API_BASE}/api/logout`, { method: 'POST', credentials: 'include' });
  } catch (err) {
    console.error('Logout request failed', err);
  }
  currentUser = null;
  updateAuthState();
  alert('Logged out');
}

/* UI helpers for auth modal */
function openAuth() { $('#authModal')?.classList.add('open'); }
function closeAuth() { $('#authModal')?.classList.remove('open'); }

/* ---------------------------
   Books (fetch, render, post)
   --------------------------- */

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
      <div class="thumb-wrap"><img src="${escapeHtml(b.image || `https://picsum.photos/seed/${encodeURIComponent(b.title||Date.now())}/400/600`)}" alt="${escapeHtml(b.title)} cover" class="thumb" loading="lazy"></div>
      <div class="meta">
        <div class="title">${escapeHtml(b.title)}</div>
        <div class="author">${escapeHtml(b.author)} • ${escapeHtml(b.publisher || '')}</div>
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div class="price">₹ ${numberWithCommas(b.price || 0)}</div>
          <div class="condition" style="font-size:13px;color:var(--muted)">${escapeHtml(b.condition || b.book_condition || '')}</div>
        </div>
      </div>
      <div class="actions">
        <button class="btn-small btn-buy" data-id="${escapeHtml(String(b.id))}">Buy</button>
        <button class="btn-small btn-chat" data-id="${escapeHtml(String(b.id))}" data-seller="${escapeHtml(b.seller || '')}">Chat</button>
        ${ (currentUser && currentUser.username === b.seller) ? `<button class="btn-small btn-delete" data-id="${escapeHtml(String(b.id))}" style="background:#fff;border:1px solid #d9443f;color:#d9443f">Delete</button>` : '' }
      </div>
    `;
    container.appendChild(div);
  });

  // attach listeners
  container.querySelectorAll('.btn-chat').forEach(btn => btn.addEventListener('click', (e) => {
    const bookId = e.currentTarget.dataset.id;
    const seller = e.currentTarget.dataset.seller;
    openChatForBook(bookId, seller);
  }));
  container.querySelectorAll('.btn-buy').forEach(btn => btn.addEventListener('click', (e) => {
    openBuyFlow(e.currentTarget.dataset.id);
  }));
  container.querySelectorAll('.btn-delete').forEach(btn => btn.addEventListener('click', (e) => {
    deleteBook(e.currentTarget.dataset.id);
  }));
}

async function fetchBooks() {
  try {
    const res = await fetch(`${API_BASE}/api/books`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch books');
    const books = await res.json();
    renderGrid('homeGrid', books.slice(0, 4));
    renderGrid('buyGrid', books);
    return books;
  } catch (err) {
    console.error('fetchBooks error', err);
    // nothing else to do — show empty state in renderGrid
    renderGrid('homeGrid', []);
    renderGrid('buyGrid', []);
    return [];
  }
}

async function postBook() {
  const title = $('#sellTitle')?.value.trim();
  const author = $('#sellAuthor')?.value.trim();
  const publisher = $('#sellPublisher')?.value.trim();
  const price = Number($('#sellPrice')?.value || 0);
  const condition = $('#sellCondition')?.value;
  let image = $('#sellImage')?.value.trim();

  if (!title || !author || !publisher) { alert('Please fill all required fields'); return; }
  if (!image) image = `https://picsum.photos/seed/${encodeURIComponent(title)}/400/600`;

  const payload = { title, author, publisher, price, condition, image };

  try {
    const res = await fetch(`${API_BASE}/api/books`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save book');
    await fetchBooks();
    $('#sellTitle').value = ''; $('#sellAuthor').value = ''; $('#sellPublisher').value = ''; $('#sellPrice').value = ''; $('#sellImage').value = '';
    alert('Listing posted.');
    showPage('buy');
  } catch (err) {
    console.error('postBook error', err);
    alert('Failed to post book: ' + (err.message || err));
  }
}

/* ---------------------------
   Donations
   --------------------------- */
async function fetchDonations() {
  try {
    const res = await fetch(`${API_BASE}/api/donations`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch donations');
    const rows = await res.json();
    // you can render donations similarly if you have a donations area
    return rows;
  } catch (err) {
    console.error('fetchDonations error', err);
    return [];
  }
}

async function postDonation() {
  const title = $('#donateTitle')?.value.trim();
  const meta = $('#donateMeta')?.value.trim();
  const location = $('#donateLocation')?.value.trim();
  let image = $('#donateImage')?.value.trim(); // 🔧 NEW: Read from image field

  if (!title) { alert('Please add the book title'); return; }

  // Use provided image or generate placeholder
  if (!image) image = `https://picsum.photos/seed/${encodeURIComponent(title)}/400/600`;
  
  const payload = { title, meta, location, image };

  try {
    const res = await fetch(`${API_BASE}/api/donations`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save donation');
    await fetchDonations();
    $('#donateTitle').value = '';
    $('#donateMeta').value = ''; 
    $('#donateLocation').value = '';
    $('#donateImage').value = ''; // 🔧 NEW: Clear image field
    alert('Donation posted (free listing).');
    // showPage('buy');

    //Reload donations if on donate page
    if(typeof loadDonations === 'function') loadDonations();
  } catch (err) {
    console.error('postDonation error', err);
    alert('Failed to post donation: ' + (err.message || err));
  }
}

/* ---------------------------
   Buy flow (demo)
   --------------------------- */
function openBuyFlow(bookId) {
  if (!currentUser) { if (confirm('You must be logged in to buy. Login now?')) openAuth(); return; }
  // simple demo flow
  const bookCard = document.querySelector(`.btn-buy[data-id="${bookId}"]`);
  const title = bookCard ? bookCard.closest('.card').querySelector('.title')?.textContent : 'this item';
  if (!confirm(`Buy "${title}" for demo?`)) return;
  alert('Purchase successful (demo). Contact seller via chat to arrange pickup.');
}

/* ---------------------------
   Delete book (server) - only seller allowed
   --------------------------- */
async function deleteBook(id) {
  if (!currentUser) { openAuth(); return; }
  if (!confirm('Confirm delete?')) return;
  try {
    const res = await fetch(`${API_BASE}/api/books/${id}`, {
      method: 'DELETE',
      credentials: 'include'
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Delete failed');
    await fetchBooks();
    alert('Book deleted');
  } catch (err) {
    console.error('deleteBook error', err);
    alert('Delete failed: ' + (err.message || err));
  }
}

/* ---------------------------
   Chat — Enhanced (logged-in users, DB-backed)
   --------------------------- */

function openChatForBook(bookId, sellerUsername) {
  // ensure user logged in
  if (!currentUser) { openAuth(); return; }
  activeChatPartner = sellerUsername;
  const participants = [currentUser.username, sellerUsername].sort();
  activeChatId = participants.join('_');
  $('#chatTitle').textContent = `Chat — ${sellerUsername}`;
  $('#chatModal')?.classList.add('open');
  loadChatMessages();
  if (chatPollInterval) clearInterval(chatPollInterval);
  chatPollInterval = setInterval(loadChatMessages, CHAT_REFRESH_MS);
}

async function loadChatMessages() {
  if (!activeChatId) return;
  try {
    const res = await fetch(`${API_BASE}/api/chats`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch chats');
    const rows = await res.json();
    const chat = rows.find(r => r.chat_id === activeChatId);
    const area = $('#messagesArea');
    if (!area) return;
    area.innerHTML = '';
    if (chat && chat.messages) {
      let messages = [];
      try { messages = JSON.parse(chat.messages || '[]'); } catch { messages = []; }
      messages.forEach(m => {
        const el = document.createElement('div');
        el.className = 'bubble ' + ((m.sender === (currentUser && currentUser.username)) ? 'me' : 'them');
        el.innerHTML = `<div style="font-size:13px;margin-bottom:6px;color:var(--muted)">${escapeHtml(m.sender)} • ${new Date(m.time || m.ts || Date.now()).toLocaleString()}</div><div>${escapeHtml(m.text)}</div>`;
        area.appendChild(el);
      });
      area.scrollTop = area.scrollHeight;
    } else {
      area.innerHTML = '<div style="color:var(--muted);padding:12px">No messages yet — start the conversation!</div>';
    }
  } catch (err) {
    console.error('loadChatMessages error', err);
  }
}

async function sendChatMessage() {
  const input = $('#chatInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;
  if (!currentUser) { openAuth(); return; }
  if (!activeChatId) return alert('No active chat');

  try {
    // fetch existing chat
    const res = await fetch(`${API_BASE}/api/chats`, { credentials: 'include' });
    const rows = await res.json();
    const existing = rows.find(r => r.chat_id === activeChatId);
    let messages = [];
    if (existing && existing.messages) {
      try { messages = JSON.parse(existing.messages); } catch { messages = []; }
    }
    const newMsg = { sender: currentUser.username, text, time: Date.now() };
    messages.push(newMsg);

    const postRes = await fetch(`${API_BASE}/api/chats`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: activeChatId,
        participants: [currentUser.username, activeChatPartner],
        messages
      })
    });
    const data = await postRes.json();
    if (!postRes.ok) throw new Error(data.error || 'Failed to send message');
    input.value = '';
    await loadChatMessages();
  } catch (err) {
    console.error('sendChatMessage error', err);
    alert('Failed to send message: ' + (err.message || err));
  }
}

/* Close chat */
function closeChatPopup() {
  $('#chatModal')?.classList.remove('open');
  if (chatPollInterval) { clearInterval(chatPollInterval); chatPollInterval = null; }
  activeChatId = null;
  activeChatPartner = null;
}

/* ---------------------------
   Wiring initial event listeners
   --------------------------- */
function attachUIHandlers() {
  // Auth
  $('#signupBtn')?.addEventListener('click', doSignup);
  $('#loginExistingBtn')?.addEventListener('click', doLogin);
  $('#closeAuth')?.addEventListener('click', closeAuth);

  // Post book
  $('#postListingBtn')?.addEventListener('click', postBook);
  // Post donation
  $('#postDonateBtn')?.addEventListener('click', postDonation);

  // Chat UI
  $('#sendChatBtn')?.addEventListener('click', sendChatMessage);
  $('#closeChat')?.addEventListener('click', closeChatPopup);

  // Search handlers (if present)
  $('#searchBtn')?.addEventListener('click', () => {
    const q = $('#globalSearch')?.value || '';
    searchAndShow(q);
    showPage('buy');
  });
  $('#globalSearch')?.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') { searchAndShow($('#globalSearch')?.value || ''); showPage('buy'); }
    else searchAndShow($('#globalSearch')?.value || '');
  });
}

/* Search helper (client side) */
function searchAndShow(q) {
  q = (q || '').trim().toLowerCase();
  // simple re-use: fetch current rendered books from buyGrid DOM (or call fetchBooks again)
  // For simplicity, call fetchBooks and filter response
  fetch(`${API_BASE}/api/books`, { credentials: 'include' }).then(r => r.json()).then(books => {
    if (!q) { renderGrid('homeGrid', books.slice(0,4)); renderGrid('buyGrid', books); return; }
    const matched = books.filter(b =>
      (b.title || '').toLowerCase().includes(q) ||
      (b.author || '').toLowerCase().includes(q) ||
      (b.publisher || '').toLowerCase().includes(q) ||
      (b.seller || '').toLowerCase().includes(q)
    );
    renderGrid('homeGrid', matched.slice(0,8));
    renderGrid('buyGrid', matched);
  }).catch(err => console.error('search error', err));
}

/* ---------------------------
   Startup: DOMContentLoaded
   --------------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  try {
    initNavHandlers();
    attachUIHandlers();
    await fetchCurrentUser();
    await Promise.all([fetchBooks(), fetchDonations()]);
    updateAuthState();
    console.log('✅ Frontend initialized');
  } catch (err) {
    console.error('Initialization error', err);
  }
});
