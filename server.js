/**
 * ==============================================================================
 * SERVIDOR PRINCIPAL BACKEND & WEBSOCKETS (RENDER / CLOUD PRODUCTION)
 * Plataforma ODS 16 - Puente de Orientación Ciudadana
 * ==============================================================================
 * Archivo de inicio del servidor para despliegue en Render, Railway o local.
 * - Servidor HTTP: Sirve la aplicación web estática (index.html, app.js, db.js, assets)
 * - Servidor WebSockets: Socket.io para chat en tiempo real bidireccional por salas de casos
 * - API Integrada: Endpoint /api/daily_room para provisión de videollamadas con Daily.co
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
  // Configuración CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-User-Email, X-User-Role, X-User-Name');

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
      service: 'Puente Ciudadano ODS 16 Backend & Realtime Chat',
      port: PORT,
      timestamp: new Date().toISOString(),
      roomsCount: io.sockets.adapter.rooms.size
    }));
    return;
  }

  // 2. Endpoint API de Videollamadas Daily.co (/api/daily_room o /backend/daily_room.php)
  if (pathname === '/api/daily_room' || pathname === '/backend/daily_room.php' || pathname === '/api/daily_room.php') {
    handleDailyRoomRequest(req, res, parsedUrl);
    return;
  }

  // 3. Servir archivos estáticos del frontend
  serveStaticFile(req, res, pathname);
});

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

    const cleanCaseId = caseId.toLowerCase().replace(/[^a-z0-9]/g, '');
    const roomName = `puente-${cleanCaseId}`;
    const expTimestamp = Math.floor(Date.now() / 1000) + (durationMins * 60);

    const hasValidKey = DAILY_API_KEY && DAILY_API_KEY !== 'tu_daily_api_key_aqui' && DAILY_API_KEY.length > 10;

    if (hasValidKey) {
      const payload = JSON.stringify({
        name: roomName,
        privacy: 'public',
        properties: {
          exp: expTimestamp,
          enable_chat: true,
          enable_screenshare: true,
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
          'Authorization': `Bearer ${DAILY_API_KEY}`,
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

          const roomUrl = parsed.url || `https://${DAILY_DOMAIN}/${roomName}`;
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({
            success: true,
            caseId: caseId,
            roomName: roomName,
            roomUrl: roomUrl,
            provider: 'daily.co',
            status: 'created_live',
            isLive: true,
            message: `Sala Daily.co aprovisionada en vivo para el caso #${caseId}`
          }));
        });
      });

      dailyReq.on('error', () => {
        respondWithSandboxRoom(res, caseId, roomName, citizen, professional, durationMins);
      });

      dailyReq.write(payload);
      dailyReq.end();
      return;
    }

    // Modo Sandbox / Fallback resiliente
    respondWithSandboxRoom(res, caseId, roomName, citizen, professional, durationMins);
  });
}

function respondWithSandboxRoom(res, caseId, roomName, citizen, professional, durationMins) {
  const roomUrl = `https://${DAILY_DOMAIN}/${roomName}`;
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
    message: `Sala Daily.co lista para el caso #${caseId}.`
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

// Inicializar Socket.io sobre el mismo servidor HTTP
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const inMemoryMessages = {};

io.on('connection', (socket) => {
  console.log(`[Socket.io] Cliente conectado: ${socket.id}`);

  // 1. Unirse a la sala de un caso específico
  socket.on('join_case', ({ caseId, user }) => {
    if (!caseId) return;

    const roomName = `case_${caseId}`;
    socket.join(roomName);
    socket.activeCaseId = caseId;
    socket.user = user;

    console.log(`[Socket.io] ${user?.name || socket.id} (${user?.role || 'user'}) se unió a la sala ${roomName}`);

    socket.to(roomName).emit('user_joined', {
      user: user || { name: 'Participante', role: 'unknown' },
      caseId: caseId,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  // 2. Enviar mensaje en tiempo real
  socket.on('send_message', (msgData) => {
    const { caseId, text, sender, senderEmail, role, time } = msgData || {};
    if (!caseId || !text) return;

    const roomName = `case_${caseId}`;
    const timestamp = time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    const messageRecord = {
      id: msgData.id || ('MSG-' + Date.now()),
      caseId: caseId,
      sender: sender || 'Usuario',
      senderEmail: senderEmail || '',
      role: role || 'citizen',
      text: text,
      time: timestamp,
      createdAt: new Date().toISOString()
    };

    if (!inMemoryMessages[caseId]) inMemoryMessages[caseId] = [];
    inMemoryMessages[caseId].push(messageRecord);

    console.log(`[Socket.io] Mensaje en ${roomName} de ${sender}: "${text.substring(0, 35)}..."`);
    io.in(roomName).emit('new_message', messageRecord);
  });

  // 3. Indicador de escritura
  socket.on('typing', ({ caseId, user, isTyping }) => {
    if (!caseId) return;
    const roomName = `case_${caseId}`;
    socket.to(roomName).emit('user_typing', {
      caseId: caseId,
      user: user,
      isTyping: !!isTyping
    });
  });

  // 4. Salir de la sala
  socket.on('leave_case', ({ caseId }) => {
    if (caseId) {
      const roomName = `case_${caseId}`;
      socket.leave(roomName);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.io] Cliente desconectado: ${socket.id}`);
  });
});

// Iniciar escucha del servidor
server.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(`🚀 Servidor Puente Ciudadano ODS 16 activo en puerto ${PORT}`);
  console.log(`- Web & Frontend: http://localhost:${PORT}/`);
  console.log(`- Socket.io Realtime: http://localhost:${PORT}`);
  console.log(`- Healthcheck: http://localhost:${PORT}/health`);
  console.log(`================================================================`);
});
