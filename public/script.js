/************************************************************************
📚 BOOKBUDDY FRONTEND — MySQL Connected (No localStorage)
************************************************************************/
const API_BASE = window.location.origin;
const $ = s => document.querySelector(s);

// ============ AUTH =============
async function signup() {
  const username = $('#authUser').value.trim();
  const email = $('#authEmail').value.trim();
  const password = $('#authPass').value.trim();
  if (!username || !email || !password) return alert('All fields required');
  const res = await fetch(`${API_BASE}/api/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password })
  });
  const data = await res.json();
  if (data.success) {
    alert('Signup successful!');
    closeAuth();
  } else alert(data.error || 'Signup failed');
}

async function login() {
  const usernameOrEmail = $('#authUser').value.trim() || $('#authEmail').value.trim();
  const password = $('#authPass').value.trim();
  const res = await fetch(`${API_BASE}/api/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ usernameOrEmail, password })
  });
  const data = await res.json();
  if (data.success) {
    alert('Logged in!');
    closeAuth();
    await fetchBooks();
  } else alert(data.error || 'Login failed');
}

$('#signupBtn')?.addEventListener('click', signup);
$('#loginExistingBtn')?.addEventListener('click', login);
$('#loginNavBtn')?.addEventListener('click', () => $('#authModal').classList.add('open'));
$('#closeAuth')?.addEventListener('click', () => $('#authModal').classList.remove('open'));

// ============ BOOKS =============
async function fetchBooks() {
  const res = await fetch(`${API_BASE}/api/books`);
  const books = await res.json();
  const grid = $('#buyGrid');
  grid.innerHTML = '';
  books.forEach(b => {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
      <img src="${b.image}" alt="${b.title}" class="thumb"/>
      <div class="meta">
        <div class="title">${b.title}</div>
        <div class="author">${b.author}</div>
        <div class="price">₹${b.price}</div>
        <button class="primary-btn chat-btn" data-seller="${b.seller}">Chat</button>
      </div>`;
    grid.appendChild(div);
  });
  document.querySelectorAll('.chat-btn').forEach(btn => {
    btn.addEventListener('click', e => openChatPopup(e.target.dataset.seller));
  });
}

async function postBook() {
  const title = $('#sellTitle').value.trim();
  const author = $('#sellAuthor').value.trim();
  const publisher = $('#sellPublisher').value.trim();
  const price = $('#sellPrice').value.trim();
  const condition = $('#sellCondition').value;
  const image = $('#sellImage').value.trim();
  const seller = prompt('Enter your username (temporary until login)');
  const res = await fetch(`${API_BASE}/api/books`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, author, publisher, price, image, condition, seller })
  });
  const data = await res.json();
  alert(data.success ? 'Book added!' : 'Error posting book');
  fetchBooks();
}
$('#postListingBtn')?.addEventListener('click', postBook);

// ============ DONATION ============
$('#postDonateBtn')?.addEventListener('click', async () => {
  const title = $('#donateTitle').value.trim();
  const meta = $('#donateMeta').value.trim();
  const location = $('#donateLocation').value.trim();
  const donor = prompt('Enter your username (temporary)');
  const res = await fetch(`${API_BASE}/api/donations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, meta, location, donor })
  });
  const data = await res.json();
  alert(data.success ? 'Donation posted!' : 'Error');
});

// ============ CHAT POPUP ============
let activeChatId = null;
let activePartner = null;
let pollInterval = null;

function openChatPopup(seller) {
  const curUser = prompt('Enter your username (temporary)');
  activePartner = seller;
  const participants = [curUser, seller].sort();
  activeChatId = participants.join('_');
  document.getElementById('chatModal').classList.add('open');
  loadChat();
  if (pollInterval) clearInterval(pollInterval);
  pollInterval = setInterval(loadChat, 4000);
}

