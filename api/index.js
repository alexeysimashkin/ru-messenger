import express from 'express';
import { createPool } from '@vercel/postgres';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const app = express();
app.use(express.json());

// База данных от Vercel (автоматически)
const pool = createPool({
  connectionString: process.env.POSTGRES_URL
});

// ========== ИНИЦИАЛИЗАЦИЯ ТАБЛИЦ ==========
app.post('/api/init', async (req, res) => {
  try {
    await pool.sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        nickname TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `;
    await pool.sql`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        from_user INTEGER REFERENCES users(id),
        to_user INTEGER REFERENCES users(id),
        content TEXT NOT NULL,
        timestamp TIMESTAMP DEFAULT NOW()
      );
    `;
    res.json({ success: true, message: 'Таблицы созданы' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== РЕГИСТРАЦИЯ ==========
app.post('/api/register', async (req, res) => {
  const { email, name, nickname, password } = req.body;
  
  if (!email || !name || !nickname || !password) {
    return res.status(400).json({ error: 'Все поля обязательны' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    
    await pool.sql`
      INSERT INTO users (email, name, nickname, password)
      VALUES (${email}, ${name}, ${nickname}, ${hashedPassword})
    `;
    
    res.json({ success: true, message: 'Пользователь создан' });
  } catch (error) {
    if (error.message.includes('duplicate key')) {
      res.status(400).json({ error: 'Email или никнейм уже занят' });
    } else {
      res.status(500).json({ error: error.message });
    }
  }
});

// ========== ВХОД ==========
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const { rows } = await pool.sql`
      SELECT * FROM users WHERE email = ${email}
    `;

    if (!rows[0]) {
      return res.status(400).json({ error: 'Пользователь не найден' });
    }

    const validPassword = await bcrypt.compare(password, rows[0].password);
    if (!validPassword) {
      return res.status(400).json({ error: 'Неверный пароль' });
    }

    const token = jwt.sign(
      { id: rows[0].id, email: rows[0].email },
      process.env.JWT_SECRET || 'secret_key_123',
      { expiresIn: '30d' }
    );

    res.json({
      token,
      user: {
        id: rows[0].id,
        email: rows[0].email,
        name: rows[0].name,
        nickname: rows[0].nickname
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== ПОЛУЧИТЬ ДАННЫЕ ПОЛЬЗОВАТЕЛЯ ПО ТОКЕНУ ==========
app.get('/api/me', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Нет токена' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_key_123');
    const { rows } = await pool.sql`
      SELECT id, email, name, nickname FROM users WHERE id = ${decoded.id}
    `;
    
    if (!rows[0]) {
      return res.status(404).json({ error: 'Пользователь не найден' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    res.status(401).json({ error: 'Неверный токен' });
  }
});

// ========== ПОИСК ПО НИКНЕЙМУ ==========
app.get('/api/search/:nickname', async (req, res) => {
  const { nickname } = req.params;
  
  try {
    const { rows } = await pool.sql`
      SELECT id, name, nickname 
      FROM users 
      WHERE nickname ILIKE ${nickname + '%'}
      LIMIT 20
    `;
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== ОТПРАВИТЬ СООБЩЕНИЕ ==========
app.post('/api/message', async (req, res) => {
  const { from_user, to_user, content } = req.body;

  if (!from_user || !to_user || !content) {
    return res.status(400).json({ error: 'Все поля обязательны' });
  }

  try {
    await pool.sql`
      INSERT INTO messages (from_user, to_user, content)
      VALUES (${from_user}, ${to_user}, ${content})
    `;
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== ИСТОРИЯ ПЕРЕПИСКИ ==========
app.get('/api/messages/:user1/:user2', async (req, res) => {
  const { user1, user2 } = req.params;

  try {
    const { rows } = await pool.sql`
      SELECT 
        m.*,
        u1.name as from_name,
        u2.name as to_name
      FROM messages m
      JOIN users u1 ON m.from_user = u1.id
      JOIN users u2 ON m.to_user = u2.id
      WHERE (m.from_user = ${user1} AND m.to_user = ${user2})
         OR (m.from_user = ${user2} AND m.to_user = ${user1})
      ORDER BY m.timestamp ASC
    `;
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== ПОЛУЧИТЬ СПИСОК ДИАЛОГОВ ==========
app.get('/api/chats/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const { rows } = await pool.sql`
      SELECT DISTINCT 
        CASE 
          WHEN m.from_user = ${userId} THEN m.to_user
          ELSE m.from_user
        END as contact_id,
        u.name,
        u.nickname,
        (SELECT content FROM messages m2 
         WHERE (m2.from_user = ${userId} AND m2.to_user = u.id)
            OR (m2.from_user = u.id AND m2.to_user = ${userId})
         ORDER BY m2.timestamp DESC LIMIT 1) as last_message,
        (SELECT timestamp FROM messages m2 
         WHERE (m2.from_user = ${userId} AND m2.to_user = u.id)
            OR (m2.from_user = u.id AND m2.to_user = ${userId})
         ORDER BY m2.timestamp DESC LIMIT 1) as last_message_time
      FROM messages m
      JOIN users u ON (u.id = m.from_user OR u.id = m.to_user)
      WHERE (m.from_user = ${userId} OR m.to_user = ${userId})
        AND u.id != ${userId}
      ORDER BY last_message_time DESC
    `;
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default app;
