/**
 * ==============================================================================
 * SERVIDOR DE WEBSOCKETS EN TIEMPO REAL (SOCKET.IO)
 * Plataforma ODS 16 - Puente de Orientacion Ciudadana
 * ==============================================================================
 * Permite la mensajeria instantanea bidireccional entre Ciudadanos y Profesionales,
 * aislando cada comunicacion estrictamente por caso (room: case_<caseId>)
 * con persistencia en disco no volátil.
 * ==============================================================================
 */

require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');

const PORT = process.env.CHAT_PORT || process.env.PORT || 3001;

const DB_DIR = path.join(__dirname, 'database');
if (!fs.existsSync(DB_DIR)) {
  try { fs.mkdirSync(DB_DIR, { recursive: true }); } catch (e) {}
}
const MESSAGES_FILE = path.join(DB_DIR, 'messages_store.json');

function normalizeCaseId(caseId) {
  if (!caseId) return 'cas00138';
  return String(caseId).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getRoomName(caseId) {
  return 'case_' + normalizeCaseId(caseId);
}

function loadMessagesStore() {
  try {
    if (fs.existsSync(MESSAGES_FILE)) {
      return JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8'));
    }
  } catch (err) {}
  return {};
}

function saveMessagesStore(store) {
  try {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {}
}

function getMessagesForCase(caseId) {
  const store = loadMessagesStore();
  return store[normalizeCaseId(caseId)] || [];
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

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'Puente Ciudadano ODS 16 Realtime Chat Server (Stand-alone)',
      timestamp: new Date().toISOString(),
      roomsCount: io.sockets.adapter.rooms.size
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Endpoint no encontrado' }));
});

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling']
});

io.on('connection', (socket) => {
  console.log('[Socket.io] Cliente conectado: ' + socket.id);

  socket.on('join_case', ({ caseId, user }) => {
    if (!caseId) return;

    const roomName = getRoomName(caseId);
    socket.join(roomName);
    socket.activeCaseId = caseId;
    socket.user = user;

    console.log('[Socket.io] ' + (user?.name || socket.id) + ' (' + (user?.role || 'user') + ') se unió a la sala ' + roomName);

    // Enviar historial persistente
    const history = getMessagesForCase(caseId);
    socket.emit('case_history', history);
    socket.emit('load_messages', history);

    socket.to(roomName).emit('user_joined', {
      user: user || { name: 'Participante', role: 'unknown' },
      caseId: caseId,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  const handleIncoming = (msgData) => {
    const { caseId, text } = msgData || {};
    if (!caseId || !text) return;

    const roomName = getRoomName(caseId);
    const messageRecord = persistMessage(caseId, msgData);

    console.log('[Socket.io] Mensaje en ' + roomName + ' de ' + messageRecord.sender + ': "' + text.substring(0, 35) + '..."');

    io.to(roomName).emit('receive_message', messageRecord);
    io.to(roomName).emit('new_message', messageRecord);
  };

  socket.on('send_message', handleIncoming);
  socket.on('receive_message', handleIncoming);

  socket.on('typing', ({ caseId, user, isTyping }) => {
    if (!caseId) return;
    const roomName = getRoomName(caseId);
    socket.to(roomName).emit('user_typing', {
      caseId: caseId,
      user: user,
      isTyping: !!isTyping
    });
  });

  socket.on('leave_case', ({ caseId }) => {
    const roomName = getRoomName(caseId || socket.activeCaseId);
    if (roomName) {
      socket.leave(roomName);
      console.log('[Socket.io] ' + socket.id + ' abandonó la sala ' + roomName);
    }
  });

  socket.on('disconnect', () => {
    console.log('[Socket.io] Cliente desconectado: ' + socket.id);
  });
});

server.listen(PORT, () => {
  console.log('================================================================');
  console.log('Servidor de Chat ODS 16 (Socket.io) activo en http://localhost:' + PORT);
  console.log('Salas por caso: case_<caseId> | Healthcheck: http://localhost:' + PORT + '/health');
  console.log('================================================================');
});
