// ============================================================
// ЕДИНЫЙ ФАЙЛ ДЛЯ ВСЕГО САЙТА (FRONTEND + BACKEND)
// ============================================================

export default function handler(req, res) {
  // ==== 1. API ЗАПРОСЫ ====
  if (req.url.startsWith('/api/')) {
    const apiPath = req.url.replace('/api/', '');
    
    // API: health
    if (apiPath === 'health' || apiPath === '') {
      res.status(200).json({ 
        status: 'ok', 
        message: '✅ API работает!',
        timestamp: new Date().toISOString(),
        path: req.url
      });
      return;
    }
    
    // API: всё остальное (заглушка)
    res.status(200).json({ 
      success: true, 
      message: 'API маршрут получен',
      path: req.url,
      method: req.method
    });
    return;
  }

  // ==== 2. ВСЁ ОСТАЛЬНОЕ — ОТДАЁМ HTML =====
  const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RU — Мессенджер</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      padding: 20px;
      color: white;
    }
    .container {
      background: #1a1a1a;
      border-radius: 24px;
      padding: 48px 40px;
      max-width: 420px;
      width: 100%;
      text-align: center;
      border: 1px solid #2a2a2a;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    }
    .logo {
      font-size: 64px;
      font-weight: 800;
      background: linear-gradient(135deg, #6c5ce7, #a29bfe);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 8px;
    }
    h1 { font-size: 24px; color: white; margin-bottom: 4px; }
    .sub { color: #666; font-size: 14px; margin-bottom: 32px; }
    .status { 
      background: #0a2a0a; 
      color: #51cf66; 
      padding: 12px; 
      border-radius: 12px;
      font-size: 14px;
      border-left: 4px solid #51cf66;
      margin-bottom: 24px;
    }
    .btn {
      display: inline-block;
      padding: 14px 40px;
      background: linear-gradient(135deg, #6c5ce7, #a29bfe);
      color: white;
      border: none;
      border-radius: 14px;
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.3s;
    }
    .btn:hover { transform: scale(1.02); box-shadow: 0 8px 30px rgba(108,92,231,0.4); }
    .info { color: #444; font-size: 12px; margin-top: 24px; }
    .debug { 
      background: #111; 
      padding: 12px; 
      border-radius: 8px; 
      margin-top: 16px;
      font-size: 11px;
      color: #555;
      text-align: left;
      overflow: hidden;
      word-break: break-all;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="logo">RU</div>
    <h1>Мессенджер</h1>
    <div class="sub">Современный и безопасный</div>
    <div class="status">✅ Сервер работает</div>
    <a href="#" class="btn" onclick="alert('Фронтенд загружается...')">Войти</a>
    <div class="info">v1.0 · Сделано с ❤️</div>
    <div class="debug">
      📡 Запрос: ${req.url}<br>
      🕐 ${new Date().toLocaleString()}<br>
      🌐 Vercel Edge
    </div>
  </div>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(html);
}
