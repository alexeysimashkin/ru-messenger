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

// ========== МИГРАЦИЯ ==========
app.post('/api/migrate', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: '❌ База не подключена' });
  }

  try {
    await pool.sql`
      CREATE TABLE IF NOT EXISTS channels (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        nickname TEXT UNIQUE,
        is_private BOOLEAN DEFAULT FALSE,
        invite_code TEXT UNIQUE,
        created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    await pool.sql`
      CREATE TABLE IF NOT EXISTS channel_members (
        id SERIAL PRIMARY KEY,
        channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(channel_id, user_id)
      )
    `;
    await pool.sql`
      CREATE TABLE IF NOT EXISTS channel_messages (
        id SERIAL PRIMARY KEY,
        channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
        from_user INTEGER REFERENCES users(id) ON DELETE CASCADE,
        content TEXT,
        file_url TEXT,
        file_type TEXT,
        is_voice BOOLEAN DEFAULT FALSE,
        timestamp TIMESTAMP DEFAULT NOW()
      )
    `;
    res.json({ success: true, message: '✅ Таблицы каналов созданы' });
  } catch (error) {
    console.error('❌ Migrate error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ========== ПРИНУДИТЕЛЬНОЕ СОЗДАНИЕ ТАБЛИЦ КАНАЛОВ ==========
app.get('/api/create-channels', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: '❌ База не подключена' });
  }

  try {
    await pool.sql`
      CREATE TABLE IF NOT EXISTS channels (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        nickname TEXT UNIQUE,
        is_private BOOLEAN DEFAULT FALSE,
        invite_code TEXT UNIQUE,
        created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;
    await pool.sql`
      CREATE TABLE IF NOT EXISTS channel_members (
        id SERIAL PRIMARY KEY,
        channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        joined_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(channel_id, user_id)
      )
    `;
    await pool.sql`
      CREATE TABLE IF NOT EXISTS channel_messages (
        id SERIAL PRIMARY KEY,
        channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
        from_user INTEGER REFERENCES users(id) ON DELETE CASCADE,
        content TEXT,
        file_url TEXT,
        file_type TEXT,
        is_voice BOOLEAN DEFAULT FALSE,
        timestamp TIMESTAMP DEFAULT NOW()
      )
    `;
    res.json({ 
      success: true, 
      message: '✅ Таблицы каналов созданы!',
      tables: ['channels', 'channel_members', 'channel_messages']
    });
  } catch (error) {
    console.error('❌ Create channels error:', error);
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

// ========== ПОИСК ПОЛЬЗОВАТЕЛЕЙ ==========
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

// ========== ПОИСК КАНАЛОВ ==========
app.get('/api/search/channels/:query', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: '❌ База не подключена' });
  }

  const { query } = req.params;
  
  if (!query || query.trim() === '') {
    return res.json([]);
  }

  try {
    const { rows } = await pool.sql`
      SELECT c.id, c.name, c.nickname, c.is_private, c.created_by, c.created_at,
             u.name as creator_name
      FROM channels c
      JOIN users u ON c.created_by = u.id
      WHERE (c.name ILIKE ${'%' + query + '%'} 
        OR c.nickname ILIKE ${'%' + query + '%'})
        AND c.is_private = false
      LIMIT 20
    `;
    res.json(rows);
  } catch (error) {
    console.error('❌ Search channels error:', error);
    res.status(500).json({ error: '❌ Ошибка поиска каналов' });
  }
});

// ========== СОЗДАНИЕ КАНАЛА ==========
app.post('/api/channel/create', async (req, res) => {
  console.log('📢 Создание канала:', req.body);
  
  if (!pool) {
    return res.status(500).json({ error: '❌ База не подключена' });
  }

  const { name, nickname, is_private, created_by } = req.body;

  if (!name || !created_by) {
    return res.status(400).json({ error: '❌ Название и создатель обязательны' });
  }

  try {
    const inviteCode = is_private ? uuidv4().slice(0, 8) : null;
    
    const result = await pool.sql`
      INSERT INTO channels (name, nickname, is_private, invite_code, created_by)
      VALUES (${name}, ${nickname || null}, ${is_private || false}, ${inviteCode}, ${created_by})
      RETURNING id, name, nickname, is_private, invite_code
    `;

    await pool.sql`
      INSERT INTO channel_members (channel_id, user_id)
      VALUES (${result.rows[0].id}, ${created_by})
    `;

    console.log('✅ Канал создан:', result.rows[0]);

    res.json({ 
      success: true, 
      channel: result.rows[0],
      link: is_private 
        ? `/c/join/${result.rows[0].invite_code}` 
        : `/c/${nickname}`
    });
  } catch (error) {
    console.error('❌ Channel create error:', error);
    if (error.message?.includes('duplicate key')) {
      res.status(400).json({ error: '❌ Такой никнейм канала уже занят' });
    } else {
      res.status(500).json({ error: '❌ Ошибка создания канала: ' + error.message });
    }
  }
});

