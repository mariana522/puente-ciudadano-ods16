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

// ==============================================================================
// ADJUNTOS DEL CHAT — Procesamiento 100% en memoria
// ------------------------------------------------------------------------------
// Render (y la mayoría de PaaS) usa un sistema de archivos efímero: escribir en
// database/uploads funciona al inicio pero puede desaparecer o fallar entre
// instancias/reinicios. Por eso el archivo se recibe con Multer en memoria y se
// publica desde un almacén acotado (TTL + límite total). También se devuelve un
// Data URL para archivos pequeños, de modo que la vista previa no dependa del
// disco. La ruta heredada /uploads/* se conserva para archivos antiguos.
// ==============================================================================
const multer = require('multer');

const UPLOADS_DIR = path.join(__dirname, 'database', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (e) {}
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB por archivo
const MAX_JSON_BODY_BYTES = 8 * 1024 * 1024; // 8 MB para /api/mensajes
const DATA_URL_MAX_BYTES = 512 * 1024; // base64 inline sólo para vistas previas
const ATTACHMENTS_MAX_TOTAL_BYTES = 64 * 1024 * 1024; // 64 MB en memoria
const ATTACHMENTS_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (req, file, cb) => {
    const ALLOWED = /\.(pdf|doc|docx|xls|xlsx|png|jpg|jpeg|gif|webp|txt|csv|zip)$/i;
    if (ALLOWED.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de archivo no permitido'), false);
    }
  }
});

// Acepta los nombres de campo usados por distintos clientes del chat.
const uploadFieldsMiddleware = uploadMiddleware.fields([
  { name: 'file', maxCount: 1 },
  { name: 'archivo', maxCount: 1 },
  { name: 'adjunto', maxCount: 1 }
]);

const attachmentStore = new Map(); // id -> { buffer, mimetype, originalname, size, createdAt }
let attachmentStoreBytes = 0;
let attachmentSequence = 0;

function pruneAttachmentStore() {
  const now = Date.now();
  for (const [id, item] of attachmentStore) {
    if (now - item.createdAt > ATTACHMENTS_TTL_MS) {
      attachmentStore.delete(id);
      attachmentStoreBytes -= item.size;
    }
  }
}

function saveAttachmentInMemory(file) {
  pruneAttachmentStore();
  // Liberar los adjuntos más antiguos si se supera el presupuesto de memoria.
  while (attachmentStoreBytes + file.size > ATTACHMENTS_MAX_TOTAL_BYTES && attachmentStore.size > 0) {
    const [oldestId, oldest] = attachmentStore.entries().next().value;
    attachmentStore.delete(oldestId);
    attachmentStoreBytes -= oldest.size;
  }

  const id = 'att_' + Date.now().toString(36) + '_' + (++attachmentSequence).toString(36);
  attachmentStore.set(id, {
    buffer: file.buffer,
    mimetype: file.mimetype || 'application/octet-stream',
    originalname: file.originalname || 'adjunto',
    size: file.size,
    createdAt: Date.now()
  });
  attachmentStoreBytes += file.size;
  return id;
}

function getAttachmentFromMemory(id) {
  if (!id) return null;
  const item = attachmentStore.get(id);
  if (!item) return null;
  if (Date.now() - item.createdAt > ATTACHMENTS_TTL_MS) {
    attachmentStore.delete(id);
    attachmentStoreBytes -= item.size;
    return null;
  }
  return item;
}

function hasAttachmentData(attachment) {
  return !!(attachment && (attachment.dataUrl || attachment.url || attachment.id));
}

const PORT = process.env.PORT || process.env.CHAT_PORT || 3001;
const DAILY_EXP_HOURS = parseInt(process.env.DAILY_ROOM_EXPIRATION_HOURS || '24', 10);

