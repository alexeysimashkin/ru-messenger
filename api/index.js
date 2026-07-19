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

// ========== ЗДОРОВЬЕ ==========
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    message: '✅ API работает!',
    timestamp: new Date().toISOString(),
    postgres: !!pool
  });
});

// ========== ТЕСТОВАЯ РЕГИСТРАЦИЯ ==========
app.post('/api/register', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: '❌ База не подключена' });
  }

  const { email, name, nickname, password } = req.body;

  if (!email || !name || !nickname || !password) {
    return res.status(400).json({ error: '❌ Все поля обязательны' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const result = await pool.sql`
      INSERT INTO users (email, name, nickname, password)
      VALUES (${email}, ${name}, ${nickname}, ${hashedPassword})
      RETURNING id, email, name, nickname
    `;
    
    res.json({ 
      success: true, 
      message: '✅ Регистрация успешна!',
      user: result.rows[0]
    });
  } catch (error) {
    console.error('❌ Register error:', error);
    if (error.message?.includes('duplicate key')) {
      res.status(400).json({ error: '❌ Email или никнейм уже занят' });
    } else {
      res.status(500).json({ error: '❌ Ошибка сервера' });
    }
  }
});

// ========== ТЕСТОВЫЙ ВХОД ==========
app.post('/api/login', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: '❌ База не подключена' });
  }

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: '❌ Email и пароль обязательны' });
  }

  try {
    const { rows } = await pool.sql`
      SELECT * FROM users WHERE email = ${email}
    `;

    if (!rows[0]) {
      return res.status(400).json({ error: '❌ Пользователь не найден' });
    }

    const valid = await bcrypt.compare(password, rows[0].password);
    if (!valid) {
      return res.status(400).json({ error: '❌ Неверный пароль' });
    }

    const token = jwt.sign(
      { id: rows[0].id },
      process.env.JWT_SECRET || 'secret',
      { expiresIn: '30d' }
    );

    res.json({
      success: true,
      token,
      user: {
        id: rows[0].id,
        email: rows[0].email,
        name: rows[0].name,
        nickname: rows[0].nickname
      }
    });
  } catch (error) {
    console.error('❌ Login error:', error);
    res.status(500).json({ error: '❌ Ошибка сервера' });
  }
});

// ========== 404 ==========
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: '❌ Маршрут не найден',
    path: req.path
  });
});

export default app;
