/**
 * ==============================================================================
 * SERVIDOR PRINCIPAL BACKEND & WEBSOCKETS (RENDER / CLOUD PRODUCTION)
 * Plataforma ODS 16 - Puente de Orientación Ciudadana
 * ==============================================================================
 * Archivo de inicio del servidor para despliegue en Render, Railway o local.
 * - Servidor HTTP: API REST y Archivos estáticos (index.html, app.js, db.js, assets)
 * - Servidor WebSockets: Socket.io con persistencia en disco y WebRTC signaling
 * - Integración Daily.co: Sincronización idéntica de salas por caso para Ciudadano y Profesional
 * ==============================================================================
 */

require('dotenv').config();
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { Server } = require('socket.io');

const PORT = process.env.PORT || process.env.CHAT_PORT || 3001;
const DAILY_API_KEY = process.env.DAILY_API_KEY || '';
const DAILY_DOMAIN = process.env.DAILY_DOMAIN || 'puente-ciudadano.daily.co';
const DAILY_EXP_HOURS = parseInt(process.env.DAILY_ROOM_EXPIRATION_HOURS || '24', 10);

// Asegurar directorio de base de datos persistente en disco
const DB_DIR = path.join(__dirname, 'database');
if (!fs.existsSync(DB_DIR)) {
  try { fs.mkdirSync(DB_DIR, { recursive: true }); } catch (e) {}
}

const MESSAGES_FILE = path.join(DB_DIR, 'messages_store.json');
const ROOMS_FILE = path.join(DB_DIR, 'rooms_store.json');