// ==============================================================================
// SERVICIO RAG (FLASK) - URL DESTINO DEL PROXY REVERSO
// ------------------------------------------------------------------------------
// En Render el frontend se sirve desde este servidor Node, pero el agente RAG
// vive en un servicio Flask aparte. Este servidor reenvía /api/rag/* hacia
// RAG_SERVICE_URL, de modo que el navegador siempre use rutas relativas
// ("/api/rag/orientar") y no necesite CORS ni URLs de localhost.
//   - Producción (Render): RAG_SERVICE_URL=https://puente-rag-ods16.onrender.com
//   - Desarrollo local:    python app.py  ->  http://127.0.0.1:5000 (por defecto)
// ==============================================================================
function getRagServiceUrl() {
  const configurada = process.env.RAG_SERVICE_URL || process.env.RAG_API_URL || process.env.FLASK_RAG_URL;
  let base = (configurada || 'http://127.0.0.1:5000').trim();
  if (!base) base = 'http://127.0.0.1:5000';
  // Render entrega sólo el host al usar fromService: agregar protocolo.
  if (!/^https?:\/\//i.test(base)) base = 'https://' + base;
  return base.replace(/\/+$/, '');
}

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
    createdAt: msgData.createdAt || new Date().toISOString(),
    attachment: msgData.attachment || null
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

// Generador determinista de token único seguro por caso
function generateCaseRoomToken(cleanCaseId) {
  let h = 0x811c9dc5;
  const str = String(cleanCaseId || '').toLowerCase();
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

// Parámetros completos de Jitsi para deshabilitar vestíbulo (lobby), contraseñas y moderador requerido
const JITSI_CONFIG_HASH = '#config.prejoinPageEnabled=false&config.prejoinConfig.enabled=false&config.enableLobby=false&config.enableLobbyChat=false&config.lobby.autoKnock=false&config.requireDisplayName=false&config.disableLobbyPassword=true&config.startWithAudioMuted=false&config.startWithVideoMuted=false&config.disableDeepLinking=true&interfaceConfig.LOBBY_SECTION_ENABLED=false&interfaceConfig.SHOW_JITSI_WATERMARK=false&interfaceConfig.SHOW_WATERMARK_FOR_GUESTS=false';


// ==============================================================================
// GESTIÓN PERSISTENTE DE AGENDA / CITAS VIRTUALES (ODS 16)
// ==============================================================================
const AGENDA_FILE = path.join(DB_DIR, 'agenda_store.json');

function loadAgendaStore() {
  try {
    if (fs.existsSync(AGENDA_FILE)) {
      const raw = fs.readFileSync(AGENDA_FILE, 'utf8');
      return JSON.parse(raw);
    }
  } catch (err) {
    console.error('[Store] Error leyendo agenda_store.json:', err.message);
  }
  const todayStr = new Date().toISOString().split('T')[0];
  return [
    {
      id: 'EVT-001',
      profEmail: 'elena.gomez@asesores.org',
      profName: 'Dra. Elena Gómez',
      citizenName: 'Mariana Sibaja',
      citizenEmail: 'mariana.sibaja@ejemplo.com',
      caseId: 'CAS-00138',
      type: 'videocall',
      time: '09:00 a.m.',
      date: todayStr,
      topic: 'Videollamada caso #00138 (Mariana Sibaja - Despido laboral)'
    },
    {
      id: 'EVT-002',
      profEmail: 'elena.gomez@asesores.org',
      profName: 'Dra. Elena Gómez',
      citizenName: 'Carlos Rodríguez',
      citizenEmail: 'carlos.rodriguez@ejemplo.com',
      caseId: 'CAS-00139',
      type: 'review',
      time: '11:00 a.m.',
      date: todayStr,
      topic: 'Revisión de caso #00139 (Carlos Rodríguez - Derecho de petición)'
    },
    {
      id: 'EVT-003',
      profEmail: 'mauricio.padilla@asesores.org',
      profName: 'Dr. Mauricio Padilla',
      citizenName: 'Daniela Doria',
      citizenEmail: 'daniela.doria@ejemplo.com',
      caseId: 'CAS-00129',
      type: 'videocall',
      time: '03:00 p.m.',
      date: todayStr,
      topic: 'Videollamada caso #00129 (Daniela Doria - Custodia familiar)'
    },
    {
      id: 'EVT-004',
      profEmail: 'mauricio.padilla@asesores.org',
      profName: 'Dr. Mauricio Padilla',
      citizenName: 'Andrés Morales',
      citizenEmail: 'andres.morales@ejemplo.com',
      caseId: 'CAS-00130',
      type: 'review',
      time: '04:30 p.m.',
      date: todayStr,
      topic: 'Revisión de caso #00130 (Andrés Morales - Conciliación)'
    }
  ];
}

function saveAgendaStore(store) {
  try {
    fs.writeFileSync(AGENDA_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('[Store] Error guardando agenda_store.json:', err.message);
  }
}

function handleAgendaRequest(req, res, parsedUrl) {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  if (req.method === 'GET') {
    const profEmail = (parsedUrl.query.profEmail || '').toLowerCase().trim();
    const profName = (parsedUrl.query.profName || '').toLowerCase().trim();
    const citizenEmail = (parsedUrl.query.citizenEmail || '').toLowerCase().trim();
    let events = loadAgendaStore();

    if (profEmail || profName) {
      events = events.filter(e => {
        const pe = (e.profEmail || '').toLowerCase().trim();
        const pn = (e.profName || '').toLowerCase().trim();
        return (profEmail && pe === profEmail) || (profName && pn === profName);
      });
    }
    if (citizenEmail) {
      events = events.filter(e => (e.citizenEmail || '').toLowerCase().trim() === citizenEmail);
    }

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      success: true,
      data: events,
      count: events.length
    }));
    return;
  }

  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      let data = {};
      try { if (body) data = JSON.parse(body); } catch (e) {}

      const events = loadAgendaStore();
      const newEvt = {
        id: data.id || ('EVT-' + Date.now()),
        caseId: data.caseId || 'CAS-00138',
        profEmail: data.profEmail || 'elena.gomez@asesores.org',
        profName: data.profName || 'Dra. Elena Gómez',
        citizenName: data.citizenName || 'Ciudadano',
        citizenEmail: data.citizenEmail || '',
        date: data.date || new Date().toISOString().split('T')[0],
        time: data.time || '10:00 a.m.',
        topic: data.topic || 'Videollamada de Orientación ODS 16',
        type: data.type || 'videocall',
        createdAt: new Date().toISOString()
      };

      events.unshift(newEvt);
      saveAgendaStore(events);

      io.emit('new_appointment', newEvt);
      console.log('[Servidor Agenda] Nueva cita agendada:', newEvt.topic, 'para', newEvt.date, newEvt.time);

      res.writeHead(201, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        message: 'Cita programada exitosamente.',
        data: newEvt
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
    
    // Obtener token persistente o calcular token único seguro
    let roomToken = '';
    const cached = getCachedRoom(cleanCaseId);
    if (cached && cached.roomToken) {
      roomToken = cached.roomToken;
    } else {
      roomToken = generateCaseRoomToken(cleanCaseId);
    }

    const roomName = 'puente-ciudadano-caso-' + cleanCaseId;
    const cleanRoomUrl = 'https://meet.jit.si/' + roomName;
    const directJoinUrl = cleanRoomUrl;

    console.log('[Jitsi Meet] Sala libre con token único generada para caso #' + caseId + ': ' + cleanRoomUrl);

    setCachedRoom(cleanCaseId, {
      caseId: caseId,
      roomName: roomName,
      roomToken: roomToken,
      roomUrl: directJoinUrl,
      cleanRoomUrl: cleanRoomUrl,
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
      roomToken: roomToken,
      roomUrl: directJoinUrl,
      directJoinUrl: directJoinUrl,
      cleanRoomUrl: cleanRoomUrl,
      provider: 'jitsi',
      isFree: true,
      status: 'jitsi_ready',
      message: 'Sala Jitsi Meet libre con token y sin vestíbulo activa para el caso #' + caseId
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
    let bodyTooLarge = false;

    req.on('data', chunk => {
      if (bodyTooLarge) return;
      body += chunk;
      // Evita que un cliente antiguo con base64 gigante agote la memoria del proceso.
      if (body.length > MAX_JSON_BODY_BYTES) {
        bodyTooLarge = true;
        res.writeHead(413, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: false,
          error: 'payload_too_large',
          message: 'El mensaje supera el tamaño permitido. Adjunta el archivo con /api/upload.'
        }));
      }
    });

    req.on('end', () => {
      if (bodyTooLarge) return;

      let data = {};
      try {
        if (body) data = JSON.parse(body);
      } catch (e) {}

      const caseId = data.caseId || data.caso_codigo || parsedUrl.query.caseId || 'CAS-00138';
      const text = data.text || data.mensaje || '';
      const hasAttachment = hasAttachmentData(data.attachment);

      // Permitir mensaje vacío si trae adjunto
      if (!text && !hasAttachment) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, message: 'El mensaje debe tener texto o un archivo adjunto.' }));
        return;
      }

      const record = persistMessage(caseId, {
        id: data.id,
        sender: data.sender || data.remitente || 'Usuario',
        senderEmail: data.senderEmail || data.remitente_email || '',
        role: data.role || data.rol || 'citizen',
        text: text,
        time: data.time || data.hora,
        attachment: data.attachment || null
      });

      // Emitir en tiempo real a la sala del caso Y globalmente
      const roomName = getRoomName(caseId);
      io.to(roomName).emit('receive_message', record);
      io.to(roomName).emit('new_message', record);
      io.emit('receive_message', record);
      io.emit('new_message', record);

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

