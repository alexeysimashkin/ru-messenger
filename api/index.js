// ============================================================
// ГЛАВНЫЙ ФАЙЛ API ДЛЯ VERCEL
// ============================================================

export default function handler(req, res) {
  // ==== ЕСЛИ ЗАПРОС К API ====
  if (req.url.startsWith('/api/')) {
    res.status(200).json({
      status: 'ok',
      message: 'API работает!',
      path: req.url,
      method: req.method
    });
    return;
  }

  // ==== ЕСЛИ ЗАПРОС К КОРНЮ ИЛИ СТАТИКЕ ====
  // Просто отдаём HTML
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>RU Мессенджер</title>
      <style>
        * { margin:0; padding:0; box-sizing:border-box; }
        body { font-family: -apple-system, sans-serif; background: #0a0a0a; min-height: 100vh; display: flex; justify-content: center; align-items: center; color: white; }
        .container { background: #1a1a1a; padding: 40px; border-radius: 24px; max-width: 400px; width: 90%; text-align: center; border: 1px solid #2a2a2a; }
        h1 { font-size: 32px; margin-bottom: 8px; }
        .sub { color: #666; font-size: 14px; margin-bottom: 24px; }
        .status { color: #51cf66; font-weight: 600; }
        .btn { display: inline-block; padding: 12px 32px; background: #6c5ce7; color: white; border: none; border-radius: 12px; font-size: 16px; font-weight: 600; cursor: pointer; text-decoration: none; margin-top: 16px; }
        .btn:hover { background: #5a4bd1; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📱 RU</h1>
        <div class="sub">Мессенджер</div>
        <div class="status">✅ Сервер работает</div>
        <a href="https://github.com/alexeysimashkin/ru-messenger" class="btn">GitHub</a>
      </div>
    </body>
    </html>
  `);
}