// ========== ПОЛУЧИТЬ КАНАЛ ПО НИКНЕЙМУ ==========
app.get('/api/channel/:nickname', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: '❌ База не подключена' });
  }

  const { nickname } = req.params;

  try {
    const { rows } = await pool.sql`
      SELECT c.*, u.name as creator_name
      FROM channels c
      JOIN users u ON c.created_by = u.id
      WHERE c.nickname = ${nickname}
    `;
    
    if (!rows[0]) {
      return res.status(404).json({ error: '❌ Канал не найден' });
    }
    
    res.json(rows[0]);
  } catch (error) {
    console.error('❌ Channel get error:', error);
    res.status(500).json({ error: '❌ Ошибка загрузки канала' });
  }
});

// ========== ПОДПИСАТЬСЯ НА КАНАЛ ==========
app.post('/api/channel/subscribe', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: '❌ База не подключена' });
  }

  const { channel_id, user_id } = req.body;

  if (!channel_id || !user_id) {
    return res.status(400).json({ error: '❌ Канал и пользователь обязательны' });
  }

  try {
    const { rows } = await pool.sql`
      SELECT id, is_private, invite_code FROM channels WHERE id = ${channel_id}
    `;

    if (!rows[0]) {
      return res.status(404).json({ error: '❌ Канал не найден' });
    }

    if (rows[0].is_private) {
      return res.status(403).json({ error: '❌ Приватный канал. Только по приглашению' });
    }

    await pool.sql`
      INSERT INTO channel_members (channel_id, user_id)
      VALUES (${channel_id}, ${user_id})
    `;

    res.json({ success: true, message: '✅ Вы подписались на канал' });
  } catch (error) {
    console.error('❌ Channel subscribe error:', error);
    if (error.message?.includes('duplicate key')) {
      res.status(400).json({ error: '❌ Вы уже подписаны на этот канал' });
    } else {
      res.status(500).json({ error: '❌ Ошибка подписки' });
    }
  }
});

// ========== ОТПИСАТЬСЯ ОТ КАНАЛА ==========
app.post('/api/channel/unsubscribe', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: '❌ База не подключена' });
  }

  const { channel_id, user_id } = req.body;

  if (!channel_id || !user_id) {
    return res.status(400).json({ error: '❌ Канал и пользователь обязательны' });
  }

  try {
    // Проверяем, не является ли пользователь создателем
    const { rows } = await pool.sql`
      SELECT created_by FROM channels WHERE id = ${channel_id}
    `;

    if (rows[0] && rows[0].created_by === user_id) {
      return res.status(403).json({ error: '❌ Создатель не может отписаться от своего канала' });
    }

    await pool.sql`
      DELETE FROM channel_members 
      WHERE channel_id = ${channel_id} AND user_id = ${user_id}
    `;

    res.json({ success: true, message: '✅ Вы отписались от канала' });
  } catch (error) {
    console.error('❌ Channel unsubscribe error:', error);
    res.status(500).json({ error: '❌ Ошибка отписки' });
  }
});

// ========== ПОЛУЧИТЬ КАНАЛЫ ПОЛЬЗОВАТЕЛЯ ==========
app.get('/api/channels/:userId', async (req, res) => {
  console.log('📋 Запрос каналов для пользователя:', req.params.userId);
  
  if (!pool) {
    return res.status(500).json({ error: '❌ База не подключена' });
  }

  const { userId } = req.params;

  try {
    const { rows } = await pool.sql`
      SELECT c.id, c.name, c.nickname, c.is_private, c.created_by, c.created_at,
             u.name as creator_name
      FROM channels c
      JOIN channel_members cm ON c.id = cm.channel_id
      JOIN users u ON c.created_by = u.id
      WHERE cm.user_id = ${userId}
      ORDER BY c.created_at DESC
    `;
    
    console.log(`✅ Найдено ${rows.length} каналов`);
    res.json(rows);
  } catch (error) {
    console.error('❌ Channels list error:', error);
    res.status(500).json({ error: '❌ Ошибка загрузки каналов: ' + error.message });
  }
});

// ========== ПРОВЕРКА ПРАВ НА КАНАЛ ==========
app.get('/api/channel/check/:channelId/:userId', async (req, res) => {
  if (!pool) {
    return res.status(500).json({ error: '❌ База не подключена' });
  }

  const { channelId, userId } = req.params;

  try {
    const { rows } = await pool.sql`
      SELECT created_by FROM channels WHERE id = ${channelId}
    `;

    if (!rows[0]) {
      return res.status(404).json({ error: '❌ Канал не найден' });
    }

    const isAdmin = rows[0].created_by === Number(userId);

    res.json({ isAdmin });
  } catch (error) {
    console.error('❌ Check error:', error);
    res.status(500).json({ error: '❌ Ошибка проверки прав' });
  }
});

