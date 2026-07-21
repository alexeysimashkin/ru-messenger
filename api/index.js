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

// ========== HTML СТРАНИЦА ==========
const HTML = `<!DOCTYPE html>
<html lang="ru">
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
</style>
</head>
<body>
<div id="app">
  <!-- АВТОРИЗАЦИЯ -->
  <div id="authBlock">
    <div class="logo">
      <div class="logo-icon">RU</div>
      <h1>Мессенджер <span>RU</span></h1>
      <p id="authTitle">Войдите в свой аккаунт</p>
    </div>
    <div id="errorMessage" class="error-message"></div>
    
    <div class="form-group">
      <label>Email</label>
      <input id="email" type="email" placeholder="example@mail.ru" />
    </div>
    <div id="extraFields"></div>
    <div class="form-group">
      <label>Пароль</label>
      <input id="password" type="password" placeholder="Введите пароль" />
    </div>
    
    <button class="btn-primary" id="authBtn">Войти</button>
    
    <div class="auth-toggle">
      <span id="toggleAuth">Зарегистрироваться</span>
    </div>
  </div>

  <!-- ПРИЛОЖЕНИЕ -->
  <div id="appBlock" style="display:none;">
    <div style="color:#fff;text-align:center;padding:40px 0;">
      <h2>Добро пожаловать!</h2>
      <p id="welcomeName" style="color:#888;margin-top:8px;"></p>
      <button onclick="logout()" style="margin-top:20px;padding:12px 30px;background:#ff6b6b;color:#fff;border:none;border-radius:12px;font-size:16px;cursor:pointer;">Выйти</button>
    </div>
  </div>
</div>

<script>
// ============================================================
// ПРОСТОЙ JS БЕЗ СЛОЖНОСТЕЙ
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
  const res = await fetch(API + path, {
    ...opts,
    headers: { ...headers, ...opts.headers }
  });
  const text = await res.text();
  if (!text) throw new Error('Пустой ответ');
  const data = JSON.parse(text);
  if (!res.ok) throw new Error(data.error || 'Ошибка');
  return data;
}

// ===== ПЕРЕКЛЮЧЕНИЕ РЕЖИМА =====
function toggleMode() {
  isLoginMode = !isLoginMode;
  document.getElementById('authTitle').textContent = isLoginMode ? 'Войдите в свой аккаунт' : 'Создайте новый аккаунт';
  document.getElementById('authBtn').textContent = isLoginMode ? 'Войти' : 'Создать аккаунт';
  document.getElementById('toggleAuth').textContent = isLoginMode ? 'Зарегистрироваться' : 'Войти';
  document.getElementById('extraFields').innerHTML = isLoginMode ? '' : 
    '<div class="form-group"><label>Имя</label><input id="name" placeholder="Ваше имя" /></div>' +
    '<div class="form-group"><label>Никнейм</label><input id="nickname" placeholder="Ваш никнейм" /></div>';
}

// ===== АВТОРИЗАЦИЯ =====
async function handleAuth() {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  
  if (!email || !password) {
    showError('Заполните все поля');
    return;
  }

  try {
    if (isLoginMode) {
      // ВХОД
      const data = await request('/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      token = data.token;
      currentUser = data.user;
      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(currentUser));
      showApp();
    } else {
      // РЕГИСТРАЦИЯ
      const name = document.getElementById('name').value.trim();
      const nickname = document.getElementById('nickname').value.trim();
      if (!name || !nickname) {
        showError('Заполните все поля');
        return;
      }
      const data = await request('/register', {
        method: 'POST',
        body: JSON.stringify({ email, name, nickname, password })
      });
      if (data.success) {
        showError('✅ Регистрация успешна! Теперь войдите.', true);
        isLoginMode = true;
        toggleMode();
        document.getElementById('email').value = email;
        document.getElementById('password').value = '';
      }
    }
  } catch (err) {
    showError(err.message);
  }
}

// ===== ВЫХОД =====
function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  token = null;
  currentUser = null;
  document.getElementById('authBlock').style.display = 'block';
  document.getElementById('appBlock').style.display = 'none';
}

// ===== ПОКАЗАТЬ ПРИЛОЖЕНИЕ =====
function showApp() {
  document.getElementById('authBlock').style.display = 'none';
  document.getElementById('appBlock').style.display = 'block';
  document.getElementById('welcomeName').textContent = 'Привет, ' + currentUser.name + ' (@' + currentUser.nickname + ')';
}

// ===== НАВЕШИВАЕМ ОБРАБОТЧИКИ =====
document.getElementById('authBtn').addEventListener('click', function(e) {
  e.preventDefault();
  handleAuth();
});

document.getElementById('toggleAuth').addEventListener('click', function(e) {
  e.preventDefault();
  toggleMode();
});

// Enter для отправки
document.getElementById('password').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleAuth();
  }
});

document.getElementById('email').addEventListener('keydown', function(e) {
  if (e.key === 'Enter') {
    e.preventDefault();
    document.getElementById('password').focus();
  }
});

// ===== ПРОВЕРКА ТОКЕНА ПРИ ЗАГРУЗКЕ =====
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
app.get('/', (req, res) => {
  res.send(HTML);
});

// ========== ЗДОРОВЬЕ ==========
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), postgres: !!pool });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), postgres: !!pool });
});

// ========== РЕГИСТРАЦИЯ ==========
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

// ========== ВХОД ==========
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

// ========== ПОРТ ==========
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('✅ Сервер запущен на порту ' + PORT);
});
