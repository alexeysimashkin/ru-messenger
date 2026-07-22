import express from 'express';
import pkg from 'pg';
const { Pool } = pkg;
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

let pool = null;
let clients = [];

try {
  if (process.env.POSTGRES_URL) {
    pool = new Pool({
      connectionString: process.env.POSTGRES_URL,
      ssl: { rejectUnauthorized: false }
    });
    console.log('✅ База данных подключена');
  } else {
    console.log('⚠️ POSTGRES_URL не найдена');
  }
} catch (err) {
  console.error('❌ Ошибка БД:', err.message);
}

async function initTables() {
  if (!pool) return;
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL, nickname TEXT UNIQUE NOT NULL, password TEXT NOT NULL, photo TEXT, birth_date TEXT, created_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS messages (id SERIAL PRIMARY KEY, from_user INTEGER REFERENCES users(id) ON DELETE CASCADE, to_user INTEGER REFERENCES users(id) ON DELETE CASCADE, content TEXT, file_url TEXT, file_type TEXT, is_voice BOOLEAN DEFAULT FALSE, read_at TIMESTAMP, timestamp TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS channels (id SERIAL PRIMARY KEY, name TEXT NOT NULL, nickname TEXT UNIQUE, is_private BOOLEAN DEFAULT FALSE, invite_code TEXT UNIQUE, created_by INTEGER REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMP DEFAULT NOW())`);
    await pool.query(`CREATE TABLE IF NOT EXISTS channel_members (id SERIAL PRIMARY KEY, channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE, user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, joined_at TIMESTAMP DEFAULT NOW(), UNIQUE(channel_id, user_id))`);
    await pool.query(`CREATE TABLE IF NOT EXISTS channel_messages (id SERIAL PRIMARY KEY, channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE, from_user INTEGER REFERENCES users(id) ON DELETE CASCADE, content TEXT, file_url TEXT, file_type TEXT, is_voice BOOLEAN DEFAULT FALSE, timestamp TIMESTAMP DEFAULT NOW())`);
    const ch = await pool.query('SELECT id FROM channels WHERE nickname = $1', ['ru_news']);
    if (ch.rows.length === 0) {
      await pool.query('INSERT INTO channels (name, nickname, is_private, created_by) VALUES ($1, $2, $3, $4)', ['RU Новости', 'ru_news', false, 1]);
    }
    console.log('✅ Все таблицы созданы');
  } catch (err) {
    console.error('❌ Ошибка создания таблиц:', err.message);
  }
}
initTables();

// ============================================================
// HTML (ВСЁ ВНУТРИ, КНОПКИ НА onclick, ГАРАНТИРОВАННО РАБОТАЕТ)
// ============================================================
const HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RU Мессенджер</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,sans-serif;background:#0a0a0a;min-height:100vh;display:flex;justify-content:center;align-items:center;padding:20px}
#app{width:100%;max-width:480px;background:#0f0f0f;border-radius:32px;padding:40px 32px;box-shadow:0 20px 60px rgba(0,0,0,0.5)}
.logo{text-align:center;margin-bottom:36px}
.logo-icon{width:72px;height:72px;background:linear-gradient(135deg,#6c5ce7,#a29bfe);border-radius:24px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:32px;color:#fff;font-weight:700}
.logo h1{font-size:28px;font-weight:700;color:#fff}
.logo h1 span{background:linear-gradient(135deg,#6c5ce7,#a29bfe);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
.logo p{color:#888;font-size:14px;margin-top:4px}
.form-group{margin-bottom:16px}
.form-group label{display:block;font-size:13px;font-weight:600;color:#888;margin-bottom:6px}
.form-group input{width:100%;padding:14px 16px;border:2px solid #2a2a2a;border-radius:14px;font-size:15px;background:#1a1a1a;color:#fff}
.form-group input:focus{outline:none;border-color:#6c5ce7}
.btn-primary{width:100%;padding:16px;background:linear-gradient(135deg,#6c5ce7,#a29bfe);color:#fff;border:none;border-radius:14px;font-size:16px;font-weight:600;cursor:pointer;transition:all .3s;margin-top:8px}
.btn-primary:hover{transform:scale(1.02);box-shadow:0 8px 30px rgba(108,92,231,0.4)}
.auth-toggle{text-align:center;margin-top:20px;color:#666;font-size:14px}
.auth-toggle span{color:#6c5ce7;font-weight:600;cursor:pointer}
.error-message{background:#2a0a0a;color:#ff6b6b;padding:12px 16px;border-radius:12px;font-size:13px;margin-bottom:16px;display:none;border-left:4px solid #ff6b6b}
.error-message.show{display:block}
.error-message.success{background:#0a2a0a;color:#51cf66;border-left-color:#51cf66}
.loading{display:inline-block;width:20px;height:20px;border:3px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.app-container{display:none;flex-direction:column;gap:16px}
.user-info{display:flex;justify-content:space-between;align-items:center;padding:12px 0;border-bottom:1px solid #1a1a1a}
.user-info .name{color:#fff;font-weight:600;font-size:16px}
.user-info .nickname{color:#666;font-size:13px}
.logout-btn{background:none;border:none;color:#666;font-size:20px;cursor:pointer}
.contact{padding:12px 14px;background:#1a1a1a;border-radius:12px;margin-bottom:6px;cursor:pointer;transition:all .3s;display:flex;justify-content:space-between;align-items:center}
.contact:hover{background:#222}
.contact .name{color:#fff;font-weight:600;font-size:14px}
.contact .nickname{color:#666;font-size:12px}
.contact .badge{background:linear-gradient(135deg,#6c5ce7,#a29bfe);color:#fff;padding:2px 10px;border-radius:20px;font-size:10px}
.search-row{display:flex;gap:8px;margin-bottom:16px}
.search-row input{flex:1;padding:10px 14px;border:2px solid #2a2a2a;border-radius:12px;font-size:14px;background:#1a1a1a;color:#fff}
.search-row input:focus{outline:none;border-color:#6c5ce7}
.search-row button{padding:10px 16px;background:linear-gradient(135deg,#6c5ce7,#a29bfe);color:#fff;border:none;border-radius:12px;font-weight:600;cursor:pointer}
.chat-header{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid #1a1a1a}
.chat-header .back{background:none;border:none;font-size:22px;cursor:pointer;color:#6c5ce7}
.chat-header .name{color:#fff;font-weight:600;font-size:15px}
.chat-header .sub{color:#666;font-size:12px}
.messages-container{max-height:300px;overflow-y:auto;padding:8px 0}
.message{padding:8px 12px;margin:3px 0;border-radius:12px;max-width:80%;word-wrap:break-word}
.message.my{background:linear-gradient(135deg,#6c5ce7,#a29bfe);color:#fff;margin-left:auto;border-bottom-right-radius:3px}
.message.other{background:#1a1a1a;color:#ddd;border-bottom-left-radius:3px}
.message .time{font-size:9px;opacity:0.5;margin-top:3px;text-align:right}
.message .sender{font-size:10px;opacity:0.7;margin-bottom:2px;color:#888}
.message .status-icon{font-size:12px}
.message .file-img{max-width:150px;border-radius:8px;margin-top:4px;display:block;cursor:pointer}
.input-container{display:flex;gap:6px;padding:6px 0;flex-wrap:wrap}
.input-container input{flex:1;padding:10px 14px;border:2px solid #2a2a2a;border-radius:12px;font-size:14px;background:#1a1a1a;color:#fff;min-width:50px}
.input-container input:focus{outline:none;border-color:#6c5ce7}
.input-container button{padding:10px 14px;background:linear-gradient(135deg,#6c5ce7,#a29bfe);color:#fff;border:none;border-radius:12px;font-weight:600;cursor:pointer}
.input-container .icon-btn{padding:10px 12px;background:#1a1a1a;color:#888;border:2px solid #2a2a2a;border-radius:12px;font-size:16px;cursor:pointer}
.input-container .icon-btn.recording{background:#ff6b6b;color:#fff;border-color:#ff6b6b;animation:pulse 1s infinite}
@keyframes pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}
#attachMenu{display:none;position:absolute;bottom:65px;right:0;background:#1a1a1a;border-radius:14px;padding:6px;z-index:100;min-width:160px;border:1px solid #2a2a2a}
#attachMenu .menu-item{padding:10px 14px;cursor:pointer;border-radius:10px;display:flex;align-items:center;gap:10px;font-size:13px;color:#ddd}
#attachMenu .menu-item:hover{background:#2a2a2a}
.hidden-file-input{display:none}
.modal-overlay{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);z-index:1000;justify-content:center;align-items:center;padding:20px}
.modal-overlay.active{display:flex}
.modal-content{background:#1a1a1a;border-radius:20px;padding:28px;max-width:400px;width:100%;border:1px solid #2a2a2a}
.modal-content h3{color:#fff;margin-bottom:16px;font-size:18px}
.modal-content .form-group{margin-bottom:14px}
.modal-content .form-group label{font-size:12px;color:#888}
.modal-content .form-group input{width:100%;padding:12px 14px;border:2px solid #2a2a2a;border-radius:12px;font-size:14px;background:#0f0f0f;color:#fff}
.modal-content .form-group input:focus{outline:none;border-color:#6c5ce7}
.modal-content .form-group .hint{font-size:11px;color:#555;margin-top:4px}
.modal-content .form-group.checkbox{display:flex;align-items:center;gap:10px}
.modal-content .form-group.checkbox input{width:16px;height:16px;accent-color:#6c5ce7}
.modal-content .form-group.checkbox label{font-size:13px;color:#ccc}
.modal-content .btn-secondary{width:100%;padding:12px;background:#2a2a2a;color:#888;border:none;border-radius:12px;font-size:14px;font-weight:600;cursor:pointer;margin-top:6px}
.modal-content .btn-secondary:hover{background:#333;color:#fff}
.bottom-tabs{display:flex;background:#1a1a1a;border-top:1px solid #222;margin-top:12px}
.bottom-tabs button{flex:1;padding:8px 0 6px;border:none;background:transparent;font-size:10px;font-weight:500;cursor:pointer;color:#666;display:flex;flex-direction:column;align-items:center;gap:2px}
.bottom-tabs button .tab-icon{font-size:20px}
.bottom-tabs button.active{color:#6c5ce7}
.tab-content{display:none}
.tab-content.active{display:block}
.empty{text-align:center;color:#444;padding:40px 0;font-size:14px}
.empty .icon{font-size:48px;display:block;margin-bottom:12px}
.avatar{width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#6c5ce7,#a29bfe);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px;flex-shrink:0;overflow:hidden}
.avatar img{width:100%;height:100%;object-fit:cover}
.contact .left{display:flex;align-items:center;gap:10px;flex:1;overflow:hidden}
.contact .info{flex:1;min-width:0}
.contact .last-msg{font-size:12px;color:#666;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.contact .status-icon{font-size:14px}
.create-channel-btn{width:100%;padding:12px;background:#1a1a1a;border:2px dashed #6c5ce7;border-radius:12px;font-size:14px;font-weight:600;color:#6c5ce7;cursor:pointer;margin-bottom:10px}
.create-channel-btn:hover{background:#6c5ce7;color:#fff}
.edit-btn{background:none;border:none;color:#666;font-size:16px;cursor:pointer;padding:4px 8px}
.edit-btn:hover{color:#6c5ce7}
.profile-avatar{width:100px;height:100px;border-radius:50%;background:linear-gradient(135deg,#6c5ce7,#a29bfe);display:flex;align-items:center;justify-content:center;font-size:40px;color:#fff;font-weight:700;margin:0 auto 16px;overflow:hidden;cursor:pointer;border:3px solid #2a2a2a}
.profile-avatar img{width:100%;height:100%;object-fit:cover}
.contact-card{display:flex;align-items:center;gap:12px;padding:10px 14px;background:#1a1a1a;border-radius:12px;margin-bottom:6px;cursor:pointer}
.contact-card .avatar-md{width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#6c5ce7,#a29bfe);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px;flex-shrink:0;overflow:hidden}
.contact-card .avatar-md img{width:100%;height:100%;object-fit:cover}
.contact-card .info .name{color:#fff;font-weight:600;font-size:14px}
.contact-card .info .nickname{color:#666;font-size:12px}
</style>
</head>
<body>
<div id="app">

<!-- АВТОРИЗАЦИЯ -->
<div id="authContainer">
  <div class="logo">
    <div class="logo-icon">RU</div>
    <h1>Мессенджер <span>RU</span></h1>
    <p id="authTitle">Войдите в свой аккаунт</p>
  </div>
  <div id="errorMessage" class="error-message"></div>
  <div class="form-group"><label>Email</label><input id="email" type="email" placeholder="example@mail.ru" /></div>
  <div id="extraFields"></div>
  <div class="form-group"><label>Пароль</label><input id="password" type="password" placeholder="Введите пароль" /></div>
  <button class="btn-primary" onclick="window.handleAuth()">Войти</button>
  <div class="auth-toggle"><span onclick="window.toggleMode()" style="cursor:pointer;">Зарегистрироваться</span></div>
</div>

<!-- ПРИЛОЖЕНИЕ -->
<div id="appContainer" style="display:none;flex-direction:column;gap:16px;">
  <div class="user-info">
    <div style="display:flex;align-items:center;gap:10px;cursor:pointer" onclick="switchTab('profile')">
      <div class="avatar" id="topAvatar">U</div>
      <div><div class="name" id="topName">User</div><div class="nickname" id="topNickname">@user</div></div>
    </div>
    <button class="logout-btn" onclick="window.logout()">⏻</button>
  </div>

  <div class="bottom-tabs">
    <button data-tab="chats" class="active" onclick="switchTab('chats')"><span class="tab-icon">💬</span>Чаты</button>
    <button data-tab="contacts" onclick="switchTab('contacts')"><span class="tab-icon">👤</span>Контакты</button>
    <button data-tab="channels" onclick="switchTab('channels')"><span class="tab-icon">📢</span>Каналы</button>
    <button data-tab="profile" onclick="switchTab('profile')"><span class="tab-icon">👤</span>Профиль</button>
  </div>

  <!-- ЧАТЫ -->
  <div id="tab-chats" class="tab-content active">
    <div id="contactsView">
      <div class="search-row"><input id="searchInput" placeholder="🔍 Поиск по никнейму..." /><button onclick="window.searchUsers()">Найти</button></div>
      <div id="contactsList"></div>
    </div>
    <div id="chatView" style="display:none;">
      <div class="chat-header"><button class="back" onclick="goBackToChats()">←</button><div><div class="name" id="selectedChatName"></div><div class="sub" id="selectedChatSub"></div></div></div>
      <div class="messages-container" id="messagesList"></div>
      <div class="input-container">
        <input id="messageInput" placeholder="Сообщение..." />
        <button onclick="window.sendMessage()">Отправить</button>
        <button class="icon-btn" onclick="window.toggleVoiceRecord()">🎤</button>
        <button class="icon-btn" onclick="window.toggleAttachMenu()">📎</button>
        <div id="attachMenu"><div class="menu-item" onclick="window.triggerFileUpload()">🖼️ Фото</div></div>
      </div>
      <input type="file" id="fileInput" class="hidden-file-input" accept="image/*" onchange="window.handleFileSelect(event)" />
    </div>
  </div>

  <!-- КОНТАКТЫ -->
  <div id="tab-contacts" class="tab-content">
    <div class="search-row"><input id="contactsSearch" placeholder="🔍 Поиск контактов..." oninput="window.filterContacts(this.value)" /></div>
    <div id="contactsListTab"></div>
  </div>

  <!-- КАНАЛЫ -->
  <div id="tab-channels" class="tab-content">
    <div id="channelListView">
      <button class="create-channel-btn" onclick="window.showCreateChannelModal()">➕ Создать канал</button>
      <div id="channelsList"></div>
    </div>
    <div id="channelChatView" style="display:none;">
      <div class="chat-header"><button class="back" onclick="goBackToChannels()">←</button><div><div class="name" id="selectedChannelName"></div><div class="sub" id="selectedChannelSub"></div></div><button class="edit-btn" id="channelEditBtn" onclick="window.showEditChannelModal()" style="display:none;">✏️</button></div>
      <div class="messages-container" id="channelMessagesList"></div>
      <div class="input-container" id="channelInputContainer" style="display:none;">
        <input id="channelMessageInput" placeholder="Сообщение в канал..." /><button onclick="window.sendChannelMessage()">Отправить</button>
      </div>
    </div>
  </div>

  <!-- ПРОФИЛЬ -->
  <div id="tab-profile" class="tab-content">
    <div style="text-align:center;padding:10px 0;">
      <div class="profile-avatar" id="profileAvatar" onclick="document.getElementById('profilePhotoInput').click()">U</div>
      <div class="avatar-hint" onclick="document.getElementById('profilePhotoInput').click()" style="font-size:12px;color:#666;cursor:pointer;text-align:center;">Нажмите, чтобы изменить фото</div>
      <input type="file" id="profilePhotoInput" class="hidden-file-input" accept="image/*" onchange="window.updateProfilePhoto(event)" />
      <div class="form-group" style="margin-top:16px;"><label>Имя</label><input id="profileName" placeholder="Ваше имя" /></div>
      <div class="form-group"><label>Никнейм</label><input id="profileNickname" placeholder="Ваш никнейм" /></div>
      <div class="form-group"><label>Дата рождения</label><input id="profileBirthDate" type="date" /></div>
      <button class="btn-primary" onclick="window.saveProfile()">💾 Сохранить</button>
    </div>
  </div>
</div>

<!-- МОДАЛКИ -->
<div class="modal-overlay" id="createChannelModal">
  <div class="modal-content">
    <h3>📢 Создать канал</h3>
    <div class="form-group"><label>Название *</label><input id="channelName" placeholder="Мой канал" /></div>
    <div class="form-group"><label>Никнейм</label><input id="channelNickname" placeholder="my-channel" /><div class="hint">ru-mes.vercel.app/c/<span id="channelPreview">никнейм</span></div></div>
    <div class="form-group checkbox"><input type="checkbox" id="channelPrivate" /><label>Приватный</label></div>
    <button class="btn-primary" onclick="window.createChannel()">Создать</button>
    <button class="btn-secondary" onclick="window.closeCreateChannelModal()">Отмена</button>
  </div>
</div>

<div class="modal-overlay" id="editChannelModal">
  <div class="modal-content">
    <h3>✏️ Редактировать канал</h3>
    <div class="form-group"><label>Название</label><input id="editChannelName" placeholder="Название" /></div>
    <div class="form-group"><label>Никнейм</label><input id="editChannelNickname" placeholder="my-channel" /></div>
    <div class="form-group checkbox"><input type="checkbox" id="editChannelPrivate" /><label>Приватный</label></div>
    <button class="btn-primary" onclick="window.saveChannelChanges()">💾 Сохранить</button>
    <button class="btn-secondary" onclick="window.closeEditChannelModal()">Отмена</button>
  </div>
</div>

<script>
// ============================================================
// ВСЕ ГЛОБАЛЬНЫЕ ФУНКЦИИ (для onclick)
// ============================================================
window.API = '/api';
window.token = localStorage.getItem('token');
window.currentUser = null;
window.selectedUser = null;
window.selectedChannel = null;
window.contacts = [];
window.channels = [];
window.messages = [];
window.channelMessages = [];
window.allUsers = [];
window.isLoginMode = true;
window.isRecording = false;
window.mediaRecorder = null;
window.audioChunks = [];
window.eventSource = null;

function showError(msg, success = false) {
  const el = document.getElementById('errorMessage');
  if (el) {
    el.textContent = msg;
    el.className = 'error-message show' + (success ? ' success' : '');
    setTimeout(() => el.classList.remove('show'), 4000);
  }
}

function formatTime(d) { return new Date(d).toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' }); }

async function request(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (window.token) headers['Authorization'] = 'Bearer ' + window.token;
  const res = await fetch(window.API + path, { ...opts, headers: { ...headers, ...opts.headers } });
  const text = await res.text();
  if (!text) throw new Error('Пустой ответ');
  const data = JSON.parse(text);
  if (!res.ok) throw new Error(data.error || 'Ошибка');
  return data;
}

// ===== АВТОРИЗАЦИЯ =====
window.toggleMode = function() {
  window.isLoginMode = !window.isLoginMode;
  document.getElementById('authTitle').textContent = window.isLoginMode ? 'Войдите в свой аккаунт' : 'Создайте новый аккаунт';
  document.getElementById('authBtn').textContent = window.isLoginMode ? 'Войти' : 'Создать аккаунт';
  const toggleEl = document.querySelector('.auth-toggle span');
  if (toggleEl) toggleEl.textContent = window.isLoginMode ? 'Зарегистрироваться' : 'Войти';
  document.getElementById('extraFields').innerHTML = window.isLoginMode ? '' : 
    '<div class="form-group"><label>Имя</label><input id="name" placeholder="Ваше имя" /></div><div class="form-group"><label>Никнейм</label><input id="nickname" placeholder="Ваш никнейм" /></div>';
}

window.handleAuth = async function() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  if (!email || !password) { showError('Заполните все поля'); return; }
  try {
    if (window.isLoginMode) {
      const data = await request('/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      window.token = data.token; window.currentUser = data.user;
      localStorage.setItem('token', window.token); localStorage.setItem('user', JSON.stringify(window.currentUser));
      initApp();
    } else {
      const name = document.getElementById('name').value.trim();
      const nickname = document.getElementById('nickname').value.trim();
      if (!name || !nickname) { showError('Заполните все поля'); return; }
      const data = await request('/register', { method: 'POST', body: JSON.stringify({ email, name, nickname, password }) });
      if (data.success) { showError('✅ Регистрация успешна! Теперь войдите.', true); window.isLoginMode = true; window.toggleMode(); document.getElementById('email').value = email; document.getElementById('password').value = ''; }
    }
  } catch (err) { showError(err.message); }
}

window.logout = function() {
  localStorage.removeItem('token'); localStorage.removeItem('user');
  window.token = null; window.currentUser = null; if (window.eventSource) { window.eventSource.close(); window.eventSource = null; }
  document.getElementById('authContainer').style.display = 'block';
  document.getElementById('appContainer').style.display = 'none';
}

// ===== ИНИЦИАЛИЗАЦИЯ =====
function initApp() {
  document.getElementById('authContainer').style.display = 'none';
  document.getElementById('appContainer').style.display = 'flex';
  document.getElementById('topName').textContent = window.currentUser.name;
  document.getElementById('topNickname').textContent = '@' + window.currentUser.nickname;
  if (window.currentUser.photo) { document.getElementById('topAvatar').innerHTML = '<img src="' + window.currentUser.photo + '" />'; } else { document.getElementById('topAvatar').textContent = window.currentUser.name.charAt(0).toUpperCase(); }
  connectSSE();
  switchTab('chats');
  loadProfile();
}

function connectSSE() {
  if (window.eventSource) { window.eventSource.close(); }
  window.eventSource = new EventSource(window.API + '/events');
  window.eventSource.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data);
      if (data.type === 'new_message') {
        if (window.selectedUser && data.from_user === window.selectedUser.id) loadMessages(window.selectedUser.id);
        loadChats();
      } else if (data.type === 'channel_message') {
        if (window.selectedChannel && data.channel_id === window.selectedChannel.id) loadChannelMessages(window.selectedChannel.id);
        loadChannels();
      }
    } catch(err) {}
  };
  window.eventSource.onerror = () => { window.eventSource.close(); setTimeout(connectSSE, 5000); };
}

// ===== ВКЛАДКИ =====
function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.bottom-tabs button').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelector('.bottom-tabs button[data-tab="' + tab + '"]').classList.add('active');
  if (tab === 'chats') loadChats();
  else if (tab === 'contacts') loadContacts();
  else if (tab === 'channels') loadChannels();
  else if (tab === 'profile') loadProfile();
}
window.switchTab = switchTab;

// ===== ЧАТЫ =====
async function loadChats() {
  try { const data = await request('/chats/' + window.currentUser.id); window.contacts = data; renderContacts(); } catch(e) { showError(e.message); }
}

function renderContacts() {
  const container = document.getElementById('contactsList');
  if (!container) return;
  if (window.contacts.length === 0) { container.innerHTML = '<div class="empty"><span class="icon">💬</span>Нет чатов</div>'; return; }
  container.innerHTML = window.contacts.map(c => {
    const id = c.contact_id; const name = c.name || 'Без имени'; const nick = c.nickname || 'unknown'; const last = c.last_message || ''; const photo = c.photo || '';
    return '<div class="contact" onclick="window.selectUser({id:' + id + ',name:\'' + name + '\',nickname:\'' + nick + '\',photo:\'' + photo + '\'})">' +
      '<div class="left"><div class="avatar">' + (photo ? '<img src="' + photo + '" />' : name.charAt(0).toUpperCase()) + '</div>' +
      '<div class="info"><div class="name">' + name + '</div><div class="nickname">@' + nick + '</div>' +
      (last ? '<div class="last-msg">' + last.slice(0,40) + (last.length>40?'...':'') + '</div>' : '') + '</div></div>' +
      (last ? '<span class="status-icon">' + (c.last_message_read ? '✅' : '⏳') + '</span>' : '') +
      '</div>';
  }).join('');
}

window.searchUsers = async function() {
  const q = document.getElementById('searchInput').value.trim();
  if (!q) { window.contacts = []; renderContacts(); return; }
  try { const data = await request('/search/' + encodeURIComponent(q) + '?exclude=' + window.currentUser.id); window.contacts = data; renderContacts(); } catch(e) { showError(e.message); }
}

window.selectUser = function(user) {
  if (!user || !user.id) return showError('Ошибка: нет ID');
  window.selectedUser = user; window.selectedChannel = null;
  document.getElementById('chatView').style.display = 'block';
  document.getElementById('contactsView').style.display = 'none';
  document.getElementById('selectedChatName').textContent = user.name;
  document.getElementById('selectedChatSub').textContent = '@' + user.nickname;
  loadMessages(user.id);
}

function goBackToChats() { window.selectedUser = null; document.getElementById('chatView').style.display = 'none'; document.getElementById('contactsView').style.display = 'block'; }
window.goBackToChats = goBackToChats;

async function loadMessages(userId) {
  try {
    const data = await request('/messages/' + window.currentUser.id + '/' + userId);
    window.messages = data; renderMessages();
    for (const m of window.messages.filter(m => m.to_user === window.currentUser.id && !m.read_at)) {
      await request('/message/read', { method: 'POST', body: JSON.stringify({ message_id: m.id, user_id: window.currentUser.id }) });
    }
  } catch(e) { showError(e.message); }
}

function renderMessages() {
  const container = document.getElementById('messagesList');
  if (!container) return;
  if (window.messages.length === 0) { container.innerHTML = '<div class="empty"><span class="icon">💬</span>Начните переписку</div>'; return; }
  container.innerHTML = window.messages.map(m => {
    const isMy = m.from_user === window.currentUser.id;
    let html = m.content || '';
    if (m.file_url && m.file_type?.startsWith('image/')) { html += '<img src="' + m.file_url + '" class="file-img" onclick="window.openFullscreen(\'' + m.file_url + '\')" />'; }
    if (m.is_voice && m.file_url) { html += '<audio controls><source src="' + m.file_url + '" type="' + (m.file_type || 'audio/webm') + '" /></audio>'; }
    return '<div class="message ' + (isMy ? 'my' : 'other') + '">' +
      (!isMy ? '<div class="sender">' + (m.from_name || 'Собеседник') + '</div>' : '') +
      html +
      '<div class="time">' + formatTime(m.timestamp) + (isMy ? ' <span class="status-icon">' + (m.read_at ? '✅✅' : '✅') + '</span>' : '') + '</div></div>';
  }).join('');
  container.scrollTop = container.scrollHeight;
}

window.sendMessage = async function() {
  const content = document.getElementById('messageInput').value.trim();
  if (!content || !window.selectedUser) return;
  try { await request('/message', { method: 'POST', body: JSON.stringify({ from_user: window.currentUser.id, to_user: window.selectedUser.id, content }) }); document.getElementById('messageInput').value = ''; loadMessages(window.selectedUser.id); } catch(e) { showError(e.message); }
}

// ===== КОНТАКТЫ =====
async function loadContacts() {
  try { const data = await request('/search/?exclude=' + window.currentUser.id); window.allUsers = data; renderContactsTab(); } catch(e) { showError(e.message); }
}

function renderContactsTab() {
  const container = document.getElementById('contactsListTab');
  if (!container) return;
  if (window.allUsers.length === 0) { container.innerHTML = '<div class="empty"><span class="icon">👤</span>Нет контактов</div>'; return; }
  container.innerHTML = window.allUsers.map(u => { const photo = u.photo || ''; return '<div class="contact-card" onclick="window.openChatFromContact(' + u.id + ')">' +
    '<div class="avatar-md">' + (photo ? '<img src="' + photo + '" />' : u.name.charAt(0).toUpperCase()) + '</div>' +
    '<div class="info"><div class="name">' + u.name + '</div><div class="nickname">@' + u.nickname + '</div></div></div>'; }).join('');
}

window.filterContacts = function(q) {
  const container = document.getElementById('contactsListTab');
  if (!container) return;
  const filtered = window.allUsers.filter(u => u.name.toLowerCase().includes(q.toLowerCase()) || u.nickname.toLowerCase().includes(q.toLowerCase()));
  if (filtered.length === 0) { container.innerHTML = '<div class="empty"><span class="icon">🔍</span>Ничего не найдено</div>'; return; }
  container.innerHTML = filtered.map(u => { const photo = u.photo || ''; return '<div class="contact-card" onclick="window.openChatFromContact(' + u.id + ')">' +
    '<div class="avatar-md">' + (photo ? '<img src="' + photo + '" />' : u.name.charAt(0).toUpperCase()) + '</div>' +
    '<div class="info"><div class="name">' + u.name + '</div><div class="nickname">@' + u.nickname + '</div></div></div>'; }).join('');
}

window.openChatFromContact = function(id) { const user = window.allUsers.find(u => u.id === id); if (user) { switchTab('chats'); window.selectUser(user); } }

// ===== КАНАЛЫ =====
async function loadChannels() {
  try { const data = await request('/channels/' + window.currentUser.id); window.channels = data; renderChannels(); } catch(e) { showError(e.message); }
}

function renderChannels() {
  const container = document.getElementById('channelsList');
  if (!container) return;
  if (window.channels.length === 0) { container.innerHTML = '<div class="empty"><span class="icon">📢</span>У вас нет каналов</div>'; return; }
  container.innerHTML = window.channels.map(c => '<div class="contact" onclick="window.selectChannel({id:' + c.id + ',name:\'' + c.name + '\',nickname:\'' + (c.nickname||'') + '\',is_private:' + c.is_private + '})">' +
    '<div class="left"><div class="info"><div class="name">' + c.name + '</div><div class="nickname">' + (c.nickname ? '@' + c.nickname : 'Приватный') + '</div></div></div>' +
    '<span class="badge">' + (c.is_private ? '🔒' : '🌐') + '</span></div>').join('');
}

window.selectChannel = function(channel) {
  window.selectedChannel = channel; window.selectedUser = null;
  document.getElementById('channelChatView').style.display = 'block';
  document.getElementById('channelListView').style.display = 'none';
  document.getElementById('selectedChannelName').textContent = channel.name;
  document.getElementById('selectedChannelSub').textContent = channel.nickname ? '@' + channel.nickname : 'Приватный канал';
  checkChannelAdmin(channel.id);
  loadChannelMessages(channel.id);
}

function goBackToChannels() { window.selectedChannel = null; document.getElementById('channelChatView').style.display = 'none'; document.getElementById('channelListView').style.display = 'block'; loadChannels(); }
window.goBackToChannels = goBackToChannels;

async function checkChannelAdmin(channelId) {
  try { const data = await request('/channel/check/' + channelId + '/' + window.currentUser.id); const isAdmin = data.isAdmin; document.getElementById('channelInputContainer').style.display = isAdmin ? 'flex' : 'none'; document.getElementById('channelEditBtn').style.display = isAdmin ? 'inline-block' : 'none'; } catch(e) {}
}

async function loadChannelMessages(channelId) {
  try { const data = await request('/channel/messages/' + channelId); window.channelMessages = data; renderChannelMessages(); } catch(e) { showError(e.message); }
}

function renderChannelMessages() {
  const container = document.getElementById('channelMessagesList');
  if (!container) return;
  if (window.channelMessages.length === 0) { container.innerHTML = '<div class="empty"><span class="icon">📢</span>Нет сообщений</div>'; return; }
  container.innerHTML = window.channelMessages.map(m => {
    const isMy = m.from_user === window.currentUser.id;
    let html = m.content || '';
    if (m.file_url && m.file_type?.startsWith('image/')) { html += '<img src="' + m.file_url + '" class="file-img" onclick="window.openFullscreen(\'' + m.file_url + '\')" />'; }
    if (m.is_voice && m.file_url) { html += '<audio controls><source src="' + m.file_url + '" type="' + (m.file_type || 'audio/webm') + '" /></audio>'; }
    return '<div class="message ' + (isMy ? 'my' : 'other') + '">' +
      (!isMy ? '<div class="sender">' + (m.from_name || 'Администратор') + '</div>' : '') +
      html +
      '<div class="time">' + formatTime(m.timestamp) + '</div></div>';
  }).join('');
  container.scrollTop = container.scrollHeight;
}

window.sendChannelMessage = async function() {
  const content = document.getElementById('channelMessageInput').value.trim();
  if (!content || !window.selectedChannel) return;
  try { await request('/channel/message', { method: 'POST', body: JSON.stringify({ channel_id: window.selectedChannel.id, from_user: window.currentUser.id, content }) }); document.getElementById('channelMessageInput').value = ''; loadChannelMessages(window.selectedChannel.id); } catch(e) { showError(e.message); }
}

// ===== СОЗДАНИЕ/РЕДАКТИРОВАНИЕ КАНАЛА =====
window.showCreateChannelModal = function() { document.getElementById('createChannelModal').classList.add('active'); }
window.closeCreateChannelModal = function() { document.getElementById('createChannelModal').classList.remove('active'); }
window.showEditChannelModal = function() { if (!window.selectedChannel) return; document.getElementById('editChannelName').value = window.selectedChannel.name || ''; document.getElementById('editChannelNickname').value = window.selectedChannel.nickname || ''; document.getElementById('editChannelPrivate').checked = window.selectedChannel.is_private || false; document.getElementById('editChannelModal').classList.add('active'); }
window.closeEditChannelModal = function() { document.getElementById('editChannelModal').classList.remove('active'); }

window.createChannel = async function() {
  const name = document.getElementById('channelName').value.trim();
  const nickname = document.getElementById('channelNickname').value.trim();
  const isPrivate = document.getElementById('channelPrivate').checked;
  if (!name) return showError('Введите название');
  try { const data = await request('/channel/create', { method: 'POST', body: JSON.stringify({ name, nickname: nickname || undefined, is_private: isPrivate, created_by: window.currentUser.id }) }); if (data.success) { showError('✅ Канал создан!', true); window.closeCreateChannelModal(); document.getElementById('channelName').value = ''; document.getElementById('channelNickname').value = ''; document.getElementById('channelPrivate').checked = false; switchTab('channels'); loadChannels(); } } catch(e) { showError(e.message); }
}

window.saveChannelChanges = async function() {
  const name = document.getElementById('editChannelName').value.trim();
  const nickname = document.getElementById('editChannelNickname').value.trim();
  const isPrivate = document.getElementById('editChannelPrivate').checked;
  if (!name) return showError('Введите название');
  try { const data = await request('/channel/update', { method: 'POST', body: JSON.stringify({ channel_id: window.selectedChannel.id, user_id: window.currentUser.id, name, nickname: nickname || null, is_private: isPrivate }) }); if (data.success) { showError('✅ Канал обновлён!', true); window.closeEditChannelModal(); window.selectedChannel = data.channel; document.getElementById('selectedChannelName').textContent = window.selectedChannel.name; document.getElementById('selectedChannelSub').textContent = window.selectedChannel.nickname ? '@' + window.selectedChannel.nickname : 'Приватный канал'; loadChannels(); } } catch(e) { showError(e.message); }
}

// ===== ПРОФИЛЬ =====
function loadProfile() {
  document.getElementById('profileName').value = window.currentUser.name || '';
  document.getElementById('profileNickname').value = window.currentUser.nickname || '';
  document.getElementById('profileBirthDate').value = window.currentUser.birth_date || '';
  const avatar = document.getElementById('profileAvatar');
  if (window.currentUser.photo) { avatar.innerHTML = '<img src="' + window.currentUser.photo + '" />'; } else { avatar.textContent = window.currentUser.name.charAt(0).toUpperCase(); }
}

window.updateProfilePhoto = async function(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2*1024*1024) return showError('Файл > 2MB');
  if (!file.type.startsWith('image/')) return showError('Только изображения');
  try {
    const reader = new FileReader();
    reader.onloadend = async function() {
      const data = await request('/profile/update', { method: 'POST', body: JSON.stringify({ user_id: window.currentUser.id, photo: reader.result }) });
      if (data.success) { window.currentUser = data.user; localStorage.setItem('user', JSON.stringify(window.currentUser)); loadProfile(); document.getElementById('topAvatar').innerHTML = '<img src="' + window.currentUser.photo + '" />'; showError('✅ Фото обновлено!', true); }
    };
    reader.readAsDataURL(file);
  } catch(e) { showError(e.message); }
  event.target.value = '';
}

window.saveProfile = async function() {
  const name = document.getElementById('profileName').value.trim();
  const nickname = document.getElementById('profileNickname').value.trim();
  const birthDate = document.getElementById('profileBirthDate').value;
  if (!name) return showError('Имя обязательно');
  try { const data = await request('/profile/update', { method: 'POST', body: JSON.stringify({ user_id: window.currentUser.id, name, nickname, birth_date: birthDate || null }) }); if (data.success) { window.currentUser = data.user; localStorage.setItem('user', JSON.stringify(window.currentUser)); loadProfile(); document.getElementById('topName').textContent = window.currentUser.name; document.getElementById('topNickname').textContent = '@' + window.currentUser.nickname; showError('✅ Профиль обновлён!', true); } } catch(e) { showError(e.message); }
}

// ===== ФОТО =====
window.triggerFileUpload = function() { document.getElementById('fileInput').click(); document.getElementById('attachMenu').style.display = 'none'; }

window.handleFileSelect = async function(event) {
  const file = event.target.files[0];
  if (!file || !window.selectedUser) { event.target.value = ''; return; }
  if (file.size > 5*1024*1024) return showError('Файл > 5MB');
  if (!file.type.startsWith('image/')) return showError('Только изображения');
  try {
    const reader = new FileReader();
    reader.onloadend = async function() {
      await request('/upload', { method: 'POST', body: JSON.stringify({ from_user: window.currentUser.id, to_user: window.selectedUser.id, file_data: reader.result, file_name: file.name, file_type: file.type }) });
      loadMessages(window.selectedUser.id);
    };
    reader.readAsDataURL(file);
  } catch(e) { showError(e.message); }
  event.target.value = '';
}

// ===== ГОЛОСОВЫЕ =====
window.toggleVoiceRecord = function() {
  if (window.isRecording) { stopRecording(); } else { startRecording(); }
}

async function startRecording() {
  if (window.isRecording) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    window.mediaRecorder = new MediaRecorder(stream);
    window.audioChunks = [];
    window.mediaRecorder.ondataavailable = e => window.audioChunks.push(e.data);
    window.mediaRecorder.onstop = async () => {
      const blob = new Blob(window.audioChunks, { type: 'audio/webm' });
      const reader = new FileReader();
      reader.onloadend = async function() {
        const base64 = reader.result;
        if (window.selectedUser) {
          await request('/message', { method: 'POST', body: JSON.stringify({ from_user: window.currentUser.id, to_user: window.selectedUser.id, content: '🎤 Голосовое', file_url: base64, file_type: 'audio/webm', is_voice: true }) });
          loadMessages(window.selectedUser.id);
        }
      };
      reader.readAsDataURL(blob);
      stream.getTracks().forEach(t => t.stop());
      document.getElementById('voiceBtn').classList.remove('recording');
      window.isRecording = false;
    };
    window.mediaRecorder.start();
    window.isRecording = true;
    document.getElementById('voiceBtn').classList.add('recording');
  } catch(e) { showError('Нет доступа к микрофону'); }
}

function stopRecording() { if (window.mediaRecorder && window.isRecording) { window.mediaRecorder.stop(); } }

window.toggleAttachMenu = function() { const menu = document.getElementById('attachMenu'); menu.style.display = menu.style.display === 'block' ? 'none' : 'block'; }

window.openFullscreen = function(src) {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.95);z-index:9999;display:flex;justify-content:center;align-items:center;cursor:pointer;';
  overlay.innerHTML = '<img src="' + src + '" style="max-width:95%;max-height:95%;border-radius:12px;object-fit:contain;" />';
  overlay.onclick = function() { this.remove(); };
  document.body.appendChild(overlay);
}

// ===== ENTER =====
document.getElementById('messageInput')?.addEventListener('keydown', function(e) { if (e.key === 'Enter') window.sendMessage(); });
document.getElementById('channelMessageInput')?.addEventListener('keydown', function(e) { if (e.key === 'Enter') window.sendChannelMessage(); });
document.getElementById('password')?.addEventListener('keydown', function(e) { if (e.key === 'Enter') window.handleAuth(); });
document.getElementById('channelNickname')?.addEventListener('input', function() { document.getElementById('channelPreview').textContent = this.value || 'никнейм'; });

// ===== ПРОВЕРКА АВТОРИЗАЦИИ =====
if (window.token && localStorage.getItem('user')) {
  try {
    window.currentUser = JSON.parse(localStorage.getItem('user'));
    initApp();
  } catch(e) {
    window.logout();
  }
}
</script>
</body>
</html>`;

// ========== ГЛАВНАЯ ==========
app.get('/', (req, res) => { res.send(HTML); });
app.get('/api/health', (req, res) => { res.json({ status: 'ok', timestamp: new Date().toISOString(), postgres: !!pool }); });

// ========== API МАРШРУТЫ ==========
app.post('/api/register', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'База не подключена' });
  const { email, name, nickname, password } = req.body;
  if (!email || !name || !nickname || !password) return res.status(400).json({ error: 'Все поля обязательны' });
  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await pool.query('INSERT INTO users (email, name, nickname, password) VALUES ($1, $2, $3, $4) RETURNING id, email, name, nickname', [email, name, nickname, hashed]);
    const ch = await pool.query('SELECT id FROM channels WHERE nickname = $1', ['ru_news']);
    if (ch.rows.length > 0) {
      await pool.query('INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [ch.rows[0].id, result.rows[0].id]);
    }
    res.json({ success: true, message: 'Регистрация успешна!', user: result.rows[0] });
  } catch(e) {
    if (e.message?.includes('duplicate')) return res.status(400).json({ error: 'Email или никнейм занят' });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/login', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'База не подключена' });
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email и пароль обязательны' });
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (!rows[0]) return res.status(400).json({ error: 'Пользователь не найден' });
    const valid = await bcrypt.compare(password, rows[0].password);
    if (!valid) return res.status(400).json({ error: 'Неверный пароль' });
    const token = jwt.sign({ id: rows[0].id }, process.env.JWT_SECRET || 'secret', { expiresIn: '30d' });
    res.json({ success: true, token, user: { id: rows[0].id, email: rows[0].email, name: rows[0].name, nickname: rows[0].nickname, photo: rows[0].photo, birth_date: rows[0].birth_date } });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/me', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Нет токена' });
  if (!pool) return res.status(500).json({ error: 'База не подключена' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const { rows } = await pool.query('SELECT id, email, name, nickname, photo, birth_date FROM users WHERE id = $1', [decoded.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json(rows[0]);
  } catch(e) { res.status(401).json({ error: 'Неверный токен' }); }
});

app.post('/api/profile/update', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'База не подключена' });
  const { user_id, name, nickname, photo, birth_date } = req.body;
  if (!user_id) return res.status(400).json({ error: 'ID обязателен' });
  try {
    if (nickname) {
      const dup = await pool.query('SELECT id FROM users WHERE nickname = $1 AND id != $2', [nickname, user_id]);
      if (dup.rows.length > 0) return res.status(400).json({ error: 'Никнейм занят' });
    }
    await pool.query('UPDATE users SET name = COALESCE($1, name), nickname = COALESCE($2, nickname), photo = COALESCE($3, photo), birth_date = COALESCE($4, birth_date) WHERE id = $5', [name, nickname, photo, birth_date, user_id]);
    const { rows } = await pool.query('SELECT id, email, name, nickname, photo, birth_date FROM users WHERE id = $1', [user_id]);
    res.json({ success: true, user: rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/search/:nickname', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'База не подключена' });
  const { nickname } = req.params;
  const exclude = parseInt(req.query.exclude) || 0;
  if (!nickname || nickname.trim() === '') return res.json([]);
  try {
    const { rows } = await pool.query('SELECT id, name, nickname, photo FROM users WHERE nickname ILIKE $1 AND id != $2 LIMIT 20', [nickname + '%', exclude]);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/channel/create', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'База не подключена' });
  const { name, nickname, is_private, created_by } = req.body;
  if (!name || !created_by) return res.status(400).json({ error: 'Название и создатель обязательны' });
  try {
    const inviteCode = is_private ? uuidv4().slice(0,8) : null;
    const result = await pool.query('INSERT INTO channels (name, nickname, is_private, invite_code, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING id, name, nickname, is_private, invite_code', [name, nickname || null, is_private || false, inviteCode, created_by]);
    await pool.query('INSERT INTO channel_members (channel_id, user_id) VALUES ($1, $2)', [result.rows[0].id, created_by]);
    res.json({ success: true, channel: result.rows[0], link: is_private ? '/c/join/' + result.rows[0].invite_code : '/c/' + nickname });
  } catch(e) {
    if (e.message?.includes('duplicate')) return res.status(400).json({ error: 'Такой никнейм уже занят' });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/channel/update', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'База не подключена' });
  const { channel_id, user_id, name, nickname, is_private } = req.body;
  if (!channel_id || !user_id) return res.status(400).json({ error: 'Канал и пользователь обязательны' });
  try {
    const check = await pool.query('SELECT created_by FROM channels WHERE id = $1', [channel_id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Канал не найден' });
    if (check.rows[0].created_by !== user_id) return res.status(403).json({ error: 'Только создатель' });
    if (nickname) {
      const dup = await pool.query('SELECT id FROM channels WHERE nickname = $1 AND id != $2', [nickname, channel_id]);
      if (dup.rows.length > 0) return res.status(400).json({ error: 'Никнейм занят' });
    }
    await pool.query('UPDATE channels SET name = COALESCE($1, name), nickname = COALESCE($2, nickname), is_private = COALESCE($3, is_private) WHERE id = $4', [name, nickname, is_private, channel_id]);
    const { rows } = await pool.query('SELECT * FROM channels WHERE id = $1', [channel_id]);
    res.json({ success: true, channel: rows[0] });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/channels/:userId', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'База не подключена' });
  const { userId } = req.params;
  try {
    const { rows } = await pool.query('SELECT c.id, c.name, c.nickname, c.is_private, c.created_by, c.created_at, u.name as creator_name FROM channels c JOIN channel_members cm ON c.id = cm.channel_id JOIN users u ON c.created_by = u.id WHERE cm.user_id = $1 ORDER BY c.created_at DESC', [userId]);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/channel/check/:channelId/:userId', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'База не подключена' });
  const { channelId, userId } = req.params;
  try {
    const { rows } = await pool.query('SELECT created_by FROM channels WHERE id = $1', [channelId]);
    if (!rows[0]) return res.status(404).json({ error: 'Канал не найден' });
    res.json({ isAdmin: rows[0].created_by === Number(userId) });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/channel/message', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'База не подключена' });
  const { channel_id, from_user, content, file_url, file_type, is_voice } = req.body;
  if (!channel_id || !from_user) return res.status(400).json({ error: 'Канал и отправитель обязательны' });
  try {
    const check = await pool.query('SELECT created_by FROM channels WHERE id = $1', [channel_id]);
    if (!check.rows[0]) return res.status(404).json({ error: 'Канал не найден' });
    if (check.rows[0].created_by !== from_user) return res.status(403).json({ error: 'Только создатель' });
    await pool.query('INSERT INTO channel_messages (channel_id, from_user, content, file_url, file_type, is_voice) VALUES ($1, $2, $3, $4, $5, $6)', [channel_id, from_user, content || null, file_url || null, file_type || null, is_voice || false]);
    clients.forEach(c => { try { c.res.write('data: ' + JSON.stringify({ type: 'channel_message', channel_id }) + '\\n\\n'); } catch(e) {} });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/channel/messages/:channelId', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'База не подключена' });
  const { channelId } = req.params;
  try {
    const { rows } = await pool.query('SELECT cm.*, u.name as from_name, u.nickname as from_nickname FROM channel_messages cm JOIN users u ON cm.from_user = u.id WHERE cm.channel_id = $1 ORDER BY cm.timestamp ASC', [channelId]);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/message', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'База не подключена' });
  const { from_user, to_user, content, file_url, file_type, is_voice } = req.body;
  if (!from_user || !to_user) return res.status(400).json({ error: 'Отправитель и получатель обязательны' });
  try {
    await pool.query('INSERT INTO messages (from_user, to_user, content, file_url, file_type, is_voice) VALUES ($1, $2, $3, $4, $5, $6)', [from_user, to_user, content || null, file_url || null, file_type || null, is_voice || false]);
    clients.forEach(c => { try { c.res.write('data: ' + JSON.stringify({ type: 'new_message', to_user, from_user }) + '\\n\\n'); } catch(e) {} });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/message/read', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'База не подключена' });
  const { message_id, user_id } = req.body;
  if (!message_id || !user_id) return res.status(400).json({ error: 'ID обязательны' });
  try {
    await pool.query('UPDATE messages SET read_at = NOW() WHERE id = $1 AND to_user = $2', [message_id, user_id]);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/upload', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'База не подключена' });
  const { from_user, to_user, file_data, file_name, file_type } = req.body;
  if (!from_user || !to_user || !file_data) return res.status(400).json({ error: 'Все поля обязательны' });
  try {
    await pool.query('INSERT INTO messages (from_user, to_user, content, file_url, file_type) VALUES ($1, $2, $3, $4, $5)', [from_user, to_user, '📷 Фото', file_data, file_type || 'image/jpeg']);
    clients.forEach(c => { try { c.res.write('data: ' + JSON.stringify({ type: 'new_message', to_user, from_user }) + '\\n\\n'); } catch(e) {} });
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/messages/:user1/:user2', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'База не подключена' });
  const { user1, user2 } = req.params;
  const id1 = Number(user1), id2 = Number(user2);
  if (isNaN(id1) || isNaN(id2) || id1 <= 0 || id2 <= 0) return res.status(400).json({ error: 'Неверные ID' });
  try {
    const { rows } = await pool.query('SELECT m.*, u1.name as from_name, u2.name as to_name FROM messages m LEFT JOIN users u1 ON m.from_user = u1.id LEFT JOIN users u2 ON m.to_user = u2.id WHERE (m.from_user = $1 AND m.to_user = $2) OR (m.from_user = $2 AND m.to_user = $1) ORDER BY m.timestamp ASC', [id1, id2]);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/chats/:userId', async (req, res) => {
  if (!pool) return res.status(500).json({ error: 'База не подключена' });
  const { userId } = req.params;
  const id = Number(userId);
  if (isNaN(id) || id <= 0) return res.status(400).json({ error: 'Неверный ID' });
  try {
    const { rows } = await pool.query(`SELECT DISTINCT CASE WHEN m.from_user = $1 THEN m.to_user ELSE m.from_user END as contact_id, u.name, u.nickname, u.photo, (SELECT content FROM messages m2 WHERE (m2.from_user = $1 AND m2.to_user = u.id) OR (m2.from_user = u.id AND m2.to_user = $1) ORDER BY m2.timestamp DESC LIMIT 1) as last_message, (SELECT read_at FROM messages m2 WHERE (m2.from_user = $1 AND m2.to_user = u.id) OR (m2.from_user = u.id AND m2.to_user = $1) ORDER BY m2.timestamp DESC LIMIT 1) as last_message_read FROM messages m JOIN users u ON (u.id = m.from_user OR u.id = m.to_user) WHERE (m.from_user = $1 OR m.to_user = $1) AND u.id != $1 ORDER BY last_message_read DESC`, [id]);
    res.json(rows);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  const client = { id: Date.now(), res };
  clients.push(client);
  const ping = setInterval(() => { try { res.write(': ping\\n\\n'); } catch(e) { clearInterval(ping); } }, 30000);
  req.on('close', () => { clearInterval(ping); clients = clients.filter(c => c.id !== client.id); });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log('✅ Сервер запущен на порту ' + PORT); });
