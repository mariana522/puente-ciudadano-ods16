/**
 * ==============================================================================
 * PUENTE CIUDADANO (ODS 16) - MOTOR DE BASE DE DATOS LOCAL Y REPOSITORIO (PuenteDB)
 * Capa de almacenamiento y persistencia en Browser LocalStorage y sincronización MySQL
 * ==============================================================================
 */

(function (window) {
  'use strict';

  // Claves de almacenamiento en LocalStorage
  const STORAGE_KEYS = {
    CASES: 'puente_db_cases_v2',
    USERS: 'puente_db_users_v2',
    SESSION: 'puente_db_session_v2',
    MESSAGES: 'puente_db_messages_v2',
    METRICS: 'puente_db_metrics_v2',
    AGENDA: 'puente_db_agenda_v2'
  };

  // Semilla de usuarios con perfiles independientes y completos
  const SEED_USERS = [
    {
      id: 'USR-001',
      name: 'Mariana Sibaja',
      email: 'mariana.sibaja@ejemplo.com',
      password: 'password123',
      role: 'citizen',
      avatar: 'M',
      phone: '+57 310 456 7890',
      documentId: '1.067.892.340',
      institution: 'Universidad Cooperativa de Colombia',
      city: 'Montería, Córdoba - Colombia',
      address: 'Barrio La Castellana, Calle 58 # 12-40',
      registeredAt: '2026-09-01'
    },
    {
      id: 'USR-002',
      name: 'Dra. Elena Gómez',
      email: 'elena.gomez@asesores.org',
      password: 'password123',
      role: 'professional',
      avatar: 'EG',
      phone: '+57 320 889 1234',
      documentId: '52.489.102',
      licenseNumber: 'TP-84920-CSJ',
      specialty: 'Derecho Laboral y Conciliación',
      institution: 'Consultorio Jurídico MinTrabajo',
      city: 'Montería, Córdoba',
      registeredAt: '2026-08-15'
    },
    {
      id: 'USR-003',
      name: 'Carlos Rodríguez',
      email: 'carlos.rodriguez@ejemplo.com',
      password: 'password123',
      role: 'citizen',
      avatar: 'CR',
      phone: '+57 312 901 2345',
      documentId: '1.098.765.432',
      city: 'Bogotá D.C.',
      address: 'Carrera 7 # 45-10',
      registeredAt: '2026-09-05'
    },
    {
      id: 'USR-004',
      name: 'Dr. Mauricio Padilla',
      email: 'mauricio.padilla@asesores.org',
      password: 'password123',
      role: 'professional',
      avatar: 'MP',
      phone: '+57 301 555 4321',
      documentId: '79.345.678',
      licenseNumber: 'TP-63211-CSJ',
      specialty: 'Derecho de Familia y Menores',
      institution: 'Defensoría de Familia / Comisaría',
      city: 'Montería, Córdoba',
      registeredAt: '2026-08-20'
    },
    {
      id: 'USR-00556',
      name: 'Daniela Doria',
      email: 'daniela@gmail',
      password: 'password123',
      role: 'professional',
      avatar: 'DD',
      phone: '+57 315 222 3344',
      documentId: '1.065.432.890',
      licenseNumber: 'TP-99412-CSJ',
      specialty: 'Derecho Administrativo y Constitucional',
      institution: 'Colegio de Abogados de Córdoba',
      city: 'Montería, Córdoba',
      address: 'Calle 15 # 8-30',
      registeredAt: '2026-09-10'
    },
    {
      id: 'USR-005',
      name: 'Daniela Doria',
      email: 'daniela.doria@ejemplo.com',
      password: 'password123',
      role: 'citizen',
      avatar: 'DD',
      phone: '+57 315 222 3344',
      documentId: '1.065.432.890',
      city: 'Montería, Córdoba',
      address: 'Calle 15 # 8-30',
      registeredAt: '2026-09-10'
    },
    {
      id: 'USR-006',
      name: 'Andrés Morales',
      email: 'andres.morales@ejemplo.com',
      password: 'password123',
      role: 'citizen',
      avatar: 'AM',
      phone: '+57 318 444 5566',
      documentId: '1.077.321.654',
      city: 'Montería, Córdoba',
      address: 'Barrio Pasatiempo',
      registeredAt: '2026-09-12'
    }
  ];

  // Semilla de casos estructurados con profesionales asignados y casos sin asignar
  const SEED_CASES = [
    {
      id: 'CAS-00138',
      citizen: 'Mariana Sibaja',
      citizenEmail: 'mariana.sibaja@ejemplo.com',
      type: 'Problema laboral',
      subType: 'Despido injustificado sin liquidación',
      description: 'Despido injustificado sin liquidación de prestaciones sociales ni entrega de certificado laboral.',
      status: 'En curso',
      assignedTo: 'Dra. Elena Gómez',
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
      id: 'CAS-00129',
      citizen: 'Daniela Doria',
      citizenEmail: 'daniela.doria@ejemplo.com',
      type: 'Conflicto familiar',
      subType: 'Fijación de cuota alimentaria y custodia',
      description: 'Orientación para conciliación extrajudicial de alimentos y visitas compartidas de menor de edad.',
      status: 'Finalizado',
      assignedTo: 'Dr. Mauricio Padilla',
      date: '2026-09-18',
      institution: 'Comisaría de Familia',
      instAddress: 'Centro de Convivencia Ciudadana, Calle 15 # 8-30',
      instPhone: 'Línea de Atención Familia 106 / (604) 782 1100',
      instHours: 'Atención 24 Horas en turno de urgencias',
      checklist: [
        'Registro civil de nacimiento de los hijos menores',
        'Cédula de ciudadanía de la parte convocante',
        'Relación de gastos mensuales de manutención y educación',
        'Dirección y datos de contacto de la contraparte'
      ],
      observations: 'Acta de acuerdo conciliatorio firmada con éxito. Expediente remitido a Comisaría.'
    },
    {
      id: 'CAS-00140',
      citizen: 'Andrés Meza',
      citizenEmail: 'andres.meza@ejemplo.com',
      type: 'Problema con institución',
      subType: 'Cobro coactivo indebido de impuesto predial',
      description: 'Notificación de cobro por predio que ya no es de su propiedad desde hace tres años.',
      status: 'Pendiente',
      assignedTo: 'Por asignar',
      date: '2026-09-22',
      institution: 'Personería Municipal',
      instAddress: 'Palacio Municipal, Carrera 3 # 12-20, Piso 1',
      instPhone: '(604) 789 2020 Ext. 104',
      instHours: 'Lunes a Viernes 7:30 am - 12:00 m / 1:30 pm - 5:00 pm',
      checklist: [
        'Certificado de tradición y libertad actualizado',
        'Escritura pública de compraventa anterior',
        'Oficio de solicitud de aclaración catastral'
      ],
      observations: ''
    },
    {
      id: 'CAS-00141',
      citizen: 'Mariana Sibaja',
      citizenEmail: 'mariana.sibaja@ejemplo.com',
      type: 'Derechos ciudadanos',
      subType: 'Derecho a la salud - Tutela de medicamentos',
      description: 'EPS niega entrega oportuna de tratamiento de alto costo ordenado por médico especialista.',
      status: 'Finalizado',
      assignedTo: 'Dra. Elena Gómez',
      date: '2026-08-30',
      institution: 'Defensoría del Pueblo',
      instAddress: 'Avenida Circunvalar # 32-15',
      instPhone: 'Línea Nacional 01 8000 914814',
      instHours: 'Lunes a Viernes 8:00 am - 5:00 pm',
      checklist: [
        'Fórmula médica e historia clínica con orden expresa',
        'Negativa o constancia de falta de entrega por parte de la EPS',
        'Acción de tutela radicada ante juzgado de reparto'
      ],
      observations: 'Fallo de tutela favorable obtenido en 48 horas. Medicamentos entregados.'
    },
    {
      id: 'CAS-00142',
      citizen: 'Andrés Morales',
      citizenEmail: 'andres.morales@ejemplo.com',
      type: 'Derechos ciudadanos',
      subType: 'Protección de datos y hábeas data financiero',
      description: 'Reporte negativo en central de riesgo sin previa notificación legal de 20 días.',
      status: 'En curso',
      assignedTo: 'Daniela Doria',
      date: '2026-09-23',
      institution: 'Superintendencia de Industria y Comercio',
      instAddress: 'Carrera 13 # 27-00, Sede Central',
      instPhone: 'Línea Gratuita 01 8000 910165',
      instHours: 'Lunes a Viernes 8:00 am - 4:30 pm',
      checklist: [
        'Copia de reclamación radicada ante la entidad financiera',
        'Constancia de reporte en CIFIN o Datacrédito',
        'Borrador de tutela por violación al debido proceso de hábeas data'
      ],
      observations: 'Orientación en marcha con la profesional Daniela Doria. Caso admitido para trámite.'
    },
    {
      id: 'CAS-00143',
      citizen: 'Lucía Morales',
      citizenEmail: 'lucia.morales@ejemplo.com',
      type: 'Conflicto familiar',
      subType: 'Custodia y régimen de visitas concertado',
      description: 'Orientación previa para firma de acta de mutuo acuerdo ante defensoría de familia.',
      status: 'Pendiente',
      assignedTo: 'Daniela Doria',
      date: '2026-09-24',
      institution: 'Comisaría de Familia',
      instAddress: 'Centro de Convivencia, Calle 15 # 8-30',
      instPhone: 'Línea 106',
      instHours: 'Atención 24 Horas',
      checklist: [
        'Registro civil de los menores',
        'Propuesta de acuerdo de visitas y alimentos'
      ],
      observations: 'Revisión de documentos programada.'
    }
  ];

  function loadFromStorage(key, fallback) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch (e) {
      console.error(`[PuenteDB] Error cargando ${key}:`, e);
      return fallback;
    }
  }

  function saveToStorage(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
      return true;
    } catch (e) {
      console.error(`[PuenteDB] Error guardando ${key}:`, e);
      return false;
    }
  }

    // Semilla de agenda de videollamadas y citas
  const todayStrIso = new Date().toISOString().split('T')[0];
  const SEED_AGENDA = [
    {
      id: 'EVT-001',
      profEmail: 'elena.gomez@asesores.org',
      profName: 'Dra. Elena Gómez',
      citizenName: 'Mariana Sibaja',
      citizenEmail: 'mariana.sibaja@ejemplo.com',
      caseId: 'CAS-00138',
      type: 'videocall',
      time: '09:00 a.m.',
      date: todayStrIso,
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
      date: todayStrIso,
      topic: 'Revisión de caso #00139 (Carlos Rodríguez - Derecho de petición)'
    },
    {
      id: 'EVT-003',
      profEmail: 'elena.gomez@asesores.org',
      profName: 'Dra. Elena Gómez',
      citizenName: 'Daniela Doria',
      citizenEmail: 'daniela.doria@ejemplo.com',
      caseId: 'CAS-00129',
      type: 'videocall',
      time: '03:00 p.m.',
      date: todayStrIso,
      topic: 'Videollamada caso #00129 (Daniela Doria - Custodia familiar)'
    }
  ];

  // Semilla de mensajes tipo Messenger
  const SEED_MESSAGES = {
    'CAS-00138': [
      {
        id: 'MSG-101',
        sender: 'Dra. Elena Gómez',
        senderEmail: 'elena.gomez@asesores.org',
        role: 'professional',
        text: 'Hola Mariana, bienvenida al canal de orientación ciudadana (ODS 16). He revisado tu reporte sobre terminación laboral sin liquidación.',
        time: '09:15 a.m.',
        date: '2026-09-01'
      },
      {
        id: 'MSG-102',
        sender: 'Mariana Sibaja',
        senderEmail: 'mariana.sibaja@ejemplo.com',
        role: 'citizen',
        text: 'Buenos días Dra. Elena. Muchas gracias por atenderme. Trabajé por más de un año en la empresa y me despidieron sin pagarme la liquidación ni las primas.',
        time: '09:18 a.m.',
        date: '2026-09-01'
      },
      {
        id: 'MSG-103',
        sender: 'Dra. Elena Gómez',
        senderEmail: 'elena.gomez@asesores.org',
        role: 'professional',
        text: 'Entiendo perfectamente, Mariana. Tenemos derecho a exigir la liquidación completa de cesantías, intereses, prima y vacaciones. Ya emití la Hoja de Ruta para radicar la reclamación ante la Inspección del Trabajo.',
        time: '09:22 a.m.',
        date: '2026-09-01'
      }
    ],
    'CAS-00139': [
      {
        id: 'MSG-201',
        sender: 'Carlos Rodríguez',
        senderEmail: 'carlos.rodriguez@ejemplo.com',
        role: 'citizen',
        text: 'Doctora Elena, buenas tardes. Radiqué un derecho de petición ante la entidad hace más de 20 días hábiles y no he recibido ninguna respuesta.',
        time: '11:05 a.m.',
        date: '2026-09-01'
      },
      {
        id: 'MSG-202',
        sender: 'Dra. Elena Gómez',
        senderEmail: 'elena.gomez@asesores.org',
        role: 'professional',
        text: 'Hola Carlos. El plazo constitucional ordinario es de 15 días hábiles. Al haberse vencido en exceso, procede interponer de forma inmediata una Acción de Tutela. Ya tenemos la minuta lista.',
        time: '11:12 a.m.',
        date: '2026-09-01'
      }
    ],
    'CAS-00129': [
      {
        id: 'MSG-301',
        sender: 'Daniela Doria',
        senderEmail: 'daniela.doria@ejemplo.com',
        role: 'citizen',
        text: 'Buen día, quisiera saber qué requisitos necesito para fijar la cuota de alimentos de mi hijo ante la Comisaría de Familia.',
        time: '02:40 p.m.',
        date: '2026-09-01'
      },
      {
        id: 'MSG-302',
        sender: 'Dra. Elena Gómez',
        senderEmail: 'elena.gomez@asesores.org',
        role: 'professional',
        text: 'Hola Daniela. Debes aportar el Registro Civil de Nacimiento del niño, copia de tu cédula y una relación estimada de gastos de alimentación, vestuario, salud y educación.',
        time: '02:45 p.m.',
        date: '2026-09-01'
      }
    ],
    'CAS-00140': [
      {
        id: 'MSG-401',
        sender: 'Andrés Morales',
        senderEmail: 'andres.morales@ejemplo.com',
        role: 'citizen',
        text: 'Hola, tengo una consulta sobre afiliación al sistema de salud subsidiado en Montería.',
        time: '03:10 p.m.',
        date: '2026-09-01'
      },
      {
        id: 'MSG-402',
        sender: 'Dra. Elena Gómez',
        senderEmail: 'elena.gomez@asesores.org',
        role: 'professional',
        text: 'Buenas tardes Andrés. Debes solicitar la encuesta Sisbén IV en la oficina municipal para la focalización en régimen subsidiado.',
        time: '03:20 p.m.',
        date: '2026-09-01'
      }
    ]
  };