$('#sendChatBtn')?.addEventListener('click', async () => {
  const text = $('#chatInput').value.trim();
  if (!text) return;
  const sender = prompt('Enter your username');
  const res = await fetch(`${API_BASE}/api/chats`);
  const chats = await res.json();
  const existing = chats.find(c => c.chat_id === activeChatId);
  const oldMsgs = existing && existing.messages ? JSON.parse(existing.messages) : [];
  oldMsgs.push({ sender, text, time: Date.now() });
  await fetch(`${API_BASE}/api/chats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: activeChatId, participants: [sender, activePartner], messages: oldMsgs })
  });
  $('#chatInput').value = '';
  loadChat();
});

async function loadChat() {
  const res = await fetch(`${API_BASE}/api/chats`);
  const chats = await res.json();
  const chat = chats.find(c => c.chat_id === activeChatId);
  const area = $('#messagesArea');
  area.innerHTML = '';
  if (chat && chat.messages) {
    JSON.parse(chat.messages).forEach(msg => {
      const div = document.createElement('div');
      div.className = 'message';
      div.textContent = `${msg.sender}: ${msg.text}`;
      area.appendChild(div);
    });
  }
}
$('#closeChat')?.addEventListener('click', () => {
  document.getElementById('chatModal').classList.remove('open');
  if (pollInterval) clearInterval(pollInterval);
});
/************************************************************************
 💬 ENHANCED CHAT MODULE — Logged-in Users Only (MySQL + Auto Refresh)
************************************************************************/

const CHAT_REFRESH_MS = 4000;
let activeChatId = null;
let activePartner = null;
let chatPollInterval = null;

// Open chat popup for a specific seller/book
async function openChatPopup(sellerUsername) {
  try {
    const curUserRes = await fetch(`${API_BASE}/api/me`, { credentials: 'include' });
    const curUserData = await curUserRes.json();
    const curUser = curUserData.user;
    if (!curUser) {
      alert('Please log in to start a chat.');
      document.getElementById('authModal').classList.add('open');
      return;
    }

    activePartner = sellerUsername;
    const participants = [curUser.username, sellerUsername].sort();
    activeChatId = participants.join('_');

    document.getElementById('chatTitle').textContent = `Chat with ${sellerUsername}`;
    document.getElementById('chatModal').classList.add('open');

    await loadChatMessages();

    if (chatPollInterval) clearInterval(chatPollInterval);
    chatPollInterval = setInterval(loadChatMessages, CHAT_REFRESH_MS);
  } catch (err) {
    console.error('❌ Error opening chat:', err);
  }
}

// Load messages for current chat
async function loadChatMessages() {
  if (!activeChatId) return;
  try {
    const res = await fetch(`${API_BASE}/api/chats`, { credentials: 'include' });
    const allChats = await res.json();
    const chat = allChats.find(c => c.chat_id === activeChatId);
    const area = document.getElementById('messagesArea');
    area.innerHTML = '';

    if (chat && chat.messages) {
      const msgs = JSON.parse(chat.messages);
      msgs.forEach(msg => {
        const div = document.createElement('div');
        div.className = 'message ' + (msg.sender === (getCurrentUser()?.username || '') ? 'me' : 'them');
        div.textContent = `${msg.sender}: ${msg.text}`;
        area.appendChild(div);
      });
      area.scrollTop = area.scrollHeight;
    } else {
      area.innerHTML = `<div style="color:gray;text-align:center;margin-top:10px;">No messages yet. Start chatting!</div>`;
    }
  } catch (err) {
    console.error('❌ Error loading messages:', err);
  }
}

// Send a message
document.getElementById('sendChatBtn')?.addEventListener('click', async () => {
  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text || !activeChatId) return;

  try {
    const curRes = await fetch(`${API_BASE}/api/me`, { credentials: 'include' });
    const curData = await curRes.json();
    const curUser = curData.user;
    if (!curUser) {
      alert('Please log in first.');
      document.getElementById('authModal').classList.add('open');
      return;
    }

    const res = await fetch(`${API_BASE}/api/chats`, { credentials: 'include' });
    const allChats = await res.json();
    const existingChat = allChats.find(c => c.chat_id === activeChatId);
    const oldMsgs = existingChat && existingChat.messages ? JSON.parse(existingChat.messages) : [];

    const newMsg = { sender: curUser.username, text, time: Date.now() };
    const updatedMsgs = [...oldMsgs, newMsg];

    await fetch(`${API_BASE}/api/chats`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: activeChatId,
        participants: [curUser.username, activePartner],
        messages: updatedMsgs
      })
    });

    input.value = '';
    await loadChatMessages();
  } catch (err) {
    console.error('❌ Error sending message:', err);
  }
});

// Close chat popup
document.getElementById('closeChat')?.addEventListener('click', () => {
  document.getElementById('chatModal').classList.remove('open');
  if (chatPollInterval) clearInterval(chatPollInterval);
  chatPollInterval = null;
  activeChatId = null;
  activePartner = null;
});

// Utility to get logged-in user quickly
function getCurrentUser() {
  try {
    const u = localStorage.getItem('currentUser');
    return u ? JSON.parse(u) : null;
  } catch {
    return null;
  }
}


document.addEventListener('DOMContentLoaded', fetchBooks);
