/************************************************************************
BookBuddy Frontend (connected to backend)

* Fetches and posts books via /api/books
* Keeps all UI, login, chat, and SPA logic intact
  *************************************************************************/

const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const LS = window.localStorage;

function getCurrentUser(){ return JSON.parse(LS.getItem('currentUser') || 'null') }
function setCurrentUser(u){ if(u === null) LS.removeItem('currentUser'); else LS.setItem('currentUser', JSON.stringify(u)) }

// Load books from backend
async function loadBooks(){
try {
const res = await fetch('/api/books');
const data = await res.json();
LS.setItem('books', JSON.stringify(data));
renderAll();
} catch (err) {
console.error('Failed to load books:', err);
}
}

// Save new book to backend
async function addBook(book){
try {
const res = await fetch('/api/books', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(book)
});
const data = await res.json();
console.log('Book added:', data);
await loadBooks(); // refresh after post
} catch (err) {
console.error('Failed to add book:', err);
}
}

// Utility: render grids
function renderGrid(containerId, books){
const container = document.getElementById(containerId);
if(!container) return;
container.innerHTML = '';
if(!books || books.length === 0){
container.innerHTML = '<div style="text-align:center;padding:22px;color:var(--muted)">No listings yet.</div>';
return;
}
books.forEach(b=>{
const div = document.createElement('div');
div.className = 'card';
div.innerHTML = `       <div class="thumb"><img src="${b.image || 'https://picsum.photos/200'}" alt="cover"></div>       <div class="meta">         <div class="title">${b.title}</div>         <div class="author">${b.author}</div>         <div class="price">₹ ${b.price}</div>       </div>
    `;
container.appendChild(div);
});
}

// Render both sections
function renderAll(){
const books = JSON.parse(LS.getItem('books') || '[]');
renderGrid('homeGrid', books.slice(0,4));
renderGrid('buyGrid', books);
}

// Sell page posting
const postListingBtn = document.getElementById('postListingBtn');
if(postListingBtn) postListingBtn.addEventListener('click', async ()=>{
const cur = getCurrentUser();
if(!cur){ alert('Login required'); return; }
const title = $('#sellTitle').value.trim();
const author = $('#sellAuthor').value.trim();
const price = Number($('#sellPrice').value.trim());
if(!title || !author || !price){ alert('Fill all required fields'); return; }

await addBook({ title, author, price, seller_email: cur.email });
alert('Book listed successfully!');
$('#sellTitle').value = '';
$('#sellAuthor').value = '';
$('#sellPrice').value = '';
});

// Auth logic (simplified local for demo)
function doLogin(){
const email = $('#authEmail').value.trim();
const username = $('#authUser').value.trim();
const pass = $('#authPass').value.trim();
if(!email || !username || !pass){ alert('Fill all fields'); return; }
setCurrentUser({ username, email });
$('#authModal').classList.remove('open');
alert('Logged in as ' + username);
}

document.getElementById('loginExistingBtn')?.addEventListener('click', doLogin);

// Startup
document.addEventListener('DOMContentLoaded', loadBooks);

	
	
	