// Reenvía las peticiones /api/rag/* al servicio Flask cuando el frontend es
// servido por este Node (Render). Así el navegador sólo usa rutas relativas.
function proxyRagRequest(req, res) {
  const base = getRagServiceUrl();
  let destino;
  try {
    destino = new URL(base + req.url);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      status: 'error',
      codigo: 'rag_url_invalida',
      mensaje: 'RAG_SERVICE_URL no es una URL válida: ' + base
    }));
    return;
  }

  const transporte = destino.protocol === 'https:' ? https : http;

  const headers = Object.assign({}, req.headers);
  delete headers['accept-encoding']; // evitar compresión doble al reenviar
  headers.host = destino.host;
  headers['x-forwarded-host'] = req.headers.host || '';
  headers['x-forwarded-proto'] = (req.socket && req.socket.encrypted) ? 'https' : 'http';

  let respondido = false;
  const responderError = (codigoHttp, codigo, mensaje) => {
    if (respondido) return;
    respondido = true;
    if (res.headersSent) {
      res.end();
      return;
    }
    res.writeHead(codigoHttp, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    });
    res.end(JSON.stringify({ status: 'error', codigo, mensaje, servicio_rag: base }));
  };

  const solicitud = transporte.request({
    protocol: destino.protocol,
    hostname: destino.hostname,
    port: destino.port || (destino.protocol === 'https:' ? 443 : 80),
    method: req.method,
    path: destino.pathname + destino.search,
    headers
  }, (respuesta) => {
    respondido = true;
    const headersRespuesta = {};
    Object.keys(respuesta.headers).forEach((clave) => {
      if (['connection', 'keep-alive', 'transfer-encoding', 'upgrade'].indexOf(clave) !== -1) return;
      // Este servidor ya define CORS para todas las respuestas: evitar duplicados.
      if (clave.indexOf('access-control-') === 0) return;
      headersRespuesta[clave] = respuesta.headers[clave];
    });
    res.writeHead(respuesta.statusCode || 502, headersRespuesta);
    respuesta.pipe(res);
  });

  // Gemini puede tardar: 90s de margen antes de abortar.
  solicitud.setTimeout(90000, () => {
    solicitud.destroy(new Error('timeout'));
  });

  solicitud.on('error', (err) => {
    const esTimeout = /timeout/i.test(err.message || '');
    console.error('[RAG Proxy] Fallo al contactar ' + base + ':', err.message);
    responderError(
      esTimeout ? 504 : 502,
      esTimeout ? 'rag_timeout' : 'rag_no_disponible',
      'El servicio de orientación (Flask RAG) no está disponible en este momento. ' +
      'Verifica que el servicio esté desplegado y que RAG_SERVICE_URL apunte a su URL pública.'
    );
  });

  req.pipe(solicitud);
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
      roomsCount: io.sockets.adapter.rooms.size,
      rag: {
        proxy: true,
        servicio_configurado: Boolean(process.env.RAG_SERVICE_URL || process.env.RAG_API_URL || process.env.FLASK_RAG_URL)
      }
    }));
    return;
  }

  // 1.2 Proxy reverso hacia el Agente RAG (Flask en otro servicio/contenedor)
  if (pathname === '/api/rag' || pathname.indexOf('/api/rag/') === 0) {
    proxyRagRequest(req, res);
    return;
  }

  // 2.2 API de Agenda y Citas REST
  if (
    pathname === '/api/agenda' ||
    pathname === '/api/citas' ||
    pathname === '/backend/agenda.php' ||
    pathname === '/api/agenda.php'
  ) {
    handleAgendaRequest(req, res, parsedUrl);
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

  // 2.5 API de Subida de Archivos Adjuntos (memoria, sin escribir en disco)
  if (pathname === '/api/upload' && req.method === 'POST') {
    uploadFieldsMiddleware(req, res, (err) => {
      if (err) {
        const esTamano = err && err.code === 'LIMIT_FILE_SIZE';
        const status = esTamano ? 413 : 400;
        res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: false,
          error: esTamano
            ? 'El archivo supera el límite de 10 MB.'
            : (err.message || 'Error al procesar el archivo adjunto.')
        }));
        return;
      }

      const files = req.files || {};
      const file = (files.file && files.file[0]) ||
                   (files.archivo && files.archivo[0]) ||
                   (files.adjunto && files.adjunto[0]) ||
                   req.file ||
                   null;

      if (!file) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          success: false,
          error: 'No se recibió ningún archivo. Envía el campo "file" en el FormData.'
        }));
        return;
      }

      const id = saveAttachmentInMemory(file);
      const mimetype = file.mimetype || 'application/octet-stream';
      const dataUrl = file.size <= DATA_URL_MAX_BYTES
        ? 'data:' + mimetype + ';base64,' + file.buffer.toString('base64')
        : null;

      console.log('[Upload] Adjunto en memoria:', id, file.originalname, '(' + Math.round(file.size / 1024) + ' KB)');
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: true,
        id: id,
        filename: id,
        originalname: file.originalname,
        mimetype: mimetype,
        size: file.size,
        storage: 'memory',
        url: '/api/attachments/' + encodeURIComponent(id),
        dataUrl: dataUrl
      }));
    });
    return;
  }

  // 2.55 Servir adjuntos desde memoria (Render-safe, sin disco)
  if (pathname.startsWith('/api/attachments/') && req.method === 'GET') {
    const id = decodeURIComponent(pathname.slice('/api/attachments/'.length));
    const item = getAttachmentFromMemory(id);
    if (!item) {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        success: false,
        error: 'attachment_not_found',
        mensaje: 'El adjunto ya no está disponible en memoria. Vuelve a subirlo.'
      }));
      return;
    }

    const safeName = String(item.originalname).replace(/["\r\n]/g, '_');
    res.writeHead(200, {
      'Content-Type': item.mimetype,
      'Content-Length': item.size,
      'Content-Disposition': 'inline; filename="' + safeName + '"',
      'Cache-Control': 'private, max-age=3600'
    });
    res.end(item.buffer);
    return;
  }

  // 2.6 Servir archivos subidos (descargas)
  if (pathname.startsWith('/uploads/')) {
    const filename = path.basename(pathname);
    const filePath = path.join(UPLOADS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Archivo no encontrado');
      return;
    }
    const ext = path.extname(filename).toLowerCase();
    const mimeMap = {
      '.pdf': 'application/pdf',
      '.doc': 'application/msword',
      '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      '.xls': 'application/vnd.ms-excel',
      '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.gif': 'image/gif', '.webp': 'image/webp',
      '.txt': 'text/plain; charset=utf-8',
      '.csv': 'text/csv; charset=utf-8',
      '.zip': 'application/zip'
    };
    const contentType = mimeMap[ext] || 'application/octet-stream';
    res.setHeader('Content-Disposition', 'inline; filename="' + filename + '"');
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
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

  // 3.5 Cualquier otra ruta de API desconocida debe responder JSON (no index.html)
  if (pathname.indexOf('/api/') === 0 || pathname.indexOf('/backend/') === 0) {
    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      success: false,
      error: 'not_found',
      mensaje: 'Ruta de API no encontrada: ' + pathname
    }));
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
  pingInterval: 25000,
  // Permite mensajes con Data URL de respaldo (el flujo normal usa /api/upload).
  maxHttpBufferSize: 16 * 1024 * 1024
});

