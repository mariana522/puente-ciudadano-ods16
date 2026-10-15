/**
 * ==============================================================================
 * SERVIDOR DE WEBSOCKETS EN TIEMPO REAL (SOCKET.IO)
 * Plataforma ODS 16 - Puente de Orientacion Ciudadana
 * ==============================================================================
 * Permite la mensajeria instantanea bidireccional entre Ciudadanos y Profesionales,
 * aislando cada comunicacion estrictamente por caso (room: case_<caseId>).
 * ==============================================================================
 */

require('dotenv').config();
const http = require('http');
const { Server } = require('socket.io');

const PORT = process.env.CHAT_PORT || process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  // Encabezados CORS
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
      service: 'Puente Ciudadano ODS 16 Realtime Chat Server',
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
  }
});

// Almacenamiento en memoria para respaldo rapido de mensajes
const inMemoryMessages = {};

io.on('connection', (socket) => {
  console.log(`[Socket.io] Cliente conectado: ${socket.id}`);

  // 1. Unirse a la sala de un caso especifico
  socket.on('join_case', ({ caseId, user }) => {
    if (!caseId) return;

    const roomName = `case_${caseId}`;
    socket.join(roomName);
    socket.activeCaseId = caseId;
    socket.user = user;

    console.log(`[Socket.io] ${user?.name || socket.id} (${user?.role || 'user'}) se unio a la sala ${roomName}`);

    // Notificar al otro participante
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

    // Guardar en cache en memoria
    if (!inMemoryMessages[caseId]) inMemoryMessages[caseId] = [];
    inMemoryMessages[caseId].push(messageRecord);

    console.log(`[Socket.io] Mensaje en ${roomName} de ${sender}: "${text.substring(0, 35)}..."`);

    // Transmitir instantaneamente a TODOS en la sala del caso
    io.in(roomName).emit('new_message', messageRecord);
  });

  // 3. Indicador de escritura ("Esta escribiendo...")
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
      console.log(`[Socket.io] ${socket.id} abandono la sala ${roomName}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.io] Cliente desconectado: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`================================================================`);
  console.log(`Servidor de Chat ODS 16 (Socket.io) activo en http://localhost:${PORT}`);
  console.log(`Salas por caso: case_<caseId> | Healthcheck: http://localhost:${PORT}/health`);
  console.log(`================================================================`);
});
