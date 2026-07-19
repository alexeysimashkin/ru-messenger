import express from 'express';
import { createPool } from '@vercel/postgres';
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
    pool = createPool({
      connectionString: process.env.POSTGRES_URL
    });
    console.log('✅ База данных подключена');
  }
} catch (err) {
  console.error('❌ Ошибка подключения к БД:', err.message);
}

// ========== ГЛАВНАЯ СТРАНИЦА (HTML) ==========
const HTML_TEMPLATE = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>RU — Мессенджер</title>
  <link rel="manifest" href="/manifest.json">
  <link rel="apple-touch-icon" href="/icon-192.png">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="theme-color" content="#6c5ce7">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; min-height: 100vh; display: flex; justify-content: center; align-items: center; padding: 0; }
    #app { width: 100%; max-width: 480px; height: 100vh; max-height: 900px; background: #0f0f0f; border-radius: 0; display: flex; flex-direction: column; overflow: hidden; position: relative; box-shadow: none; }
    @media (min-width: 481px) { #app { border-radius: 24px; height: 90vh; box-shadow: 0 20px 80px rgba(0,0,0,0.8); } }
    .auth-container { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 40px 32px; background: #0f0f0f; }
    .auth-container .logo { text-align: center; margin-bottom: 40px; }
    .auth-container .logo-icon { width: 72px; height: 72px; background: linear-gradient(135deg, #6c5ce7, #a29bfe); border-radius: 24px; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; font-size: 32px; color: white; font-weight: 700; }
    .auth-container .logo h1 { font-size: 28px; font-weight: 700; color: white; letter-spacing: -0.5px; }
    .auth-container .logo h1 span { background: linear-gradient(135deg, #6c5ce7, #a29bfe); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    .auth-container .logo p { color: #666; font-size: 14px; margin-top: 4px; }
    .auth-container .form-group { margin-bottom: 16px; }
    .auth-container .form-group label { display: block; font-size: 13px; font-weight: 600; color: #888; margin-bottom: 6px; }
    .auth-container .form-group input { width: 100%; padding: 14px 16px; border: 2px solid #2a2a2a; border-radius: 14px; font-size: 15px; transition: all 0.3s; background: #1a1a1a; color: white; }
    .auth-container .form-group input:focus { outline: none; border-color: #6c5ce7; background: #222; }
    .auth-container .form-group input::placeholder { color: #555; }
    .auth-container .btn-primary { width: 100%; padding: 16px; background: linear-gradient(135deg, #6c5ce7, #a29bfe); color: white; border: none; border-radius: 14px; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.3s; margin-top: 8px; }
    .auth-container .btn-primary:hover { transform: scale(1.02); box-shadow: 0 8px 30px rgba(108, 92, 231, 0.4); }
    .auth-container .btn-primary:disabled { opacity: 0.6; cursor: not-allowed; transform: none; }
    .auth-container .auth-toggle { text-align: center; margin-top: 20px; color: #666; font-size: 14px; }
    .auth-container .auth-toggle span { color: #6c5ce7; font-weight: 600; cursor: pointer; }
    .auth-container .auth-toggle span:hover { text-decoration: underline; }
    .error-message { background: #2a0a0a; color: #ff6b6b; padding: 12px 16px; border-radius: 12px; font-size: 13px; margin-bottom: 16px; display: none; border-left: 4px solid #ff6b6b; }
    .error-message.show { display: block; }
    .error-message.success { background: #0a2a0a; color: #51cf66; border-left-color: #51cf66; }
    .loading { display: inline-block; width: 20px; height: 20px; border: 3px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.6s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="app">
    <div class="auth-container">
      <div class="logo">
        <div class="logo-icon">RU</div>
        <h1>Мессенджер <span>RU</span></h1>
        <p>Войдите в свой аккаунт</p>
      </div>
      <div id="errorMessage" class="error-message"></div>
      <form id="authForm" onsubmit="event.preventDefault(); login()">
        <div class="form-group">
          <label>Email</label>
          <input id="email" type="email" placeholder="example@mail.ru" required />
        </div>
        <div class="form-group">
          <label>Пароль</label>
          <input id="password" type="password" placeholder="Введите пароль" required />
        </div>
        <button type="submit" class="btn-primary">Войти</button>
      </form>
      <div class="auth-toggle">
        Нет аккаунта?
        <span onclick="document.querySelector('.auth-container .logo p').textContent='Создайте новый аккаунт'; document.querySelector('.btn-primary').textContent='Создать аккаунт'; document.querySelector('#authForm').onsubmit=function(e){e.preventDefault(); register()}; this.textContent='Уже есть аккаунт?'; this.onclick=function(){location.reload()}">Зарегистрироваться</span>
      </div>
    </div>
  </div>
  <script>
    const API = '/api';
    async function request(path, options = {}) {
      const response = await fetch(API + path, { ...options, headers: { 'Content-Type': 'application/json' } });
      const text = await response.text();
      if (!text) throw new Error('Пустой ответ');
      return JSON.parse(text);
    }
    async function login() {
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      if (!email || !password) return alert('Заполните все поля');
      try {
        const data = await request('/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        if (data.token) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('user', JSON.stringify(data.user));
          window.location.href = '/app';
        }
      } catch(e) { alert('Ошибка: ' + e.message); }
    }
    async function register() {
      const email = document.getElementById('email').value.trim();
      const name = document.getElementById('name')?.value?.trim() || 'User';
      const nickname = document.getElementById('nickname')?.value?.trim() || 'user' + Math.floor(Math.random()*1000);
      const password = document.getElementById('password').value;
      if (!email || !password) return alert('Заполните все поля');
      try {
        const data = await request('/register', { method: 'POST', body: JSON.stringify({ email, name, nickname, password }) });
        if (data.success) {
          alert('Регистрация успешна! Теперь войдите.');
          window.location.reload();
        }
      } catch(e) { alert('Ошибка: ' + e.message); }
    }
    // Добавляем поля для регистрации
    document.querySelector('.auth-toggle span').onclick = function() {
      const form = document.querySelector('#authForm');
      const html = '<div class="form-group"><label>Имя</label><input id="name" placeholder="Ваше имя" required /></div><div class="form-group"><label>Никнейм</label><input id="nickname" placeholder="Ваш никнейм" required /></div>';
      if (!document.getElementById('name')) {
        form.insertAdjacentHTML('afterbegin', html);
      }
      document.querySelector('.auth-container .logo p').textContent = 'Создайте новый аккаунт';
      document.querySelector('.btn-primary').textContent = 'Создать аккаунт';
      document.querySelector('#authForm').onsubmit = function(e) { e.preventDefault(); register(); };
      this.textContent = 'Уже есть аккаунт?';
      this.onclick = function() { window.location.reload(); };
    };
    // Проверяем токен
    if (localStorage.getItem('token')) {
      window.location.href = '/app';
    }
  </script>
</body>
</html>`;

// ========== ГЛАВНАЯ СТРАНИЦА ==========
app.get('/', (req, res) => {
  res.send(HTML_TEMPLATE);
});

// ========== СТРАНИЦА ПРИЛОЖЕНИЯ ==========
app.get('/app', (req, res) => {
  // Простая проверка токена
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>RU Мессенджер</title>
      <link rel="manifest" href="/manifest.json">
      <link rel="apple-touch-icon" href="/icon-192.png">
      <meta name="apple-mobile-web-app-capable" content="yes">
      <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
      <meta name="theme-color" content="#6c5ce7">
    </head>
    <body>
      <div id="root"></div>
      <script>
        // Проверяем токен
        const token = localStorage.getItem('token');
        if (!token) {
          window.location.href = '/';
        }
        // Загружаем полный интерфейс из index.html
        fetch('/index.html')
          .then(r => r.text())
          .then(html => {
            document.getElementById('root').innerHTML = html;
            // Запускаем скрипты из загруженного HTML
            const scripts = document.getElementById('root').getElementsByTagName('script');
            for (let s of scripts) {
              eval(s.textContent);
            }
          });
      </script>
    </body>
    </html>
  `);
});

// ========== ЗДОРОВЬЕ ==========
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: '✅ API работает!',
    timestamp: new Date().toISOString(),
    postgres: !!pool
  });
});

// ========== ВСЕ ОСТАЛЬНЫЕ API МАРШРУТЫ ==========
// (здесь твои маршруты — регистрация, логин, сообщения, каналы и т.д.)

// ========== ВРЕМЕННЫЙ ЛОГИН ДЛЯ ТЕСТА ==========
app.post('/api/login', (req, res) => {
  res.json({
    success: true,
    token: 'test_token',
    user: {
      id: 1,
      email: req.body.email || 'test@test.ru',
      name: 'Тестовый',
      nickname: 'test'
    }
  });
});

app.post('/api/register', (req, res) => {
  res.json({
    success: true,
    message: 'Регистрация успешна!',
    user: {
      id: 1,
      email: req.body.email,
      name: req.body.name,
      nickname: req.body.nickname
    }
  });
});

// ========== 404 ==========
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: '❌ Маршрут не найден',
    path: req.path
  });
});

export default app;