// Normalizador estándar de identificadores de caso (elimina caracteres especiales y espacios)
function normalizeCaseId(caseId) {
  if (!caseId) return 'cas00138';
  return String(caseId).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getRoomName(caseId) {
  return 'case_' + normalizeCaseId(caseId);
}

// Semilla inicial de mensajes por caso para arranque limpio
const DEFAULT_SEED_MESSAGES = {
  'cas00138': [
    {
      id: 'MSG-101',
      caseId: 'CAS-00138',
      sender: 'Dra. Elena Gómez',
      senderEmail: 'elena.gomez@asesores.org',
      role: 'professional',
      text: 'Hola Mariana, bienvenida al canal de orientación ciudadana (ODS 16). He revisado tu reporte sobre terminación laboral sin liquidación.',
      time: '09:15 a.m.',
      date: '2026-09-01',
      read: true,
      createdAt: '2026-09-01T14:15:00.000Z'
    },
    {
      id: 'MSG-102',
      caseId: 'CAS-00138',
      sender: 'Mariana Sibaja',
      senderEmail: 'mariana.sibaja@ejemplo.com',
      role: 'citizen',
      text: 'Buenos días Dra. Elena. Muchas gracias por atenderme. Trabajé por más de un año en la empresa y me despidieron sin pagarme la liquidación ni las primas.',
      time: '09:18 a.m.',
      date: '2026-09-01',
      read: true,
      createdAt: '2026-09-01T14:18:00.000Z'
    },
    {
      id: 'MSG-103',
      caseId: 'CAS-00138',
      sender: 'Dra. Elena Gómez',
      senderEmail: 'elena.gomez@asesores.org',
      role: 'professional',
      text: 'Entiendo perfectamente, Mariana. Tenemos derecho a exigir la liquidación completa de cesantías, intereses, prima y vacaciones. Ya emití la Hoja de Ruta para radicar la reclamación ante la Inspección del Trabajo.',
      time: '09:22 a.m.',
      date: '2026-09-01',
      read: true,
      createdAt: '2026-09-01T14:22:00.000Z'
    }
  ],
  'cas00139': [
    {
      id: 'MSG-201',
      caseId: 'CAS-00139',
      sender: 'Carlos Rodríguez',
      senderEmail: 'carlos.rodriguez@ejemplo.com',
      role: 'citizen',
      text: 'Doctora Elena, buenas tardes. Radiqué un derecho de petición ante la entidad hace más de 20 días hábiles y no he recibido ninguna respuesta.',
      time: '11:05 a.m.',
      date: '2026-09-01',
      read: true,
      createdAt: '2026-09-01T16:05:00.000Z'
    },
    {
      id: 'MSG-202',
      caseId: 'CAS-00139',
      sender: 'Dra. Elena Gómez',
      senderEmail: 'elena.gomez@asesores.org',
      role: 'professional',
      text: 'Hola Carlos. El plazo constitucional ordinario es de 15 días hábiles. Al haberse vencido en exceso, procede interponer de forma inmediata una Acción de Tutela.',
      time: '11:12 a.m.',
      date: '2026-09-01',
      read: true,
      createdAt: '2026-09-01T16:12:00.000Z'
    }
  ],
  'cas00129': [
    {
      id: 'MSG-301',
      caseId: 'CAS-00129',
      sender: 'Daniela Doria',
      senderEmail: 'daniela.doria@ejemplo.com',
      role: 'citizen',
      text: 'Buen día, quisiera saber qué requisitos necesito para fijar la cuota de alimentos de mi hijo ante la Comisaría de Familia.',
      time: '02:40 p.m.',
      date: '2026-09-01',
      read: true,
      createdAt: '2026-09-01T19:40:00.000Z'
    },
    {
      id: 'MSG-302',
      caseId: 'CAS-00129',
      sender: 'Dra. Elena Gómez',
      senderEmail: 'elena.gomez@asesores.org',
      role: 'professional',
      text: 'Hola Daniela. Debes aportar el Registro Civil de Nacimiento del niño, copia de tu cédula y una relación estimada de gastos de alimentación, vestuario, salud y educación.',
      time: '02:45 p.m.',
      date: '2026-09-01',
      read: true,
      createdAt: '2026-09-01T19:45:00.000Z'
    }
  ]
};

// Carga y guardado de persistencia de mensajes
function loadMessagesStore() {
  try {
    if (fs.existsSync(MESSAGES_FILE)) {
      const raw = fs.readFileSync(MESSAGES_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[Store] Error leyendo messages_store.json:', err.message);
  }
  saveMessagesStore(DEFAULT_SEED_MESSAGES);
  return { ...DEFAULT_SEED_MESSAGES };
}

function saveMessagesStore(store) {
  try {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('[Store] Error guardando messages_store.json:', err.message);
  }
}

function getMessagesForCase(caseId) {
  const store = loadMessagesStore();
  const cleanId = normalizeCaseId(caseId);
  return store[cleanId] || [];
}

function persistMessage(caseId, msgData) {
  const store = loadMessagesStore();
  const cleanId = normalizeCaseId(caseId);
  if (!store[cleanId]) store[cleanId] = [];

  const record = {
    id: msgData.id || ('MSG-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4)),
    caseId: caseId || 'CAS-00138',
    sender: msgData.sender || 'Usuario',
    senderEmail: (msgData.senderEmail || '').toLowerCase().trim(),
    role: msgData.role || 'citizen',
    text: msgData.text || '',
    time: msgData.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    date: msgData.date || new Date().toISOString().split('T')[0],
    read: !!msgData.read,
    createdAt: msgData.createdAt || new Date().toISOString()
  };

  const existingIdx = store[cleanId].findIndex(m => m.id === record.id);
  if (existingIdx >= 0) {
    store[cleanId][existingIdx] = record;
  } else {
    store[cleanId].push(record);
  }

  saveMessagesStore(store);
  return record;
}

// Carga y guardado persistente de salas Daily.co
function loadRoomsStore() {
  try {
    if (fs.existsSync(ROOMS_FILE)) {
      const raw = fs.readFileSync(ROOMS_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[Store] Error leyendo rooms_store.json:', err.message);
  }
  return {};
}

function saveRoomsStore(store) {
  try {
    fs.writeFileSync(ROOMS_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('[Store] Error guardando rooms_store.json:', err.message);
  }
}

function getCachedRoom(cleanCaseId) {
  const store = loadRoomsStore();
  const entry = store[cleanCaseId];
  if (!entry) return null;
  if (entry.exp && Date.now() / 1000 > entry.exp) {
    delete store[cleanCaseId];
    saveRoomsStore(store);
    return null;
  }
  return entry;
}

function setCachedRoom(cleanCaseId, roomData) {
  const store = loadRoomsStore();
  store[cleanCaseId] = {
    ...roomData,
    cachedAt: new Date().toISOString()
  };
  saveRoomsStore(store);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.sql': 'text/plain; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8'
};

// Crear servidor HTTP
const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Email, X-User-Role, X-User-Name, X-Requested-With');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // 1. Healthcheck
  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'Puente Ciudadano ODS 16 Backend & Realtime Sockets',
      port: PORT,
      timestamp: new Date().toISOString(),
      roomsCount: io.sockets.adapter.rooms.size
    }));
    return;
  }

  // 2. API de Mensajes REST (persistencia para ambos usuarios)
  if (
    pathname === '/api/mensajes' ||
    pathname === '/api/messages' ||
    pathname === '/backend/mensajes.php' ||
    pathname === '/api/mensajes.php'
  ) {
    handleMessagesRequest(req, res, parsedUrl);
    return;
  }

  // 3. Endpoint API de Videollamadas Daily.co
  if (
    pathname === '/api/daily_room' ||
    pathname === '/backend/daily_room.php' ||
    pathname === '/api/daily_room.php'
  ) {
    handleDailyRoomRequest(req, res, parsedUrl);
    return;
  }

  // 4. Servir archivos estáticos del frontend
  serveStaticFile(req, res, pathname);
});

// Manejo de peticiones de mensajes REST
function handleMessagesRequest(req, res, parsedUrl) {
  if (req.method === 'GET') {
    const caseId = parsedUrl.query.caso_codigo || parsedUrl.query.caseId || parsedUrl.query.id || 'CAS-00138';
    const messages = getMessagesForCase(caseId);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      success: true,
      caseId: caseId,
      count: messages.length,
      data: messages
    }));
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let data = {};
      try {
        if (body) data = JSON.parse(body);
      } catch (e) {}

      const caseId = data.caseId || data.caso_codigo || parsedUrl.query.caseId || 'CAS-00138';
      const text = data.text || data.mensaje || '';
      if (!text) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, message: 'El texto del mensaje es requerido.' }));
        return;
      }

      const record = persistMessage(caseId, {
        id: data.id,
        sender: data.sender || data.remitente || 'Usuario',
        senderEmail: data.senderEmail || data.remitente_email || '',
        role: data.role || data.rol || 'citizen',
        text: text,
        time: data.time || data.hora
      });

      // Emitir en tiempo real a la sala del caso
      const roomName = getRoomName(caseId);
      io.to(roomName).emit('receive_message', record);
      io.to(roomName).emit('new_message', record);

      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        message: 'Mensaje persistido y emitido en tiempo real.',
        data: record
      }));
    });
    return;
  }

  res.writeHead(405, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Method Not Allowed' }));
}

