import express from 'express';

const app = express();
app.use(express.json());

// ========== HEALTH CHECK ==========
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: '✅ API работает!',
    timestamp: new Date().toISOString()
  });
});

// ========== РЕГИСТРАЦИЯ ==========
app.post('/api/register', (req, res) => {
  console.log('📝 Регистрация:', req.body);
  res.json({ 
    success: true, 
    message: '✅ Регистрация успешна!',
    user: req.body
  });
});

// ========== ВХОД ==========
app.post('/api/login', (req, res) => {
  console.log('🔑 Вход:', req.body.email);
  res.json({ 
    success: true,
    token: 'test_token_123',
    user: {
      id: 1,
      email: req.body.email || 'test@test.ru',
      name: 'Тест',
      nickname: 'test'
    }
  });
});

// ========== ВАЖНО: экспорт для Vercel ==========
export default app;
