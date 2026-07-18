import express from 'express';
import { createPool } from '@vercel/postgres';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

let pool = null;

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

// ========== ПРОВЕРКА СТРУКТУРЫ ==========
app.get('/api/check', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: '❌ База не подключена' });
  }

  try {
    const { rows } = await pool.sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'messages'
    `;
    const columns = rows.map(r => r.column_name);
    res.json({ 
      columns,
      hasFileUrl: columns.includes('file_url'),
      hasFileType: columns.includes('file_type'),
      hasIsVoice: columns.includes('is_voice')
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ========== ИНИЦИАЛИЗАЦИЯ ==========
app.post('/api/init', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: '❌ База не подключена' });
  }

  try {
    await pool.sql`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        nickname TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    await pool.sql`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        from_user INTEGER REFERENCES users(id) ON DELETE CASCADE,
        to_user INTEGER REFERENCES users(id) ON DELETE CASCADE,
        content TEXT,
        file_url TEXT,
        file_type TEXT,
        is_voice BOOLEAN DEFAULT FALSE,
        timestamp TIMESTAMP DEFAULT NOW()
      )
    `;
    res.json({ success: true, message: '✅ Таблицы созданы' });
  } catch (error) {
    console.error('❌ Init error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== РЕГИСТРАЦИЯ ==========
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

// ========== ВХОД ==========
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

// ========== ПОЛУЧИТЬ ПОЛЬЗОВАТЕЛЯ ==========
app.get('/api/me', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: '❌ Нет токена' });
  }

  if (!pool) {
    return res.status(500).json({ error: '❌ База не подключена' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const { rows } = await pool.sql`
      SELECT id, email, name, nickname FROM users WHERE id = ${decoded.id}
    `;
    
    if (!rows[0]) {
      return res.status(404).json({ error: '❌ Пользователь не найден' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('❌ Me error:', error);
    res.status(401).json({ error: '❌ Неверный токен' });
  }
});

// ========== ПОИСК ==========
app.get('/api/search/:nickname', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: '❌ База не подключена' });
  }

  const { nickname } = req.params;
  const exclude = parseInt(req.query.exclude) || 0;
  
  if (!nickname || nickname.trim() === '') {
    return res.json([]);
  }

  try {
    const { rows } = await pool.sql`
      SELECT id, name, nickname 
      FROM users 
      WHERE nickname ILIKE ${nickname + '%'}
        AND id != ${exclude}
      LIMIT 20
    `;
    res.json(rows);
  } catch (error) {
    console.error('❌ Search error:', error);
    res.status(500).json({ error: '❌ Ошибка поиска' });
  }
});

// ========== ОТПРАВКА СООБЩЕНИЯ ==========
app.post('/api/message', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: '❌ База не подключена' });
  }

  const { from_user, to_user, content, file_url, file_type, is_voice } = req.body;

  if (!from_user || !to_user) {
    return res.status(400).json({ error: '❌ Отправитель и получатель обязательны' });
  }

  try {
    await pool.sql`
      INSERT INTO messages (from_user, to_user, content, file_url, file_type, is_voice)
      VALUES (${from_user}, ${to_user}, ${content || null}, ${file_url || null}, ${file_type || null}, ${is_voice || false})
    `;
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Message error:', error);
    res.status(500).json({ error: '❌ Ошибка отправки' });
  }
});

// ========== ОТПРАВКА ФОТО (ЧЕРЕЗ JSON, БЕЗ MULTER) ==========
app.post('/api/upload', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: '❌ База не подключена' });
  }

  const { from_user, to_user, file_data, file_name, file_type } = req.body;

  if (!from_user || !to_user || !file_data) {
    return res.status(400).json({ error: '❌ Все поля обязательны' });
  }

  try {
    await pool.sql`
      INSERT INTO messages (from_user, to_user, file_url, file_type)
      VALUES (${from_user}, ${to_user}, ${file_data}, ${file_type || 'image/jpeg'})
    `;
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ error: '❌ Ошибка загрузки фото: ' + error.message });
  }
});

// ========== ИСТОРИЯ ==========
app.get('/api/messages/:user1/:user2', async (req, res) => {
  console.log('📜 Запрос истории:', req.params);
  
  if (!pool) {
    return res.status(500).json({ error: '❌ База не подключена' });
  }

  const { user1, user2 } = req.params;

  const id1 = Number(user1);
  const id2 = Number(user2);

  if (isNaN(id1) || isNaN(id2) || id1 <= 0 || id2 <= 0) {
    return res.status(400).json({ 
      error: '❌ Неверные ID пользователей'
    });
  }

  try {
    const { rows } = await pool.sql`
      SELECT 
        m.id,
        m.from_user,
        m.to_user,
        m.content,
        m.file_url,
        m.file_type,
        m.is_voice,
        m.timestamp,
        u1.name as from_name,
        u2.name as to_name
      FROM messages m
      LEFT JOIN users u1 ON m.from_user = u1.id
      LEFT JOIN users u2 ON m.to_user = u2.id
      WHERE (m.from_user = ${id1} AND m.to_user = ${id2})
         OR (m.from_user = ${id2} AND m.to_user = ${id1})
      ORDER BY m.timestamp ASC
    `;
    
    console.log(`✅ Найдено ${rows.length} сообщений`);
    res.json(rows);
  } catch (error) {
    console.error('❌ Messages error:', error);
    res.status(500).json({ 
      error: '❌ Ошибка загрузки сообщений: ' + error.message 
    });
  }
});

// ========== СПИСОК ЧАТОВ ==========
app.get('/api/chats/:userId', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: '❌ База не подключена' });
  }

  const { userId } = req.params;
  const id = Number(userId);

  if (isNaN(id) || id <= 0) {
    return res.status(400).json({ error: '❌ Неверный ID пользователя' });
  }

  try {
    const { rows } = await pool.sql`
      SELECT DISTINCT 
        CASE 
          WHEN m.from_user = ${id} THEN m.to_user
          ELSE m.from_user
        END as contact_id,
        u.name,
        u.nickname,
        (SELECT content FROM messages m2 
         WHERE (m2.from_user = ${id} AND m2.to_user = u.id)
            OR (m2.from_user = u.id AND m2.to_user = ${id})
         ORDER BY m2.timestamp DESC LIMIT 1) as last_message,
        (SELECT timestamp FROM messages m2 
         WHERE (m2.from_user = ${id} AND m2.to_user = u.id)
            OR (m2.from_user = u.id AND m2.to_user = ${id})
         ORDER BY m2.timestamp DESC LIMIT 1) as last_message_time
      FROM messages m
      JOIN users u ON (u.id = m.from_user OR u.id = m.to_user)
      WHERE (m.from_user = ${id} OR m.to_user = ${id})
        AND u.id != ${id}
      ORDER BY last_message_time DESC
    `;
    res.json(rows);
  } catch (error) {
    console.error('❌ Chats error:', error);
    res.status(500).json({ error: '❌ Ошибка загрузки чатов' });
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
