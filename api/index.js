import express from 'express';

const app = express();
app.use(express.json());

// ===== ГЛАВНАЯ СТРАНИЦА (чтобы ты увидел, что сервер работает) =====
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"><title>RU Мессенджер</title></head>
    <body style="font-family:sans-serif;background:#0a0a0a;color:white;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;">
      <div style="background:#1a1a1a;padding:50px;border-radius:30px;text-align:center;border:1px solid #333;max-width:400px;">
        <h1 style="font-size:60px;margin:0;">📱</h1>
        <h2 style="margin:10px 0 5px;">RU Мессенджер</h2>
        <p style="color:#51cf66;font-weight:bold;">✅ СЕРВЕР РАБОТАЕТ</p>
        <p style="color:#666;font-size:14px;">Render запущен успешно</p>
      </div>
    </body>
    </html>
  `);
});

// ===== ЗДОРОВЬЕ =====
app.get('/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// ===== ПОРТ =====
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Сервер запущен на порту ${PORT}`);
});
