/**
 * ==============================================================================
 * SERVIDOR PRINCIPAL BACKEND & WEBSOCKETS (RENDER / CLOUD PRODUCTION)
 * Plataforma ODS 16 - Puente de Orientación Ciudadana
 * ==============================================================================
 * - Servidor HTTP: API REST y Archivos estáticos (index.html, app.js, db.js, assets)
 * - Servidor WebSockets: Socket.io con persistencia en disco y WebRTC signaling
 * - Integración Daily.co: API REST oficial (api.daily.co/v1/rooms) con clave privada
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
const DAILY_EXP_HOURS = parseInt(process.env.DAILY_ROOM_EXPIRATION_HOURS || '24', 10);

// Asegurar directorio de base de datos persistente
const DB_DIR = path.join(__dirname, 'database');
if (!fs.existsSync(DB_DIR)) {
  try { fs.mkdirSync(DB_DIR, { recursive: true }); } catch (e) {}
}

const MESSAGES_FILE = path.join(DB_DIR, 'messages_store.json');
const ROOMS_FILE = path.join(DB_DIR, 'rooms_store.json');
const CASES_FILE = path.join(DB_DIR, 'cases_store.json');

// Normalizador estándar de identificadores de caso
function normalizeCaseId(caseId) {
  if (!caseId) return 'cas00138';
  return String(caseId).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getRoomName(caseId) {
  return 'case_' + normalizeCaseId(caseId);
}

// Lectura dinámica y rigurosa de DAILY_API_KEY
function getDailyApiKey() {
  const rawKey = process.env.DAILY_API_KEY || process.env.DAILY_KEY || process.env.VITE_DAILY_API_KEY || '';
  return String(rawKey).replace(/^["']|["']$/g, '').trim();
}

function isValidDailyKey(key) {
  if (!key) return false;
  const lower = key.toLowerCase();
  if (lower === 'tu_daily_api_key_aqui' || lower === 'your_daily_api_key_here') return false;
  return key.length >= 20;
}

// Configuración opcional de sala pública fija Daily Prebuilt o Jitsi Meet
function getDailyRoomUrlConfig() {
  const raw = process.env.DAILY_ROOM_URL || process.env.DAILY_PUBLIC_ROOM_URL || process.env.VIDEO_ROOM_URL || '';
  return String(raw).replace(/^["']|["']$/g, '').trim();
}

function getJitsiDomain() {
  const raw = process.env.JITSI_DOMAIN || 'meet.jit.si';
  return String(raw).replace(/^["']|["']$/g, '').trim();
}

// Semilla inicial si no existe archivo de mensajes
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

// Almacén de salas Daily.co
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


// ==============================================================================
// BASE DE DATOS Y GESTIÓN PERSISTENTE DE CASOS (ODS 16 - MULTIDISPOSITIVO)
// ==============================================================================
const DEFAULT_SEED_CASES = [
  {
    id: 'CAS-00138',
    citizen: 'Mariana Sibaja',
    citizenEmail: 'mariana.sibaja@ejemplo.com',
    type: 'Problema laboral',
    subType: 'Despido injustificado sin liquidación',
    description: 'Despido injustificado sin liquidación de prestaciones sociales ni entrega de certificado laboral.',
    status: 'En curso',
    assignedTo: 'Dra. Elena Gómez',
    assignedToEmail: 'elena.gomez@asesores.org',
    date: '2026-09-20',
    institution: 'Inspección del Trabajo',
    instAddress: 'Calle 28 # 4-50, Sede Central MinTrabajo',
    instPhone: 'Línea Gratuita Nacional 01 8000 112518',
    instHours: 'Lunes a Viernes 8:00 am - 4:00 pm',
    checklist: [
      'Copia de cédula de ciudadanía del trabajador',
      'Contrato de trabajo o desprendibles de pago / extractos',
      'Carta de despido laboral o constancia de retiro',
      'Liquidación preliminar elaborada en la plataforma'
    ],
    observations: 'Se inició sesión de orientación virtual y se redactó borrador de solicitud de conciliación laboral.'
  },
  {
    id: 'CAS-00139',
    citizen: 'Carlos Rodríguez',
    citizenEmail: 'carlos.rodriguez@ejemplo.com',
    type: 'Derechos ciudadanos',
    subType: 'Falta de respuesta a petición oficial',
    description: 'Demora superior a 30 días hábiles en respuesta de petición oficial ante la administración municipal.',
    status: 'Pendiente',
    assignedTo: 'Por asignar',
    assignedToEmail: '',
    date: '2026-09-21',
    institution: 'Personería Municipal',
    instAddress: 'Palacio Municipal, Carrera 3 # 12-20',
    instPhone: '(604) 789 2020 Ext. 104',
    instHours: 'Lunes a Viernes 7:30 am - 12:00 m / 1:30 pm - 5:00 pm',
    checklist: [
      'Copia radicada del Derecho de Petición con sello de recibido',
      'Copia del documento de identidad',
      'Constancia de vencimiento de términos legales (15 o 30 días)',
      'Borrador de Acción de Tutela por violación al Derecho de Petición'
    ],
    observations: ''
  },
  {
    id: 'CAS-00140',
    citizen: 'Lucía Fernández',
    citizenEmail: 'lucia.fernandez@ejemplo.com',
    type: 'Familia',
    subType: 'Fijación de cuota alimentaria',
    description: 'Incumplimiento reiterado de acuerdo verbal para el sostenimiento de dos menores de edad.',
    status: 'Finalizado',
    assignedTo: 'Dr. Mauricio Padilla',
    assignedToEmail: 'mauricio.padilla@asesores.org',
    date: '2026-09-18',
    institution: 'Comisaría de Familia',
    instAddress: 'Calle 14 # 8-32, Barrio Centro',
    instPhone: '(604) 791 4500',
    instHours: 'Lunes a Viernes 8:00 am - 5:00 pm',
    checklist: [
      'Registro Civil de Nacimiento de los menores',
      'Copia de cédula de la madre o solicitante',
      'Relación aproximada de gastos mensuales de los hijos',
      'Copia de citación previa o acuerdo de conciliación extrajudicial'
    ],
    observations: 'Audiencia de conciliación culminada con acta de acuerdo formalmente suscrita.'
  }
];

function loadCasesStore() {
  try {
    if (fs.existsSync(CASES_FILE)) {
      const raw = fs.readFileSync(CASES_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[Casos DB] Error leyendo ' + CASES_FILE + ':', err.message);
  }
  return null;
}

function saveCasesStore(store) {
  try {
    fs.writeFileSync(CASES_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('[Casos DB] Error escribiendo ' + CASES_FILE + ':', err.message);
  }
}

function getAllCases() {
  const cases = loadCasesStore();
  if (!cases || !Array.isArray(cases) || cases.length === 0) {
    saveCasesStore(DEFAULT_SEED_CASES);
    return [...DEFAULT_SEED_CASES];
  }
  return cases;
}

function saveAllCases(cases) {
  saveCasesStore(cases);
}

function handleCasesRequest(req, res, parsedUrl) {
  const method = req.method;
  const query = parsedUrl.query || {};
  const action = query.action || '';
  const isUnassigned = query.unassigned === 'true' || query.unassigned === '1';

  const userEmail = (query.user_email || query.userEmail || req.headers['x-user-email'] || '').trim().toLowerCase();
  const userRole = (query.user_role || query.userRole || req.headers['x-user-role'] || 'citizen').trim().toLowerCase();
  const userName = (query.user_name || query.userName || req.headers['x-user-name'] || '').trim().toLowerCase();
  const codigo = query.codigo || query.id || '';

  const cases = getAllCases();

  // 1. GET: Consultar casos
  if (method === 'GET') {
    if (codigo) {
      const found = cases.find(c => c.id === codigo || c.codigo === codigo);
      if (!found) {
        res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, message: 'Expediente no encontrado.' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, data: found }));
      return;
    }

    if (isUnassigned) {
      const unassigned = cases.filter(c => {
        const assigned = (c.assignedTo || c.profesional_asignado || '').trim().toLowerCase();
        return !assigned || assigned === 'por asignar' || assigned === 'sin asignar' || assigned === 'null' || assigned === 'undefined';
      });

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, count: unassigned.length, data: unassigned }));
      return;
    }

    if (userRole === 'professional') {
      if (userName || userEmail) {
        const cleanUserName = userName.replace(/^(dra?\.\s*)/i, '').trim();
        const profCases = cases.filter(c => {
          const assigned = (c.assignedTo || '').trim().toLowerCase();
          const cleanAssigned = assigned.replace(/^(dra?\.\s*)/i, '').trim();
          const matchEmail = c.assignedToEmail && c.assignedToEmail.toLowerCase() === userEmail;
          const matchName = assigned === userName || cleanAssigned === cleanUserName;
          return matchEmail || matchName;
        });

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, count: profCases.length, data: profCases }));
        return;
      }
    } else if (userRole === 'citizen') {
      if (userEmail || userName) {
        const citizenCases = cases.filter(c => {
          const matchEmail = c.citizenEmail && c.citizenEmail.toLowerCase() === userEmail;
          const matchName = c.citizen && c.citizen.trim().toLowerCase() === userName;
          return matchEmail || matchName;
        });

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, count: citizenCases.length, data: citizenCases }));
        return;
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, count: cases.length, data: cases }));
    return;
  }

  // 2. POST / PUT
  if (method === 'POST' || method === 'PUT') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let data = {};
      try { data = JSON.parse(body || '{}'); } catch (e) {}

      // A. Reclamar / Asignar caso
      if (action === 'claim' || data.action === 'claim') {
        const caseId = data.caseId || data.id || query.caseId || query.id;
        const profName = data.profName || data.assignedTo || 'Dra. Elena Gómez';
        const profEmail = data.profEmail || data.assignedToEmail || '';

        const idx = cases.findIndex(c => c.id === caseId || c.codigo === caseId);
        if (idx === -1) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, message: 'Expediente no encontrado para asignación.' }));
          return;
        }

        cases[idx].assignedTo = profName;
        cases[idx].profesional_asignado = profName;
        if (profEmail) cases[idx].assignedToEmail = profEmail;
        if (cases[idx].status === 'Pendiente') {
          cases[idx].status = 'En curso';
        }
        cases[idx].updatedAt = new Date().toISOString();

        saveAllCases(cases);

        io.emit('case_claimed', { caseId, profName, profEmail, caseRecord: cases[idx] });
        io.emit('case_updated', cases[idx]);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          message: 'Caso ' + caseId + ' asignado exitosamente a ' + profName,
          data: cases[idx]
        }));
        return;
      }

      // B. Actualizar estado / observaciones
      if (action === 'update' || data.action === 'update' || method === 'PUT') {
        const caseId = data.id || data.codigo || query.id;
        const idx = cases.findIndex(c => c.id === caseId || c.codigo === caseId);
        if (idx === -1) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ success: false, message: 'Expediente no encontrado para actualizar.' }));
          return;
        }

        if (data.status || data.estado) cases[idx].status = data.status || data.estado;
        if (data.observations !== undefined) cases[idx].observations = data.observations;
        if (data.roomUrl || data.sala_url) cases[idx].roomUrl = data.roomUrl || data.sala_url;
        cases[idx].updatedAt = new Date().toISOString();

        saveAllCases(cases);

        io.emit('case_updated', cases[idx]);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: true,
          message: 'Expediente ' + caseId + ' actualizado exitosamente.',
          data: cases[idx]
        }));
        return;
      }

      // C. Registrar nuevo caso con estado inicial 'Pendiente' y 'Por asignar'
      const newCaseId = data.id || ('CAS-00' + Math.floor(100 + Math.random() * 900));
      const newCaseRecord = {
        id: newCaseId,
        citizen: data.citizen || 'Ciudadano Anónimo',
        citizenEmail: data.citizenEmail || '',
        type: data.type || 'Orientación Jurídica',
        subType: data.subType || data.subtipo || data.type || '',
        description: data.description || data.descripcion || '',
        status: data.status || 'Pendiente', // Estado inicial exacto para casos sin asignar
        assignedTo: data.assignedTo || 'Por asignar', // 'Por asignar' para que aparezca en bandeja de profesionales
        assignedToEmail: data.assignedToEmail || '',
        date: data.date || new Date().toISOString().split('T')[0],
        institution: data.institution || 'Consultorio Jurídico',
        instAddress: data.instAddress || '',
        instPhone: data.instPhone || '',
        instHours: data.instHours || '',
        checklist: data.checklist || [],
        observations: data.observations || '',
        createdAt: new Date().toISOString()
      };

      const existingIdx = cases.findIndex(c => c.id === newCaseId);
      if (existingIdx !== -1) {
        cases[existingIdx] = { ...cases[existingIdx], ...newCaseRecord };
      } else {
        cases.unshift(newCaseRecord);
      }

      saveAllCases(cases);

      io.emit('new_case', newCaseRecord);
      io.emit('case_created', newCaseRecord);

      console.log('[Servidor Casos] Nuevo caso registrado con estado Pendiente y Por asignar: #' + newCaseId);

      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        message: 'Expediente registrado exitosamente con estado inicial Pendiente.',
        data: newCaseRecord
      }));
    });
    return;
  }

  res.writeHead(405, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Method Not Allowed' }));
}

// Manejo de salas de videollamada públicas y gratuitas con Jitsi Meet
function handleDailyRoomRequest(req, res, parsedUrl) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    let data = {};
    try {
      if (body) data = JSON.parse(body);
    } catch (e) {}

    const caseId = data.caseId || parsedUrl.query.caseId || parsedUrl.query.id || 'CAS-00138';
    const cleanCaseId = normalizeCaseId(caseId);
    const roomName = 'puente-ciudadano-caso-' + cleanCaseId;
    const roomUrl = 'https://meet.jit.si/' + roomName;

    console.log('[Jitsi Meet] Sala generada para caso #' + caseId + ': ' + roomUrl);

    setCachedRoom(cleanCaseId, {
      caseId: caseId,
      roomName: roomName,
      roomUrl: roomUrl,
      provider: 'jitsi',
      isLive: true,
      isFree: true
    });

    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
    res.end(JSON.stringify({
      success: true,
      caseId: caseId,
      roomName: roomName,
      roomUrl: roomUrl,
      directJoinUrl: roomUrl,
      provider: 'jitsi',
      isFree: true,
      status: 'jitsi_ready',
      message: 'Sala Jitsi Meet libre y gratuita activa para el caso #' + caseId
    }));
  });
}


// Manejo de peticiones de mensajes REST
function handleMessagesRequest(req, res, parsedUrl) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'GET') {
    const caseId = parsedUrl.query.caso_codigo || parsedUrl.query.caseId || parsedUrl.query.id || 'CAS-00138';
    const messages = getMessagesForCase(caseId);
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate'
    });
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

  // 2.1 API de Casos REST (ODS 16 - Bandeja sin asignar y asignados)
  if (
    pathname === '/api/casos' ||
    pathname === '/api/cases' ||
    pathname === '/backend/casos.php' ||
    pathname === '/api/casos.php'
  ) {
    handleCasesRequest(req, res, parsedUrl);
    return;
  }

  // 2. API de Mensajes REST
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
    pathname === '/api/daily_room.php' ||
    pathname === '/api/video_room' ||
    pathname === '/backend/video_room.php' ||
    pathname === '/api/video_room.php'
  ) {
    handleDailyRoomRequest(req, res, parsedUrl);
    return;
  }

  // 4. Servir frontend estático
  serveStaticFile(req, res, pathname);
});

// Inicializar Socket.io sobre el servidor HTTP
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

  socket.on('join_case', ({ caseId, user }) => {
    if (!caseId) return;

    const roomName = getRoomName(caseId);
    socket.join(roomName);
    socket.activeCaseId = caseId;
    socket.activeRoomName = roomName;
    socket.user = user;

    console.log('[Socket.io] ' + (user?.name || socket.id) + ' (' + (user?.role || 'user') + ') se unió a la sala ' + roomName);

    const history = getMessagesForCase(caseId);
    socket.emit('case_history', history);
    socket.emit('load_messages', history);

    socket.to(roomName).emit('user_joined', {
      user: user || { name: 'Participante', role: 'unknown' },
      caseId: caseId,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    });
  });

  const handleIncomingMessage = (msgData) => {
    const { caseId, text } = msgData || {};
    if (!caseId || !text) return;

    const roomName = getRoomName(caseId);
    const messageRecord = persistMessage(caseId, msgData);

    console.log('[Socket.io] Mensaje en ' + roomName + ' de ' + messageRecord.sender + ': "' + text.substring(0, 35) + '..."');

    io.to(roomName).emit('receive_message', messageRecord);
    io.to(roomName).emit('new_message', messageRecord);
  };

  socket.on('send_message', handleIncomingMessage);
  socket.on('receive_message', handleIncomingMessage);

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
  const initKey = getDailyApiKey();
  console.log('================================================================');
  console.log('🚀 Servidor Puente Ciudadano ODS 16 activo en puerto ' + PORT);
  console.log('- Web & Frontend: http://localhost:' + PORT + '/');
  console.log('- Socket.io Realtime: http://localhost:' + PORT);
  console.log('- Healthcheck: http://localhost:' + PORT + '/health');
  console.log('- Persistencia Mensajes: ' + MESSAGES_FILE);
  const confDaily = getDailyRoomUrlConfig();
  const jDomain = getJitsiDomain();
  if (confDaily) {
    console.log('- Videollamadas: Daily Prebuilt configurada (' + confDaily + ')');
  } else if (isValidDailyKey(initKey)) {
    console.log('- Videollamadas: Daily.co API configurada con fallback a Jitsi Meet');
  } else {
    console.log('- Videollamadas: Jitsi Meet Libre (https://' + jDomain + '/...) [100% Sin Tarjeta ni Costo]');
  }
  console.log('================================================================');
});