// Manejo de la provisión de salas Daily.co
function handleDailyRoomRequest(req, res, parsedUrl) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    let data = {};
    try {
      if (body) data = JSON.parse(body);
    } catch (e) {}

    const caseId = data.caseId || parsedUrl.query.caseId || parsedUrl.query.id || 'CAS-00138';
    const citizen = data.citizen || parsedUrl.query.citizen || 'Mariana Sibaja';
    const professional = data.professional || parsedUrl.query.professional || 'Dra. Elena Gómez';
    const durationMins = parseInt(data.durationMinutes || parsedUrl.query.durationMinutes || (DAILY_EXP_HOURS * 60), 10);

    const cleanCaseId = normalizeCaseId(caseId);
    const roomName = 'puente-' + cleanCaseId;
    const expTimestamp = Math.floor(Date.now() / 1000) + (durationMins * 60);

    // 1. REVISAR SI YA EXISTE SALA GENERADA PARA ESTE CASO (Garantiza URL idéntica para Ciudadano y Profesional)
    const cached = getCachedRoom(cleanCaseId);
    if (cached && cached.roomUrl) {
      console.log('[Daily.co] Sala sincronizada existente devuelta para caso #' + caseId + ': ' + cached.roomUrl);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        caseId: caseId,
        roomName: cached.roomName || roomName,
        roomUrl: cached.roomUrl,
        provider: 'daily.co',
        status: 'synchronized',
        isLive: true,
        message: 'Sala Daily.co sincronizada para el caso #' + caseId
      }));
      return;
    }

    const hasValidKey = DAILY_API_KEY && DAILY_API_KEY !== 'tu_daily_api_key_aqui' && DAILY_API_KEY.length > 10;

    if (hasValidKey) {
      const payload = JSON.stringify({
        name: roomName,
        privacy: 'public',
        properties: {
          exp: expTimestamp,
          enable_chat: true,
          enable_screenshare: true,
          enable_knocking: false,
          start_video_off: false,
          start_audio_off: false,
          eject_at_room_exp: true,
          lang: 'es'
        }
      });

      const options = {
        hostname: 'api.daily.co',
        port: 443,
        path: '/v1/rooms',
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + DAILY_API_KEY,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      };

      const dailyReq = https.request(options, (dailyRes) => {
        let respData = '';
        dailyRes.on('data', chunk => { respData += chunk; });
        dailyRes.on('end', () => {
          let parsed = {};
          try { parsed = JSON.parse(respData); } catch (e) {}

          // Si se creó con éxito (200)
          if (dailyRes.statusCode === 200 && parsed.url) {
            setCachedRoom(cleanCaseId, {
              caseId: caseId,
              roomName: parsed.name || roomName,
              roomUrl: parsed.url,
              exp: expTimestamp
            });

            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({
              success: true,
              caseId: caseId,
              roomName: parsed.name || roomName,
              roomUrl: parsed.url,
              provider: 'daily.co',
              status: 'created_live',
              isLive: true,
              message: 'Sala Daily.co aprovisionada en vivo para el caso #' + caseId
            }));
            return;
          }

          // Si ya existía (400 already exists), consultar los detalles para obtener la URL original exacta
          if (dailyRes.statusCode === 400 && respData.includes('already exists')) {
            fetchExistingDailyRoom(roomName, cleanCaseId, caseId, expTimestamp, res, citizen, professional, durationMins);
            return;
          }

          // Fallback resiliente si API responde otro error
          const fallbackUrl = parsed.url || ('https://' + DAILY_DOMAIN + '/' + roomName);
          setCachedRoom(cleanCaseId, {
            caseId: caseId,
            roomName: roomName,
            roomUrl: fallbackUrl,
            exp: expTimestamp
          });

          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            success: true,
            caseId: caseId,
            roomName: roomName,
            roomUrl: fallbackUrl,
            provider: 'daily.co',
            status: 'fallback_live',
            isLive: true,
            message: 'Sala Daily.co asignada para el caso #' + caseId
          }));
        });
      });

      dailyReq.on('error', (e) => {
        console.warn('[Daily.co] Error al contactar api.daily.co:', e.message);
        respondWithConsistentRoom(res, cleanCaseId, caseId, roomName, citizen, professional, durationMins);
      });

      dailyReq.write(payload);
      dailyReq.end();
      return;
    }

    // Modo Sin API Key o Fallback resiliente
    respondWithConsistentRoom(res, cleanCaseId, caseId, roomName, citizen, professional, durationMins);
  });
}