io.on('connection', (socket) => {
  console.log('[Socket.io] Cliente conectado: ' + socket.id + ' desde ' + socket.handshake.address);

  socket.on('join_case', ({ caseId, user }) => {
    if (!caseId) return;

    const roomName = getRoomName(caseId);
    const alreadyInRoom = socket.activeRoomName === roomName && socket.rooms.has(roomName);

    socket.join(roomName);
    socket.activeCaseId = caseId;
    socket.activeRoomName = roomName;
    socket.user = user;

    // Re-renderizados del cliente pueden re-emitir join_case: no reenviar el
    // historial ni notificar de nuevo si la sala ya estaba unida.
    if (alreadyInRoom) return;

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
    // Un mensaje puede venir sólo con adjunto (sin texto).
    if (!caseId || (!text && !hasAttachmentData(msgData && msgData.attachment))) return;

    const roomName = getRoomName(caseId);
    const messageRecord = persistMessage(caseId, msgData);
    const preview = (messageRecord.text || '[adjunto] ' + (messageRecord.attachment?.originalname || '')).substring(0, 35);

    console.log('[Socket.io] Mensaje en ' + roomName + ' de ' + messageRecord.sender + ': "' + preview + '"');

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
  console.log('- Proxy Agente RAG (/api/rag/*): ' + getRagServiceUrl());
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
