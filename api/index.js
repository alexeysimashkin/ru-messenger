// ============================================================
// МИНИМАЛЬНЫЙ API ДЛЯ ТЕСТА
// ============================================================

export default function handler(req, res) {
  console.log('📨 Запрос:', req.method, req.url);
  
  // ==== ОТВЕЧАЕМ НА ВСЁ ====
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>RU — Тест</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body {
          font-family: -apple-system, sans-serif;
          background: #0a0a0a;
          min-height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          color: white;
        }
        .container {
          background: #1a1a1a;
          padding: 48px 40px;
          border-radius: 24px;
          max-width: 420px;
          width: 90%;
          text-align: center;
          border: 1px solid #2a2a2a;
        }
        .logo { font-size: 48px; margin-bottom: 8px; }
        h1 { font-size: 24px; }
        .status { 
          background: #0a2a0a; 
          color: #51cf66; 
          padding: 12px; 
          border-radius: 12px;
          margin: 16px 0;
          border-left: 4px solid #51cf66;
        }
        .debug {
          background: #111;
          padding: 12px;
          border-radius: 8px;
          font-size: 12px;
          color: #555;
          text-align: left;
          margin-top: 16px;
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
      </style>
    </head>
    <body>
      <div class="container">
        <div class="logo">📱</div>
        <h1>RU Мессенджер</h1>
        <div class="status">✅ Сервер работает</div>
        <a href="/api/health" class="btn">Проверить API</a>
        <div class="debug">
          📡 Запрос: ${req.method} ${req.url}<br>
          🕐 ${new Date().toLocaleString()}
        </div>
      </div>
    </body>
    </html>
  `);
}