// Consultar sala existente en Daily.co para obtener su URL canónica
function fetchExistingDailyRoom(roomName, cleanCaseId, caseId, expTimestamp, res, citizen, professional, durationMins) {
  const options = {
    hostname: 'api.daily.co',
    port: 443,
    path: '/v1/rooms/' + encodeURIComponent(roomName),
    method: 'GET',
    headers: {
      'Authorization': 'Bearer ' + DAILY_API_KEY
    }
  };

  const getReq = https.request(options, (getRes) => {
    let raw = '';
    getRes.on('data', chunk => { raw += chunk; });
    getRes.on('end', () => {
      let parsed = {};
      try { parsed = JSON.parse(raw); } catch (e) {}

      const roomUrl = parsed.url || ('https://' + DAILY_DOMAIN + '/' + roomName);
      setCachedRoom(cleanCaseId, {
        caseId: caseId,
        roomName: roomName,
        roomUrl: roomUrl,
        exp: parsed.properties?.exp || expTimestamp
      });

      console.log('[Daily.co] Sala existente recuperada exitosamente para caso #' + caseId + ': ' + roomUrl);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        caseId: caseId,
        roomName: roomName,
        roomUrl: roomUrl,
        provider: 'daily.co',
        status: 'existing_live',
        isLive: true,
        message: 'Sala existente sincronizada para el caso #' + caseId
      }));
    });
  });

  getReq.on('error', () => {
    respondWithConsistentRoom(res, cleanCaseId, caseId, roomName, citizen, professional, durationMins);
  });

  getReq.end();
}

function respondWithConsistentRoom(res, cleanCaseId, caseId, roomName, citizen, professional, durationMins) {
  const roomUrl = 'https://' + DAILY_DOMAIN + '/' + roomName;
  setCachedRoom(cleanCaseId, {
    caseId: caseId,
    roomName: roomName,
    roomUrl: roomUrl,
    exp: Math.floor(Date.now() / 1000) + (durationMins * 60)
  });

  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({
    success: true,
    caseId: caseId,
    roomName: roomName,
    roomUrl: roomUrl,
    provider: 'daily.co',
    status: 'ready',
    isSandbox: true,
    config: {
      domain: DAILY_DOMAIN,
      citizen: citizen,
      professional: professional,
      expMinutes: durationMins
    },
    message: 'Sala Daily.co garantizada e idéntica para el caso #' + caseId + '.'
  }));
}