// ========== ОТПРАВКА СООБЩЕНИЯ В КАНАЛ (только админ) ==========
app.post('/api/channel/message', async (req, res) => {
  console.log('💬 Сообщение в канал:', req.body);
  
  if (!pool) {
    return res.status(500).json({ error: '❌ База не подключена' });
  }

  const { channel_id, from_user, content, file_url, file_type, is_voice } = req.body;

  if (!channel_id || !from_user) {
    return res.status(400).json({ error: '❌ Канал и отправитель обязательны' });
  }

  try {
    // Проверяем, является ли отправитель создателем канала
    const { rows } = await pool.sql`
      SELECT created_by FROM channels WHERE id = ${channel_id}
    `;

    if (!rows[0]) {
      return res.status(404).json({ error: '❌ Канал не найден' });
    }

    if (rows[0].created_by !== from_user) {
      return res.status(403).json({ error: '❌ Только создатель канала может отправлять сообщения' });
    }

    await pool.sql`
      INSERT INTO channel_messages (channel_id, from_user, content, file_url, file_type, is_voice)
      VALUES (${channel_id}, ${from_user}, ${content || null}, ${file_url || null}, ${file_type || null}, ${is_voice || false})
    `;
    
    notifyClients({ type: 'channel_message', channel_id });
    
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Channel message error:', error);
    res.status(500).json({ error: '❌ Ошибка отправки' });
  }
});

// ========== ПОЛУЧИТЬ СООБЩЕНИЯ КАНАЛА ==========
app.get('/api/channel/messages/:channelId', async (req, res) => {
  console.log('📜 Запрос сообщений канала:', req.params.channelId);
  
  if (!pool) {
    return res.status(500).json({ error: '❌ База не подключена' });
  }

  const { channelId } = req.params;

  try {
    const { rows } = await pool.sql`
      SELECT cm.*, u.name as from_name, u.nickname as from_nickname
      FROM channel_messages cm
      JOIN users u ON cm.from_user = u.id
      WHERE cm.channel_id = ${channelId}
      ORDER BY cm.timestamp ASC
    `;
    
    console.log(`✅ Найдено ${rows.length} сообщений`);
    res.json(rows);
  } catch (error) {
    console.error('❌ Channel messages error:', error);
    res.status(500).json({ error: '❌ Ошибка загрузки сообщений' });
  }
});

// ========== ОТПРАВКА ЛИЧНОГО СООБЩЕНИЯ ==========
app.post('/api/message', async (req, res) => {
  console.log('💬 Личное сообщение:', req.body);
  
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
    
    notifyClients({ type: 'new_message', to_user, from_user });
    
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Message error:', error);
    res.status(500).json({ error: '❌ Ошибка отправки' });
  }
});