const PuenteDB = {
    init() {
      // Inicializar usuarios si no existen
      if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
        saveToStorage(STORAGE_KEYS.USERS, SEED_USERS);
      } else {
        // Asegurar que usuarios existentes tengan campos nuevos y que Daniela esté incluida
        const currentUsers = loadFromStorage(STORAGE_KEYS.USERS, []);
        let updated = false;

        const cleanText = (str) => {
          if (!str || typeof str !== 'string') return str;
          return str
            .replace(/Monter\?a|Montera/g, 'Montería')
            .replace(/C\?rdoba|Crdoba/g, 'Córdoba')
            .replace(/Bogot\?|Bogot/g, 'Bogotá')
            .replace(/G\?mez|Gmez/g, 'Gómez')
            .replace(/Rodr\?guez|Rodrguez/g, 'Rodríguez')
            .replace(/Defensor\?a|Defensora/g, 'Defensoría')
            .replace(/Comisar\?a|Comisara/g, 'Comisaría')
            .replace(/Conciliaci\?n|Conciliacin/g, 'Conciliación')
            .replace(/orientaci\?n|orientacin/g, 'orientación')
            .replace(/liquidaci\?n|liquidacin/g, 'liquidación');
        };

        currentUsers.forEach(u => {
          ['name', 'city', 'address', 'specialty', 'institution'].forEach(prop => {
            if (u[prop]) {
              const c = cleanText(u[prop]);
              if (c !== u[prop]) { u[prop] = c; updated = true; }
            }
          });
          if (u.email && u.email.toLowerCase() === 'mariana.sibaja@ejemplo.com' && !u.institution) {
            u.institution = 'Universidad Cooperativa de Colombia';
            updated = true;
          }
        });
        SEED_USERS.forEach(su => {
          const found = currentUsers.find(u => u.email.toLowerCase() === su.email.toLowerCase());
          if (!found) {
            currentUsers.push(su);
            updated = true;
          } else {
            // Actualizar campos que falten
            ['documentId', 'licenseNumber', 'specialty', 'institution', 'city', 'address'].forEach(prop => {
              if (su[prop] && !found[prop]) {
                found[prop] = su[prop];
                updated = true;
              }
            });
          }
        });
        if (updated) saveToStorage(STORAGE_KEYS.USERS, currentUsers);
      }

      // Inicializar casos con asignaciones estrictas garantizadas
      if (!localStorage.getItem(STORAGE_KEYS.CASES)) {
        saveToStorage(STORAGE_KEYS.CASES, SEED_CASES);
      } else {
        let currentCases = loadFromStorage(STORAGE_KEYS.CASES, []);
        let updated = false;

        // Asegurar que cada caso de la semilla tenga el profesional asignado exacto
        SEED_CASES.forEach(sc => {
          const idx = currentCases.findIndex(c => c.id === sc.id);
          if (idx === -1) {
            currentCases.push(sc);
            updated = true;
          } else {
            // Sincronizar profesional_asignado estricto
            if (currentCases[idx].assignedTo !== sc.assignedTo) {
              currentCases[idx].assignedTo = sc.assignedTo;
              updated = true;
            }
          }
        });

        if (updated || currentCases.length === 0) {
          saveToStorage(STORAGE_KEYS.CASES, currentCases.length > 0 ? currentCases : SEED_CASES);
        }
      }

      // Iniciar automáticamente motores de sincronización en tiempo real y polling
      if (this.polling) {
        this.polling.start();
      }
      if (this.realtime) {
        this.realtime.init();
      }

      // Sincronizar en segundo plano con MySQL si está disponible
      setTimeout(() => {
        this.syncWithMySQL();
      }, 500);

      return true;
    },

    // Sincronización bidireccional suave con MySQL
    async syncWithMySQL() {
      if (!this.mysql) return;
      try {
        const mysqlCases = await this.mysql.fetchCases();
        if (Array.isArray(mysqlCases) && mysqlCases.length > 0) {
          const localCases = this.cases.getAll();
          // Combinar sin duplicados
          const merged = [...mysqlCases];
          localCases.forEach(lc => {
            if (!merged.some(mc => mc.id === lc.id)) {
              merged.push(lc);
            }
          });
          saveToStorage(STORAGE_KEYS.CASES, merged);
        }

        const mysqlUsers = await this.mysql.fetchUsers();
        if (Array.isArray(mysqlUsers) && mysqlUsers.length > 0) {
          const localUsers = this.users.getAll();
          const mergedUsers = [...localUsers];
          mysqlUsers.forEach(mu => {
            const idx = mergedUsers.findIndex(lu => lu.email.toLowerCase() === mu.email.toLowerCase());
            if (idx >= 0) {
              mergedUsers[idx] = { ...mergedUsers[idx], ...mu };
            } else {
              mergedUsers.push(mu);
            }
          });
          saveToStorage(STORAGE_KEYS.USERS, mergedUsers);
        }
      } catch (e) {
        // Modo offline transparente
      }
    },

    // =========================================================================
    // COLECCIÓN: CASOS
    // =========================================================================
    cases: {
      getAll() {
        return loadFromStorage(STORAGE_KEYS.CASES, SEED_CASES);
      },

      getById(caseId) {
        const cases = this.getAll();
        return cases.find(c => c.id === caseId) || null;
      },

      // Casos independientes para un ciudadano
      getByCitizen(citizenNameOrEmail) {
        if (!citizenNameOrEmail) return [];
        const cases = this.getAll();
        const term = citizenNameOrEmail.trim().toLowerCase();
        return cases.filter(c => {
          const matchEmail = c.citizenEmail && c.citizenEmail.toLowerCase() === term;
          const matchName = c.citizen && c.citizen.trim().toLowerCase() === term;
          return matchEmail || matchName;
        });
      },

      // Casos independientes para un profesional
      getByProfessional(profNameOrEmail) {
        if (!profNameOrEmail) return [];
        const cases = this.getAll();
        const term = profNameOrEmail.trim().toLowerCase();
        // Quitar títulos como "dra.", "dr." para match flexible
        const cleanTerm = term.replace(/^(dra?\.\s*)/i, '').trim();

        return cases.filter(c => {
          if (!c.assignedTo) return false;
          const assigned = c.assignedTo.trim().toLowerCase();
          const cleanAssigned = assigned.replace(/^(dra?\.\s*)/i, '').trim();
          const matchEmail = c.assignedToEmail && c.assignedToEmail.toLowerCase() === term;
          const matchExact = assigned === term || cleanAssigned === cleanTerm;
          return matchEmail || matchExact;
        });
      },

      // Casos sin asignar disponibles para cualquier profesional (ODS 16)
      getUnassigned() {
        const cases = this.getAll();
        return cases.filter(c => {
          if (!c) return false;
          const assigned = (c.assignedTo || c.profesional_asignado || '').trim().toLowerCase();
          return !assigned || assigned === 'por asignar' || assigned === 'sin asignar' || assigned === 'null' || assigned === 'undefined';
        });
      },

      insert(newCase) {
        const cases = this.getAll();
        const record = {
          id: newCase.id || `CAS-00${Math.floor(100 + Math.random() * 900)}`,
          citizen: newCase.citizen || 'Ciudadano Anónimo',
          citizenEmail: newCase.citizenEmail || '',
          type: newCase.type || 'Orientación General',
          subType: newCase.subType || newCase.type || '',
          description: newCase.description || '',
          status: newCase.status || 'Pendiente',
          assignedTo: newCase.assignedTo || 'Por asignar',
          assignedToEmail: newCase.assignedToEmail || '',
          date: newCase.date || new Date().toISOString().split('T')[0],
          institution: newCase.institution || 'Consultorio Jurídico',
          instAddress: newCase.instAddress || '',
          instPhone: newCase.instPhone || '',
          instHours: newCase.instHours || '',
          checklist: newCase.checklist || [],
          observations: newCase.observations || '',
          createdAt: new Date().toISOString()
        };

        const existingIdx = cases.findIndex(c => c.id === record.id);
        if (existingIdx !== -1) {
          cases[existingIdx] = { ...cases[existingIdx], ...record };
        } else {
          cases.unshift(record);
        }
        saveToStorage(STORAGE_KEYS.CASES, cases);
        if (PuenteDB.mysql) PuenteDB.mysql.createCase(record);
        return record;
      },

      update(caseId, updates) {
        const cases = this.getAll();
        const index = cases.findIndex(c => c.id === caseId);
        if (index === -1) return null;

        cases[index] = {
          ...cases[index],
          ...updates,
          updatedAt: new Date().toISOString()
        };

        saveToStorage(STORAGE_KEYS.CASES, cases);
        if (PuenteDB.mysql) {
          PuenteDB.mysql.updateCaseStatus(
            caseId, 
            updates.status || cases[index].status, 
            updates.observations !== undefined ? updates.observations : cases[index].observations
          );
        }
        return cases[index];
      },

      // Asignar caso sin asignar a un profesional (ODS 16)
      claim(caseId, profName, profEmail = '') {
        const cases = this.getAll();
        const index = cases.findIndex(c => c.id === caseId);
        if (index === -1) return null;

        cases[index].assignedTo = profName;
        cases[index].profesional_asignado = profName;
        if (profEmail) cases[index].assignedToEmail = profEmail;
        if (cases[index].status === 'Pendiente') {
          cases[index].status = 'En curso';
        }
        cases[index].updatedAt = new Date().toISOString();

        saveToStorage(STORAGE_KEYS.CASES, cases);
        if (PuenteDB.mysql) PuenteDB.mysql.claimCase(caseId, profName, profEmail);
        return cases[index];
      },

      delete(caseId) {
        const cases = this.getAll();
        const filtered = cases.filter(c => c.id !== caseId);
        saveToStorage(STORAGE_KEYS.CASES, filtered);
        return filtered.length < cases.length;
      }
    },

    // =========================================================================
    // COLECCIÓN: USUARIOS Y PERFILES INDEPENDIENTES (CRUD COMPLETO)
    // =========================================================================
    users: {
      getAll() {
        return loadFromStorage(STORAGE_KEYS.USERS, SEED_USERS);
      },

      findByEmail(email) {
        if (!email) return null;
        const users = this.getAll();
        return users.find(u => u.email.toLowerCase() === email.trim().toLowerCase()) || null;
      },

      findById(id) {
        if (!id) return null;
        const users = this.getAll();
        return users.find(u => u.id === id) || null;
      },

      create(userData) {
        const users = this.getAll();
        const existing = this.findByEmail(userData.email);
        if (existing) {
          throw new Error('Ya existe una cuenta registrada con este correo electrónico.');
        }

        const parts = userData.name.trim().split(' ').filter(Boolean);
        const avatar = parts.length > 1 
          ? (parts[0][0] + parts[1][0]).toUpperCase() 
          : parts[0].substring(0, 2).toUpperCase();

        const newUser = {
          id: `USR-00${Math.floor(100 + Math.random() * 900)}`,
          name: userData.name.trim(),
          email: userData.email.trim().toLowerCase(),
          password: userData.password || '123456',
          role: userData.role === 'professional' ? 'professional' : 'citizen',
          avatar: userData.avatar || avatar,
          phone: userData.phone || '',
          documentId: userData.documentId || '',
          licenseNumber: userData.licenseNumber || '',
          specialty: userData.specialty || '',
          institution: userData.institution || (userData.role === 'professional' ? 'Colegio de Abogados ODS 16' : ''),
          city: userData.city || 'Montería, Córdoba',
          address: userData.address || '',
          registeredAt: new Date().toISOString().split('T')[0]
        };

        users.push(newUser);
        saveToStorage(STORAGE_KEYS.USERS, users);
        if (PuenteDB.mysql) PuenteDB.mysql.register(newUser);
        return newUser;
      },

      // ACTUALIZAR PERFIL INDEPENDIENTE
      update(idOrEmail, updates) {
        const users = this.getAll();
        const index = users.findIndex(u => 
          (u.id && u.id === idOrEmail) || 
          (u.email && u.email.toLowerCase() === (idOrEmail || '').toLowerCase())
        );

        if (index === -1) return null;

        const prevUser = users[index];
        const oldName = prevUser.name;
        const oldEmail = prevUser.email;

        // Si cambió el nombre, generar avatar acorde
        let avatar = prevUser.avatar;
        if (updates.name && updates.name !== oldName) {
          const parts = updates.name.trim().split(' ').filter(Boolean);
          avatar = parts.length > 1 
            ? (parts[0][0] + parts[1][0]).toUpperCase() 
            : parts[0].substring(0, 2).toUpperCase();
        }

        users[index] = {
          ...prevUser,
          ...updates,
          avatar: updates.avatar || avatar,
          updatedAt: new Date().toISOString()
        };

        saveToStorage(STORAGE_KEYS.USERS, users);

        // Actualizar sesión si el usuario actualizado es el usuario activo
        const currentSession = PuenteDB.session.get();
        if (currentSession && (currentSession.email.toLowerCase() === oldEmail.toLowerCase() || currentSession.id === prevUser.id)) {
          PuenteDB.session.set(users[index]);
        }

        // Si el nombre o correo cambió, sincronizar los casos relacionados
        if ((updates.name && updates.name !== oldName) || (updates.email && updates.email !== oldEmail)) {
          const newName = updates.name || oldName;
          const newEmail = updates.email || oldEmail;
          const cases = PuenteDB.cases.getAll();
          let casesUpdated = false;

          cases.forEach(c => {
            // Sincronizar casos de ciudadano
            if (c.citizenEmail?.toLowerCase() === oldEmail.toLowerCase() || c.citizen === oldName) {
              c.citizen = newName;
              c.citizenEmail = newEmail;
              casesUpdated = true;
            }
            // Sincronizar casos de profesional
            if (c.assignedTo === oldName || (c.assignedToEmail && c.assignedToEmail.toLowerCase() === oldEmail.toLowerCase())) {
              c.assignedTo = newName;
              c.assignedToEmail = newEmail;
              casesUpdated = true;
            }
          });

          if (casesUpdated) {
            saveToStorage(STORAGE_KEYS.CASES, cases);
          }
        }

        // Sincronizar en segundo plano con MySQL
        if (PuenteDB.mysql) {
          PuenteDB.mysql.updateProfile({
            ...users[index],
            oldEmail: oldEmail
          });
        }

        return users[index];
      },

      authenticate(email, password) {
        const user = this.findByEmail(email);
        if (!user) return null;
        if (user.password && user.password !== password) return null;

        const { password: _, ...safeUser } = user;
        return safeUser;
      }
    },

    // =========================================================================
    // SESIÓN ACTIVA (Persiste TODOS los datos del perfil activo)
    // =========================================================================
    session: {
      get() {
        return loadFromStorage(STORAGE_KEYS.SESSION, null);
      },

      set(user) {
        if (!user) {
          localStorage.removeItem(STORAGE_KEYS.SESSION);
          return null;
        }
        // Conservar todos los campos del usuario en sesión
        const safeUser = { ...user };
        delete safeUser.password;
        saveToStorage(STORAGE_KEYS.SESSION, safeUser);
        return safeUser;
      },

      clear() {
        localStorage.removeItem(STORAGE_KEYS.SESSION);
      }
    },

        // =========================================================================
    // MENSAJES Y CHAT BIDIRECCIONAL EN TIEMPO REAL (AISLAMIENTO ODS 16)
    // =========================================================================
    messages: {
      getByCase(caseId, user = null) {
        const allMessages = loadFromStorage(STORAGE_KEYS.MESSAGES, SEED_MESSAGES);
        if (!caseId) return [];
        const cleanId = String(caseId).trim();
        if (allMessages[cleanId] && allMessages[cleanId].length > 0) return allMessages[cleanId];

        // Probar variantes con o sin almohadilla
        const withHash = cleanId.startsWith('#') ? cleanId : '#' + cleanId;
        const withoutHash = cleanId.replace(/^#/, '');
        return allMessages[withHash] || allMessages[withoutHash] || [];
      },

      insert(caseId, message, shouldBroadcast = true) {
        const allMessages = loadFromStorage(STORAGE_KEYS.MESSAGES, SEED_MESSAGES);
        const cleanId = String(caseId || 'CAS-00138').trim();
        if (!allMessages[cleanId]) allMessages[cleanId] = [];

        const record = {
          id: message.id || ('MSG-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4)),
          caseId: cleanId,
          sender: message.sender || 'Usuario',
          senderEmail: (message.senderEmail || '').toLowerCase().trim(),
          role: message.role || 'citizen',
          text: message.text,
          time: message.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          date: message.date || new Date().toISOString().split('T')[0],
          read: !!message.read
        };

        // Deduplicación estricta por ID
        const existingIdx = allMessages[cleanId].findIndex(m => m.id === record.id);
        if (existingIdx >= 0) {
          allMessages[cleanId][existingIdx] = record;
        } else {
          allMessages[cleanId].push(record);
        }

        saveToStorage(STORAGE_KEYS.MESSAGES, allMessages);

        // Transmisión bidireccional en tiempo real (Sockets y Broadcast)
        if (shouldBroadcast && PuenteDB.realtime) {
          PuenteDB.realtime.broadcastMessage(record);
        }

        // Persistir en backend central usando URL dinámica del entorno
        if (shouldBroadcast) {
          try {
            const endpoint = (typeof window !== 'undefined' && window.PUENTE_CONFIG)
              ? window.PUENTE_CONFIG.getApiUrl('api/mensajes')
              : '/api/mensajes';
            fetch(endpoint, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(record)
            }).catch(() => {});
          } catch (e) {}
        }

        return record;
      },

      // Sincronizar mensajes desde el servidor central persistente
      async syncWithServer(caseId) {
        if (!caseId) return [];
        try {
          const cleanCode = String(caseId).replace(/^#/, '');
          const endpoints = [
            '/api/mensajes?caseId=' + encodeURIComponent(cleanCode) + '&_t=' + Date.now(),
            '/api/mensajes?caso_codigo=' + encodeURIComponent(cleanCode) + '&_t=' + Date.now(),
            '/backend/mensajes.php?caso_codigo=' + encodeURIComponent(cleanCode)
          ];
          for (const ep of endpoints) {
            try {
              const res = await fetch(ep);
              if (res.ok) {
                const json = await res.json();
                if (json && Array.isArray(json.data) && json.data.length > 0) {
                  const allMessages = loadFromStorage(STORAGE_KEYS.MESSAGES, SEED_MESSAGES);
                  if (!allMessages[caseId]) allMessages[caseId] = [];
                  json.data.forEach(srvMsg => {
                    const idx = allMessages[caseId].findIndex(m => m.id === srvMsg.id);
                    if (idx >= 0) {
                      allMessages[caseId][idx] = srvMsg;
                    } else {
                      allMessages[caseId].push(srvMsg);
                    }
                  });
                  saveToStorage(STORAGE_KEYS.MESSAGES, allMessages);
                  return allMessages[caseId];
                }
              }
            } catch (e) {}
          }
        } catch (err) {
          console.warn('[PuenteDB] Error sincronizando mensajes:', err);
        }
        return this.getByCase(caseId);
      },

      // CONVERSACIONES DINAMICAS Y ESTRICTAMENTE AISLADAS POR USUARIO
      getConversationsForUser(user) {
        if (!user) return [];
        const isProf = user.role === 'professional';
        const userEmail = (user.email || '').toLowerCase().trim();
        const userName = (user.name || '').toLowerCase().trim();
        const allCases = PuenteDB.cases.getAll();
        const allMessages = loadFromStorage(STORAGE_KEYS.MESSAGES, SEED_MESSAGES);

        let userCases = [];
        if (isProf) {
          userCases = allCases.filter(c => {
            if (!c.assignedTo) return false;
            const assigned = c.assignedTo.trim().toLowerCase();
            const cleanAssigned = assigned.replace(/^(dra?\.\s*)/i, '').trim();
            const cleanName = userName.replace(/^(dra?\.\s*)/i, '').trim();
            return assigned === userName || cleanAssigned === cleanName || (c.assignedToEmail && c.assignedToEmail.toLowerCase() === userEmail);
          });
        } else {
          userCases = allCases.filter(c => {
            const matchEmail = c.citizenEmail && c.citizenEmail.toLowerCase() === userEmail;
            const matchName = c.citizen && c.citizen.trim().toLowerCase() === userName;
            return matchEmail || matchName;
          });
        }

        return userCases.map(c => {
          const caseMsgs = allMessages[c.id] || [];
          const lastMsgObj = caseMsgs.length > 0 ? caseMsgs[caseMsgs.length - 1] : null;

          let contactName = isProf ? c.citizen : (c.assignedTo || 'Por asignar');
          let contactEmail = isProf ? (c.citizenEmail || '') : (c.assignedToEmail || '');
          let contactRole = isProf ? 'Ciudadano(a) Solicitante' : (c.assignedTo === 'Por asignar' ? 'Pendiente Asignacion' : 'Especialista Orientador');

          let avatar = 'U';
          const parts = (contactName || 'U').trim().split(' ');
          if (parts.length >= 2) {
            avatar = (parts[0][0] + parts[1][0]).toUpperCase();
          } else if (parts.length === 1 && parts[0].length > 0) {
            avatar = parts[0][0].toUpperCase();
          }

          let lastMsg = lastMsgObj ? lastMsgObj.text : 'Expediente radicado. Inicia la orientacion aqui.';
          let time = lastMsgObj ? lastMsgObj.time : 'Hoy';

          // Mensajes no leidos de la contraparte
          const unread = caseMsgs.filter(m => {
            const isCounterpart = isProf ? m.role === 'citizen' : m.role === 'professional';
            return isCounterpart && !m.read;
          }).length;

          return {
            caseId: c.id,
            name: contactName,
            email: contactEmail,
            avatar: avatar,
            role: contactRole,
            caseTag: `#${c.id} - ${c.subType || c.type}`,
            lastMsg: lastMsg,
            time: time,
            unread: unread,
            status: c.status
          };
        });
      }
    },
        // =========================================================================
    // 5. GESTIÓN DE AGENDA Y CITAS DE VIDEOLLAMADA
    // =========================================================================
    agenda: {
      async syncWithServer() {
        try {
          const endpoint = (typeof window !== 'undefined' && window.PUENTE_CONFIG)
            ? window.PUENTE_CONFIG.getApiUrl('api/agenda')
            : '/api/agenda';
          const res = await fetch(endpoint + '?_t=' + Date.now(), { cache: 'no-store' });
          if (res.ok) {
            const json = await res.json();
            if (json.success && Array.isArray(json.data)) {
              saveToStorage(STORAGE_KEYS.AGENDA, json.data);
              return json.data;
            }
          }
        } catch (e) {}
        return this.getAll();
      },
      getAll() {
        return loadFromStorage(STORAGE_KEYS.AGENDA, SEED_AGENDA);
      },
      add(item) {
        const items = this.getAll();
        items.unshift(item);
        saveToStorage(STORAGE_KEYS.AGENDA, items);

        // Guardar en backend si está disponible
        try {
          const endpoint = (typeof window !== 'undefined' && window.PUENTE_CONFIG)
            ? window.PUENTE_CONFIG.getApiUrl('api/agenda')
            : '/api/agenda';
          fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item)
          }).catch(() => {});
        } catch (e) {}

        return item;
      },
      getByProf(profEmail) {
        const items = this.getAll();
        const pEmail = (profEmail || '').toLowerCase().trim();
        return items.filter(i => (i.profEmail || '').toLowerCase().trim() === pEmail);
      },
      getByCitizen(citizenEmail) {
        const items = this.getAll();
        const cEmail = (citizenEmail || '').toLowerCase().trim();
        return items.filter(i => (i.citizenEmail || '').toLowerCase().trim() === cEmail);
      }
    },

    // =========================================================================
    // CONEXIÓN CON MYSQL / XAMPP (API PHP)
    // =========================================================================
    
    // =========================================================================
    // =========================================================================
    // MOTOR DE POLLING Y SINCRONIZACIÓN AUTOMÁTICA DE CHAT (ODS 16 ROBUSTO)
    // =========================================================================
    polling: {
      intervalId: null,
      activeCaseId: null,
      pollingRateMs: 2000, // Consulta cada 2 segundos sin depender de WebSockets

      start() {
        if (this.intervalId) return;
        console.log('[PuenteDB Polling] Motor de sincronización automática activo (cada ' + this.pollingRateMs + 'ms)');
        this.intervalId = setInterval(() => {
          this.tick();
        }, this.pollingRateMs);
        setTimeout(() => this.tick(), 200);
      },

      stop() {
        if (this.intervalId) {
          clearInterval(this.intervalId);
          this.intervalId = null;
        }
      },

      setActiveCase(caseId) {
        if (!caseId) return;
        this.activeCaseId = caseId;
        this.syncCase(caseId, true);
      },

      async tick() {
        if (this.activeCaseId) {
          await this.syncCase(this.activeCaseId, true);
        } else {
          const currentUser = PuenteDB.session ? PuenteDB.session.get() : null;
          if (currentUser) {
            const userCases = PuenteDB.cases.getByCitizen(currentUser.email).concat(PuenteDB.cases.getByProfessional(currentUser.email));
            if (userCases.length > 0) {
              await this.syncCase(userCases[0].id, false);
            }
          }
        }
        // Sincronizar periódicamente lista de casos de la base de datos
        this.casePollCounter = (this.casePollCounter || 0) + 1;
        if (this.casePollCounter % 2 === 0) {
          await this.syncCases();
        }
      },

      async syncCases() {
        try {
          let serverCases = null;
          try {
            const base = (typeof window !== 'undefined' && window.PUENTE_CONFIG)
              ? window.PUENTE_CONFIG.getServerUrl()
              : '';
            const res = await fetch(base + '/api/casos?_t=' + Date.now(), { cache: 'no-cache' });
            if (res.ok) {
              const json = await res.json();
              if (json.success && Array.isArray(json.data)) serverCases = json.data;
            }
          } catch (e) {}

          if (!serverCases && PuenteDB.mysql) {
            serverCases = await PuenteDB.mysql.fetchCases();
          }

          if (serverCases && Array.isArray(serverCases) && serverCases.length > 0) {
            const localCases = PuenteDB.cases.getAll();
            let changed = false;

            serverCases.forEach(sc => {
              const localIdx = localCases.findIndex(lc => lc.id === sc.id);
              if (localIdx === -1) {
                localCases.unshift(sc);
                changed = true;
              } else {
                // Actualizar si cambió estado o asignación en servidor
                if (localCases[localIdx].status !== sc.status || localCases[localIdx].assignedTo !== sc.assignedTo) {
                  localCases[localIdx] = { ...localCases[localIdx], ...sc };
                  changed = true;
                }
              }
            });

            if (changed) {
              saveToStorage(STORAGE_KEYS.CASES, localCases);
              if (typeof window !== 'undefined' && window.state) {
                window.state.cases = localCases;
                if (typeof window.renderProfessionalTable === 'function') {
                  window.renderProfessionalTable();
                }
                if (typeof window.renderCitizenTable === 'function') {
                  window.renderCitizenTable();
                }
              }
            }
          }
        } catch (err) {}
      },

      async syncCase(caseId, triggerUi = true) {
        if (!caseId) return;
        const cleanCode = String(caseId).toLowerCase().replace(/[^a-z0-9]/g, '');
        try {
          const base = (typeof window !== 'undefined' && window.PUENTE_CONFIG)
            ? window.PUENTE_CONFIG.getServerUrl()
            : '';
          const url = base + '/api/mensajes?caseId=' + encodeURIComponent(cleanCode) + '&_t=' + Date.now();
          const res = await fetch(url, { cache: 'no-store' });
          if (!res.ok) return;
          const json = await res.json();
          if (!json || !Array.isArray(json.data)) return;

          const serverMsgs = json.data;
          const localMsgs = PuenteDB.messages.getByCase(caseId);

          let hasNew = false;
          let latestNewMsg = null;

          serverMsgs.forEach(sMsg => {
            const exists = localMsgs.some(lMsg => lMsg.id === sMsg.id);
            if (!exists) {
              PuenteDB.messages.insert(caseId, sMsg, false);
              hasNew = true;
              latestNewMsg = sMsg;
            }
          });

          if (hasNew && triggerUi && PuenteDB.realtime) {
            console.log('[PuenteDB Polling] Mensaje nuevo sincronizado desde el servidor para #' + caseId);
            PuenteDB.realtime.notifyListeners('message', latestNewMsg || { caseId });
          }
        } catch (e) {
          // Silencioso ante microcortes de red
        }
      }
    },

    // MOTOR EN TIEMPO REAL: SOCKET.IO + BROADCASTCHANNEL BIDIRECCIONAL
    // =========================================================================
    realtime: {
      channel: typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('puente_ods16_realtime_chat') : null,
      socket: null,
      listeners: [],
      initialized: false,
      activeCaseId: null,
      activeUser: null,

      init() {
        if (this.initialized) return;
        this.initialized = true;

        // 1. Canal local ultra-rápido (BroadcastChannel entre pestañas del mismo navegador)
        if (this.channel) {
          this.channel.onmessage = (event) => {
            if (event.data && event.data.type === 'NEW_MESSAGE') {
              const msg = event.data.message;
              if (msg && msg.caseId) {
                PuenteDB.messages.insert(msg.caseId, msg, false);
              }
              this.notifyListeners('message', msg);
            } else if (event.data && event.data.type === 'TYPING') {
              this.notifyListeners('typing', event.data);
            }
          };
        }

        // 2. WebSockets vía Socket.io (red y multiplataforma en Render y Local)
        if (typeof io !== 'undefined') {
          try {
            // Resolver URL dinámicamente según el entorno (Render Cloud / Red Remota / Local)
            let socketUrl;
            if (typeof window !== 'undefined') {
              if (window.PUENTE_CONFIG) {
                socketUrl = window.PUENTE_CONFIG.getServerUrl();
              } else if (window.SERVER_URL) {
                socketUrl = window.SERVER_URL;
              } else if (window.SOCKET_URL) {
                socketUrl = window.SOCKET_URL;
              } else if (window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1') {
                // En Render (https://puente-ciudadano-ods16.onrender.com) usa automáticamente window.location.origin
                socketUrl = window.location.origin;
              } else {
                socketUrl = (window.location.port === '3001') ? window.location.origin : 'http://localhost:3001';
              }
            } else {
              socketUrl = 'http://localhost:3001';
            }

            console.log('[PuenteDB Realtime] Conectando Socket.io a:', socketUrl);

            this.socket = io(socketUrl, {
              reconnection: true,
              reconnectionAttempts: 30,
              reconnectionDelay: 1000,
              timeout: 10000,
              transports: ['websocket', 'polling']
            });

            this.socket.on('connect', () => {
              console.log('[PuenteDB Realtime] Socket.io conectado con id:', this.socket.id);
              // Re-unir inmediatamente a la sala si ya se había abierto un caso
              if (this.activeCaseId) {
                console.log('[PuenteDB Realtime] Uniéndose a sala de caso activo:', this.activeCaseId);
                this.socket.emit('join_case', { caseId: this.activeCaseId, user: this.activeUser });
              }
            });

            this.socket.on('reconnect', () => {
              console.log('[PuenteDB Realtime] Socket.io reconectado.');
              if (this.activeCaseId) {
                this.socket.emit('join_case', { caseId: this.activeCaseId, user: this.activeUser });
              }
            });

            // Manejo de mensajes entrantes (soporta tanto receive_message como new_message)
            const handleIncomingMsg = (msg) => {
              if (!msg || !msg.caseId) return;
              console.log('[PuenteDB Realtime] Mensaje recibido vía WebSockets:', msg);
              // Guardar en el almacenamiento del receptor (sin re-broadcast para evitar bucles)
              PuenteDB.messages.insert(msg.caseId, msg, false);
              this.notifyListeners('message', msg);
            };

            this.socket.on('receive_message', handleIncomingMsg);
            this.socket.on('new_message', handleIncomingMsg);

            // Carga de historial enviada al conectarse
            const handleHistory = (msgs) => {
              if (Array.isArray(msgs)) {
                msgs.forEach(m => {
                  if (m && m.caseId) PuenteDB.messages.insert(m.caseId, m, false);
                });
                this.notifyListeners('history_loaded', msgs);
              }
            };

            this.socket.on('case_history', handleHistory);
            this.socket.on('load_messages', handleHistory);

            this.socket.on('user_typing', (data) => {
              this.notifyListeners('typing', data);
            });

            this.socket.on('user_joined', (data) => {
              this.notifyListeners('user_joined', data);
            });

            // Señalización WebRTC para contingencia de videollamada P2P
            this.socket.on('webrtc_offer', (data) => this.notifyListeners('webrtc_offer', data));
            this.socket.on('webrtc_answer', (data) => this.notifyListeners('webrtc_answer', data));
            this.socket.on('webrtc_ice_candidate', (data) => this.notifyListeners('webrtc_ice_candidate', data));

          } catch (err) {
            console.warn('[PuenteDB Realtime] Error inicializando Socket.io:', err);
          }
        }
      },

      joinCase(caseId, user) {
        if (!caseId) return;
        this.activeCaseId = caseId;
        if (user) this.activeUser = user;

        // Sincronizar de inmediato en el motor de polling
        if (PuenteDB.polling) {
          PuenteDB.polling.setActiveCase(caseId);
        }

        if (this.socket && this.socket.connected) {
          this.socket.emit('join_case', { caseId, user: this.activeUser });
        }
      },

      broadcastMessage(record) {
        // Broadcast local inmediato entre pestañas
        if (this.channel) {
          try {
            this.channel.postMessage({ type: 'NEW_MESSAGE', message: record });
          } catch (e) {}
        }
        // Transmisión WebSocket en tiempo real
        if (this.socket && this.socket.connected) {
          this.socket.emit('send_message', record);
        } else {
          // Fallback REST si el socket aún no ha terminado de conectar
          try {
            fetch('/api/mensajes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(record)
            }).catch(() => {});
          } catch (e) {}
        }
      },

      broadcastTyping(caseId, user, isTyping) {
        if (this.channel) {
          try {
            this.channel.postMessage({ type: 'TYPING', caseId, user, isTyping });
          } catch (e) {}
        }
        if (this.socket && this.socket.connected) {
          this.socket.emit('typing', { caseId, user, isTyping });
        }
      },

      on(event, callback) {
        this.listeners.push({ event, callback });
      },

      notifyListeners(event, data) {
        this.listeners
          .filter(l => l.event === event)
          .forEach(l => {
            try { l.callback(data); } catch (e) { console.error(e); }
          });
      }
    },
    mysql: {
      getUrl(endpoint) {
        if (typeof window !== 'undefined' && window.PUENTE_CONFIG) {
          return window.PUENTE_CONFIG.getApiUrl(endpoint);
        }
        if (typeof window !== 'undefined' && window.PUENTE_API_BASE) {
          return `${window.PUENTE_API_BASE.replace(/\/+$/, '')}/${endpoint}`;
        }
        const isFrontendSubdir = typeof window !== 'undefined' && window.location && window.location.pathname.includes('/frontend');
        if (isFrontendSubdir) {
          return `../backend/${endpoint}`;
        }
        return `backend/${endpoint}`;
      },

      async request(endpoint, options = {}) {
        const primary = this.getUrl(endpoint);
        try {
          const res = await fetch(primary, options);
          if (res.ok || res.status === 400 || res.status === 401 || res.status === 409) {
            return res;
          }
        } catch (e) {
          // Probar candidatos
        }

        const candidates = [
          `../backend/${endpoint}`,
          `backend/${endpoint}`,
          `api/${endpoint}`,
          `../api/${endpoint}`
        ].filter(u => u !== primary);

        for (const candidate of candidates) {
          try {
            const res = await fetch(candidate, options);
            if (res.ok || res.status === 400 || res.status === 401 || res.status === 409) {
              return res;
            }
          } catch (err) {}
        }
        throw new Error('Servidor backend no disponible');
      },

            async sendMessage(messageRecord) {
        try {
          const res = await this.request('mensajes.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(messageRecord)
          });
          return await res.json();
        } catch (e) {
          return null;
        }
      },

      async fetchMessages(caseId, user) {
        try {
          const uEmail = encodeURIComponent(user?.email || '');
          const uRole = encodeURIComponent(user?.role || '');
          const uName = encodeURIComponent(user?.name || '');
          const res = await this.request(`mensajes.php?caso_codigo=${encodeURIComponent(caseId)}&user_email=${uEmail}&user_role=${uRole}&user_name=${uName}`);
          const json = await res.json();
          if (json.success && Array.isArray(json.data)) return json.data;
          return null;
        } catch (e) {
          return null;
        }
      },

      async testConnection() {
        try {
          const res = await this.request('test_connection.php');
          if (!res.ok) throw new Error('HTTP ' + res.status);
          return await res.json();
        } catch (err) {
          return { success: false, error: err.message };
        }
      },

      async fetchCases() {
        try {
          const res = await this.request('casos.php');
          const json = await res.json();
          if (json.success && Array.isArray(json.data)) {
            return json.data;
          }
          return null;
        } catch (e) {
          return null;
        }
      },

      async fetchUsers() {
        try {
          const res = await this.request('auth.php?action=users');
          const json = await res.json();
          if (json.success && Array.isArray(json.data)) {
            return json.data;
          }
          return null;
        } catch (e) {
          return null;
        }
      },

      async createCase(caseData) {
        try {
          const endpoint = (typeof window !== 'undefined' && window.PUENTE_CONFIG)
            ? window.PUENTE_CONFIG.getApiUrl('api/casos')
            : '/api/casos';
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(caseData)
          });
          if (res.ok) return await res.json();
        } catch (e) {}

        try {
          const res = await this.request('casos.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(caseData)
          });
          return await res.json();
        } catch (e) {
          return null;
        }
      },

      async updateCaseStatus(caseId, status, obs = '') {
        try {
          const res = await this.request('casos.php?action=update', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: caseId, status, observations: obs })
          });
          return await res.json();
        } catch (e) {
          return null;
        }
      },

      async claimCase(caseId, profName, profEmail = '') {
        try {
          const endpoint = (typeof window !== 'undefined' && window.PUENTE_CONFIG)
            ? window.PUENTE_CONFIG.getApiUrl('api/casos?action=claim')
            : '/api/casos?action=claim';
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ caseId, profName, profEmail })
          });
          if (res.ok) return await res.json();
        } catch (e) {}

        try {
          const res = await this.request('casos.php?action=claim', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ caseId, profName, profEmail })
          });
          return await res.json();
        } catch (e) {
          return null;
        }
      },

      async updateProfile(userData) {
        try {
          const res = await this.request('auth.php?action=update_profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
          });
          return await res.json();
        } catch (e) {
          return null;
        }
      },

      async login(email, password) {
        try {
          const res = await this.request('auth.php?action=login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
          });
          return await res.json();
        } catch (e) {
          return null;
        }
      },

      async register(userData) {
        try {
          const res = await this.request('auth.php?action=register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(userData)
          });
          return await res.json();
        } catch (e) {
          return null;
        }
      }
    },

    getStats() {
      const cases = this.cases.getAll();
      const users = this.users.getAll();
      return {
        totalCases: cases.length,
        pendingCases: cases.filter(c => c.status === 'Pendiente').length,
        inProgressCases: cases.filter(c => c.status === 'En curso').length,
        completedCases: cases.filter(c => c.status === 'Finalizado').length,
        totalUsers: users.length,
        citizensCount: users.filter(u => u.role === 'citizen').length,
        professionalsCount: users.filter(u => u.role === 'professional').length,
        storageBytesUsed: new Blob([JSON.stringify(localStorage)]).size
      };
    },

    resetToDefaults() {
      saveToStorage(STORAGE_KEYS.CASES, SEED_CASES);
      saveToStorage(STORAGE_KEYS.USERS, SEED_USERS);
      this.session.clear();
      console.log('[PuenteDB] Base de datos restablecida.');
      return true;
    }
  };

  PuenteDB.init();
  window.PuenteDB = PuenteDB;

})(window);
