/************************************************************************
📚 BookBuddy – Unified frontend (SPA) wired to Railway MySQL backend
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
function escapeHtml(str) { if (!str) return ''; return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

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

  // FIX: Add listeners for the red CTA buttons on home page
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
    await fetchBooks();
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
      <div class="thumb-wrap"><img src="${escapeHtml(b.image || `https://picsum.photos/seed/${encodeURIComponent(b.title || Date.now())}/400/600`)}" alt="${escapeHtml(b.title)} cover" class="thumb" loading="lazy"></div>
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
        ${(currentUser && currentUser.username === b.seller) ? `<button class="btn-small btn-delete" data-id="${escapeHtml(String(b.id))}" style="background:#fff;border:1px solid #d9443f;color:#d9443f">Delete</button>` : ''}
      </div>
    `;
    container.appendChild(div);
  });

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
  let image = $('#donateImage')?.value.trim();

  if (!title) { alert('Please add the book title'); return; }

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
    $('#donateImage').value = '';
    alert('Donation posted (free listing).');

    if (typeof loadDonations === 'function') loadDonations();
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
   Chat – Enhanced (FIXED VERSION)
   --------------------------- */

function openChatForBook(bookId, sellerUsername) {
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

async function openGlobalChats() {
  if (!currentUser) {
    openAuth();
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/api/chats`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch chats');
    const allChats = await res.json();

    console.log('📥 All chats fetched:', allChats.length);

    // Filter chats for current user and remove duplicates
    const userChatsMap = new Map();

    allChats.forEach(chat => {
      try {
        const participants = typeof chat.participants === 'string'
          ? JSON.parse(chat.participants)
          : chat.participants;

        if (!Array.isArray(participants) || !participants.includes(currentUser.username)) {
          return;
        }

        // Get the other user
        const otherUser = participants.find(p => p !== currentUser.username);
        if (!otherUser) return;

        // Parse messages
        let messages = [];
        try {
          const parsed = typeof chat.messages === 'string'
            ? JSON.parse(chat.messages)
            : chat.messages;
          messages = Array.isArray(parsed) ? parsed : [];
        } catch (err) {
          console.warn('Failed to parse messages for chat:', chat.chat_id, err);
        }

        console.log(`📥 Chat with ${otherUser}: ${messages.length} messages`);

        // Only keep the chat with the most messages (latest version)
        const existing = userChatsMap.get(otherUser);
        if (!existing || messages.length > existing.messageCount) {
          userChatsMap.set(otherUser, {
            chat_id: chat.chat_id,
            otherUser: otherUser,
            messages: messages,
            messageCount: messages.length,
            lastMessage: messages[messages.length - 1]
          });
        }
      } catch (err) {
        console.warn('Error processing chat:', err);
      }
    });

    const userChats = Array.from(userChatsMap.values());
    console.log('📊 Unique chats:', userChats.length);

    const area = $('#messagesArea');
    const title = $('#chatTitle');

    if (!area || !title) return;

    title.textContent = 'Your Chats';
    area.innerHTML = '';

    if (userChats.length === 0) {
      area.innerHTML = '<div style="color:var(--muted);padding:12px;text-align:center">No chats yet. Click "Chat" on any book to start a conversation!</div>';
    } else {
      userChats.forEach(chat => {
        const lastMsg = chat.lastMessage;
        const preview = lastMsg && lastMsg.text
          ? (lastMsg.text.substring(0, 50) + (lastMsg.text.length > 50 ? '...' : ''))
          : 'Start the conversation';

        const chatItem = document.createElement('div');
        chatItem.style.cssText = 'padding:12px;margin:8px 0;background:#f9f9f9;border-radius:8px;cursor:pointer;border:1px solid #eee;transition:background 0.2s';
        chatItem.innerHTML = `
          <div style="font-weight:600;margin-bottom:4px">${escapeHtml(chat.otherUser)}</div>
          <div style="font-size:13px;color:var(--muted)">${escapeHtml(preview)}</div>
        `;

        chatItem.addEventListener('mouseenter', () => {
          chatItem.style.background = '#f0f0f0';
        });

        chatItem.addEventListener('mouseleave', () => {
          chatItem.style.background = '#f9f9f9';
        });

        chatItem.addEventListener('click', () => {
          openChatForBook(null, chat.otherUser);
        });

        area.appendChild(chatItem);
      });
    }

    $('#chatModal')?.classList.add('open');

    if (chatPollInterval) {
      clearInterval(chatPollInterval);
      chatPollInterval = null;
    }

  } catch (err) {
    console.error('❌ openGlobalChats error:', err);
    alert('Failed to load chats');
  }
}

async function loadChatMessages() {
  if (!activeChatId) return;

  console.log('🟢 Loading messages for chat:', activeChatId);

  try {
    const res = await fetch(`${API_BASE}/api/chats`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch chats');

    const allChats = await res.json();
    console.log('🟢 All chats:', allChats);

    const chat = allChats.find(r => r.chat_id === activeChatId);
    console.log('🟢 Found chat:', chat);

    const area = $('#messagesArea');
    if (!area) return;

    area.innerHTML = '';

    if (chat && chat.messages) {
      let messages = [];
      try {
        // Handle both string and object JSON
        const parsed = typeof chat.messages === 'string'
          ? JSON.parse(chat.messages)
          : chat.messages;

        messages = Array.isArray(parsed) ? parsed : [];
        console.log('🟢 Parsed messages:', messages);
      } catch (parseErr) {
        console.warn('⚠️ Failed to parse messages:', parseErr);
        messages = [];
      }

      if (messages.length === 0) {
        console.log('🟡 No messages in array');
        area.innerHTML = '<div style="color:var(--muted);padding:12px">No messages yet – start the conversation!</div>';
      } else {
        console.log('🟢 Displaying', messages.length, 'messages');
        messages.forEach((m, index) => {
          const el = document.createElement('div');
          el.className = 'bubble ' + ((m.sender === currentUser.username) ? 'me' : 'them');

          // Only show delete button for user's own messages
          // Use message timestamp instead of index for reliable deletion
          const deleteBtn = (m.sender === currentUser.username)
            ? `<button class="delete-msg-btn" data-time="${m.time}">Delete</button>`
            : '';

          el.innerHTML = `
    <div style="font-size:13px;margin-bottom:6px;color:var(--muted)">${escapeHtml(m.sender)} • ${new Date(m.time || Date.now()).toLocaleString()}</div>
    <div>${escapeHtml(m.text)}</div>
    ${deleteBtn}
  `;

          area.appendChild(el);
        });

        // Add click handlers for delete buttons
        area.querySelectorAll('.delete-msg-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const messageTime = parseInt(e.target.dataset.time);
            console.log('🗑️ Delete button clicked for message time:', messageTime);
            deleteMessage(messageTime);
          });
        });
        area.scrollTop = area.scrollHeight;
      }
    } else {
      console.log('🟡 Chat not found in database');
      area.innerHTML = '<div style="color:var(--muted);padding:12px">No messages yet – start the conversation!</div>';
    }

  } catch (err) {
    console.error('❌ loadChatMessages error:', err);
  }
}

async function sendChatMessage() {
  const input = $('#chatInput');
  if (!input) return;

  const text = input.value.trim();
  if (!text) return;

  if (!currentUser) {
    alert('Please log in to send messages');
    openAuth();
    return;
  }

  if (!activeChatId || !activeChatPartner) {
    alert('No active chat');
    return;
  }

  console.log('📤 Sending message:', text);
  console.log('📤 Chat ID:', activeChatId);
  console.log('📤 From:', currentUser.username, 'To:', activeChatPartner);

  // Disable input and button while sending
  const originalText = text;
  input.disabled = true;
  const sendBtn = $('#sendChatBtn');
  if (sendBtn) sendBtn.disabled = true;

  try {
    // 1. Fetch existing chat data
    const res = await fetch(`${API_BASE}/api/chats`, { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to fetch chats');

    const allChats = await res.json();
    const existing = allChats.find(r => r.chat_id === activeChatId);

    console.log('📥 Existing chat found:', existing);

    // 2. Parse existing messages
    let messages = [];
    if (existing && existing.messages) {
      try {
        const parsed = typeof existing.messages === 'string'
          ? JSON.parse(existing.messages)
          : existing.messages;
        messages = Array.isArray(parsed) ? parsed : [];
        console.log('📥 Existing messages:', messages.length);
      } catch (parseErr) {
        console.warn('⚠️ Failed to parse existing messages:', parseErr);
        messages = [];
      }
    }

    // 3. Add new message
    const newMsg = {
      sender: currentUser.username,
      text: originalText,
      time: Date.now()
    };
    messages.push(newMsg);

    console.log('📤 Total messages to save:', messages.length);

    // 4. Save to server
    const postRes = await fetch(`${API_BASE}/api/chats`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: activeChatId,
        participants: [currentUser.username, activeChatPartner],
        messages: messages
      })
    });

    const saveResult = await postRes.json();
    console.log('✅ Server response:', saveResult);

    // Check if the response indicates success
    if (!saveResult.success) {
      throw new Error(saveResult.error || 'Failed to send message');
    }

    // 5. Clear input ONLY after successful save
    input.value = '';
    console.log('✅ Input cleared');

    // 6. Update UI immediately - reload messages to show with delete button
    await loadChatMessages();

    console.log('✅ Message sent and displayed successfully');

  } catch (err) {
    console.error('❌ sendChatMessage error:', err);
    alert('Failed to send message: ' + (err.message || err));
    // Restore the message in input on error
    input.value = originalText;
  } finally {
    // Re-enable input and button
    input.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    input.focus();
  }
}

async function deleteMessage(messageTime) {
  if (!currentUser || !activeChatId) {
    alert('Cannot delete message');
    return;
  }

  if (!confirm('Are you sure you want to delete this message?')) {
    return;
  }

  console.log('🗑️ Deleting message with timestamp:', messageTime);
  console.log('🗑️ From chat:', activeChatId);

  try {
    const res = await fetch(`${API_BASE}/api/chats/${activeChatId}/messages/${messageTime}`, {
      method: 'DELETE',
      credentials: 'include'
    });

    const result = await res.json();
    console.log('🗑️ Delete response:', result);

    if (!result.success) {
      throw new Error(result.error || 'Failed to delete message');
    }

    console.log('✅ Message deleted, reloading chat...');

    // Reload messages to show updated chat
    await loadChatMessages();

    console.log('✅ Chat reloaded successfully');

  } catch (err) {
    console.error('❌ Delete message error:', err);
    alert('Failed to delete message: ' + (err.message || err));
  }
}

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
  $('#signupBtn')?.addEventListener('click', doSignup);
  $('#loginExistingBtn')?.addEventListener('click', doLogin);
  $('#closeAuth')?.addEventListener('click', closeAuth);

  $('#postListingBtn')?.addEventListener('click', postBook);
  $('#postDonateBtn')?.addEventListener('click', postDonation);

  $('#sendChatBtn')?.addEventListener('click', sendChatMessage);
  $('#chatInput')?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });
  $('#closeChat')?.addEventListener('click', closeChatPopup);
  $('#openChats')?.addEventListener('click', openGlobalChats);

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

function searchAndShow(q) {
  q = (q || '').trim().toLowerCase();
  fetch(`${API_BASE}/api/books`, { credentials: 'include' }).then(r => r.json()).then(books => {
    if (!q) { renderGrid('homeGrid', books.slice(0, 4)); renderGrid('buyGrid', books); return; }
    const matched = books.filter(b =>
      (b.title || '').toLowerCase().includes(q) ||
      (b.author || '').toLowerCase().includes(q) ||
      (b.publisher || '').toLowerCase().includes(q) ||
      (b.seller || '').toLowerCase().includes(q)
    );
    renderGrid('homeGrid', matched.slice(0, 8));
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