// Servir archivos estáticos
function serveStaticFile(req, res, pathname) {
  let cleanPath = pathname === '/' ? '/index.html' : pathname;
  let filePath = path.join(__dirname, cleanPath);

  if (!fs.existsSync(filePath)) {
    const frontendPath = path.join(__dirname, 'frontend', cleanPath);
    if (fs.existsSync(frontendPath)) {
      filePath = frontendPath;
    } else {
      filePath = path.join(__dirname, 'index.html');
      if (!fs.existsSync(filePath)) {
        filePath = path.join(__dirname, 'frontend', 'index.html');
      }
    }
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
}

// Inicializar Socket.io sobre el mismo servidor HTTP (CORS total y transporte dual)
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: false
  },
  transports: ['websocket', 'polling'],
  pingTimeout: 30000,
  pingInterval: 25000
});

io.on('connection', (socket) => {
  console.log('[Socket.io] Cliente conectado: ' + socket.id + ' desde ' + socket.handshake.address);

  // 1. Unirse a la sala de un caso específico
  socket.on('join_case', ({ caseId, user }) => {
    if (!caseId) return;

    const roomName = getRoomName(caseId);
    socket.join(roomName);
    socket.activeCaseId = caseId;
    socket.activeRoomName = roomName;
    socket.user = user;

    console.log('[Socket.io] ' + (user?.name || socket.id) + ' (' + (user?.role || 'user') + ') se unió a la sala ' + roomName);

    // Enviar historial de mensajes persistidos al usuario que se acaba de conectar
    const history = getMessagesForCase(caseId);
    socket.emit('case_history', history);
    socket.emit('load_messages', history);

    // Notificar a los demás participantes en la sala
    socket.to(roomName).emit('user_joined', {
      user: user || { name: 'Participante', role: 'unknown' },
      caseId: caseId,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  // 2. Enviar mensaje en tiempo real (Persistencia en disco + Broadcast dual)
  const handleIncomingMessage = (msgData) => {
    const { caseId, text } = msgData || {};
    if (!caseId || !text) return;

    const roomName = getRoomName(caseId);

    // Guardar en almacenamiento persistente no volátil
    const messageRecord = persistMessage(caseId, msgData);

    console.log('[Socket.io] Mensaje en ' + roomName + ' de ' + messageRecord.sender + ': "' + text.substring(0, 35) + '..."');

    // Transmitir a TODOS los clientes conectados en la sala (emitiendo tanto receive_message como new_message)
    io.to(roomName).emit('receive_message', messageRecord);
    io.to(roomName).emit('new_message', messageRecord);
  };

  socket.on('send_message', handleIncomingMessage);
  socket.on('receive_message', handleIncomingMessage);

  // 3. Indicador de escritura en vivo
  socket.on('typing', ({ caseId, user, isTyping }) => {
    if (!caseId) return;
    const roomName = getRoomName(caseId);
    socket.to(roomName).emit('user_typing', {
      caseId: caseId,
      user: user,
      isTyping: !!isTyping
    });
  });

  // 4. Salir de la sala
  socket.on('leave_case', ({ caseId }) => {
    const roomName = getRoomName(caseId || socket.activeCaseId);
    if (roomName) {
      socket.leave(roomName);
      console.log('[Socket.io] ' + socket.id + ' abandonó la sala ' + roomName);
    }
  });

  // 5. Señalización WebRTC P2P (Para contingencia de videollamada directa entre navegadores)
  socket.on('webrtc_offer', ({ caseId, offer, sender }) => {
    const roomName = getRoomName(caseId);
    socket.to(roomName).emit('webrtc_offer', { caseId, offer, sender });
  });

  socket.on('webrtc_answer', ({ caseId, answer, sender }) => {
    const roomName = getRoomName(caseId);
    socket.to(roomName).emit('webrtc_answer', { caseId, answer, sender });
  });

  socket.on('webrtc_ice_candidate', ({ caseId, candidate, sender }) => {
    const roomName = getRoomName(caseId);
    socket.to(roomName).emit('webrtc_ice_candidate', { caseId, candidate, sender });
  });

  socket.on('disconnect', () => {
    console.log('[Socket.io] Cliente desconectado: ' + socket.id);
  });
});

// Iniciar escucha del servidor
server.listen(PORT, () => {
  console.log('================================================================');
  console.log('🚀 Servidor Puente Ciudadano ODS 16 activo en puerto ' + PORT);
  console.log('- Web & Frontend: http://localhost:' + PORT + '/');
  console.log('- Socket.io Realtime: http://localhost:' + PORT);
  console.log('- Healthcheck: http://localhost:' + PORT + '/health');
  console.log('- Persistencia: ' + MESSAGES_FILE);
  console.log('================================================================');
});
