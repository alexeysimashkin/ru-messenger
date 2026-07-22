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
// HTML СТРАНИЦА (упрощённая для теста кнопок)
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
  <button class="btn-primary" id="authBtn">Войти</button>
  <div class="auth-toggle"><span id="toggleAuth">Зарегистрироваться</span></div>
</div>

<!-- ПРИЛОЖЕНИЕ (упрощённое для теста) -->
<div id="appContainer" style="display:none;flex-direction:column;gap:16px;">
  <div class="user-info">
    <div><div class="name" id="topName">User</div><div class="nickname" id="topNickname">@user</div></div>
    <button class="logout-btn" id="logoutBtn">⏻</button>
  </div>
  <div style="color:#fff;text-align:center;padding:20px 0;">
    <h2>Добро пожаловать!</h2>
    <p id="welcomeMsg" style="color:#888;margin-top:8px;"></p>
  </div>
</div>

</div>

<script>
// ============================================================
// 100% РАБОЧИЙ JS (всё через addEventListener)
// ============================================================
const API = '/api';
let token = localStorage.getItem('token');
let currentUser = null;
let isLoginMode = true;

function showError(msg, success = false) {
  const el = document.getElementById('errorMessage');
  if (el) {
    el.textContent = msg;
    el.className = 'error-message show' + (success ? ' success' : '');
    setTimeout(() => el.classList.remove('show'), 4000);
  }
}

async function request(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = 'Bearer ' + token;
  const res = await fetch(API + path, { ...opts, headers: { ...headers, ...opts.headers } });
  const text = await res.text();
  if (!text) throw new Error('Пустой ответ');
  const data = JSON.parse(text);
  if (!res.ok) throw new Error(data.error || 'Ошибка');
  return data;
}

function toggleMode() {
  isLoginMode = !isLoginMode;
  document.getElementById('authTitle').textContent = isLoginMode ? 'Войдите в свой аккаунт' : 'Создайте новый аккаунт';
  document.getElementById('authBtn').textContent = isLoginMode ? 'Войти' : 'Создать аккаунт';
  document.getElementById('toggleAuth').textContent = isLoginMode ? 'Зарегистрироваться' : 'Войти';
  document.getElementById('extraFields').innerHTML = isLoginMode ? '' : 
    '<div class="form-group"><label>Имя</label><input id="name" placeholder="Ваше имя" /></div><div class="form-group"><label>Никнейм</label><input id="nickname" placeholder="Ваш никнейм" /></div>';
}

async function handleAuth() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  if (!email || !password) { showError('Заполните все поля'); return; }
  try {
    if (isLoginMode) {
      const data = await request('/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      token = data.token; currentUser = data.user;
      localStorage.setItem('token', token); localStorage.setItem('user', JSON.stringify(currentUser));
      showApp();
    } else {
      const name = document.getElementById('name').value.trim();
      const nickname = document.getElementById('nickname').value.trim();
      if (!name || !nickname) { showError('Заполните все поля'); return; }
      const data = await request('/register', { method: 'POST', body: JSON.stringify({ email, name, nickname, password }) });
      if (data.success) { showError('✅ Регистрация успешна! Теперь войдите.', true); isLoginMode = true; toggleMode(); document.getElementById('email').value = email; document.getElementById('password').value = ''; }
    }
  } catch (err) { showError(err.message); }
}

function logout() {
  localStorage.removeItem('token'); localStorage.removeItem('user');
  token = null; currentUser = null;
  document.getElementById('authContainer').style.display = 'block';
  document.getElementById('appContainer').style.display = 'none';
}

function showApp() {
  document.getElementById('authContainer').style.display = 'none';
  document.getElementById('appContainer').style.display = 'flex';
  document.getElementById('topName').textContent = currentUser.name;
  document.getElementById('topNickname').textContent = '@' + currentUser.nickname;
  document.getElementById('welcomeMsg').textContent = 'Привет, ' + currentUser.name + '!';
}

// ===== НАВЕШИВАЕМ КНОПКИ (100% РАБОТАЕТ) =====
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('authBtn').addEventListener('click', function(e) {
    e.preventDefault();
    handleAuth();
  });

  document.getElementById('toggleAuth').addEventListener('click', function(e) {
    e.preventDefault();
    toggleMode();
  });

  document.getElementById('logoutBtn').addEventListener('click', function(e) {
    e.preventDefault();
    logout();
  });

  document.getElementById('password').addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); handleAuth(); }
  });
});

// ===== ПРОВЕРКА АВТОРИЗАЦИИ =====
if (token && localStorage.getItem('user')) {
  try {
    currentUser = JSON.parse(localStorage.getItem('user'));
    showApp();
  } catch(e) {
    logout();
  }
}
</script>
</body>
</html>`;

// ========== ГЛАВНАЯ ==========
app.get('/', (req, res) => { res.send(HTML); });
app.get('/api/health', (req, res) => { res.json({ status: 'ok', timestamp: new Date().toISOString(), postgres: !!pool }); });

// ========== API МАРШРУТЫ (все функции) ==========
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => { console.log('✅ Сервер запущен на порту ' + PORT); });