// ========== ОТПРАВКА ФОТО ==========
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
      INSERT INTO messages (from_user, to_user, content, file_url, file_type)
      VALUES (${from_user}, ${to_user}, '📷 Фото', ${file_data}, ${file_type || 'image/jpeg'})
    `;
    
    notifyClients({ type: 'new_message', to_user, from_user });
    
    res.json({ success: true });
  } catch (error) {
    console.error('❌ Upload error:', error);
    res.status(500).json({ error: '❌ Ошибка загрузки фото: ' + error.message });
  }
});

// ========== ИСТОРИЯ ЛИЧНЫХ СООБЩЕНИЙ ==========
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

// ========== СПИСОК ЛИЧНЫХ ЧАТОВ ==========
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

// ========== SERVER-SENT EVENTS (SSE) ==========
app.get('/api/events', (req, res) => {
  console.log('🔌 Клиент подключился к SSE');
  
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const clientId = Date.now();
  const newClient = {
    id: clientId,
    res
  };

  clients.push(newClient);
  console.log(`✅ Клиент ${clientId} подключен. Всего клиентов: ${clients.length}`);

  res.write(`data: ${JSON.stringify({ type: 'connected', clientId })}\n\n`);

  req.on('close', () => {
    console.log(`❌ Клиент ${clientId} отключен`);
    clients = clients.filter(client => client.id !== clientId);
    console.log(`📊 Осталось клиентов: ${clients.length}`);
  });
});

function notifyClients(data) {
  console.log(`📤 Отправка уведомления ${clients.length} клиентам:`, data);
  
  clients.forEach(client => {
    try {
      client.res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      console.error('❌ Ошибка отправки клиенту:', error);
    }
  });
}

// ========== СТРАНИЦА КАНАЛА (ПО НИКНЕЙМУ) ==========
app.get('/c/:nickname', async (req, res) => {
  console.log('🌐 Запрос страницы канала:', req.params.nickname);
  
  if (!pool) {
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Ошибка — RU</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; color: white; }
          .container { background: #1a1a1a; border-radius: 24px; padding: 40px; max-width: 400px; width: 100%; text-align: center; border: 1px solid #2a2a2a; }
          .icon { font-size: 64px; margin-bottom: 16px; }
          h1 { color: white; margin-bottom: 8px; }
          .sub { color: #666; font-size: 14px; margin-bottom: 24px; }
          .btn { display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #6c5ce7, #a29bfe); color: white; border: none; border-radius: 14px; font-size: 16px; font-weight: 600; cursor: pointer; text-decoration: none; transition: all 0.3s; }
          .btn:hover { transform: scale(1.02); box-shadow: 0 8px 30px rgba(108, 92, 231, 0.4); }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">❌</div>
          <h1>Ошибка сервера</h1>
          <div class="sub">База данных не подключена</div>
          <a href="/" class="btn">Вернуться</a>
        </div>
      </body>
      </html>
    `);
  }

  const { nickname } = req.params;

  try {
    const { rows } = await pool.sql`
      SELECT c.*, u.name as creator_name, u.id as creator_id
      FROM channels c
      JOIN users u ON c.created_by = u.id
      WHERE c.nickname = ${nickname} AND c.is_private = false
    `;
    
    if (!rows[0]) {
      return res.status(404).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Канал не найден — RU</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; color: white; }
            .container { background: #1a1a1a; border-radius: 24px; padding: 40px; max-width: 400px; width: 100%; text-align: center; border: 1px solid #2a2a2a; }
            .icon { font-size: 64px; margin-bottom: 16px; }
            h1 { color: white; margin-bottom: 8px; }
            .sub { color: #666; font-size: 14px; margin-bottom: 24px; }
            .btn { display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #6c5ce7, #a29bfe); color: white; border: none; border-radius: 14px; font-size: 16px; font-weight: 600; cursor: pointer; text-decoration: none; transition: all 0.3s; }
            .btn:hover { transform: scale(1.02); box-shadow: 0 8px 30px rgba(108, 92, 231, 0.4); }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="icon">🔍</div>
            <h1>Канал не найден</h1>
            <div class="sub">Канала с таким никнеймом не существует или он приватный</div>
            <a href="/" class="btn">Вернуться в мессенджер</a>
          </div>
        </body>
        </html>
      `);
    }
    
    const channelId = rows[0].id;
    const channelName = rows[0].name;
    const channelNickname = rows[0].nickname;
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${channelName} — RU Канал</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; color: white; }
          .container { background: #1a1a1a; border-radius: 24px; padding: 40px; max-width: 400px; width: 100%; text-align: center; border: 1px solid #2a2a2a; }
          .icon { font-size: 64px; margin-bottom: 16px; }
          h1 { color: white; margin-bottom: 8px; }
          .sub { color: #666; font-size: 14px; margin-bottom: 16px; }
          .btn { display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #6c5ce7, #a29bfe); color: white; border: none; border-radius: 14px; font-size: 16px; font-weight: 600; cursor: pointer; text-decoration: none; transition: all 0.3s; }
          .btn:hover { transform: scale(1.02); box-shadow: 0 8px 30px rgba(108, 92, 231, 0.4); }
          .private-badge { background: #2a2a2a; color: #888; padding: 4px 12px; border-radius: 20px; font-size: 12px; display: inline-block; margin-bottom: 12px; }
          .info { color: #555; font-size: 13px; margin-top: 8px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">📢</div>
          <div class="private-badge">🌐 Публичный канал</div>
          <h1>${channelName}</h1>
          <div class="sub">@${channelNickname}</div>
          <a href="/?open_channel=${channelId}" class="btn">📥 Подписаться</a>
          <div class="info">Подпишитесь, чтобы читать новости канала</div>
        </div>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('❌ Channel page error:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Ошибка — RU</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; padding: 20px; color: white; }
          .container { background: #1a1a1a; border-radius: 24px; padding: 40px; max-width: 400px; width: 100%; text-align: center; border: 1px solid #2a2a2a; }
          .icon { font-size: 64px; margin-bottom: 16px; }
          h1 { color: white; margin-bottom: 8px; }
          .sub { color: #666; font-size: 14px; margin-bottom: 24px; }
          .btn { display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #6c5ce7, #a29bfe); color: white; border: none; border-radius: 14px; font-size: 16px; font-weight: 600; cursor: pointer; text-decoration: none; transition: all 0.3s; }
          .btn:hover { transform: scale(1.02); box-shadow: 0 8px 30px rgba(108, 92, 231, 0.4); }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">❌</div>
          <h1>Ошибка загрузки</h1>
          <div class="sub">${error.message}</div>
          <a href="/" class="btn">Вернуться</a>
        </div>
      </body>
      </html>
    `);
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
