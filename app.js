
  // Helper de asignación estricta e independiente por profesional (ODS 16)
  function isCaseAssignedToProf(c, profUser) {
    if (!c || !profUser) return false;
    const assigned = (c.assignedTo || c.profesional_asignado || '').trim().toLowerCase();
    if (!assigned || assigned === 'por asignar' || assigned === 'sin asignar' || assigned === 'null' || assigned === 'undefined') return false;
    if (c.profesional_id === null && (!c.assignedTo || assigned === 'por asignar')) return false;
    // Un caso en estado Pendiente sin correo de profesional o por asignar nunca cuenta como asignado
    if (c.status && c.status.toLowerCase() === 'pendiente' && (!c.assignedToEmail || assigned === 'por asignar')) return false;

    const profName = (profUser.name || '').trim().toLowerCase();
    const profEmail = (profUser.email || '').trim().toLowerCase();
    const cleanAssigned = assigned.replace(/^(dra?\.\s*)/i, '').trim();
    const cleanProfName = profName.replace(/^(dra?\.\s*)/i, '').trim();

    // 1. Coincidencia por correo si está registrado
    if (c.assignedToEmail && profEmail && c.assignedToEmail.trim().toLowerCase() === profEmail) {
      return true;
    }

    // 2. Coincidencia exacta de nombre (con o sin título Dr./Dra.)
    if (assigned === profName || cleanAssigned === cleanProfName) {
      return true;
    }

    return false;
  }

// Alias para compatibilidad con bundle de Daily.co
if (typeof window !== 'undefined' && typeof window.DailyIframe === 'undefined' && typeof window.Daily !== 'undefined') {
  window.DailyIframe = window.Daily;
}

/* ==========================================================================
   ODS 16: PUENTE DE ORIENTACIÓN CIUDADANA - INTERACTIVE APPLICATION
   Conditional View Rendering & State-Driven Architecture (Figma M1)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {

  // ==========================================================================
  // 1. GLOBAL STATE STORE
  // ==========================================================================
  // 1. GLOBAL STATE STORE (CONECTADO A BASE DE DATOS LOCAL PUENTEDB)
  // ==========================================================================
  const state = {
    // Estado de Autenticación persistente desde PuenteDB: null | { name, role, email, avatar }
    currentUser: (window.PuenteDB && window.PuenteDB.session.get()) ? window.PuenteDB.session.get() : null,

    // Narrative player current scene (1 to 6)
    currentScene: 1,
    totalScenes: 6,
    autoPlayTimer: null,
    isAutoPlaying: false,
    selectedSimulation: 'desconocida',

    // Active Consultation Room
    activeCaseIdForRoom: 'CAS-00138',
    vRoomCallState: { cam: true, mic: true, inCall: true },

    // Filter for Professional Cases Table: 'all' | 'Pendiente' | 'En curso' | 'Finalizado'
    profFilter: 'all',
    profViewMode: 'assigned', // 'assigned' | 'unassigned' | 'all'

    // Wizard Form Current Progress
    wizard: {
      step: 1,
      category: 'Problema laboral',
      subCategory: 'Despido injustificado',
      description: '',
      hasDocs: true,
      recent: true,
      modality: 'virtual'
    },

    // Registro institucional de casos sincronizado con Base de Datos
    cases: (window.PuenteDB && window.PuenteDB.cases) ? window.PuenteDB.cases.getAll() : [
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
          'Contrato de trabajo o desprendibles de pago / extractos bancarios',
          'Carta de despido laboral o constancia de retiro',
          'Liquidación preliminar elaborada en la plataforma'
        ]
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
        ]
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
        ]
      }
    ]
  };

  // Subcategories Dictionary by Area
  const subCategoriesData = {
    'Problema laboral': [
      'Despido injustificado',
      'Falta de pago o liquidación',
      'Acoso laboral o discriminación',
      'Contrato por prestación de servicios encubierto'
    ],
    'Conflicto familiar': [
      'Fijación de cuota alimentaria',
      'Custodia y régimen de visitas',
      'Divorcio y separación de bienes',
      'Violencia intrafamiliar / Medida de protección'
    ],
    'Problema con institución': [
      'Falta de respuesta a Derecho de Petición',
      'Negación de servicios de salud / EPS',
      'Cobros indebidos de servicios públicos'
    ],
    'Derechos ciudadanos': [
      'Acción de Tutela urgente',
      'Violación al debido proceso',
      'Discriminación o vulneración de DDHH'
    ]
  };

  const institutionsData = {
    'Inspección del Trabajo': {
      address: 'Calle 28 # 4-50, Sede Central MinTrabajo',
      phone: 'Línea Gratuita Nacional 01 8000 112518',
      hours: 'Lunes a Viernes 8:00 am - 4:00 pm',
      checklist: [
        'Copia de cédula de ciudadanía del trabajador',
        'Copia del contrato laboral o desprendibles de pago',
        'Carta de despido o constancia de retiro',
        'Relación de salarios o prestaciones pendientes'
      ]
    },
    'Comisaría de Familia': {
      address: 'Centro de Convivencia Ciudadana, Calle 15 # 8-30',
      phone: 'Línea de Atención Familia 106 / (604) 782 1100',
      hours: 'Atención diurna 8am-5pm / Urgencias 24/7',
      checklist: [
        'Registro civil de nacimiento de los hijos menores',
        'Cédula de ciudadanía del solicitante',
        'Tabla estimada de gastos de manutención',
        'Dirección y teléfono de la contraparte'
      ]
    },
    'Personería Municipal': {
      address: 'Palacio Municipal, Carrera 3 # 12-20, Piso 1',
      phone: '(604) 789 2020 Ext. 104',
      hours: 'Lunes a Viernes 7:30 am - 12:00 m / 1:30 pm - 5:00 pm',
      checklist: [
        'Copia radicada del Derecho de Petición con sello de recibido',
        'Cédula de ciudadanía del solicitante',
        'Cálculo de días hábiles transcurridos sin respuesta',
        'Borrador de Acción de Tutela por derecho fundamental'
      ]
    },
    'Defensoría del Pueblo': {
      address: 'Avenida Circunvalar # 32-15',
      phone: 'Línea Nacional 01 8000 914814',
      hours: 'Lunes a Viernes 8:00 am - 5:00 pm',
      checklist: [
        'Documento de identidad del afectado',
        'Relato firmado de los hechos vulneratorios',
        'Pruebas documentales o testimoniales sumarias'
      ]
    }
  };

  const simulationData = {
    desconocida: {
      title: 'Desorientación Institucional: ¿A dónde acudir?',
      description: 'El 64% de los ciudadanos acude a dependencias equivocadas. Se pierde tiempo y se vencen plazos legales por desconocer si un caso compete a la Inspección de Trabajo, Comisaría o Personería.',
      overlayTitle: 'Entidad Oficial Desconocida',
      overlaySubtitle: '3 de cada 4 personas pierden días recorriendo dependencias erróneas.',
      overlayIcon: 'fa-compass',
      overlayColor: '#38bdf8',
      statBadge: '64% desorientación',
      solutionQuote: 'Puente Ciudadano diagnostica tu caso en 2 minutos y te señala la institución oficial exacta sin intermediarios.',
      bridgeAction: 'Ver cómo ODS 16 te conecta'
    },
    burocracia: {
      title: 'Laberinto Burocrático y Formularios Confusos',
      description: 'Filas interminables desde la madrugada, formularios con terminología jurídica incomprensible y copias innecesarias provocan que el 70% desista de reclamar sus derechos.',
      overlayTitle: 'Burocracia y Dilaciones Excesivas',
      overlaySubtitle: 'Semanas de espera y trámites repetitivos que desaniman al ciudadano.',
      overlayIcon: 'fa-file-lines',
      overlayColor: '#f59e0b',
      statBadge: '72% desiste por trámites',
      solutionQuote: 'Digitalizamos la orientación inicial en un lenguaje claro, accesible y comprensible.',
      bridgeAction: 'Descubrir la ruta ágil'
    },
    costos: {
      title: 'Barrera Económica en el Acceso a la Justicia',
      description: 'Los honorarios de abogados privados resultan inalcanzables para trabajadores de ingresos medios y vulnerables, dejándolos desprotegidos.',
      overlayTitle: 'Brecha de Acceso Económico',
      overlaySubtitle: 'El dinero no debe ser una barrera para la justicia y la dignidad.',
      overlayIcon: 'fa-scale-unbalanced',
      overlayColor: '#ef4444',
      statBadge: 'Inaccesibilidad económica',
      solutionQuote: 'El ODS 16 promueve orientación gratuita, universal y transparente para toda la ciudadanía.',
      bridgeAction: 'Conocer el acceso universal'
    }
  };

  // ==========================================================================
  // 2. TOAST NOTIFICATION SYSTEM
  // ==========================================================================
  const toastContainer = document.getElementById('toastContainer');

  function showToast(message, type = 'info') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast-message toast-${type}`;

    let iconClass = 'fa-circle-info';
    if (type === 'success') iconClass = 'fa-circle-check';
    if (type === 'warning') iconClass = 'fa-triangle-exclamation';

    toast.innerHTML = `
      <i class="fas ${iconClass}" style="font-size: 1.1rem; color: ${type === 'success' ? '#10b981' : type === 'warning' ? '#f59e0b' : 'var(--accent-turquoise)'};"></i>
      <div style="flex: 1; line-height: 1.35;">${message}</div>
      <button style="background: none; border: none; color: var(--text-muted); cursor: pointer; padding: 0 4px;" onclick="this.parentElement.remove()">&times;</button>
    `;

    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-hiding');
      setTimeout(() => toast.remove(), 300);
    }, 3800);
  }

  // ==========================================================================
  // MODAL SYSTEM HELPERS (ACCESIBLES GLOBALMENTE)
  // ==========================================================================
  const mainModal = document.getElementById('mainModal');
  const modalTitle = document.getElementById('modalTitle');
  const modalBody = document.getElementById('modalBody');
  const modalClose = document.getElementById('modalClose');

  function openModal(title, htmlContent) {
    const elModal = mainModal || document.getElementById('mainModal');
    const elTitle = modalTitle || document.getElementById('modalTitle');
    const elBody = modalBody || document.getElementById('modalBody');
    if (elTitle) elTitle.textContent = title;
    if (elBody) elBody.innerHTML = htmlContent;
    if (elModal) elModal.classList.add('active');
  }

  function closeModal() {
    const elModal = mainModal || document.getElementById('mainModal');
    if (elModal) elModal.classList.remove('active');
  }

  window.openModal = openModal;
  window.closeModal = closeModal;

  if (modalClose && mainModal) {
    modalClose.addEventListener('click', closeModal);
    mainModal.addEventListener('click', (e) => {
      if (e.target === mainModal) closeModal();
    });
  }

  // ==========================================================================
  // 3. CONDITIONAL VIEW RENDERING SYSTEM (FIGMA STATES)
  // ==========================================================================
  const publicHeader = document.getElementById('publicHeader');
  const authHeader = document.getElementById('authHeader');
  const viewPublicSection = document.getElementById('viewPublicSection');
  const viewCitizenSection = document.getElementById('viewCitizenSection');
  const viewProfessionalSection = document.getElementById('viewProfessionalSection');

  const authAvatarTop = document.getElementById('authAvatarTop');
  const authNameTop = document.getElementById('authNameTop');

  // Funciones auxiliares para personalización dinámica por usuario
  function getUserInitials(name) {
    if (!name || typeof name !== 'string') return 'U';
    const clean = name.replace(/^(Dr\.|Dra\.|Ing\.|Lic\.|Sr\.|Sra\.)\s*/i, '').trim();
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return parts[0] ? parts[0].slice(0, 2).toUpperCase() : 'U';
  }

  function getUserGreeting(name, role) {
    if (!name) return 'Bienvenido(a)';
    if (role === 'citizen') {
      const firstName = name.split(' ')[0] || name;
      return `Hola, ${firstName}`;
    }
    const isFemale = /^(Dra\.|Sra\.|Mariana|Elena|Daniela|Laura|María|Maria|Ana|Claudia|Patricia|Sofia|Sofía)/i.test(name);
    const prefix = isFemale ? 'Bienvenida' : 'Bienvenido';
    return `${prefix}, ${name}`;
  }

  function renderConditionalViews() {
    const user = state.currentUser;

    // Control estricto de visibilidad del botón flotante de chat
    const floatingBtn = document.getElementById('floatingMessengerBtn');
    const messengerModalEl = document.getElementById('messengerModal');

    // ESTADO 1: SIN SESIÓN (Página Pública Inicial)
    if (!user) {
      if (publicHeader) publicHeader.style.display = 'block';
      if (authHeader) authHeader.style.display = 'none';

      // OCULTAR COMPLETAMENTE la bolita de mensajes y cerrar el modal si no hay sesión
      if (floatingBtn) floatingBtn.style.display = 'none';
      if (messengerModalEl) {
        messengerModalEl.classList.remove('active');
        messengerModalEl.style.display = 'none';
      }

      if (viewPublicSection) viewPublicSection.style.display = 'block';
      if (viewCitizenSection) viewCitizenSection.style.display = 'none';
      if (viewProfessionalSection) viewProfessionalSection.style.display = 'none';

      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ESTADO 2: VISTA DE CIUDADANO (Dinámica para cualquier ciudadano)
    else if (user.role === 'citizen') {
      if (floatingBtn) floatingBtn.style.display = 'flex';
      if (publicHeader) publicHeader.style.display = 'none';
      if (authHeader) authHeader.style.display = 'block';

      const userInitials = user.avatar || getUserInitials(user.name) || 'M';
      if (authAvatarTop) authAvatarTop.textContent = userInitials;
      if (authNameTop) authNameTop.textContent = user.name.split(' ')[0] || 'Ciudadano';

      // Actualizar tarjeta de bienvenida del ciudadano
      const cUserAvatarLarge = document.getElementById('cUserAvatarLarge');
      if (cUserAvatarLarge) cUserAvatarLarge.textContent = userInitials;

      const cWelcomeName = document.getElementById('cWelcomeName');
      if (cWelcomeName) cWelcomeName.textContent = `Hola, ${user.name.split(' ')[0] || user.name}`;

      const cWelcomeSubtitle = document.getElementById('cWelcomeSubtitle');
      if (cWelcomeSubtitle) {
        cWelcomeSubtitle.textContent = `¿En qué podemos ayudarte hoy, ${user.name.split(' ')[0] || ''}? Recuerda que tu situación importa.`;
      }

      if (viewPublicSection) viewPublicSection.style.display = 'none';
      if (viewCitizenSection) viewCitizenSection.style.display = 'block';
      if (viewProfessionalSection) viewProfessionalSection.style.display = 'none';

      renderCitizenTable();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ESTADO 3: VISTA DE PROFESIONAL (Dinámica para cualquier orientador/profesional)
    else if (user.role === 'professional' || user.role === 'admin') {
      if (floatingBtn) floatingBtn.style.display = 'flex';
      if (publicHeader) publicHeader.style.display = 'none';
      if (authHeader) authHeader.style.display = 'block';

      const userInitials = user.avatar || getUserInitials(user.name) || 'EG';
      if (authAvatarTop) authAvatarTop.textContent = userInitials;
      if (authNameTop) authNameTop.textContent = user.name.startsWith('Dr') ? user.name.split(' ').slice(0, 2).join(' ') : user.name.split(' ')[0];

      // Actualizar cuadro de bienvenida del profesional (se ajusta a cada usuario)
      const profWelcomeAvatar = document.getElementById('profWelcomeAvatar');
      if (profWelcomeAvatar) profWelcomeAvatar.textContent = userInitials;

      const profWelcomeName = document.getElementById('profWelcomeName');
      if (profWelcomeName) profWelcomeName.textContent = getUserGreeting(user.name, user.role);

      const profWelcomeQuote = document.getElementById('profWelcomeQuote');
      if (profWelcomeQuote) {
        if (user.specialty) {
          profWelcomeQuote.textContent = `"La orientación también transforma vidas. Especialidad: ${user.specialty}."`;
        } else {
          profWelcomeQuote.textContent = '"La orientación también transforma vidas. Tu conocimiento y experiencia generan gran impacto."';
        }
      }

      if (viewPublicSection) viewPublicSection.style.display = 'none';
      if (viewCitizenSection) viewCitizenSection.style.display = 'none';
      if (viewProfessionalSection) viewProfessionalSection.style.display = 'block';

      renderProfessionalTable();
      if (typeof window.renderProfessionalAgenda === 'function') window.renderProfessionalAgenda();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // Session Manager functions attached to window for buttons/dev switcher
  window.setSession = (role, targetEmail = null) => {
    if (role === 'citizen') {
      const email = targetEmail || 'mariana.sibaja@ejemplo.com';
      const user = window.PuenteDB?.users.findByEmail(email) || 
                   window.PuenteDB?.users.getAll().find(u => u.role === 'citizen') || {
        name: 'Mariana Sibaja',
        role: 'citizen',
        email: email,
        avatar: 'M'
      };
      state.currentUser = user;
      window.PuenteDB?.session.set(user);
      showToast(`Sesión iniciada como Ciudadano (${user.name}).`, 'success');
    } else if (role === 'professional') {
      const email = targetEmail || 'elena.gomez@asesores.org';
      const user = window.PuenteDB?.users.findByEmail(email) || 
                   window.PuenteDB?.users.getAll().find(u => u.role === 'professional') || {
        name: 'Dra. Elena Gómez',
        role: 'professional',
        email: email,
        avatar: 'EG',
        specialty: 'Derecho Laboral y Conciliación'
      };
      state.currentUser = user;
      window.PuenteDB?.session.set(user);
      showToast(`Sesión iniciada como Profesional (${user.name}).`, 'success');
    } else {
      state.currentUser = null;
      if (window.PuenteDB && window.PuenteDB.session) {
        window.PuenteDB.session.clear();
      }
      try {
        localStorage.removeItem('puente_db_session_v2');
      } catch (e) {}
      showToast('Sesión cerrada correctamente. Puedes iniciar sesión o registrarte.', 'info');
    }

    renderConditionalViews();
    if (typeof window.updateSystemRealtimeDates === "function") window.updateSystemRealtimeDates();
  };

  window.handleLogout = () => {
    window.setSession(null);
  };

  // ==========================================================================
  // 4. SIDEBAR ACTIONS NAVIGATION (FIGMA MENU ITEMS)
  // ==========================================================================
  window.sidebarCitizenAction = (action) => {
    // Reset active class on sidebar items
    document.querySelectorAll('#viewCitizenSection .sidebar-item').forEach(el => el.classList.remove('active'));

    if (action === 'cases') {
      document.getElementById('cNavCases')?.classList.add('active');
      renderCitizenTable();
      showToast('Mostrando tus casos registrados.', 'info');
    } else if (action === 'report') {
      document.getElementById('cNavReport')?.classList.add('active');
      openModal('Reportar Nueva Situación (ODS 16)', `
        <p style="color: var(--text-muted); font-size: 0.95rem;">Diligencia este formulario para orientar tu situación con la entidad correspondiente.</p>
        <div class="form-group" style="margin-top: 1rem;">
          <label class="form-label">Área del problema:</label>
          <select id="modalCaseCategory" class="form-control">
            <option>Problema laboral</option>
            <option>Conflicto familiar</option>
            <option>Problema con institución</option>
            <option>Derechos ciudadanos</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Describe la situación:</label>
          <textarea id="modalCaseDesc" class="form-control" rows="3" placeholder="Describe brevemente lo que sucedió..."></textarea>
        </div>
        <button class="btn btn-turquoise" style="width: 100%;" onclick="window.submitModalCase()">Registrar Situación</button>
      `);
    } else if (action === 'messages') {
      document.getElementById('cNavMessages')?.classList.add('active');
      window.openMessenger();
    } else if (action === 'videocalls') {
      document.getElementById('cNavCalls')?.classList.add('active');
      window.openVirtualRoom(state.activeCaseIdForRoom || state.activeMessengerCaseId || state.cases[0]?.id || 'CAS-00138');
    } else if (action === 'notifications') {
      document.getElementById('cNavNotif')?.classList.add('active');
      window.openNotificationsModal();
    } else if (action === 'institutions') {
      document.getElementById('cNavInst')?.classList.add('active');
      window.openInstitutionsModal();
    } else if (action === 'profile') {
      document.getElementById('cNavProfile')?.classList.add('active');
      window.openProfileModal();
    }
  };

  window.sidebarProfAction = (action) => {
    document.querySelectorAll('#viewProfessionalSection .sidebar-item').forEach(el => el.classList.remove('active'));

    if (action === 'cases') {
      document.getElementById('pNavCases')?.classList.add('active');
      window.switchProfViewMode('assigned');
      showToast('Mostrando casos asignados.', 'info');
    } else if (action === 'unassigned') {
      document.getElementById('pNavUnassigned')?.classList.add('active');
      window.switchProfViewMode('unassigned');
      showToast('Mostrando casos sin asignar en la red ODS 16.', 'info');
    } else if (action === 'agenda') {
      document.getElementById('pNavAgenda')?.classList.add('active');
      const agenda = document.getElementById('cardAgendaProf');
      if (agenda) {
        agenda.scrollIntoView({ behavior: 'smooth' });
        agenda.style.boxShadow = '0 0 0 4px rgba(0, 168, 150, 0.4)';
        setTimeout(() => agenda.style.boxShadow = '', 1500);
      }
    } else if (action === 'messages') {
      window.openMessenger();
    } else if (action === 'videocalls') {
      window.openVirtualRoom(state.activeCaseIdForRoom || state.activeMessengerCaseId || state.cases[0]?.id || 'CAS-00138');
    } else if (action === 'notifications') {
      window.openNotificationsModal();
    } else if (action === 'institutions') {
      window.openInstitutionsModal();
    } else if (action === 'profile') {
      window.openProfileModal();
    }
  };

  window.submitModalCase = () => {
    const cat = document.getElementById('modalCaseCategory')?.value || 'Problema laboral';
    const desc = document.getElementById('modalCaseDesc')?.value || 'Caso reportado desde el menú lateral';
    const id = `CAS-00${Math.floor(100 + Math.random() * 900)}`;

    const newCaseRecord = {
      id,
      citizen: state.currentUser ? state.currentUser.name : 'Mariana Sibaja',
      citizenEmail: state.currentUser ? state.currentUser.email : 'mariana.sibaja@ejemplo.com',
      type: cat,
      subType: cat,
      description: desc,
      status: 'Pendiente', // Estado inicial correcto
      assignedTo: 'Por asignar', // Disponible para asignación profesional
      assignedToEmail: '',
      date: new Date().toISOString().split('T')[0],
      institution: getInstitutionByCategory(cat),
      instAddress: institutionsData[getInstitutionByCategory(cat)]?.address || '',
      instPhone: institutionsData[getInstitutionByCategory(cat)]?.phone || '',
      instHours: institutionsData[getInstitutionByCategory(cat)]?.hours || '',
      checklist: institutionsData[getInstitutionByCategory(cat)]?.checklist || []
    };

    if (window.PuenteDB) {
      window.PuenteDB.cases.insert(newCaseRecord);
      state.cases = window.PuenteDB.cases.getAll();
    } else {
      state.cases.unshift(newCaseRecord);
    }

    closeModal();
    renderCitizenTable();
    renderProfessionalTable();
    showToast(`¡Caso ${id} creado y guardado en la Base de Datos con éxito!`, 'success');
  };

  // ==========================================================================
  // 5. NAVBAR ACTIONS & MODAL SYSTEM HELPERS (INICIO, CÓMO FUNCIONA, SERVICIOS, FAQ, NOTIFICACIONES, PERFIL)
  // ==========================================================================
  window.handleNavInicio = () => {
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.getElementById('authNavInicio')?.classList.add('active');
    document.getElementById('navLinkInicio')?.classList.add('active');

    if (!state.currentUser) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      showToast('Estás en la página pública de Puente Ciudadano (ODS 16).', 'info');
    } else if (state.currentUser.role === 'citizen') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      window.sidebarCitizenAction('cases');
      showToast('Bienvenida al inicio de tu panel ciudadano, Mariana.', 'info');
    } else if (state.currentUser.role === 'professional') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      window.sidebarProfAction('cases');
      showToast('Bienvenida al inicio de tu panel profesional, Dra. Elena.', 'info');
    }
  };

  window.openHowItWorksModal = () => {
    openModal('¿Cómo funciona Puente Ciudadano? (ODS 16)', `
      <p style="color: var(--text-muted); font-size: 0.95rem; line-height: 1.5; margin-bottom: 1.25rem;">
        Puente Ciudadano es una plataforma tecnológica creada para facilitar el acceso a la justicia y la orientación institucional (ODS 16: Paz, Justicia e Instituciones Sólidas), conectando a los ciudadanos con profesionales y entidades competentes a través de 4 pasos fundamentales:
      </p>

      <div style="display: flex; flex-direction: column; gap: 0.85rem;">
        <div style="display: flex; gap: 0.85rem; align-items: flex-start; background: var(--soft-blue); padding: 0.85rem 1rem; border-radius: 8px; border-left: 4px solid var(--accent-turquoise);">
          <div style="width: 28px; height: 28px; border-radius: 50%; background: var(--accent-turquoise); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; font-size: 0.85rem;">1</div>
          <div>
            <strong style="color: var(--dark-blue); font-size: 0.95rem;">Reporte y Registro de la Situación</strong>
            <p style="font-size: 0.85rem; color: var(--text-dark); margin: 0.2rem 0 0;">El ciudadano describe su problema de manera sencilla (laboral, familiar, derechos o institucional) sin tecnicismos.</p>
          </div>
        </div>

        <div style="display: flex; gap: 0.85rem; align-items: flex-start; background: var(--soft-blue); padding: 0.85rem 1rem; border-radius: 8px; border-left: 4px solid var(--primary-blue);">
          <div style="width: 28px; height: 28px; border-radius: 50%; background: var(--primary-blue); color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; font-size: 0.85rem;">2</div>
          <div>
            <strong style="color: var(--dark-blue); font-size: 0.95rem;">Clasificación y Orientación Inicial</strong>
            <p style="font-size: 0.85rem; color: var(--text-dark); margin: 0.2rem 0 0;">El sistema analiza los hechos y determina el área competente, brindando una guía previa y los posibles caminos de acción.</p>
          </div>
        </div>

        <div style="display: flex; gap: 0.85rem; align-items: flex-start; background: var(--soft-blue); padding: 0.85rem 1rem; border-radius: 8px; border-left: 4px solid #10b981;">
          <div style="width: 28px; height: 28px; border-radius: 50%; background: #10b981; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; font-size: 0.85rem;">3</div>
          <div>
            <strong style="color: var(--dark-blue); font-size: 0.95rem;">Asignación de Profesional y Videollamada</strong>
            <p style="font-size: 0.85rem; color: var(--text-dark); margin: 0.2rem 0 0;">Se asigna un profesional voluntario verificado para atender consultas vía chat seguro o videollamada interactiva en tiempo real.</p>
          </div>
        </div>

        <div style="display: flex; gap: 0.85rem; align-items: flex-start; background: var(--soft-blue); padding: 0.85rem 1rem; border-radius: 8px; border-left: 4px solid #8b5cf6;">
          <div style="width: 28px; height: 28px; border-radius: 50%; background: #8b5cf6; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 700; flex-shrink: 0; font-size: 0.85rem;">4</div>
          <div>
            <strong style="color: var(--dark-blue); font-size: 0.95rem;">Emisión de Hoja de Ruta y Enrutamiento</strong>
            <p style="font-size: 0.85rem; color: var(--text-dark); margin: 0.2rem 0 0;">Se genera una Hoja de Ruta Oficial con la sede física de la entidad encargada (Inspección laboral, Comisaría, Personería), horarios y requisitos a presentar.</p>
          </div>
        </div>
      </div>

      <div style="margin-top: 1.5rem; display: flex; gap: 0.75rem; justify-content: flex-end;">
        <button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
        <button class="btn btn-turquoise" onclick="closeModal(); ${state.currentUser ? `window.sidebar${state.currentUser.role === 'citizen' ? 'Citizen' : 'Prof'}Action('cases')` : 'window.scrollToQuestionnaire()'}">
          <i class="fas fa-arrow-right"></i> ${state.currentUser ? 'Ir a Mis Casos' : 'Comenzar Diagnóstico'}
        </button>
      </div>
    `);
  };

  window.openServicesModal = () => {
    openModal('Nuestros Servicios - ODS 16 Puente Ciudadano', `
      <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 1.25rem;">
        Herramientas digitales diseñadas para reducir las barreras de acceso a la justicia y orientar al ciudadano hacia instituciones sólidas:
      </p>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.85rem;">
        <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem; box-shadow: var(--shadow-sm);">
          <div style="color: var(--primary-blue); font-size: 1.3rem; margin-bottom: 0.4rem;"><i class="fas fa-scale-balanced"></i></div>
          <strong style="color: var(--dark-blue); font-size: 0.95rem;">Orientación Jurídica Gratuita</strong>
          <p style="font-size: 0.82rem; color: var(--text-muted); margin: 0.3rem 0 0;">Asesoría en derecho laboral, conciliación familiar, derechos de petición y protección de DDHH.</p>
        </div>

        <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem; box-shadow: var(--shadow-sm);">
          <div style="color: var(--accent-turquoise); font-size: 1.3rem; margin-bottom: 0.4rem;"><i class="fas fa-landmark"></i></div>
          <strong style="color: var(--dark-blue); font-size: 0.95rem;">Enrutamiento Institucional</strong>
          <p style="font-size: 0.82rem; color: var(--text-muted); margin: 0.3rem 0 0;">Directorio exacto con sedes, teléfonos y competencias de entidades oficiales en tu ciudad.</p>
        </div>

        <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem; box-shadow: var(--shadow-sm);">
          <div style="color: #10b981; font-size: 1.3rem; margin-bottom: 0.4rem;"><i class="fas fa-video"></i></div>
          <strong style="color: var(--dark-blue); font-size: 0.95rem;">Videollamadas Seguras</strong>
          <p style="font-size: 0.82rem; color: var(--text-muted); margin: 0.3rem 0 0;">Salas virtuales 1 a 1 para exponer tu situación frente a profesionales acreditados.</p>
        </div>

        <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem; box-shadow: var(--shadow-sm);">
          <div style="color: #f59e0b; font-size: 1.3rem; margin-bottom: 0.4rem;"><i class="fas fa-file-signature"></i></div>
          <strong style="color: var(--dark-blue); font-size: 0.95rem;">Hojas de Ruta Oficiales</strong>
          <p style="font-size: 0.82rem; color: var(--text-muted); margin: 0.3rem 0 0;">Documento descargable con checklist de pruebas y pasos para radicar tu caso formalmente.</p>
        </div>
      </div>

      <div style="margin-top: 1.5rem; display: flex; justify-content: space-between; align-items: center; background: var(--soft-blue); padding: 0.85rem 1rem; border-radius: 8px;">
        <span style="font-size: 0.85rem; color: var(--primary-blue);"><strong>100% Sin Costo</strong> | Financiado para el ODS 16</span>
        <button class="btn btn-turquoise btn-sm" onclick="closeModal(); window.openInstitutionsModal()">
          <i class="fas fa-building-columns"></i> Ver Instituciones
        </button>
      </div>
    `);
  };

  window.openFaqModal = () => {
    openModal('Preguntas Frecuentes (FAQ) - ODS 16', `
      <div style="display: flex; flex-direction: column; gap: 0.85rem;">
        <div style="background: var(--soft-blue); border-radius: 8px; padding: 0.85rem 1rem;">
          <strong style="color: var(--dark-blue); font-size: 0.92rem;"><i class="fas fa-question-circle" style="color: var(--accent-turquoise); margin-right: 0.4rem;"></i> ¿La plataforma tiene algún costo para el ciudadano?</strong>
          <p style="font-size: 0.85rem; color: var(--text-dark); margin: 0.35rem 0 0; line-height: 1.45;">No, todos los servicios de registro, diagnóstico, chat y videollamada son completamente gratuitos bajo el propósito del ODS 16 de promover el acceso universal a la justicia.</p>
        </div>

        <div style="background: var(--soft-blue); border-radius: 8px; padding: 0.85rem 1rem;">
          <strong style="color: var(--dark-blue); font-size: 0.92rem;"><i class="fas fa-shield-halved" style="color: var(--primary-blue); margin-right: 0.4rem;"></i> ¿La plataforma reemplaza a los jueces o emite fallos?</strong>
          <p style="font-size: 0.85rem; color: var(--text-dark); margin: 0.35rem 0 0; line-height: 1.45;">No. La plataforma no dicta sentencias ni sustituye a las autoridades oficiales. Su función es orientar, preparar al ciudadano y canalizarlo eficazmente a la entidad competente.</p>
        </div>

        <div style="background: var(--soft-blue); border-radius: 8px; padding: 0.85rem 1rem;">
          <strong style="color: var(--dark-blue); font-size: 0.92rem;"><i class="fas fa-user-tie" style="color: #10b981; margin-right: 0.4rem;"></i> ¿Quiénes son los profesionales que atienden?</strong>
          <p style="font-size: 0.85rem; color: var(--text-dark); margin: 0.35rem 0 0; line-height: 1.45;">Docentes, abogados titulados y practicantes de consultorio jurídico adscritos a la Universidad Cooperativa de Colombia y entidades aliadas debidamente acreditadas.</p>
        </div>

        <div style="background: var(--soft-blue); border-radius: 8px; padding: 0.85rem 1rem;">
          <strong style="color: var(--dark-blue); font-size: 0.92rem;"><i class="fas fa-lock" style="color: #f59e0b; margin-right: 0.4rem;"></i> ¿Mis datos personales están protegidos?</strong>
          <p style="font-size: 0.85rem; color: var(--text-dark); margin: 0.35rem 0 0; line-height: 1.45;">Sí, las salas virtuales y registros cuentan con cifrado y se rigen bajo la Ley 1581 de Protección de Datos Personales (Habeas Data) garantizando total confidencialidad.</p>
        </div>
      </div>

      <button class="btn btn-secondary" style="width: 100%; margin-top: 1.25rem;" onclick="closeModal()">Cerrar</button>
    `);
  };

  window.openMessagesModal = () => {
    openModal('Mis Mensajes con Especialistas', `
      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        <div style="background: var(--soft-blue); padding: 0.85rem; border-radius: 8px; border-left: 4px solid var(--accent-turquoise);">
          <strong>Dra. Elena Gómez (Asesora Verificada):</strong><br>
          <small style="color: var(--text-dark);">"Hola Mariana, he revisado tus desprendibles. Ya puedes solicitar la audiencia en la Inspección de Trabajo."</small>
        </div>
      </div>
      <button class="btn btn-turquoise" style="width: 100%; margin-top: 1rem;" onclick="closeModal(); window.openVirtualRoom(state.activeCaseIdForRoom || state.activeMessengerCaseId || state.cases[0]?.id || 'CAS-00138')">
        <i class="fas fa-comments"></i> Abrir Chat en Vivo
      </button>
    `);
  };

  window.openNotificationsModal = () => {
    const user = state.currentUser;
    const isProf = user?.role === 'professional';
    const userName = user?.name || (isProf ? 'Profesional' : 'Ciudadano');
    const userEmail = (user?.email || '').toLowerCase().trim();
    const uNameLower = (user?.name || '').toLowerCase().trim();

    // 1. Obtener todos los casos del sistema
    const allCases = (window.PuenteDB?.cases ? window.PuenteDB.cases.getAll() : state.cases) || [];

    // 2. Obtener agenda personal del usuario
    let myAgenda = [];
    if (window.PuenteDB?.agenda) {
      if (isProf) {
        if (userEmail) myAgenda = window.PuenteDB.agenda.getByProf(userEmail) || [];
        if (myAgenda.length === 0 && uNameLower) {
          myAgenda = window.PuenteDB.agenda.getByProf(uNameLower) || [];
        }
      } else {
        if (userEmail) myAgenda = window.PuenteDB.agenda.getByCitizen(userEmail) || [];
        if (myAgenda.length === 0 && uNameLower) {
          const allEvts = window.PuenteDB.agenda.getAll() || [];
          myAgenda = allEvts.filter(e => (e.citizenName || '').toLowerCase().includes(uNameLower));
        }
      }
    }

    let notificationsHtml = '';

    if (isProf) {
      // Casos asignados a este profesional específico
      const myCases = allCases.filter(c => {
        const a = (c.assignedTo || '').toLowerCase().trim();
        return (uNameLower && (a.includes(uNameLower) || uNameLower.includes(a)));
      });

      const notifs = [];

      // A. Notificación por cada caso asignado
      myCases.forEach(c => {
        notifs.push(`
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 0.85rem 1rem; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; gap: 0.75rem;">
            <div>
              <strong style="color: #166534;"><i class="fas fa-circle-exclamation"></i> Caso Asignado: #${c.id}</strong><br>
              <small style="color: #15803d;">${c.citizen || 'Ciudadano'} — ${c.subType || c.type || 'Orientación en curso'}</small>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="closeModal(); window.viewCaseDetail('${c.id}')">Ver Caso</button>
          </div>
        `);
      });

      // B. Notificación por citas en la agenda del profesional
      myAgenda.forEach(evt => {
        notifs.push(`
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 0.85rem 1rem; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; gap: 0.75rem;">
            <div>
              <strong style="color: #1e40af;"><i class="fas fa-video"></i> Videollamada: ${evt.time || 'Hoy'}</strong><br>
              <small style="color: #1d4ed8;">${evt.topic || `Cita caso #${evt.caseId} con ${evt.citizenName}`}</small>
            </div>
            <button class="btn btn-turquoise btn-sm" onclick="closeModal(); window.openVirtualRoom('${evt.caseId || 'CAS-00138'}')"><i class="fas fa-video"></i> Conectar</button>
          </div>
        `);
      });

      // C. Canal de mensajes activo
      if (myCases.length > 0) {
        const firstC = myCases[0];
        notifs.push(`
          <div style="background: var(--soft-blue); padding: 0.85rem 1rem; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; gap: 0.75rem;">
            <div>
              <strong style="color: var(--dark-blue);"><i class="fas fa-comment-dots"></i> Canal de Orientación Activo</strong><br>
              <small style="color: var(--text-dark);">Comunicación directa con ${firstC.citizen} (#${firstC.id})</small>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="closeModal(); window.openMessenger('${firstC.id}')">Responder</button>
          </div>
        `);
      }

      if (notifs.length === 0) {
        notificationsHtml = `
          <div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted);">
            <i class="fas fa-bell-slash" style="font-size: 2.2rem; color: #cbd5e1; margin-bottom: 0.5rem; display: block;"></i>
            <p style="margin: 0; font-weight: 600; color: var(--dark-blue);">Bandeja de avisos al día</p>
            <small>No tienes notificaciones pendientes para tu cuenta profesional.</small>
          </div>
        `;
      } else {
        notificationsHtml = notifs.join('');
      }

    } else {
      // Notificaciones para Ciudadano
      const myCases = allCases.filter(c => {
        const ce = (c.citizenEmail || '').toLowerCase().trim();
        const cn = (c.citizen || '').toLowerCase().trim();
        return (userEmail && ce === userEmail) || (uNameLower && cn.includes(uNameLower)) || (cn && uNameLower.includes(cn));
      });

      const notifs = [];

      myCases.forEach(c => {
        if (c.assignedTo && c.assignedTo !== 'Por asignar') {
          notifs.push(`
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 0.85rem 1rem; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; gap: 0.75rem;">
              <div>
                <strong style="color: #166534;"><i class="fas fa-check-circle"></i> Especialista Asignado(a)</strong><br>
                <small style="color: #15803d;">${c.assignedTo} está orientando tu caso #${c.id}</small>
              </div>
              <button class="btn btn-secondary btn-sm" onclick="closeModal(); window.viewCaseDetail('${c.id}')">Detalles</button>
            </div>
          `);
        }
        if (c.institution) {
          notifs.push(`
            <div style="background: #fefce8; border: 1px solid #fef08a; padding: 0.85rem 1rem; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; gap: 0.75rem;">
              <div>
                <strong style="color: #854d0e;"><i class="fas fa-file-contract"></i> Hoja de Ruta ODS 16 Disponible</strong><br>
                <small style="color: #a16207;">Entidad recomendada: ${c.institution} para el caso #${c.id}</small>
              </div>
              <button class="btn btn-primary btn-sm" onclick="closeModal(); window.openRoadmap('${c.id}')">Abrir Guía</button>
            </div>
          `);
        }
      });

      // Citas de videollamada para el ciudadano
      myAgenda.forEach(evt => {
        notifs.push(`
          <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 0.85rem 1rem; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; gap: 0.75rem;">
            <div>
              <strong style="color: #1e40af;"><i class="fas fa-video"></i> Cita Virtual Programada: ${evt.time || 'Hoy'}</strong><br>
              <small style="color: #1d4ed8;">${evt.topic || 'Consulta virtual con tu especialista'}</small>
            </div>
            <button class="btn btn-turquoise btn-sm" onclick="closeModal(); window.openVirtualRoom('${evt.caseId || 'CAS-00138'}')"><i class="fas fa-video"></i> Entrar a Sala</button>
          </div>
        `);
      });

      if (notifs.length === 0) {
        notificationsHtml = `
          <div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted);">
            <i class="fas fa-bell-slash" style="font-size: 2.2rem; color: #cbd5e1; margin-bottom: 0.5rem; display: block;"></i>
            <p style="margin: 0; font-weight: 600; color: var(--dark-blue);">Bandeja de avisos al día</p>
            <small>Aquí verás las actualizaciones de tus casos y citas agendadas.</small>
          </div>
        `;
      } else {
        notificationsHtml = notifs.join('');
      }
    }

    openModal(`Notificaciones - ${userName}`, `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
        <span style="font-size: 0.85rem; color: var(--text-muted);">Bandeja de avisos personalizada</span>
        <button class="btn btn-secondary btn-sm" onclick="window.markNotificationsRead()">
          <i class="fas fa-check-double"></i> Marcar todas como leídas
        </button>
      </div>

      <div style="display: flex; flex-direction: column; gap: 0.75rem;">
        ${notificationsHtml}
      </div>
    `);
  };

  window.markNotificationsRead = () => {
    const dot = document.getElementById('authNotificationDot');
    if (dot) dot.style.display = 'none';
    closeModal();
    showToast('Todas las notificaciones han sido marcadas como leídas.', 'success');
  };

    window.openProfileModal = (initialMode = 'view') => {
    // 1. Obtener usuario activo completo
    const currentUser = state.currentUser || { name: 'Mariana Sibaja', role: 'citizen', email: 'mariana.sibaja@ejemplo.com', avatar: 'M' };
    const fullUser = (window.PuenteDB?.users.findByEmail(currentUser.email) || currentUser);
    const isProf = fullUser.role === 'professional';

    // 2. Calcular actividad real e independiente de sus casos
    let myCases = [];
    if (isProf) {
      myCases = state.cases.filter(c => isCaseAssignedToProf(c, fullUser));
    } else {
      const citEmail = (fullUser.email || '').toLowerCase().trim();
      const citName = (fullUser.name || '').toLowerCase().trim();
      myCases = state.cases.filter(c => {
        const matchEmail = c.citizenEmail && c.citizenEmail.toLowerCase().trim() === citEmail;
        const matchName = c.citizen && c.citizen.toLowerCase().trim() === citName;
        return matchEmail || matchName;
      });
    }

    const totalCasos = myCases.length;
    const casosEnCurso = myCases.filter(c => c.status === 'En curso').length;
    const casosFinalizados = myCases.filter(c => c.status === 'Finalizado').length;
    const casosPendientes = myCases.filter(c => c.status === 'Pendiente').length;
    const videollamadasCount = myCases.filter(c => c.status === 'En curso' || c.roomUrl || c.hasCall || c.id === 'CAS-00138').length;

    const userInitials = fullUser.avatar || getUserInitials(fullUser.name) || (isProf ? 'EG' : 'M');

    openModal(isProf ? `Perfil Profesional - ${fullUser.name}` : `Perfil Ciudadano - ${fullUser.name}`, `
      <div style="display: flex; align-items: center; justify-content: space-between; padding-bottom: 1.15rem; border-bottom: 1px solid var(--border-color); margin-bottom: 1.15rem; flex-wrap: wrap; gap: 0.75rem;">
        <div style="display: flex; align-items: center; gap: 1rem;">
          <div style="width: 64px; height: 64px; border-radius: 50%; background: linear-gradient(135deg, ${isProf ? 'var(--accent-turquoise), #004d40' : 'var(--primary-blue), var(--accent-turquoise)'}); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.75rem; font-weight: 700; box-shadow: 0 4px 12px rgba(0,0,0,0.15);">
            ${userInitials}
          </div>
          <div>
            <h3 style="margin: 0; color: var(--dark-blue); font-size: 1.3rem; font-weight: 800;">${fullUser.name}</h3>
            <div style="display: flex; align-items: center; gap: 0.45rem; margin-top: 0.3rem; flex-wrap: wrap;">
              <span class="badge-od16" style="background: ${isProf ? '#ecfdf5; color: #047857; border: 1px solid #a7f3d0' : '#eff6ff; color: #1d4ed8; border: 1px solid #bfdbfe'}; font-weight: 700; font-size: 0.78rem;">
                <i class="${isProf ? 'fas fa-scale-balanced' : 'fas fa-user-shield'}"></i> ${isProf ? 'Asesor(a) Jurídico(a) Verificado(a)' : 'Ciudadano(a) Registrado(a)'}
              </span>
              <span style="font-size: 0.78rem; color: #10b981; font-weight: 700;"><i class="fas fa-circle" style="font-size: 0.55rem;"></i> En Línea</span>
            </div>
          </div>
        </div>

        <button type="button" class="btn btn-sm btn-turquoise" id="btnToggleEditProfile" onclick="window.toggleEditProfileForm()" style="font-weight: 700; padding: 0.45rem 0.95rem; font-size: 0.85rem;">
          <i class="fas fa-pencil"></i> ${initialMode === 'edit' ? 'Cancelar Edición' : 'Editar Datos'}
        </button>
      </div>

      <!-- SECCIÓN 1: VISTA DE INFORMACIÓN DEL PERFIL -->
      <div id="profileViewSection" style="display: ${initialMode === 'edit' ? 'none' : 'block'};">
        <div style="background: var(--soft-blue); border-radius: 10px; padding: 1.15rem; margin-bottom: 1.25rem; font-size: 0.92rem; line-height: 1.8; border: 1px solid var(--border-color);">
          <div style="display: grid; grid-template-columns: 1fr; gap: 0.35rem;">
            <div><strong style="color: var(--dark-blue);"><i class="fas fa-envelope" style="width: 20px; color: var(--accent-turquoise);"></i> Correo:</strong> <span style="color: var(--text-dark);">${fullUser.email}</span></div>
            <div><strong style="color: var(--dark-blue);"><i class="fas fa-phone" style="width: 20px; color: var(--accent-turquoise);"></i> Teléfono:</strong> <span style="color: var(--text-dark);">${fullUser.phone || 'No registrado'}</span></div>
            <div><strong style="color: var(--dark-blue);"><i class="fas fa-id-card" style="width: 20px; color: var(--accent-turquoise);"></i> Identificación:</strong> <span style="color: var(--text-dark);">${fullUser.documentId ? ('C.C. ' + fullUser.documentId) : 'No registrada'}</span></div>
            ${isProf ? `
              <div><strong style="color: var(--dark-blue);"><i class="fas fa-graduation-cap" style="width: 20px; color: var(--accent-turquoise);"></i> Especialidad:</strong> <span style="color: var(--text-dark);">${fullUser.specialty || 'Derecho Laboral y Conciliación'}</span></div>
              <div><strong style="color: var(--dark-blue);"><i class="fas fa-certificate" style="width: 20px; color: var(--accent-turquoise);"></i> Tarjeta Profesional:</strong> <span style="color: var(--text-dark);">${fullUser.licenseNumber || 'TP-84920-CSJ'}</span></div>
              <div><strong style="color: var(--dark-blue);"><i class="fas fa-building-columns" style="width: 20px; color: var(--accent-turquoise);"></i> Entidad / Colegio:</strong> <span style="color: var(--text-dark);">${fullUser.institution || 'Colegio de Abogados de Córdoba'}</span></div>
              <div><strong style="color: var(--dark-blue);"><i class="fas fa-location-dot" style="width: 20px; color: var(--accent-turquoise);"></i> Ubicación:</strong> <span style="color: var(--text-dark);">${fullUser.city || 'Montería, Córdoba - Colombia'}</span></div>
              <div><strong style="color: var(--dark-blue);"><i class="fas fa-house" style="width: 20px; color: var(--accent-turquoise);"></i> Dirección:</strong> <span style="color: var(--text-dark);">${fullUser.address || 'Centro Jurídico Carrera 3 # 28-15'}</span></div>
            ` : `
              <div><strong style="color: var(--dark-blue);"><i class="fas fa-building-columns" style="width: 20px; color: var(--accent-turquoise);"></i> Entidad Formadora:</strong> <span style="color: var(--text-dark);">${fullUser.institution || 'Universidad Cooperativa de Colombia'}</span></div>
              <div><strong style="color: var(--dark-blue);"><i class="fas fa-location-dot" style="width: 20px; color: var(--accent-turquoise);"></i> Ubicación:</strong> <span style="color: var(--text-dark);">${fullUser.city || 'Montería, Córdoba - Colombia'}</span></div>
              <div><strong style="color: var(--dark-blue);"><i class="fas fa-house" style="width: 20px; color: var(--accent-turquoise);"></i> Dirección:</strong> <span style="color: var(--text-dark);">${fullUser.address || 'Barrio La Castellana, Calle 58 # 12-40'}</span></div>
            `}
          </div>
        </div>
      </div>

      <!-- SECCIÓN 2: FORMULARIO INTERACTIVO PARA EDITAR DATOS -->
      <div id="profileEditSection" style="display: ${initialMode === 'edit' ? 'block' : 'none'}; margin-bottom: 1.25rem;">
        <form onsubmit="event.preventDefault(); window.saveProfileChanges(this);" style="background: #ffffff; border: 2px solid var(--accent-turquoise); border-radius: 10px; padding: 1.15rem; display: flex; flex-direction: column; gap: 0.85rem; box-shadow: 0 4px 12px rgba(0,0,0,0.06);">
          <div style="font-weight: 700; color: var(--dark-blue); font-size: 0.95rem; margin-bottom: 0.2rem;">
            <i class="fas fa-user-pen" style="color: var(--accent-turquoise);"></i> Edita tus datos personales
          </div>

          <div class="form-group" style="margin: 0;">
            <label style="font-weight: 700; font-size: 0.82rem; color: var(--dark-blue); margin-bottom: 0.2rem; display: block;">Nombre Completo</label>
            <input type="text" id="editProfileName" class="form-control" value="${fullUser.name || ''}" required placeholder="Tu nombre">
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem;">
            <div class="form-group" style="margin: 0;">
              <label style="font-weight: 700; font-size: 0.82rem; color: var(--dark-blue); margin-bottom: 0.2rem; display: block;">Correo</label>
              <input type="email" id="editProfileEmail" class="form-control" value="${fullUser.email || ''}" required placeholder="correo@ejemplo.com">
            </div>
            <div class="form-group" style="margin: 0;">
              <label style="font-weight: 700; font-size: 0.82rem; color: var(--dark-blue); margin-bottom: 0.2rem; display: block;">Teléfono</label>
              <input type="tel" id="editProfilePhone" class="form-control" value="${fullUser.phone || ''}" placeholder="+57 310 123 4567">
            </div>
          </div>

          <div class="form-group" style="margin: 0;">
            <label style="font-weight: 700; font-size: 0.82rem; color: var(--dark-blue); margin-bottom: 0.2rem; display: block;">Documento (Cédula)</label>
            <input type="text" id="editProfileDocument" class="form-control" value="${fullUser.documentId || ''}" placeholder="Ej: 1.065.432.890">
          </div>

          ${isProf ? `
            <div class="form-group" style="margin: 0;">
              <label style="font-weight: 700; font-size: 0.82rem; color: var(--dark-blue); margin-bottom: 0.2rem; display: block;">Área de Especialidad</label>
              <input type="text" id="editProfileSpecialty" class="form-control" value="${fullUser.specialty || ''}" placeholder="Ej: Derecho Laboral, Familia, DDHH">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem;">
              <div class="form-group" style="margin: 0;">
                <label style="font-weight: 700; font-size: 0.82rem; color: var(--dark-blue); margin-bottom: 0.2rem; display: block;">Tarjeta Profesional</label>
                <input type="text" id="editProfileLicense" class="form-control" value="${fullUser.licenseNumber || ''}" placeholder="TP-84920-CSJ">
              </div>
              <div class="form-group" style="margin: 0;">
                <label style="font-weight: 700; font-size: 0.82rem; color: var(--dark-blue); margin-bottom: 0.2rem; display: block;">Entidad / Colegio</label>
                <input type="text" id="editProfileInstitution" class="form-control" value="${fullUser.institution || ''}" placeholder="Colegio de Abogados">
              </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem;">
              <div class="form-group" style="margin: 0;">
                <label style="font-weight: 700; font-size: 0.82rem; color: var(--dark-blue); margin-bottom: 0.2rem; display: block;">Ubicación / Ciudad</label>
                <input type="text" id="editProfileCity" class="form-control" value="${fullUser.city || 'Montería, Córdoba - Colombia'}" placeholder="Montería, Córdoba - Colombia">
              </div>
              <div class="form-group" style="margin: 0;">
                <label style="font-weight: 700; font-size: 0.82rem; color: var(--dark-blue); margin-bottom: 0.2rem; display: block;">Dirección</label>
                <input type="text" id="editProfileAddress" class="form-control" value="${fullUser.address || ''}" placeholder="Centro Jurídico Carrera 3 # 28-15">
              </div>
            </div>
          ` : `
            <div class="form-group" style="margin: 0;">
              <label style="font-weight: 700; font-size: 0.82rem; color: var(--dark-blue); margin-bottom: 0.2rem; display: block;">Entidad Formadora</label>
              <input type="text" id="editProfileInstitution" class="form-control" value="${fullUser.institution || 'Universidad Cooperativa de Colombia'}" placeholder="Ej: Universidad Cooperativa de Colombia">
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.65rem;">
              <div class="form-group" style="margin: 0;">
                <label style="font-weight: 700; font-size: 0.82rem; color: var(--dark-blue); margin-bottom: 0.2rem; display: block;">Ubicación / Ciudad</label>
                <input type="text" id="editProfileCity" class="form-control" value="${fullUser.city || 'Montería, Córdoba - Colombia'}" placeholder="Montería, Córdoba - Colombia">
              </div>
              <div class="form-group" style="margin: 0;">
                <label style="font-weight: 700; font-size: 0.82rem; color: var(--dark-blue); margin-bottom: 0.2rem; display: block;">Dirección</label>
                <input type="text" id="editProfileAddress" class="form-control" value="${fullUser.address || ''}" placeholder="Barrio La Castellana, Calle 58 # 12-40">
              </div>
            </div>
          `}

          <div style="display: flex; gap: 0.65rem; margin-top: 0.35rem;">
            <button type="submit" class="btn btn-turquoise" id="btnSaveProfile" style="flex: 2; padding: 0.7rem; font-weight: 700; font-size: 0.9rem;">
              <i class="fas fa-floppy-disk"></i> Guardar Cambios
            </button>
            <button type="button" class="btn btn-secondary" style="flex: 1; padding: 0.7rem; font-weight: 700; font-size: 0.9rem;" onclick="window.toggleEditProfileForm();">
              <i class="fas fa-xmark"></i> Cancelar
            </button>
          </div>
        </form>
      </div>

      <!-- SECCIÓN 3: ACTIVIDAD DINÁMICA DE SUS CASOS (SE ACTUALIZA CON SU GESTIÓN REAL) -->
      <div style="margin-bottom: 1.35rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
          <strong style="color: var(--dark-blue); font-size: 0.92rem;">
            <i class="fas fa-chart-line" style="color: var(--accent-turquoise);"></i> Actividad Real de tus Casos
          </strong>
          <span style="font-size: 0.75rem; color: var(--text-muted);">Actualizado en vivo</span>
        </div>

        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.5rem; text-align: center;">
          <div style="background: #ffffff; border: 1px solid var(--border-color); padding: 0.75rem 0.25rem; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
            <strong style="color: var(--primary-blue); font-size: 1.35rem; display: block; font-weight: 800;">${totalCasos}</strong>
            <small style="color: var(--text-muted); font-size: 0.72rem; font-weight: 700;">${isProf ? 'Asignados' : 'Radicados'}</small>
          </div>
          <div style="background: #ffffff; border: 1px solid var(--border-color); padding: 0.75rem 0.25rem; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
            <strong style="color: var(--accent-turquoise); font-size: 1.35rem; display: block; font-weight: 800;">${casosEnCurso}</strong>
            <small style="color: var(--text-muted); font-size: 0.72rem; font-weight: 700;">${isProf ? 'En Curso' : 'Activos'}</small>
          </div>
          <div style="background: #ffffff; border: 1px solid var(--border-color); padding: 0.75rem 0.25rem; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
            <strong style="color: #0284c7; font-size: 1.35rem; display: block; font-weight: 800;">${videollamadasCount}</strong>
            <small style="color: var(--text-muted); font-size: 0.72rem; font-weight: 700;">Videollamadas</small>
          </div>
          <div style="background: #ffffff; border: 1px solid var(--border-color); padding: 0.75rem 0.25rem; border-radius: 8px; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
            <strong style="color: #10b981; font-size: 1.35rem; display: block; font-weight: 800;">${casosFinalizados}</strong>
            <small style="color: var(--text-muted); font-size: 0.72rem; font-weight: 700;">Resueltos</small>
          </div>
        </div>

        <div style="margin-top: 0.65rem; background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 8px; padding: 0.5rem 0.75rem; font-size: 0.78rem; color: #065f46; display: flex; align-items: center; justify-content: center; gap: 0.5rem; font-weight: 600;">
          <i class="fas fa-shield-halved" style="color: #10b981;"></i> ODS 16: Tu caso cuenta con garantía de seguimiento y orientación institucional activa
        </div>
      </div>

      <!-- ACCIONES DE SESIÓN Y AUTENTICACIÓN SEGURA -->
      <div style="display: flex; flex-direction: column; gap: 0.65rem;">
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-primary" style="flex: 1; padding: 0.75rem; font-weight: 700; font-size: 0.9rem;" onclick="closeModal(); window.triggerLoginModal();">
            <i class="fas fa-arrow-right-to-bracket"></i> Iniciar Sesión
          </button>
          <button class="btn btn-outline" style="flex: 1; border-color: var(--accent-turquoise); color: var(--accent-turquoise); font-weight: 700; padding: 0.75rem; font-size: 0.9rem;" onclick="closeModal(); window.triggerRegisterModal();">
            <i class="fas fa-user-plus"></i> Registrarse
          </button>
        </div>

        <button class="btn btn-outline" style="width: 100%; border-color: #ef4444; color: #ef4444; font-weight: 700; padding: 0.75rem;" onclick="closeModal(); window.handleLogout();">
          <i class="fas fa-arrow-right-from-bracket"></i> Cerrar Sesión
        </button>
      </div>
    `);
  };

  // Alternar entre ver perfil y el formulario de edición integrado
  window.toggleEditProfileForm = () => {
    const viewSec = document.getElementById('profileViewSection');
    const editSec = document.getElementById('profileEditSection');
    const btn = document.getElementById('btnToggleEditProfile');

    if (!viewSec || !editSec) return;

    if (editSec.style.display === 'none' || editSec.style.display === '') {
      viewSec.style.display = 'none';
      editSec.style.display = 'block';
      if (btn) btn.innerHTML = '<i class="fas fa-xmark"></i> Cancelar';
    } else {
      viewSec.style.display = 'block';
      editSec.style.display = 'none';
      if (btn) btn.innerHTML = '<i class="fas fa-pencil"></i> Editar Datos';
    }
  };

  window.openEditProfileModal = () => {
    window.openProfileModal('edit');
  };

  // ==========================================================================
  // GUARDAR CAMBIOS DE PERFIL
  // ==========================================================================
  window.saveProfileChanges = async (form) => {
    const name = document.getElementById('editProfileName')?.value.trim();
    const email = document.getElementById('editProfileEmail')?.value.trim();
    const phone = document.getElementById('editProfilePhone')?.value.trim();
    const documentId = document.getElementById('editProfileDocument')?.value.trim();
    const specialty = document.getElementById('editProfileSpecialty')?.value.trim();
    const licenseNumber = document.getElementById('editProfileLicense')?.value.trim();
    const institution = document.getElementById('editProfileInstitution')?.value.trim();
    const city = document.getElementById('editProfileCity')?.value.trim();
    const address = document.getElementById('editProfileAddress')?.value.trim();
    const submitBtn = document.getElementById('btnSaveProfile');

    if (!name || !email) {
      showToast('Nombre y correo son requeridos.', 'warning');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Guardando cambios...';
    }

    try {
      const updates = {
        name,
        email,
        phone,
        documentId,
        specialty,
        licenseNumber,
        institution,
        city,
        address
      };

      const currentUser = state.currentUser;
      const targetId = currentUser?.email || email;

      let updatedUser = null;
      if (window.PuenteDB) {
        updatedUser = window.PuenteDB.users.update(targetId, updates);
      }

      if (!updatedUser) {
        updatedUser = { ...currentUser, ...updates };
        if (window.PuenteDB) window.PuenteDB.session.set(updatedUser);
      }

      // Sincronizar en segundo plano con el backend MySQL vía API
      try {
        fetch('backend/auth.php?action=update_profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...updates, oldEmail: currentUser?.email || email })
        }).catch(() => {});
      } catch (e) {}

      state.currentUser = updatedUser;
      if (window.PuenteDB) state.cases = window.PuenteDB.cases.getAll();

      // Refrescar vistas en vivo (header, cards, tablas)
      renderConditionalViews();

      showToast(`¡Perfil de ${updatedUser.name} actualizado con éxito!`, 'success');

      // Reabrir modal en modo visualización con datos actualizados
      setTimeout(() => {
        window.openProfileModal('view');
      }, 250);

    } catch (err) {
      showToast('Error al actualizar perfil: ' + err.message, 'warning');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-floppy-disk"></i> Guardar Cambios';
      }
    }
  };

  window.switchProfViewMode = (mode) => {
    state.profViewMode = mode;
    if (window.PuenteDB) {
      state.cases = window.PuenteDB.cases.getAll();
    }
    document.querySelectorAll('.prof-view-mode-btn').forEach(b => {
      if (b.dataset.mode === mode) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
    });
    renderProfessionalTable();
  };

  window.claimCaseForCurrentProf = async (caseId) => {
    const currentProf = state.currentUser;
    if (!currentProf || currentProf.role !== 'professional') {
      showToast('Debes ser un profesional para tomar un caso.', 'warning');
      return;
    }
    if (window.PuenteDB) {
      window.PuenteDB.cases.claim(caseId, currentProf.name, currentProf.email);
      state.cases = window.PuenteDB.cases.getAll();
    }
    try {
      const endpoint = (typeof window !== 'undefined' && window.PUENTE_CONFIG)
        ? window.PUENTE_CONFIG.getApiUrl('api/casos?action=claim')
        : '/api/casos?action=claim';
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId, profName: currentProf.name, profEmail: currentProf.email })
      });
    } catch (e) {}

    state.profViewMode = 'assigned';
    renderProfessionalTable();
    showToast(`¡Caso ${caseId} asignado a tu gestión exitosamente!`, 'success');
  };

  
  // ==========================================================================
  
  // ==========================================================================
  // FECHA ACTUAL DEL SISTEMA EN TIEMPO REAL (Formateada en español)
  // ==========================================================================
  window.updateSystemRealtimeDates = () => {
    try {
      const now = new Date();
      const fullOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
      let fullFormatted = now.toLocaleDateString('es-ES', fullOptions);
      if (fullFormatted) {
        fullFormatted = fullFormatted.charAt(0).toUpperCase() + fullFormatted.slice(1);
      } else {
        fullFormatted = now.toDateString();
      }

      const compactOptions = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' };
      let compactFormatted = now.toLocaleDateString('es-ES', compactOptions);
      if (compactFormatted) {
        compactFormatted = compactFormatted.replace(/\./g, '').trim();
        compactFormatted = compactFormatted.charAt(0).toUpperCase() + compactFormatted.slice(1);
      } else {
        compactFormatted = fullFormatted;
      }

      document.querySelectorAll('.agenda-date-badge, #agendaCurrentDateBadge, #currentSystemDateBadge').forEach(el => {
        el.textContent = fullFormatted;
      });

      document.querySelectorAll('.top-realtime-date').forEach(el => {
        el.textContent = compactFormatted;
      });
    } catch (e) {
      console.warn('[Fecha] Error formateando fecha actual:', e);
    }
  };

  // RENDERIZAR AGENDA DEL PROFESIONAL ("Mi agenda hoy")
  // ==========================================================================
  window.renderProfessionalAgenda = () => {
    if (typeof window.updateSystemRealtimeDates === 'function') {
      window.updateSystemRealtimeDates();
    }
    const list = document.getElementById('agendaEventsList');
    if (!list) return;

    const currentProf = state.currentUser;
    const profEmail = (currentProf?.email || '').toLowerCase().trim();
    const profName = (currentProf?.name || '').toLowerCase().trim();

    let events = [];
    if (window.PuenteDB?.agenda) {
      if (profEmail) {
        events = window.PuenteDB.agenda.getByProf(profEmail);
      }
      if ((!events || events.length === 0) && profName) {
        events = window.PuenteDB.agenda.getByProf(profName);
      }
    } else {
      events = (state.agenda || []).filter(e => {
        const pe = (e.profEmail || '').toLowerCase().trim();
        const pn = (e.profName || '').toLowerCase().trim();
        return (profEmail && pe === profEmail) || (profName && pn === profName);
      });
    }

    if (!events || events.length === 0) {
      list.innerHTML = `
        <div style="text-align: center; padding: 2rem 1rem; color: var(--text-muted);">
          <i class="fas fa-calendar-xmark" style="font-size: 2.2rem; color: #cbd5e1; margin-bottom: 0.75rem; display: block;"></i>
          <p style="margin: 0 0 0.5rem 0; font-weight: 600; color: var(--dark-blue);">No tienes videollamadas agendadas para hoy.</p>
          <small>Haz clic en <strong>"Programar video llamada"</strong> para registrar una nueva cita con uno de tus casos.</small>
        </div>
      `;
      return;
    }

    list.innerHTML = events.map(evt => {
      const isCall = evt.type === 'videocall' || !evt.type;
      const cid = evt.caseId || 'CAS-00138';
      const actionBtn = isCall 
        ? `<button class="btn btn-turquoise btn-sm" onclick="window.openVirtualRoom('${cid}')"><i class="fas fa-video"></i> Conectar</button>`
        : `<button class="btn btn-secondary btn-sm" onclick="window.openRoadmap('${cid}')"><i class="fas fa-file-contract"></i> Revisar</button>`;

      const citizenLabel = evt.citizenName ? ` (${evt.citizenName})` : '';
      const topicText = evt.topic || `Videollamada caso #${cid}${citizenLabel}`;

      return `
        <div class="agenda-event-row" id="agenda-row-${evt.id}">
          <span class="agenda-event-time">${evt.time || '09:00 a.m.'}</span>
          <span class="agenda-event-desc">${topicText}</span>
          ${actionBtn}
        </div>
      `;
    }).join('');
  };

  // ==========================================================================
  // MODAL: PROGRAMAR VIDEOLLAMADA (CARGA DINÁMICA DE CASOS Y CIUDADANOS REALES DE BD)
  // ==========================================================================
  window.openScheduleCallModal = async (preselectedCaseId = null) => {
    const user = state.currentUser || { name: 'Dra. Elena Gómez', role: 'professional', email: 'elena.gomez@asesores.org' };
    const isProf = user.role === 'professional';

    // 1. Obtener los casos reales y sincronizados más recientes de la base de datos
    if (window.PuenteDB?.syncCases) {
      try { await window.PuenteDB.syncCases(); } catch (e) {}
    }
    const allCases = (window.PuenteDB?.cases ? window.PuenteDB.cases.getAll() : state.cases) || [];

    // Fecha actual del sistema en tiempo real para el input
    const todayStrIso = new Date().toISOString().split('T')[0];

    // Hora sugerida inteligente (la hora actual más 1 hora redondeada)
    const curHour = new Date().getHours() + 1;
    const timeSuggestion = (curHour < 20 && curHour >= 8 ? String(curHour).padStart(2, '0') : '09') + ':00';

    if (isProf) {
      // 2. Extraer TODOS los ciudadanos reales únicos que tienen casos en la Base de Datos
      const citizenMap = new Map();

      // De los casos registrados
      allCases.forEach(c => {
        const name = (c.citizen || '').trim();
        if (!name) return;
        const email = (c.citizenEmail || '').trim().toLowerCase();
        const key = email || name.toLowerCase();

        if (!citizenMap.has(key)) {
          citizenMap.set(key, {
            name: name,
            email: email || (name.toLowerCase().replace(/[^a-z0-9]/g, '.') + '@ciudadano.org'),
            cases: []
          });
        }
        citizenMap.get(key).cases.push(c);
      });

      // De los usuarios registrados en la BD con rol ciudadano
      const regUsers = (window.PuenteDB?.users ? window.PuenteDB.users.getAll() : []) || [];
      regUsers.filter(u => u.role === 'citizen').forEach(u => {
        const key = (u.email || u.name).toLowerCase().trim();
        if (!citizenMap.has(key)) {
          citizenMap.set(key, {
            name: u.name,
            email: u.email,
            cases: allCases.filter(c => 
              (c.citizenEmail && c.citizenEmail.toLowerCase().trim() === u.email.toLowerCase().trim()) ||
              (c.citizen && c.citizen.toLowerCase().trim() === u.name.toLowerCase().trim())
            )
          });
        }
      });

      // Si no hay ciudadanos aún, agregar los de prueba por defecto
      if (citizenMap.size === 0) {
        citizenMap.set('mariana.sibaja@ejemplo.com', {
          name: 'Mariana Sibaja',
          email: 'mariana.sibaja@ejemplo.com',
          cases: allCases.filter(c => c.id === 'CAS-00138')
        });
      }

      // Si viene un caso preseleccionado, identificar su ciudadano para marcarlo
      const targetPreCase = preselectedCaseId ? allCases.find(c => c.id === preselectedCaseId) : null;

      let userOptionsHtml = '';
      for (const [key, cit] of citizenMap.entries()) {
        const cCount = cit.cases.length;
        const cList = cCount > 0 ? cit.cases.map(x => '#' + x.id).join(', ') : 'Sin expedientes';
        const isSelected = targetPreCase && (
          (targetPreCase.citizenEmail && targetPreCase.citizenEmail.toLowerCase().trim() === cit.email.toLowerCase().trim()) ||
          (targetPreCase.citizen && targetPreCase.citizen.toLowerCase().trim() === cit.name.toLowerCase().trim())
        );
        userOptionsHtml += `<option value="${cit.email}" data-name="${cit.name}" ${isSelected ? 'selected' : ''}>${cit.name} — (${cCount} caso(s): ${cList})</option>`;
      }

      openModal('Programar Nueva Cita / Videollamada', `
        <div style="background: var(--soft-blue); border-left: 4px solid var(--accent-turquoise); padding: 0.85rem 1rem; border-radius: 8px; margin-bottom: 1.25rem; font-size: 0.88rem; color: var(--dark-blue); line-height: 1.5;">
          <i class="fas fa-calendar-check" style="color: var(--accent-turquoise);"></i> 
          <strong>Agenda Profesional ODS 16:</strong> Selecciona el ciudadano y su expediente real consultado desde la base de datos para programar la atención.
        </div>

        <form onsubmit="event.preventDefault(); window.submitScheduleCall();" style="display: flex; flex-direction: column; gap: 0.95rem;">
          <div class="form-group" style="margin: 0;">
            <label style="font-weight: 700; font-size: 0.85rem; color: var(--dark-blue); margin-bottom: 0.35rem; display: block;">
              <i class="fas fa-users" style="color: var(--accent-turquoise);"></i> 1. Ciudadano(a) Registrado(a) en el Sistema:
            </label>
            <select id="scheduleUserSelect" class="form-control" style="font-weight: 700; color: var(--dark-blue);" onchange="window.updateScheduleCaseOptions()">
              ${userOptionsHtml}
            </select>
          </div>

          <div class="form-group" style="margin: 0;">
            <label style="font-weight: 700; font-size: 0.85rem; color: var(--dark-blue); margin-bottom: 0.35rem; display: block;">
              <i class="fas fa-folder-open" style="color: var(--accent-turquoise);"></i> 2. Caso o Expediente Real a Tratar:
            </label>
            <select id="scheduleCaseSelect" class="form-control" onchange="window.handleScheduleCaseChange()">
              <!-- Poblado dinámicamente con los casos reales del ciudadano y la BD -->
            </select>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
            <div class="form-group" style="margin: 0;">
              <label style="font-weight: 700; font-size: 0.85rem; color: var(--dark-blue); margin-bottom: 0.35rem; display: block;">
                <i class="fas fa-calendar-day" style="color: var(--accent-turquoise);"></i> 3. Fecha de la Cita:
              </label>
              <input type="date" id="scheduleCallDate" class="form-control" value="${todayStrIso}" min="${todayStrIso}" required>
            </div>

            <div class="form-group" style="margin: 0;">
              <label style="font-weight: 700; font-size: 0.85rem; color: var(--dark-blue); margin-bottom: 0.35rem; display: block;">
                <i class="fas fa-clock" style="color: var(--accent-turquoise);"></i> 4. Hora de la Cita:
              </label>
              <input type="time" id="scheduleCallTime" class="form-control" value="${timeSuggestion}" required>
            </div>
          </div>

          <!-- Botones de horarios sugeridos rápidos -->
          <div>
            <span style="font-size: 0.75rem; color: var(--text-muted); font-weight: 600; display: block; margin-bottom: 0.25rem;">Horarios rápidos disponibles:</span>
            <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
              <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('scheduleCallTime').value='09:00'">09:00 a.m.</button>
              <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('scheduleCallTime').value='10:30'">10:30 a.m.</button>
              <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('scheduleCallTime').value='14:00'">02:00 p.m.</button>
              <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('scheduleCallTime').value='15:30'">03:30 p.m.</button>
              <button type="button" class="btn btn-outline btn-sm" onclick="document.getElementById('scheduleCallTime').value='16:30'">04:30 p.m.</button>
            </div>
          </div>

          <div class="form-group" style="margin: 0;">
            <label style="font-weight: 700; font-size: 0.85rem; color: var(--dark-blue); margin-bottom: 0.35rem; display: block;">
              <i class="fas fa-bullseye" style="color: var(--accent-turquoise);"></i> 5. Motivo de la Consulta:
            </label>
            <select id="scheduleCallTopic" class="form-control">
              <option value="Orientación jurídica sobre hechos y derechos">Orientación jurídica sobre hechos y derechos</option>
              <option value="Revisión de pruebas documentales y anexos">Revisión de pruebas documentales y anexos</option>
              <option value="Preparación de conciliación / Inspección del Trabajo">Preparación de conciliación / Inspección del Trabajo</option>
              <option value="Seguimiento y cierre formal de hoja de ruta">Seguimiento y cierre formal de hoja de ruta</option>
            </select>
          </div>

          <div class="form-group" style="margin: 0;">
            <label style="font-weight: 700; font-size: 0.85rem; color: var(--dark-blue); margin-bottom: 0.35rem; display: block;">
              <i class="fas fa-note-sticky" style="color: var(--accent-turquoise);"></i> Notas o Instrucciones previas:
            </label>
            <input type="text" id="scheduleCallNotes" class="form-control" placeholder="Ej: Conectarse con documento de identidad y soportes del caso">
          </div>

          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 0.65rem 0.85rem; border-radius: 8px; font-size: 0.8rem; color: #166534; display: flex; align-items: center; gap: 0.5rem;">
            <i class="fas fa-video" style="color: #10b981; font-size: 1.1rem;"></i>
            <span>Se integrará automáticamente con el enlace directo y libre de Jitsi Meet (#CAS-[ID]).</span>
          </div>

          <div style="display: flex; gap: 0.75rem; margin-top: 0.5rem;">
            <button type="submit" class="btn btn-turquoise" id="btnSubmitSchedule" style="flex: 2; padding: 0.75rem; font-weight: 700; font-size: 0.95rem;">
              <i class="fas fa-calendar-plus"></i> Agendar y Programar Cita
            </button>
            <button type="button" class="btn btn-secondary" style="flex: 1; padding: 0.75rem; font-weight: 700;" onclick="closeModal()">
              <i class="fas fa-xmark"></i> Cancelar
            </button>
          </div>
        </form>
      `);

      setTimeout(() => {
        window.updateScheduleCaseOptions(preselectedCaseId);
      }, 50);

    } else {
      // Rama del Ciudadano: Elige profesional y su propio caso real
      const professionals = (window.PuenteDB?.users ? window.PuenteDB.users.getAll() : []).filter(u => u.role === 'professional');
      if (professionals.length === 0) {
        professionals.push({
          name: 'Dra. Elena Gómez',
          email: 'elena.gomez@asesores.org',
          specialty: 'Derecho Laboral y Seguridad Social'
        });
      }

      let profOptionsHtml = '';
      professionals.forEach(p => {
        profOptionsHtml += `<option value="${p.email}" data-name="${p.name}">${p.name} — ${p.specialty || 'Asesoría Jurídica'}</option>`;
      });

      const citEmail = (user.email || '').toLowerCase().trim();
      const citName = (user.name || '').toLowerCase().trim();
      const myCases = allCases.filter(c => 
        (c.citizenEmail && c.citizenEmail.toLowerCase().trim() === citEmail) ||
        (c.citizen && c.citizen.toLowerCase().trim() === citName)
      );

      let myCasesHtml = myCases.map(c => `<option value="${c.id}" ${preselectedCaseId === c.id ? 'selected' : ''}>#${c.id} - ${c.type} (${c.status})</option>`).join('');
      if (!myCasesHtml) {
        myCasesHtml = allCases.slice(0, 5).map(c => `<option value="${c.id}">#${c.id} - ${c.type} (${c.citizen})</option>`).join('');
      }

      openModal('Solicitar / Programar Cita Virtual', `
        <div style="background: var(--soft-blue); border-left: 4px solid var(--accent-turquoise); padding: 0.85rem 1rem; border-radius: 8px; margin-bottom: 1.25rem; font-size: 0.88rem; color: var(--dark-blue);">
          Agenda una sesión virtual de orientación gratuita con uno de nuestros asesores jurídicos verificados.
        </div>

        <form onsubmit="event.preventDefault(); window.submitScheduleCall();" style="display: flex; flex-direction: column; gap: 0.95rem;">
          <div class="form-group" style="margin: 0;">
            <label style="font-weight: 700; font-size: 0.85rem; color: var(--dark-blue); margin-bottom: 0.35rem; display: block;">
              <i class="fas fa-user-doctor" style="color: var(--accent-turquoise);"></i> Asesor(a) Jurídico(a) a consultar:
            </label>
            <select id="scheduleUserSelect" class="form-control" style="font-weight: 700; color: var(--dark-blue);">
              ${profOptionsHtml}
            </select>
          </div>

          <div class="form-group" style="margin: 0;">
            <label style="font-weight: 700; font-size: 0.85rem; color: var(--dark-blue); margin-bottom: 0.35rem; display: block;">
              <i class="fas fa-folder-open" style="color: var(--accent-turquoise);"></i> Tu caso o expediente:
            </label>
            <select id="scheduleCaseSelect" class="form-control">
              ${myCasesHtml}
            </select>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
            <div class="form-group" style="margin: 0;">
              <label style="font-weight: 700; font-size: 0.85rem; color: var(--dark-blue); margin-bottom: 0.35rem; display: block;">
                <i class="fas fa-calendar-day" style="color: var(--accent-turquoise);"></i> Fecha deseada:
              </label>
              <input type="date" id="scheduleCallDate" class="form-control" value="${todayStrIso}" min="${todayStrIso}" required>
            </div>

            <div class="form-group" style="margin: 0;">
              <label style="font-weight: 700; font-size: 0.85rem; color: var(--dark-blue); margin-bottom: 0.35rem; display: block;">
                <i class="fas fa-clock" style="color: var(--accent-turquoise);"></i> Hora:
              </label>
              <input type="time" id="scheduleCallTime" class="form-control" value="${timeSuggestion}" required>
            </div>
          </div>

          <div class="form-group" style="margin: 0;">
            <label style="font-weight: 700; font-size: 0.85rem; color: var(--dark-blue); margin-bottom: 0.35rem; display: block;">
              <i class="fas fa-bullseye" style="color: var(--accent-turquoise);"></i> Motivo de la Consulta:
            </label>
            <select id="scheduleCallTopic" class="form-control">
              <option value="Orientación jurídica sobre mi caso">Orientación jurídica sobre mi caso</option>
              <option value="Dudas sobre la Hoja de Ruta">Dudas sobre la Hoja de Ruta</option>
              <option value="Acompañamiento en trámite institucional">Acompañamiento en trámite institucional</option>
            </select>
          </div>

          <div style="display: flex; gap: 0.75rem; margin-top: 0.5rem;">
            <button type="submit" class="btn btn-turquoise" id="btnSubmitSchedule" style="flex: 2; padding: 0.75rem; font-weight: 700;">
              <i class="fas fa-calendar-plus"></i> Confirmar Cita Virtual
            </button>
            <button type="button" class="btn btn-secondary" style="flex: 1; padding: 0.75rem; font-weight: 700;" onclick="closeModal()">
              <i class="fas fa-xmark"></i> Cancelar
            </button>
          </div>
        </form>
      `);
    }
  };

  // Cargar dinámicamente los casos reales del ciudadano seleccionado
  window.updateScheduleCaseOptions = (preselectedCaseId = null) => {
    const userSel = document.getElementById('scheduleUserSelect');
    const caseSel = document.getElementById('scheduleCaseSelect');
    if (!userSel || !caseSel) return;

    const email = userSel.value.toLowerCase().trim();
    const selOption = userSel.options[userSel.selectedIndex];
    const name = selOption ? (selOption.dataset.name || '').toLowerCase().trim() : '';

    const allCases = (window.PuenteDB?.cases ? window.PuenteDB.cases.getAll() : state.cases) || [];

    // Casos pertenecientes al ciudadano seleccionado
    const userCases = allCases.filter(c => 
      (c.citizenEmail && c.citizenEmail.toLowerCase().trim() === email) ||
      (c.citizen && c.citizen.toLowerCase().trim() === name)
    );

    // Otros casos registrados en el sistema
    const otherCases = allCases.filter(c => !userCases.some(u => u.id === c.id));

    let html = '';

    if (userCases.length > 0) {
      html += `<optgroup label="Expedientes de este Ciudadano (${userCases.length})">`;
      html += userCases.map(c => `
        <option value="${c.id}" data-cit-name="${c.citizen}" data-cit-email="${c.citizenEmail || ''}" ${preselectedCaseId === c.id ? 'selected' : ''}>
          #${c.id} - ${c.type || c.subType || 'Caso'} (${c.status})
        </option>
      `).join('');
      html += `</optgroup>`;
    }

    if (otherCases.length > 0) {
      html += `<optgroup label="Otros Expedientes Registrados en BD">`;
      html += otherCases.map(c => `
        <option value="${c.id}" data-cit-name="${c.citizen}" data-cit-email="${c.citizenEmail || ''}" ${preselectedCaseId === c.id ? 'selected' : ''}>
          #${c.id} - ${c.type || c.subType || 'Caso'} (${c.citizen})
        </option>
      `).join('');
      html += `</optgroup>`;
    }

    html += `<option value="CAS-NUEVO">+ Nueva Orientación / Consulta General</option>`;

    caseSel.innerHTML = html;
  };

  // Sincronizar selección de ciudadano cuando se elija un caso de otro usuario
  window.handleScheduleCaseChange = () => {
    const userSel = document.getElementById('scheduleUserSelect');
    const caseSel = document.getElementById('scheduleCaseSelect');
    if (!userSel || !caseSel) return;

    const selOption = caseSel.options[caseSel.selectedIndex];
    if (!selOption) return;

    const citEmail = (selOption.dataset.citEmail || '').toLowerCase().trim();
    const citName = (selOption.dataset.citName || '').toLowerCase().trim();

    if (citEmail || citName) {
      for (let i = 0; i < userSel.options.length; i++) {
        const opt = userSel.options[i];
        if (
          (citEmail && opt.value.toLowerCase().trim() === citEmail) ||
          (citName && (opt.dataset.name || '').toLowerCase().trim() === citName)
        ) {
          userSel.selectedIndex = i;
          break;
        }
      }
    }
  };

  // Confirmar y registrar la videollamada agendada
  window.submitScheduleCall = () => {
    const user = state.currentUser || { name: 'Dra. Elena Gómez', role: 'professional', email: 'elena.gomez@asesores.org' };
    const isProf = user.role === 'professional';

    const userSel = document.getElementById('scheduleUserSelect');
    const caseSel = document.getElementById('scheduleCaseSelect');
    const dateInput = document.getElementById('scheduleCallDate');
    const timeInput = document.getElementById('scheduleCallTime');
    const topicSel = document.getElementById('scheduleCallTopic');
    const notesInput = document.getElementById('scheduleCallNotes');

    if (!userSel || !timeInput) return;

    const targetEmail = userSel.value;
    const targetOption = userSel.options[userSel.selectedIndex];
    const targetName = targetOption ? (targetOption.dataset.name || targetOption.text.split('—')[0].trim()) : 'Usuario';
    const caseId = caseSel ? caseSel.value : 'CAS-00138';
    const dateVal = dateInput?.value || '2026-09-01';
    const timeVal = timeInput?.value || '10:00';
    const topicVal = topicSel?.value || 'Orientación jurídica';
    const notesVal = notesInput?.value || '';

    // Convertir a formato 12 horas legible (ej: 14:00 -> 02:00 p.m.)
    const formatHour = (t) => {
      if (!t) return '10:00 a.m.';
      if (t.includes('a.m.') || t.includes('p.m.')) return t;
      const parts = t.split(':');
      let h = parseInt(parts[0], 10);
      const m = parts[1] || '00';
      const ampm = h >= 12 ? 'p.m.' : 'a.m.';
      h = h % 12;
      if (h === 0) h = 12;
      return `${h < 10 ? '0' + h : h}:${m} ${ampm}`;
    };

    const formattedTime = formatHour(timeVal);

    const newAppointment = {
      id: `EVT-${Date.now().toString().slice(-4)}`,
      profEmail: isProf ? user.email : targetEmail,
      profName: isProf ? user.name : targetName,
      citizenEmail: isProf ? targetEmail : user.email,
      citizenName: isProf ? targetName : user.name,
      caseId: caseId,
      type: 'videocall',
      time: formattedTime,
      date: dateVal,
      topic: `Videollamada caso #${caseId} (${isProf ? targetName : user.name} - ${topicVal})`,
      notes: notesVal,
      createdAt: new Date().toISOString()
    };

    if (window.PuenteDB?.agenda) {
      window.PuenteDB.agenda.add(newAppointment);
    }

    if (!state.agenda) state.agenda = [];
    state.agenda.unshift(newAppointment);

    // Actualizar también el caso en state.cases
    const targetCase = state.cases.find(c => c.id === caseId);
    if (targetCase) {
      targetCase.hasCall = true;
      targetCase.scheduledCallTime = formattedTime;
      targetCase.scheduledCallDate = dateVal;
      if (window.PuenteDB?.cases) {
        window.PuenteDB.cases.update(targetCase);
      }
    }

    closeModal();

    if (typeof window.renderProfessionalAgenda === 'function') {
      window.renderProfessionalAgenda();
    }

    showToast(`¡Videollamada programada con éxito con ${targetName} a las ${formattedTime}!`, 'success');

    const agendaCard = document.getElementById('cardAgendaProf');
    if (agendaCard && isProf) {
      agendaCard.scrollIntoView({ behavior: 'smooth' });
      agendaCard.style.boxShadow = '0 0 0 4px rgba(0, 168, 150, 0.4)';
      setTimeout(() => { agendaCard.style.boxShadow = ''; }, 1800);
    }
  };

  
  // ==========================================================================
  // PUENTE MESSENGER (ODS 16 - CHAT SEPARADO TIPO MESSENGER)
  // ==========================================================================
  state.activeMessengerCaseId = 'CAS-00138';
  state.activeMessengerContact = null;

  window.openMessenger = (initialCaseId = null, initialContactEmail = null) => {
    const modal = document.getElementById('messengerModal');
    if (!modal) return;

    const user = state.currentUser || { name: 'Mariana Sibaja', role: 'citizen', email: 'mariana.sibaja@ejemplo.com' };
    const isProf = user.role === 'professional';

    // Determinar caso inicial según el rol
    if (!initialCaseId) {
      if (isProf) {
        initialCaseId = 'CAS-00138';
      } else {
        const myCases = (state.cases || []).filter(c => 
          (c.citizenEmail && c.citizenEmail.toLowerCase() === user.email.toLowerCase()) ||
          (c.citizen && c.citizen.toLowerCase() === user.name.toLowerCase())
        );
        initialCaseId = myCases.length > 0 ? myCases[0].id : 'CAS-00138';
      }
    }

    state.activeMessengerCaseId = initialCaseId;

    // Renderizar lista de conversaciones
    window.renderMessengerConversations(initialCaseId);

    // Abrir modal
    modal.classList.add('active');
    modal.style.display = 'flex';

    // Enfocar input
    setTimeout(() => {
      document.getElementById('messengerTextInput')?.focus();
    }, 150);
  };

  window.closeMessengerModal = () => {
    const modal = document.getElementById('messengerModal');
    if (modal) {
      modal.classList.remove('active');
      modal.style.display = 'none';
    }
  };

  window.openMessagesModal = () => {
    window.openMessenger();
  };

    // Renderizar la lista dinamica y aislada de chats en Messenger (ODS 16)
  window.renderMessengerConversations = (activeCaseId) => {
    const listEl = document.getElementById('messengerConvoList');
    if (!listEl) return;

    const user = state.currentUser || { name: 'Mariana Sibaja', role: 'citizen', email: 'mariana.sibaja@ejemplo.com' };
    const isProf = user.role === 'professional';

    // Obtener conversaciones dinamicas estrictamente de los expedientes del usuario
    let convos = [];
    if (window.PuenteDB && typeof window.PuenteDB.messages.getConversationsForUser === 'function') {
      convos = window.PuenteDB.messages.getConversationsForUser(user);
    }

    if (convos.length === 0) {
      listEl.innerHTML = `
        <div style="padding: 2.5rem 1rem; text-align: center; color: var(--text-muted); font-size: 0.88rem;">
          <i class="fas fa-comments" style="font-size: 2.2rem; color: #cbd5e1; margin-bottom: 0.75rem; display: block;"></i>
          <strong style="color: var(--dark-blue); display: block; margin-bottom: 0.35rem;">No tienes conversaciones activas</strong>
          <span>${isProf ? 'Revisa "Casos Sin Asignar" para asignarte un expediente de la red ODS 16.' : 'Radica una situación para iniciar orientación con un profesional.'}</span>
        </div>
      `;
      // Limpiar cabecera activa si no hay chats
      const mActiveName = document.getElementById('mActiveName');
      const mActiveRole = document.getElementById('mActiveRole');
      const mActiveCaseTag = document.getElementById('mActiveCaseTag');
      if (mActiveName) mActiveName.textContent = 'Sin conversación seleccionada';
      if (mActiveRole) mActiveRole.textContent = 'Aislamiento de datos ODS 16';
      if (mActiveCaseTag) mActiveCaseTag.textContent = '#CAS-00000';
      const threadEl = document.getElementById('messengerMessagesThread');
      if (threadEl) {
        threadEl.innerHTML = `
          <div style="text-align: center; color: var(--text-muted); padding: 3rem 1rem;">
            <i class="fas fa-lock" style="font-size: 2rem; color: #94a3b8; margin-bottom: 0.75rem; display: block;"></i>
            Tus mensajes e historiales son completamente privados y exclusivos para tus expedientes.
          </div>
        `;
      }
      return;
    }

    const currentActiveId = activeCaseId || convos[0].caseId;
    const activeConvo = convos.find(c => c.caseId === currentActiveId) || convos[0];
    state.activeMessengerContact = activeConvo;
    state.activeMessengerCaseId = activeConvo.caseId;

    // Unirse a la sala de WebSockets para este caso
    if (window.PuenteDB && window.PuenteDB.realtime) {
      window.PuenteDB.realtime.joinCase(activeConvo.caseId, user);
    }

    listEl.innerHTML = convos.map(c => `
      <div class="messenger-convo-item ${c.caseId === activeConvo.caseId ? 'active' : ''}" 
           onclick="window.selectMessengerConversation('${c.caseId}', '${c.email}', '${c.name}', '${c.role}', '${c.caseTag}')">
        <div class="messenger-avatar-wrapper">
          <div class="messenger-avatar">${c.avatar}</div>
          <span class="messenger-online-indicator"></span>
        </div>
        <div class="messenger-convo-info">
          <div class="messenger-convo-top">
            <span class="messenger-convo-name">${c.name}</span>
            <span class="messenger-convo-time">${c.time}</span>
          </div>
          <div class="messenger-convo-preview">${c.lastMsg}</div>
        </div>
        ${c.unread ? `<span style="background: var(--accent-turquoise); color: #fff; border-radius: 50%; width: 18px; height: 18px; font-size: 0.65rem; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">${c.unread}</span>` : ''}
      </div>
    `).join('');

    // Actualizar cabecera activa
    const mActiveAvatar = document.getElementById('mActiveAvatar');
    const mActiveName = document.getElementById('mActiveName');
    const mActiveRole = document.getElementById('mActiveRole');
    const mActiveCaseTag = document.getElementById('mActiveCaseTag');

    if (mActiveAvatar) mActiveAvatar.textContent = activeConvo.avatar;
    if (mActiveName) mActiveName.textContent = activeConvo.name;
    if (mActiveRole) mActiveRole.textContent = activeConvo.role;
    if (mActiveCaseTag) mActiveCaseTag.textContent = activeConvo.caseTag;

    // Renderizar hilo de mensajes de esta conversacion
    window.renderMessengerThread(activeConvo.caseId);
  };

  // Seleccionar conversación
  window.selectMessengerConversation = (caseId, contactEmail, contactName, contactRole, caseTag) => {
    state.activeMessengerCaseId = caseId;
    state.activeMessengerContact = { caseId, email: contactEmail, name: contactName, role: contactRole, caseTag };

    // Unirse a la sala de Socket.io para este caso específico
    if (window.PuenteDB && window.PuenteDB.realtime) {
      window.PuenteDB.realtime.joinCase(caseId, state.currentUser);
    }

    // Sincronizar historial persistente desde el servidor
    if (window.PuenteDB && window.PuenteDB.messages && window.PuenteDB.messages.syncWithServer) {
      window.PuenteDB.messages.syncWithServer(caseId).then(() => {
        window.renderMessengerThread(caseId);
      });
    }

    window.renderMessengerConversations(caseId);
  };

  // Renderizar mensajes de la conversación activa
  window.renderMessengerThread = (caseId) => {
    const threadEl = document.getElementById('messengerMessagesThread');
    if (!threadEl) return;

    const user = state.currentUser || { name: 'Mariana Sibaja', role: 'citizen', email: 'mariana.sibaja@ejemplo.com' };
    const myEmail = (user.email || '').toLowerCase();
    const myName = (user.name || '').toLowerCase();

    const messages = window.PuenteDB?.messages.getByCase(caseId) || [];

    if (messages.length === 0) {
      threadEl.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 2rem;">
          <i class="fas fa-comment-dots" style="font-size: 2.5rem; color: #cbd5e1; margin-bottom: 0.75rem; display: block;"></i>
          Inicia la conversación segura con tu asesor(a) de orientación legal ODS 16.
        </div>
      `;
      return;
    }

    threadEl.innerHTML = messages.map(msg => {
      const isMine = (msg.senderEmail && msg.senderEmail.toLowerCase() === myEmail) ||
                     (msg.sender && msg.sender.toLowerCase().trim() === myName) ||
                     (msg.role === user.role);

      return `
        <div class="m-bubble ${isMine ? 'm-bubble-out' : 'm-bubble-in'}">
          <div style="font-size: 0.72rem; font-weight: 700; margin-bottom: 0.2rem; opacity: 0.85;">
            ${isMine ? 'Tú' : msg.sender}
          </div>
          <div>${msg.text}</div>
          <span class="m-bubble-time">${msg.time || ''}</span>
        </div>
      `;
    }).join('');

    // Scroll automático al último mensaje
    threadEl.scrollTop = threadEl.scrollHeight;
  };

    // Enviar mensaje en el Messenger (Bidireccional en Tiempo Real)
  window.sendMessengerMessage = async () => {
    const input = document.getElementById('messengerTextInput');
    if (!input) return;

    const text = input.value.trim();
    if (!text) return;

    const user = state.currentUser || { name: 'Mariana Sibaja', role: 'citizen', email: 'mariana.sibaja@ejemplo.com' };
    const caseId = state.activeMessengerCaseId || 'CAS-00138';

    const newMsg = {
      id: 'MSG-' + Date.now(),
      caseId: caseId,
      sender: user.name,
      senderEmail: user.email,
      role: user.role,
      text: text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      date: new Date().toISOString().split('T')[0]
    };

    input.value = '';

    // 1. Guardar de inmediato localmente
    if (window.PuenteDB?.messages) {
      window.PuenteDB.messages.insert(caseId, newMsg, true);
    }

    // 2. Guardar DIRECTAMENTE en el backend de Render con URL dinámica
    try {
      const endpoint = (typeof window !== 'undefined' && window.PUENTE_CONFIG)
        ? window.PUENTE_CONFIG.getApiUrl('api/mensajes')
        : '/api/mensajes';
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMsg)
      });
    } catch (err) {
      console.warn('[Messenger] Error enviando mensaje a BD:', err);
    }

    // Refrescar hilo de mensajes y lista de conversaciones localmente
    window.renderMessengerThread(caseId);
    window.renderMessengerConversations(caseId);
  };

  window.attachFileInMessenger = () => {
    showToast('Función de adjuntos ODS 16 activa: Puedes cargar documentos PDF, fotos de contratos o peticiones.', 'info');
  };

  // Iniciar videollamada directamente desde la conversación de Messenger
  
  // =========================================================================
  // SUSCRIPCION A EVENTOS EN TIEMPO REAL (SOCKET.IO + BROADCASTCHANNEL)
  // =========================================================================
  if (window.PuenteDB && window.PuenteDB.realtime) {
    window.PuenteDB.realtime.on('message', (msg) => {
      const user = state.currentUser;
      const myEmail = (user?.email || '').toLowerCase().trim();
      const myName = (user?.name || '').toLowerCase().trim();
      const isMine = (msg.senderEmail && msg.senderEmail.toLowerCase().trim() === myEmail) ||
                     (msg.sender && msg.sender.toLowerCase().trim() === myName);

      const normMsgCase = String(msg.caseId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const normActiveMsgCase = String(state.activeMessengerCaseId || '').toLowerCase().replace(/[^a-z0-9]/g, '');

      // 1. Si el messenger esta abierto en este caso, actualizar hilo en tiempo real
      if (normActiveMsgCase === normMsgCase) {
        window.renderMessengerThread(state.activeMessengerCaseId);
      }

      // 2. Si estamos dentro de la sala virtual de videollamada para este caso
      const normRoomCase = String(state.activeCaseIdForRoom || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normRoomCase === normMsgCase) {
        const vChatBox = document.getElementById('vroomChatMessages');
        if (vChatBox && !isMine) {
          const incMsg = document.createElement('div');
          incMsg.className = `chat-msg ${msg.role || 'citizen'}`;
          incMsg.innerHTML = `<strong>${msg.sender}:</strong><br>${msg.text}`;
          vChatBox.appendChild(incMsg);
          vChatBox.scrollTop = vChatBox.scrollHeight;
        }
      }

      // 3. Actualizar lista de conversaciones activas
      const mModal = document.getElementById('messengerModal');
      if (mModal && (mModal.classList.contains('active') || mModal.style.display === 'flex')) {
        window.renderMessengerConversations(state.activeMessengerCaseId);
      }

      // 4. Notificacion flotante sutil si el mensaje proviene de la contraparte
      if (!isMine) {
        showToast(`💬 Mensaje de ${msg.sender} en #${msg.caseId}: "${msg.text.substring(0, 35)}..."`, 'info');
      }
    });

    // Carga de historial sincronizada desde el servidor
    window.PuenteDB.realtime.on('history_loaded', () => {
      if (state.activeMessengerCaseId) {
        window.renderMessengerThread(state.activeMessengerCaseId);
        window.renderMessengerConversations(state.activeMessengerCaseId);
      }
    });

    // Indicador de escritura en tiempo real ("Está escribiendo...")
    window.PuenteDB.realtime.on('typing', ({ caseId, user, isTyping }) => {
      const normCase = String(caseId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const normActiveCase = String(state.activeMessengerCaseId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (normCase === normActiveCase) {
        const myEmail = (state.currentUser?.email || '').toLowerCase().trim();
        const isMine = user?.email && user.email.toLowerCase().trim() === myEmail;
        if (!isMine) {
          const roleEl = document.getElementById('mActiveRole');
          if (roleEl) {
            if (isTyping) {
              if (!roleEl.dataset.origText) roleEl.dataset.origText = roleEl.textContent;
              roleEl.innerHTML = `<span style="color: var(--accent-turquoise); font-style: italic;"><i class="fas fa-pencil-alt"></i> Escribiendo...</span>`;
            } else if (roleEl.dataset.origText) {
              roleEl.textContent = roleEl.dataset.origText;
            }
          }
        }
      }
    });
  }

  // Evento de escritura con debounce en el input de Messenger
  let typingDebounceTimer = null;
  document.getElementById('messengerTextInput')?.addEventListener('input', () => {
    if (window.PuenteDB?.realtime && state.activeMessengerCaseId) {
      window.PuenteDB.realtime.broadcastTyping(state.activeMessengerCaseId, state.currentUser, true);
      clearTimeout(typingDebounceTimer);
      typingDebounceTimer = setTimeout(() => {
        window.PuenteDB.realtime.broadcastTyping(state.activeMessengerCaseId, state.currentUser, false);
      }, 1400);
    }
  });

  window.startVideoFromMessenger = () => {
    const caseId = state.activeMessengerCaseId || 'CAS-00138';
    window.closeMessengerModal();
    window.openVirtualRoom(caseId);
  };

  // Filtrar lista de conversaciones
  window.filterMessengerList = (query) => {
    const q = (query || '').toLowerCase().trim();
    document.querySelectorAll('.messenger-convo-item').forEach(item => {
      const text = item.textContent.toLowerCase();
      item.style.display = text.includes(q) ? 'flex' : 'none';
    });
  };


  window.openInstitutionsModal = () => {
    openModal('Directorio de Instituciones Oficiales (ODS 16)', `
      <p style="color: var(--text-muted); font-size: 0.95rem; margin-bottom: 1rem;">
        Instituciones públicas aliadas para la atención de casos y trámites legales:
      </p>
      <div style="display: flex; flex-direction: column; gap: 0.85rem;">
        <div style="background: var(--soft-blue); padding: 0.85rem 1rem; border-radius: 8px; border-left: 4px solid var(--primary-blue);">
          <strong style="color: var(--dark-blue); font-size: 0.95rem;">Inspección del Trabajo (MinTrabajo)</strong><br>
          <small style="color: var(--text-dark);"><strong>Competencia:</strong> Despidos laborales, liquidaciones, salarios insolutos.</small><br>
          <small style="color: var(--text-muted);"><i class="fas fa-map-marker-alt"></i> Calle 28 # 4-50 | <i class="fas fa-phone"></i> Línea Gratuita 01 8000 112518</small>
        </div>
        <div style="background: var(--soft-blue); padding: 0.85rem 1rem; border-radius: 8px; border-left: 4px solid var(--accent-turquoise);">
          <strong style="color: var(--dark-blue); font-size: 0.95rem;">Comisaría de Familia</strong><br>
          <small style="color: var(--text-dark);"><strong>Competencia:</strong> Custodia, alimentos, régimen de visitas, violencia intrafamiliar.</small><br>
          <small style="color: var(--text-muted);"><i class="fas fa-map-marker-alt"></i> Centro de Convivencia, Calle 15 # 8-30 | <i class="fas fa-phone"></i> Línea 106</small>
        </div>
        <div style="background: var(--soft-blue); padding: 0.85rem 1rem; border-radius: 8px; border-left: 4px solid #10b981;">
          <strong style="color: var(--dark-blue); font-size: 0.95rem;">Personería Municipal</strong><br>
          <small style="color: var(--text-dark);"><strong>Competencia:</strong> Derechos de petición, quejas institucionales, vigilancia pública.</small><br>
          <small style="color: var(--text-muted);"><i class="fas fa-map-marker-alt"></i> Palacio Municipal, Carrera 3 # 12-20 | <i class="fas fa-phone"></i> (604) 789 2020</small>
        </div>
        <div style="background: var(--soft-blue); padding: 0.85rem 1rem; border-radius: 8px; border-left: 4px solid #8b5cf6;">
          <strong style="color: var(--dark-blue); font-size: 0.95rem;">Defensoría del Pueblo</strong><br>
          <small style="color: var(--text-dark);"><strong>Competencia:</strong> Acciones de Tutela urgente, vulneración de derechos fundamentales.</small><br>
          <small style="color: var(--text-muted);"><i class="fas fa-map-marker-alt"></i> Avenida Circunvalar # 32-15 | <i class="fas fa-phone"></i> Línea Nacional 01 8000 914814</small>
        </div>
      </div>
      <button class="btn btn-secondary" style="width: 100%; margin-top: 1.25rem;" onclick="closeModal()">Cerrar</button>
    `);
  };

  // ==========================================================================
  // 6. TABLES RENDERING (CIUDADANO Y PROFESIONAL)
  // ==========================================================================
  function renderCitizenTable() {
    const tableBody = document.getElementById('citizenDashboardTableBody');
    if (!tableBody) return;

    // FILTRADO ESTRICTO E INDEPENDIENTE: Solo los casos de este ciudadano específico
    const currentCitizen = state.currentUser;
    const currentEmail = (currentCitizen?.email || '').trim().toLowerCase();
    const currentName = (currentCitizen?.name || '').trim().toLowerCase();

    const myCases = state.cases.filter(c => {
      if (!currentCitizen) return false;
      const matchEmail = c.citizenEmail && c.citizenEmail.trim().toLowerCase() === currentEmail;
      const matchName = c.citizen && c.citizen.trim().toLowerCase() === currentName;
      return matchEmail || matchName;
    });

    if (myCases.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; padding: 3rem 1rem; color: var(--text-muted);">
            <i class="fas fa-folder-open" style="font-size: 2.5rem; margin-bottom: 0.85rem; display: block; opacity: 0.4; color: var(--primary-blue);"></i>
            <strong style="font-size: 1.1rem; color: var(--dark-blue); display: block; margin-bottom: 0.35rem;">No tienes casos registrados en tu cuenta actualmente.</strong>
            <span style="font-size: 0.9rem;">Utiliza la opción <strong>"Nueva Situación"</strong> en el menú lateral para radicar tu solicitud de orientación jurídica.</span>
          </td>
        </tr>
      `;
      return;
    }

    tableBody.innerHTML = myCases.map(c => `
      <tr>
        <td><strong style="color: var(--primary-blue);">${c.id}</strong></td>
        <td>
          <strong>${c.type}</strong><br>
          <small style="color: var(--text-muted);">${(c.subType || c.description).substring(0, 48)}...</small>
        </td>
        <td>
          <span class="status-badge ${getStatusBadgeClass(c.status)}" title="Estado actual de tu caso">
            ${c.status}
          </span>
        </td>
        <td>${c.date}</td>
        <td>
          <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
            <button class="btn btn-secondary btn-sm" onclick="window.viewCaseDetail('${c.id}')" title="Ver detalle">
              <i class="fas fa-eye"></i> Detalle
            </button>
            <button id="btnCitizenCall_${c.id.replace(/[^a-zA-Z0-9]/g, '')}" class="btn btn-turquoise btn-sm" onclick="window.openVirtualRoom('${c.id}')" title="Asesoría en vivo">
              <i class="fas fa-video"></i> Conectar
            </button>
            <button class="btn btn-primary btn-sm" onclick="window.openRoadmap('${c.id}')" title="Hoja de ruta">
              <i class="fas fa-file-contract"></i> Hoja de Ruta
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  function renderProfessionalTable() {
    const tableBody = document.getElementById('profDashboardTableBody');
    if (!tableBody) return;

    const currentProf = state.currentUser;
    if (!currentProf || currentProf.role !== 'professional') {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
            Por favor inicia sesión como profesional para consultar tus casos asignados.
          </td>
        </tr>
      `;
      return;
    }

    // FILTRADO ESTRICTO E INDEPENDIENTE: Cada profesional solo ve los casos que le fueron asignados a él
    const myAssignedCases = state.cases.filter(c => isCaseAssignedToProf(c, currentProf));

    // Casos sin asignar en la red ODS 16 (Detección rigurosa y completa)
    const unassignedCases = state.cases.filter(c => {
      if (!c) return false;
      const assigned = (c.assignedTo || c.profesional_asignado || '').trim().toLowerCase();
      return !assigned || assigned === 'por asignar' || assigned === 'sin asignar' || assigned === 'null' || assigned === 'undefined';
    });

    // Actualizar encabezado dinámico según modo
    const profTableHeading = document.getElementById('profTableHeading');
    if (profTableHeading) {
      if (state.profViewMode === 'unassigned') {
        profTableHeading.innerHTML = `<i class="fas fa-inbox" style="color: var(--accent-turquoise);"></i> Casos Sin Asignar (${unassignedCases.length})`;
      } else {
        profTableHeading.innerHTML = `<i class="fas fa-list-check" style="color: var(--accent-turquoise);"></i> Casos Asignados (${myAssignedCases.length})`;
      }
    }

    // Actualizar botones de modo con contador de badge en vivo
    document.querySelectorAll('.prof-view-mode-btn').forEach(b => {
      if (b.dataset.mode === state.profViewMode) {
        b.classList.add('active');
      } else {
        b.classList.remove('active');
      }
      if (b.dataset.mode === 'unassigned') {
        b.innerHTML = `<i class="fas fa-inbox"></i> Casos Sin Asignar <span class="badge" style="background: ${unassignedCases.length > 0 ? 'var(--accent-turquoise)' : '#94a3b8'}; color: white; border-radius: 9999px; padding: 2px 7px; font-size: 0.75rem; margin-left: 5px;">${unassignedCases.length}</span>`;
      }
    });

    // Métricas en tiempo real únicas para este profesional
    const pendingCount = myAssignedCases.filter(c => c.status === 'Pendiente').length;
    const inProgCount = myAssignedCases.filter(c => c.status === 'En curso').length;
    const completedCount = myAssignedCases.filter(c => c.status === 'Finalizado').length;

    // Actualizar números de las métricas superiores
    const metricPendingEl = document.querySelector('#metricCardPending .metric-number');
    if (metricPendingEl) metricPendingEl.textContent = pendingCount;
    const metricInProgEl = document.querySelector('#metricCardInProgress .metric-number');
    if (metricInProgEl) metricInProgEl.textContent = inProgCount;
    const metricCompletedEl = document.querySelector('#metricCardCompleted .metric-number');
    if (metricCompletedEl) metricCompletedEl.textContent = completedCount;

    // Actualizar botones de pestañas con contadores en tiempo real
    const tabAllEl = document.getElementById('tabProfAll');
    if (tabAllEl) tabAllEl.textContent = `Todos (${myAssignedCases.length})`;
    const tabPendEl = document.getElementById('tabProfPendientes');
    if (tabPendEl) tabPendEl.textContent = `Pendientes (${pendingCount})`;
    const tabInProgEl = document.getElementById('tabProfEnCurso');
    if (tabInProgEl) tabInProgEl.textContent = `En curso (${inProgCount})`;
    const tabFinEl = document.getElementById('tabProfFinalizados');
    if (tabFinEl) tabFinEl.textContent = `Finalizados (${completedCount})`;

    // Determinar qué lista renderizar según state.profViewMode
    let baseList = [];
    const isUnassignedMode = state.profViewMode === 'unassigned';

    if (isUnassignedMode) {
      baseList = unassignedCases;
    } else {
      baseList = myAssignedCases;
      if (state.profFilter !== 'all') {
        baseList = baseList.filter(c => c.status === state.profFilter);
      }
    }

    if (baseList.length === 0) {
      if (isUnassignedMode) {
        tableBody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align: center; padding: 3rem 1.5rem; color: var(--text-muted);">
              <i class="fas fa-check-circle" style="font-size: 2.4rem; color: #10b981; margin-bottom: 0.85rem; display: block; opacity: 0.8;"></i>
              <strong style="font-size: 1.1rem; color: var(--dark-blue); display: block; margin-bottom: 0.35rem;">No hay casos sin asignar pendientes en este momento.</strong>
              <p style="font-size: 0.88rem; margin-bottom: 1rem;">Todos los casos radicados en la red ya tienen un profesional orientador asignado.</p>
              <button class="btn btn-secondary btn-sm" onclick="window.switchProfViewMode('assigned')">
                <i class="fas fa-arrow-left"></i> Volver a Mis Casos Asignados
              </button>
            </td>
          </tr>
        `;
      } else {
        tableBody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align: center; padding: 3rem 1.5rem; color: var(--text-muted);">
              <i class="fas fa-folder-open" style="font-size: 2.4rem; margin-bottom: 0.85rem; display: block; opacity: 0.4; color: var(--accent-turquoise);"></i>
              <strong style="font-size: 1.1rem; color: var(--dark-blue); display: block; margin-bottom: 0.35rem;">
                No tienes casos asignados ${state.profFilter !== 'all' ? `con estado "${state.profFilter}"` : ''} en este momento.
              </strong>
              <p style="font-size: 0.88rem; margin-bottom: 1rem;">
                Los casos que atiendes son únicos e independientes para tu cuenta (${currentProf.name}).
              </p>
              ${unassignedCases.length > 0 ? `
                <button class="btn btn-turquoise btn-sm" onclick="window.switchProfViewMode('unassigned')">
                  <i class="fas fa-hand-holding-hand"></i> Ver ${unassignedCases.length} Casos Disponibles Sin Asignar
                </button>
              ` : ''}
            </td>
          </tr>
        `;
      }
      return;
    }

    tableBody.innerHTML = baseList.map(c => `
      <tr>
        <td><strong>${c.id}</strong></td>
        <td>${c.citizen}</td>
        <td>${c.type}</td>
        <td>
          <div class="status-badge-wrapper">
            <select class="status-badge-select ${getStatusBadgeClass(c.status)}" 
                    onchange="window.updateCaseStatus('${c.id}', this.value)" 
                    title="Clic para cambiar el estado del caso">
              <option value="Pendiente" ${c.status === 'Pendiente' ? 'selected' : ''}>Pendiente</option>
              <option value="En curso" ${c.status === 'En curso' ? 'selected' : ''}>En curso</option>
              <option value="Finalizado" ${c.status === 'Finalizado' ? 'selected' : ''}>Finalizado</option>
            </select>
            <button class="status-edit-btn" onclick="window.openEditStatusModal('${c.id}')" title="Editar estado y observaciones">
              <i class="fas fa-pencil"></i>
            </button>
          </div>
        </td>
        <td>${c.date}</td>
        <td>
          <div style="display: flex; gap: 0.35rem; flex-wrap: wrap;">
            ${isUnassignedMode ? `
              <button class="btn btn-turquoise btn-sm" onclick="window.claimCaseForCurrentProf('${c.id}')" title="Asignarme este caso para gestionarlo">
                <i class="fas fa-hand-holding-hand"></i> Asignarme Caso
              </button>
              <button class="btn btn-secondary btn-sm" onclick="window.viewCaseDetail('${c.id}')" title="Ver detalle de la solicitud">
                <i class="fas fa-eye"></i> Detalle
              </button>
            ` : `
              <button id="btnAtenderCase_${c.id.replace(/[^a-zA-Z0-9]/g, '')}" class="btn btn-turquoise btn-sm" onclick="window.openVirtualRoom('${c.id}')" title="Atender en vivo">
                <i class="fas fa-headset"></i> Atender
              </button>
              <button class="btn btn-secondary btn-sm" onclick="window.openRoadmap('${c.id}')" title="Emitir hoja de ruta">
                <i class="fas fa-file-signature"></i> Hoja de Ruta
              </button>
              <button class="btn btn-primary btn-sm" onclick="window.openEditStatusModal('${c.id}')" title="Cambiar estado">
                <i class="fas fa-pen-to-square"></i> Estado
              </button>
            `}
          </div>
        </td>
    `).join('');
  }

  window.filterProfCases = (filterType) => {
    state.profFilter = filterType;

    // Sincronizar botones de pestañas
    document.querySelectorAll('#profTableFilterTabs .btn-sm').forEach(btn => btn.classList.remove('active'));
    if (filterType === 'all') document.getElementById('tabProfAll')?.classList.add('active');
    if (filterType === 'Pendiente') document.getElementById('tabProfPendientes')?.classList.add('active');
    if (filterType === 'En curso') document.getElementById('tabProfEnCurso')?.classList.add('active');
    if (filterType === 'Finalizado') document.getElementById('tabProfFinalizados')?.classList.add('active');

    // Sincronizar tarjetas métricas superiores
    const cardPend = document.getElementById('metricCardPending');
    const cardProg = document.getElementById('metricCardInProgress');
    const cardFin = document.getElementById('metricCardCompleted');

    cardPend?.classList.remove('active-pending');
    cardProg?.classList.remove('active-in-progress', 'highlight');
    cardFin?.classList.remove('active-completed');

    if (filterType === 'Pendiente') cardPend?.classList.add('active-pending');
    if (filterType === 'En curso') cardProg?.classList.add('active-in-progress', 'highlight');
    if (filterType === 'Finalizado') cardFin?.classList.add('active-completed');

    renderProfessionalTable();
  };

  window.filterProfByCard = (cardType) => {
    // Si ya está activo ese filtro, hacer toggle a 'all'
    if (state.profFilter === cardType) {
      window.filterProfCases('all');
      showToast('Mostrando todos tus casos asignados.', 'info');
      return;
    }

    window.filterProfCases(cardType);

    if (cardType === 'Pendiente') {
      showToast('Filtrando por 8 Casos Pendientes de asignación o revisión.', 'warning');
    } else if (cardType === 'En curso') {
      showToast('Filtrando por 15 Casos en Curso con orientación activa.', 'info');
    } else if (cardType === 'Finalizado') {
      showToast('Filtrando por tus casos finalizados atendidos.', 'success');
    }

    // Desplazamiento suave hacia la tabla
    const tableSection = document.getElementById('profCasesTableSection');
    if (tableSection) {
      tableSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  function getStatusBadgeClass(status) {
    if (status === 'Finalizado') return 'completed';
    if (status === 'En curso') return 'in-progress';
    if (status === 'Pendiente') return 'pending';
    return '';
  }

  function getInstitutionByCategory(cat) {
    switch (cat) {
      case 'Problema laboral': return 'Inspección del Trabajo';
      case 'Conflicto familiar': return 'Comisaría de Familia';
      case 'Problema con institución': return 'Personería Municipal';
      case 'Derechos ciudadanos': return 'Defensoría del Pueblo';
      default: return 'Consultorio Jurídico';
    }
  }

  window.viewCaseDetail = (caseId) => {
    const targetCase = state.cases.find(c => c.id === caseId);
    if (!targetCase) return;
    const isProf = state.currentUser?.role === 'professional';
    openModal('Expediente ' + targetCase.id, `
      <p><strong>Ciudadano:</strong> ${targetCase.citizen}</p>
      <p><strong>Tipo:</strong> ${targetCase.type} (${targetCase.subType || 'General'})</p>
      <p><strong>Descripción:</strong> ${targetCase.description}</p>
      <p><strong>Estado:</strong> 
        <span class="status-badge ${getStatusBadgeClass(targetCase.status)}">${targetCase.status}</span>
        ${isProf ? `
        <button class="btn btn-secondary btn-sm" style="margin-left: 0.5rem;" onclick="closeModal(); window.openEditStatusModal('${targetCase.id}')">
          <i class="fas fa-pen"></i> Cambiar Estado
        </button>` : ''}
      </p>
      <p><strong>Profesional asignado:</strong> ${targetCase.assignedTo}</p>
      ${targetCase.observations ? `<p><strong>Observaciones registradas:</strong> <em>${targetCase.observations}</em></p>` : ''}
      <hr style="margin: 1rem 0; border: none; border-top: 1px solid var(--border-color);">
      <div style="background: var(--soft-blue); padding: 1rem; border-radius: 8px;">
        <strong>Entidad Oficial Competente:</strong><br>
        <span style="font-weight: 700; color: var(--primary-blue); font-size: 1.1rem;">${targetCase.institution}</span><br>
        <small>${targetCase.instAddress || ''}</small>
      </div>
      <div style="margin-top: 1.25rem; display: flex; gap: 0.5rem; justify-content: flex-end; flex-wrap: wrap;">
        <button class="btn btn-turquoise" onclick="closeModal(); window.openVirtualRoom('${targetCase.id}')">
          <i class="fas fa-video"></i> Ir a Sala Virtual
        </button>
        <button class="btn btn-primary" onclick="closeModal(); window.openRoadmap('${targetCase.id}')">
          <i class="fas fa-file-contract"></i> Abrir Hoja de Ruta
        </button>
      </div>
    `);
  };

  window.updateCaseStatus = (caseId, newStatus) => {
    if (state.currentUser?.role !== 'professional') {
      showToast('Acceso restringido: Solo los profesionales autorizados pueden modificar el estado del caso.', 'warning');
      return;
    }
    if (window.PuenteDB) {
      window.PuenteDB.cases.update(caseId, { status: newStatus });
      state.cases = window.PuenteDB.cases.getAll();
    } else {
      const targetCase = state.cases.find(c => c.id === caseId);
      if (targetCase) targetCase.status = newStatus;
    }
    renderCitizenTable();
    renderProfessionalTable();
    showToast(`Estado del caso #${caseId} actualizado en Base de Datos a "${newStatus}".`, 'success');
  };

  window.openEditStatusModal = (caseId) => {
    if (state.currentUser?.role !== 'professional') {
      showToast('Acceso restringido: Solo los profesionales autorizados pueden modificar el estado del caso.', 'warning');
      return;
    }
    const targetCase = state.cases.find(c => c.id === caseId);
    if (!targetCase) return;

    openModal(`Actualizar Estado: #${targetCase.id}`, `
      <div style="margin-bottom: 1.25rem; padding-bottom: 0.85rem; border-bottom: 1px solid var(--border-color);">
        <strong style="color: var(--dark-blue); font-size: 1.05rem;">${targetCase.citizen}</strong>
        <p style="color: var(--text-muted); font-size: 0.88rem; margin: 0.2rem 0 0;">
          <strong>Situación:</strong> ${targetCase.type} (${targetCase.subType || targetCase.description})
        </p>
      </div>

      <div class="form-group" style="margin-bottom: 1.25rem;">
        <label class="form-label" style="font-weight: 700; color: var(--dark-blue);">Selecciona el nuevo estado del expediente:</label>
        <div style="display: flex; flex-direction: column; gap: 0.65rem; margin-top: 0.5rem;">
          <label style="display: flex; align-items: center; gap: 0.75rem; background: #fef3c7; border: 1.5px solid #fde68a; padding: 0.75rem 1rem; border-radius: 8px; cursor: pointer;">
            <input type="radio" name="editCaseStatusRadio" value="Pendiente" ${targetCase.status === 'Pendiente' ? 'checked' : ''}>
            <div>
              <strong style="color: #b45309;">⏳ Pendiente</strong><br>
              <small style="color: #92400e;">En espera de asignación de especialista o revisión documental inicial.</small>
            </div>
          </label>

          <label style="display: flex; align-items: center; gap: 0.75rem; background: #e0f2fe; border: 1.5px solid #bae6fd; padding: 0.75rem 1rem; border-radius: 8px; cursor: pointer;">
            <input type="radio" name="editCaseStatusRadio" value="En curso" ${targetCase.status === 'En curso' ? 'checked' : ''}>
            <div>
              <strong style="color: #0369a1;">🔄 En curso</strong><br>
              <small style="color: #075985;">Orientación activa en videollamada, chat o preparación de Hoja de Ruta.</small>
            </div>
          </label>

          <label style="display: flex; align-items: center; gap: 0.75rem; background: #d1fae5; border: 1.5px solid #a7f3d0; padding: 0.75rem 1rem; border-radius: 8px; cursor: pointer;">
            <input type="radio" name="editCaseStatusRadio" value="Finalizado" ${targetCase.status === 'Finalizado' ? 'checked' : ''}>
            <div>
              <strong style="color: #047857;">✅ Finalizado</strong><br>
              <small style="color: #065f46;">Orientación completada satisfactoriamente y remitido a la entidad pública.</small>
            </div>
          </label>
        </div>
      </div>

      <div class="form-group" style="margin-bottom: 1.5rem;">
        <label class="form-label" style="font-weight: 700; color: var(--dark-blue);">Observaciones de la atención (Opcional):</label>
        <textarea id="editCaseObs" class="form-control" rows="3" placeholder="Registra las notas o avances de la asesoría brindada...">${targetCase.observations || ''}</textarea>
      </div>

      <div style="display: flex; justify-content: flex-end; gap: 0.75rem;">
        <button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-turquoise" onclick="window.saveCaseStatusModal('${targetCase.id}')">
          <i class="fas fa-check"></i> Guardar Cambios
        </button>
      </div>
    `);
  };

  window.saveCaseStatusModal = (caseId) => {
    if (state.currentUser?.role !== 'professional') {
      showToast('Acceso restringido: Solo los profesionales autorizados pueden modificar el estado del caso.', 'warning');
      return;
    }
    const selected = document.querySelector('input[name="editCaseStatusRadio"]:checked')?.value || 'En curso';
    const obs = document.getElementById('editCaseObs')?.value.trim();

    if (window.PuenteDB) {
      window.PuenteDB.cases.update(caseId, { status: selected, observations: obs });
      state.cases = window.PuenteDB.cases.getAll();
    } else {
      const targetCase = state.cases.find(c => c.id === caseId);
      if (targetCase) {
        targetCase.status = selected;
        if (obs) targetCase.observations = obs;
      }
    }
    renderCitizenTable();
    renderProfessionalTable();
    closeModal();
    showToast(`Estado del caso #${caseId} actualizado en Base de Datos a "${selected}".`, 'success');
  };

  // ==========================================================================
  // 7. LOGIN & REGISTRATION MODALS (AUTENTICACIÓN CON BASE DE DATOS PUENTEDB)
  // ==========================================================================
  // ==========================================================================
  // 7. AUTENTICACIÓN REAL (INICIAR SESIÓN Y REGISTRO)
  // ==========================================================================
  window.triggerLoginModal = (defaultRole = null) => {
    let roleBadge = '';
    let btnText = 'Iniciar Sesión';
    if (defaultRole === 'professional') {
      roleBadge = '<div style="background: var(--soft-blue); border-left: 4px solid var(--primary-blue); padding: 0.65rem 0.9rem; border-radius: 6px; margin-bottom: 1rem; font-size: 0.88rem; color: var(--dark-blue); font-weight: 600;"><i class="fas fa-user-tie"></i> Acceso para Profesionales y Asesores Jurídicos</div>';
      btnText = 'Iniciar Sesión como Profesional';
    } else if (defaultRole === 'citizen') {
      roleBadge = '<div style="background: var(--soft-blue); border-left: 4px solid var(--accent-turquoise); padding: 0.65rem 0.9rem; border-radius: 6px; margin-bottom: 1rem; font-size: 0.88rem; color: var(--dark-blue); font-weight: 600;"><i class="fas fa-user"></i> Acceso para Ciudadanos y Solicitantes</div>';
      btnText = 'Iniciar Sesión como Ciudadano';
    } else {
      roleBadge = '<div style="background: var(--soft-blue); border-left: 4px solid var(--accent-turquoise); padding: 0.65rem 0.9rem; border-radius: 6px; margin-bottom: 1rem; font-size: 0.88rem; color: var(--dark-blue); font-weight: 600;"><i class="fas fa-shield-halved" style="color: var(--accent-turquoise);"></i> Ingreso Seguro a Puente Ciudadano (ODS 16)</div>';
      btnText = 'Iniciar Sesión';
    }

    openModal('Iniciar Sesión - Puente Ciudadano', `
      ${roleBadge}
      <form onsubmit="event.preventDefault(); window.handleLoginFormSubmit(this);">
        <div class="form-group" style="margin-bottom: 1.1rem;">
          <label class="form-label" style="font-weight: 600;"><i class="fas fa-envelope" style="color: var(--primary-blue); margin-right: 0.35rem;"></i> Correo Electrónico</label>
          <input type="email" id="loginEmailInput" class="form-control" placeholder="usuario@correo.com" required autocomplete="email">
        </div>
        <div class="form-group" style="margin-bottom: 1.25rem;">
          <label class="form-label" style="font-weight: 600;"><i class="fas fa-lock" style="color: var(--primary-blue); margin-right: 0.35rem;"></i> Contraseña</label>
          <input type="password" id="loginPasswordInput" class="form-control" placeholder="••••••••" required autocomplete="current-password">
        </div>
        <button type="submit" class="btn btn-primary" id="btnSubmitLogin" style="width: 100%; padding: 0.75rem; font-size: 0.95rem; font-weight: 700;">
          <i class="fas fa-arrow-right-to-bracket"></i> ${btnText}
        </button>
      </form>

      <div style="margin-top: 1.25rem; padding-top: 0.85rem; border-top: 1px solid var(--border-color); text-align: center; font-size: 0.88rem; color: var(--text-muted);">
        ¿Aún no tienes una cuenta registrada? 
        <a href="javascript:void(0)" onclick="closeModal(); window.triggerRegisterModal('${defaultRole}');" style="color: var(--primary-blue); font-weight: 700; text-decoration: underline; margin-left: 0.25rem;">
          Regístrate gratis aquí
        </a>
      </div>
    `);
  };

    window.handleLoginFormSubmit = async (form) => {
    const email = document.getElementById('loginEmailInput')?.value.trim();
    const pass = document.getElementById('loginPasswordInput')?.value.trim();
    const submitBtn = document.getElementById('btnSubmitLogin');

    if (!email || !pass) {
      showToast('Por favor ingresa tu correo y contraseña.', 'warning');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Validando credenciales...';
    }

    try {
      // 1. Intentar autenticar contra MySQL en XAMPP si está activo
      if (window.PuenteDB && window.PuenteDB.mysql) {
        try {
          const mysqlRes = await window.PuenteDB.mysql.login(email, pass);
          if (mysqlRes && mysqlRes.success && mysqlRes.user) {
            state.currentUser = mysqlRes.user;
            window.PuenteDB.session.set(mysqlRes.user);
            closeModal();
            renderConditionalViews();
            showToast(`¡Bienvenido(a), ${mysqlRes.user.name}! Sesión iniciada con éxito.`, 'success');
            return;
          }
        } catch (e) {}
      }

      // 2. Si no responde MySQL o modo local, autenticar con la BD local
      if (window.PuenteDB) {
        const localUser = window.PuenteDB.users.authenticate(email, pass);
        if (localUser) {
          state.currentUser = localUser;
          window.PuenteDB.session.set(localUser);
          closeModal();
          renderConditionalViews();
          showToast(`¡Bienvenido(a), ${localUser.name}! Sesión iniciada con éxito.`, 'success');
          return;
        }
      }

      showToast('Correo electrónico o contraseña incorrectos.', 'warning');
    } catch (err) {
      showToast('Error al iniciar sesión: ' + err.message, 'warning');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-arrow-right-to-bracket"></i> Iniciar Sesión';
      }
    }
  };

  window.triggerRegisterModal = (preselectedRole = 'citizen') => {
    openModal('Crear Cuenta - Puente Ciudadano', `
      <form onsubmit="event.preventDefault(); window.handleRegisterFormSubmit(this);">
        <div class="form-group" style="margin-bottom: 1rem;">
          <label class="form-label" style="font-weight: 600;"><i class="fas fa-user" style="color: var(--accent-turquoise); margin-right: 0.35rem;"></i> Nombre Completo</label>
          <input type="text" id="regNameInput" class="form-control" placeholder="Ej: Mariana Sibaja" required autocomplete="name">
        </div>
        <div class="form-group" style="margin-bottom: 1rem;">
          <label class="form-label" style="font-weight: 600;"><i class="fas fa-id-card" style="color: var(--accent-turquoise); margin-right: 0.35rem;"></i> Tipo de Perfil</label>
          <select id="modalRegRole" class="form-control">
            <option value="citizen">Ciudadano (Consultar y radicar casos)</option>
            <option value="professional">Profesional Legal (Atención y asesoría)</option>
          </select>
        </div>
        <div class="form-group" style="margin-bottom: 1rem;">
          <label class="form-label" style="font-weight: 600;"><i class="fas fa-envelope" style="color: var(--accent-turquoise); margin-right: 0.35rem;"></i> Correo Electrónico</label>
          <input type="email" id="regEmailInput" class="form-control" placeholder="correo@ejemplo.com" required autocomplete="email">
        </div>
        <div class="form-group" style="margin-bottom: 1.25rem;">
          <label class="form-label" style="font-weight: 600;"><i class="fas fa-lock" style="color: var(--accent-turquoise); margin-right: 0.35rem;"></i> Contraseña</label>
          <input type="password" id="regPasswordInput" class="form-control" placeholder="Mínimo 6 caracteres" required autocomplete="new-password">
        </div>
        <button type="submit" class="btn btn-turquoise" id="btnSubmitRegister" style="width: 100%; padding: 0.75rem; font-size: 0.95rem;">
          <i class="fas fa-user-plus"></i> Registrarse e Ingresar
        </button>
      </form>

      <div style="margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid var(--border-color); text-align: center; font-size: 0.88rem; color: var(--text-muted);">
        ¿Ya tienes una cuenta registrada? 
        <a href="javascript:void(0)" onclick="closeModal(); window.triggerLoginModal();" style="color: var(--primary-blue); font-weight: 700; text-decoration: underline; margin-left: 0.25rem;">
          Inicia sesión aquí
        </a>
      </div>
    `);
  };

  window.handleRegisterFormSubmit = async (form) => {
    const name = document.getElementById('regNameInput')?.value.trim();
    const role = document.getElementById('modalRegRole')?.value || 'citizen';
    const email = document.getElementById('regEmailInput')?.value.trim();
    const password = document.getElementById('regPasswordInput')?.value.trim();
    const submitBtn = document.getElementById('btnSubmitRegister');

    if (!name || !email || !password) {
      showToast('Por favor completa todos los campos requeridos.', 'warning');
      return;
    }

    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando usuario...';
    }

    try {
      if (window.PuenteDB) {
        const newUser = window.PuenteDB.users.create({ name, email, password, role });
        state.currentUser = newUser;
        window.PuenteDB.session.set(newUser);
        closeModal();
        renderConditionalViews();
        showToast(`¡Cuenta creada con éxito! Bienvenido(a), ${newUser.name}.`, 'success');
      } else {
        window.setSession(role);
        closeModal();
      }
    } catch (err) {
      showToast(err.message || 'Error al registrar usuario.', 'warning');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-user-plus"></i> Registrarse e Ingresar';
      }
    }
  };

  // ==========================================================================
  // PANEL ADMINISTRADOR DE BASE DE DATOS LOCAL (PUENTEDB)
  // ==========================================================================
  window.openDatabaseAdminModal = () => {
    if (!window.PuenteDB) {
      showToast('Motor de base de datos no disponible.', 'warning');
      return;
    }

    const stats = window.PuenteDB.getStats();
    const activeSession = window.PuenteDB.session.get();

    openModal('Administrador de Base de Datos Local (PuenteDB)', `
      <div style="background: var(--soft-blue); border-left: 4px solid var(--accent-turquoise); padding: 0.85rem 1rem; border-radius: 8px; margin-bottom: 1.25rem;">
        <strong style="color: var(--dark-blue); font-size: 0.95rem;"><i class="fas fa-database"></i> Estado del Almacenamiento: ACTIVO</strong>
        <p style="font-size: 0.85rem; color: var(--text-dark); margin: 0.2rem 0 0;">
          Los datos se guardan de forma persistente en tu navegador (LocalStorage). Todos los cambios en expedientes, registros y estados se conservan al recargar o cerrar la pestaña.
        </p>
      </div>

      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.85rem; margin-bottom: 1.5rem;">
        <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: 8px; padding: 0.85rem; text-align: center;">
          <div style="font-size: 1.6rem; font-weight: 800; color: var(--primary-blue);">${stats.totalCases}</div>
          <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted);">Expedientes Guardados</div>
          <small style="color: var(--text-muted); font-size: 0.75rem;">${stats.pendingCases} pend. | ${stats.inProgressCases} en curso | ${stats.completedCases} fin.</small>
        </div>

        <div style="background: #ffffff; border: 1px solid var(--border-color); border-radius: 8px; padding: 0.85rem; text-align: center;">
          <div style="font-size: 1.6rem; font-weight: 800; color: #10b981;">${stats.totalUsers}</div>
          <div style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted);">Usuarios Registrados</div>
          <small style="color: var(--text-muted); font-size: 0.75rem;">${stats.citizensCount} ciudadanos | ${stats.professionalsCount} especialistas</small>
        </div>
      </div>

      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 0.85rem 1rem; margin-bottom: 1rem; font-size: 0.85rem;">
        <strong>Sesión activa en BD:</strong> ${activeSession ? `${activeSession.name} (${activeSession.role})` : 'Ninguna (Vista pública sin sesión)'}<br>
        <strong>Espacio utilizado en navegador:</strong> ${(stats.storageBytesUsed / 1024).toFixed(2)} KB
      </div>

      <div style="background: #ecfdf5; border: 1.5px solid #a7f3d0; border-radius: 8px; padding: 0.85rem 1rem; margin-bottom: 1.25rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
          <strong style="color: #065f46; font-size: 0.92rem;"><i class="fas fa-server"></i> Conexión MySQL / XAMPP</strong>
          <button class="btn btn-turquoise btn-sm" onclick="window.testMySQLInModal()" id="btnTestMySQL">
            <i class="fas fa-plug"></i> Probar Conexión
          </button>
        </div>
        <p id="mysqlStatusFeedback" style="font-size: 0.82rem; color: #047857; margin: 0.35rem 0 0;">
          Base de datos configurada: <strong>puente_ciudadano</strong> (MySQL localhost:3306). Clic para comprobar estado.
        </p>
      </div>

      <div style="display: flex; flex-direction: column; gap: 0.65rem;">
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-secondary btn-sm" style="flex: 1;" onclick="window.exportDatabaseBackup()">
            <i class="fas fa-download"></i> Descargar Copia (.JSON)
          </button>
          <button class="btn btn-secondary btn-sm" style="flex: 1;" onclick="window.promptImportDatabase()">
            <i class="fas fa-upload"></i> Restaurar Copia (.JSON)
          </button>
        </div>
        <button class="btn btn-outline btn-sm" style="color: #ef4444; border-color: #fca5a5;" onclick="window.resetDatabaseDefaults()">
          <i class="fas fa-rotate-left"></i> Restablecer Datos de Fábrica (Reset)
        </button>
      </div>

      <div style="margin-top: 1.25rem; display: flex; justify-content: flex-end;">
        <button class="btn btn-secondary" onclick="closeModal()">Cerrar</button>
      </div>
    `);
  };

  window.testMySQLInModal = async () => {
    const feedback = document.getElementById('mysqlStatusFeedback');
    const btn = document.getElementById('btnTestMySQL');
    if (feedback) feedback.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verificando conexión con MySQL XAMPP...';
    if (btn) btn.disabled = true;

    try {
      const res = await window.PuenteDB.mysql.testConnection();
      if (res && res.success) {
        if (feedback) {
          feedback.innerHTML = `✅ <strong>¡Conectado exitosamente con MySQL en XAMPP!</strong><br>Base de datos: <code>puente_ciudadano</code> | Casos en MySQL: <strong>${res.total_casos}</strong> | Usuarios: <strong>${res.total_usuarios}</strong>.`;
          feedback.style.color = '#047857';
        }
        showToast('¡Conexión exitosa con MySQL en XAMPP!', 'success');
      } else {
        if (feedback) {
          feedback.innerHTML = `⚠️ <strong>No se pudo conectar a MySQL:</strong> ${res.error || 'Servidor no iniciado'}.<br><small>Asegúrate de dar 'Start' a Apache y MySQL en XAMPP y ejecutar el archivo <code>database.sql</code> en phpMyAdmin.</small>`;
          feedback.style.color = '#b45309';
        }
        showToast('MySQL no responde. Inicia Apache y MySQL en XAMPP.', 'warning');
      }
    } catch (e) {
      if (feedback) {
        feedback.innerHTML = `⚠️ Error al conectar: ${e.message}`;
        feedback.style.color = '#dc2626';
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  window.exportDatabaseBackup = () => {
    if (!window.PuenteDB) return;
    const jsonStr = window.PuenteDB.exportJSON();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `puente_ciudadano_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Copia de seguridad descargada exitosamente en formato JSON.', 'success');
  };

  window.promptImportDatabase = () => {
    const jsonInput = prompt('Pega aquí el contenido JSON de la copia de seguridad que deseas importar:');
    if (!jsonInput) return;
    const res = window.PuenteDB.importJSON(jsonInput);
    if (res.success) {
      state.cases = window.PuenteDB.cases.getAll();
      renderCitizenTable();
      renderProfessionalTable();
      closeModal();
      showToast('Base de datos restaurada con éxito.', 'success');
    } else {
      showToast(res.message, 'warning');
    }
  };

  window.resetDatabaseDefaults = () => {
    if (confirm('¿Deseas restablecer todos los casos y usuarios a los valores originales de fábrica?')) {
      window.PuenteDB.resetToDefaults();
      state.cases = window.PuenteDB.cases.getAll();
      state.currentUser = null;
      renderConditionalViews();
      closeModal();
      showToast('Base de datos restablecida a los valores iniciales de fábrica.', 'info');
    }
  };

  // ==========================================================================
  // 8. WIZARD Y AI MATCHING (PÁGINA PÚBLICA)
  // ==========================================================================
  const wizardStep1 = document.getElementById('wizardStep1');
  const wizardStep2 = document.getElementById('wizardStep2');
  const wizardStep3 = document.getElementById('wizardStep3');
  const wStepIndicators = document.querySelectorAll('.w-step-item');
  const subcatChipsContainer = document.getElementById('subcatChipsContainer');

  const btnNextStep1 = document.getElementById('btnNextStep1');
  const btnPrevStep2 = document.getElementById('btnPrevStep2');
  const btnNextStep2 = document.getElementById('btnNextStep2');
  const btnPrevStep3 = document.getElementById('btnPrevStep3');
  const formWizard = document.getElementById('formWizardOrientation');

  function renderSubCategoryChips(category) {
    if (!subcatChipsContainer) return;
    const chips = subCategoriesData[category] || subCategoriesData['Problema laboral'];
    state.wizard.subCategory = chips[0];

    subcatChipsContainer.innerHTML = chips.map((chip, idx) => `
      <button type="button" class="chip-btn ${idx === 0 ? 'selected' : ''}" data-chip="${chip}">
        ${chip}
      </button>
    `).join('');

    subcatChipsContainer.querySelectorAll('.chip-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        subcatChipsContainer.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        state.wizard.subCategory = btn.getAttribute('data-chip');
      });
    });
  }

  document.querySelectorAll('.category-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.category-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      const cat = card.getAttribute('data-category');
      state.wizard.category = cat;
      renderSubCategoryChips(cat);
    });
  });

  function setWizardStep(stepNum) {
    state.wizard.step = stepNum;
    if (wizardStep1) wizardStep1.style.display = (stepNum === 1) ? 'block' : 'none';
    if (wizardStep2) wizardStep2.style.display = (stepNum === 2) ? 'block' : 'none';
    if (wizardStep3) wizardStep3.style.display = (stepNum === 3) ? 'block' : 'none';

    wStepIndicators.forEach(ind => {
      const s = parseInt(ind.getAttribute('data-wstep'));
      ind.classList.remove('active', 'completed');
      if (s === stepNum) ind.classList.add('active');
      else if (s < stepNum) ind.classList.add('completed');
    });

    if (stepNum === 3) {
      const box = document.getElementById('wizardSummaryBox');
      if (box) {
        box.innerHTML = `
          <div style="background: var(--soft-blue); padding: 0.85rem; border-radius: 6px; font-size: 0.88rem;">
            <strong>Resumen:</strong> ${state.wizard.category} (${state.wizard.subCategory})<br>
            <strong>Entidad asignada:</strong> ${getInstitutionByCategory(state.wizard.category)}
          </div>
        `;
      }
    }
  }

  btnNextStep1?.addEventListener('click', () => setWizardStep(2));
  btnPrevStep2?.addEventListener('click', () => setWizardStep(1));
  btnNextStep2?.addEventListener('click', () => {
    const desc = document.getElementById('caseDescription')?.value.trim();
    if (!desc) {
      showToast('Por favor describe tu caso brevemente.', 'warning');
      return;
    }
    state.wizard.description = desc;
    setWizardStep(3);
  });
  btnPrevStep3?.addEventListener('click', () => setWizardStep(2));

  if (formWizard) {
    formWizard.addEventListener('submit', (e) => {
      e.preventDefault();
      executeAIMatchingFlow();
    });
  }

  window.scrollToQuestionnaire = () => {
    document.getElementById('questionnaireSection')?.scrollIntoView({ behavior: 'smooth' });
  };

  const matchingModal = document.getElementById('matchingModal');
  const matchingContent = document.getElementById('matchingContent');

  function executeAIMatchingFlow() {
    if (!matchingModal || !matchingContent) return;
    matchingModal.classList.add('active');

    matchingContent.innerHTML = `
      <div class="radar-scan-box"><i class="fas fa-satellite-dish"></i></div>
      <h3 style="color: var(--dark-blue); margin-bottom: 0.5rem;">Analizando tu Caso</h3>
      <p style="color: var(--text-muted); font-size: 0.95rem;">Emparejamiento inteligente de Puente Ciudadano ODS 16</p>
      <div class="matching-steps-list" style="margin-top: 1.5rem; text-align: left;">
        <div class="matching-log-step active"><i class="fas fa-spinner fa-spin" style="color: var(--accent-turquoise);"></i> 1. Clasificando marco legal (${state.wizard.category})...</div>
      </div>
    `;

    setTimeout(() => {
      const newCaseId = `CAS-00${Math.floor(100 + Math.random() * 900)}`;
      const targetInst = getInstitutionByCategory(state.wizard.category);
      const instInfo = institutionsData[targetInst] || institutionsData['Inspección del Trabajo'];

      const newCaseRecord = {
        id: newCaseId,
        citizen: state.currentUser ? state.currentUser.name : 'Mariana Sibaja',
        citizenEmail: state.currentUser ? state.currentUser.email : 'mariana.sibaja@ejemplo.com',
        type: state.wizard.category,
        subType: state.wizard.subCategory,
        description: state.wizard.description,
        status: 'Pendiente', // Estado inicial correcto: Pendiente
        assignedTo: 'Por asignar', // Sin asignar para que aparezca en bandeja de profesionales
        assignedToEmail: '',
        date: new Date().toISOString().split('T')[0],
        institution: targetInst,
        instAddress: instInfo.address,
        instPhone: instInfo.phone,
        instHours: instInfo.hours,
        checklist: instInfo.checklist
      };

      if (window.PuenteDB) {
        window.PuenteDB.cases.insert(newCaseRecord);
        state.cases = window.PuenteDB.cases.getAll();
      } else {
        state.cases.unshift(newCaseRecord);
      }

      renderCitizenTable();
      renderProfessionalTable();

      matchingContent.innerHTML = `
        <div class="match-result-box">
          <div style="width: 52px; height: 52px; border-radius: 50%; background: #10b981; color: #fff; margin: 0 auto 0.75rem; display: flex; align-items: center; justify-content: center; font-size: 1.6rem;"><i class="fas fa-check"></i></div>
          <h3 style="color: #065f46; margin-bottom: 0.25rem;">¡Situación Radicada Exitosamente!</h3>
          <p style="font-size: 0.95rem; color: #047857; margin-bottom: 1rem;">Expediente registrado en la red ODS 16 con código <strong>${newCaseId}</strong></p>
          <div style="background: #ffffff; border: 1px solid #a7f3d0; border-radius: 8px; padding: 0.85rem; text-align: left; margin-bottom: 1rem; font-size: 0.88rem;">
            <strong>Estado:</strong> <span class="status-badge status-pending" style="font-size: 0.78rem; padding: 2px 7px; border-radius: 4px;">Pendiente</span> (Disponible en casos sin asignar)<br>
            <strong>Entidad competente:</strong> ${targetInst}<br>
            <strong>Asignación:</strong> Un profesional orientador tomará tu caso a la brevedad.
          </div>
          <button class="btn btn-turquoise" style="width: 100%; margin-bottom: 0.5rem;" onclick="document.getElementById('matchingModal').classList.remove('active'); window.setSession('citizen'); window.openRoadmap('${newCaseId}');">
            <i class="fas fa-file-contract"></i> Ver Hoja de Ruta Oficial
          </button>
          <button class="btn btn-outline" style="width: 100%;" onclick="document.getElementById('matchingModal').classList.remove('active'); window.setSession('citizen'); window.openVirtualRoom('${newCaseId}');">
            <i class="fas fa-video"></i> Ir a Sala Virtual de Orientación
          </button>
        </div>
      `;

      showToast(`¡Caso ${newCaseId} radicado con éxito!`, 'success');
      formWizard?.reset();
      setWizardStep(1);
    }, 2000);
  }

  // ==========================================================================
  // 9. SALA VIRTUAL DAILY.CO Y HOJA DE RUTA (WEBRTC EN VIVO MULTIDISPOSITIVO)
  // ==========================================================================
  const virtualRoomModal = document.getElementById('virtualRoomModal');
  const vRoomTitle = document.getElementById('vRoomTitle');
  const vRoomSubtitle = document.getElementById('vRoomSubtitle');
  const vRoomClose = document.getElementById('vRoomClose');
  const btnEmitRoadmapFromRoom = document.getElementById('btnEmitRoadmapFromRoom');
  const dailyRoomLabel = document.getElementById('dailyRoomLabel');
  const dailyRoomUrlText = document.getElementById('dailyRoomUrlText');
  const btnCopyDailyUrl = document.getElementById('btnCopyDailyUrl');
  const vroomCamToggle = document.getElementById('vroomCamToggle');
  const vroomMicToggle = document.getElementById('vroomMicToggle');
  const vroomShareToggle = document.getElementById('vroomShareToggle');
  const vroomEndCall = document.getElementById('vroomEndCall');

  state.dailyCallFrame = null;
  state.p2pPeerConnection = null;
  state.remoteMediaStream = null;
  state.isAudioMuted = false;
  state.isVideoOff = false;
  state.isScreenSharing = false;

  // Manejo de pistas de audio y video remotas en Daily.co
  function handleRemoteDailyTrack(event) {
    const track = event.track;
    const participant = event.participant;
    if (!track || !participant) return;

    console.log('[Daily.co WebRTC] Procesando pista remota:', track.kind, 'de:', participant.user_name);

    if (track.kind === 'audio') {
      let audioEl = document.getElementById('dailyRemoteAudio_' + participant.session_id);
      if (!audioEl) {
        audioEl = document.createElement('audio');
        audioEl.id = 'dailyRemoteAudio_' + participant.session_id;
        audioEl.autoplay = true;
        audioEl.playsinline = true;
        audioEl.style.display = 'none';
        document.body.appendChild(audioEl);
      }
      audioEl.srcObject = new MediaStream([track]);
      audioEl.play().catch(e => console.warn('[Daily.co] Autoplay audio restringido:', e));
    }
  }

  function handleRemoteDailyTrackStopped(event) {
    const participant = event.participant;
    if (!participant) return;
    if (event.track?.kind === 'audio') {
      const audioEl = document.getElementById('dailyRemoteAudio_' + participant.session_id);
      if (audioEl) {
        try { audioEl.srcObject = null; audioEl.remove(); } catch (e) {}
      }
    }
  }

  // Actualizar indicadores visuales de participantes en la sala
  function updateDailyRoomParticipantCount(callFrame) {
    if (!callFrame) return;
    try {
      const participants = callFrame.participants();
      const count = Object.keys(participants).length;
      const countBadge = document.getElementById('vroomParticipantBadge');
      if (countBadge) {
        countBadge.textContent = count + ' en sala';
      }
    } catch (e) {}
  }

  // ==========================================================================
  // WEBRTC P2P FALLBACK (CONEXION REAL DE AUDIO Y VIDEO ENTRE NAVEGADORES)
  // Permite que Ciudadano y Profesional se vean y escuchen en vivo si la sala
  // de Daily cloud no estuviera aprovisionada con clave privada.
  // ==========================================================================
  function mountWebRtcExperience(mount, targetCase, userName, isProf, roomUrl) {
    if (!mount) return;
    if (state.callTimerInterval) {
      clearInterval(state.callTimerInterval);
      state.callTimerInterval = null;
    }

    state.callSeconds = 0;
    const counterpartName = isProf ? (targetCase.citizen || 'Mariana Sibaja') : (targetCase.assignedTo || 'Dra. Elena Gómez');
    const counterpartRole = isProf ? 'Ciudadana Solicitante' : 'Asesora Verificada ODS 16';
    const counterpartAvatar = isProf ? 'M' : 'EG';

    mount.innerHTML = `
      <div class="daily-active-room" style="position: relative; width: 100%; height: 100%; min-height: 0; flex: 1; background: #090d16; border-radius: 8px; overflow: hidden; display: flex; flex-direction: column;">
        <!-- Barra de Estado Superior -->
        <div style="position: absolute; top: 12px; left: 14px; right: 14px; z-index: 10; display: flex; justify-content: space-between; align-items: center; pointer-events: none;">
          <div style="display: flex; align-items: center; gap: 8px; background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(8px); padding: 5px 12px; border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.1);">
            <div style="width: 10px; height: 10px; border-radius: 50%; background: #10b981; box-shadow: 0 0 8px #10b981; animation: pulse 1.5s infinite;"></div>
            <span style="font-weight: 700; font-size: 0.75rem; color: #fff; letter-spacing: 0.5px;">EN VIVO</span>
            <span id="sandboxCallTimer" style="font-family: monospace; font-size: 0.78rem; color: #38bdf8; font-weight: 600;">00:00</span>
          </div>
          <div style="background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(8px); padding: 5px 12px; border-radius: 20px; font-size: 0.72rem; color: #10b981; border: 1px solid rgba(16, 185, 129, 0.25); display: flex; align-items: center; gap: 5px;">
            <i class="fas fa-shield-alt"></i> WebRTC P2P Cifrado ODS 16
          </div>
        </div>

        <!-- Banner de Sesión Activa -->
        <div style="position: absolute; top: 52px; left: 14px; right: 14px; z-index: 10; background: rgba(30, 41, 59, 0.9); border: 1px solid #0284c7; padding: 6px 12px; border-radius: 6px; font-size: 0.72rem; color: #e2e8f0; display: flex; align-items: center; gap: 8px;">
          <i class="fas fa-video" style="color: #38bdf8; font-size: 0.9rem;"></i>
          <span><strong>Orientación en Vivo Activa:</strong> Canal directo para el caso <strong>#${targetCase.id}</strong> entre <strong>${targetCase.citizen}</strong> y <strong>${targetCase.assignedTo || 'Profesional Asignado'}</strong>.</span>
        </div>

        <!-- Área Principal de Video (Remoto de la Contraparte) -->
        <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; position: relative; background: radial-gradient(circle at center, #1e293b 0%, #090d16 100%); overflow: hidden;">
          <!-- Video Remoto en Vivo (se muestra automáticamente al conectar la contraparte) -->
          <video id="sandboxRemoteVideo" autoplay playsinline style="position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; display: none; z-index: 1;"></video>

          <!-- Placeholder de Espera / Avatar de la Contraparte -->
          <div id="sandboxAvatarPlaceholder" style="display: flex; flex-direction: column; align-items: center; gap: 12px; z-index: 2;">
            <div style="position: relative;">
              <div style="width: 90px; height: 90px; border-radius: 50%; background: linear-gradient(135deg, #0ea5e9, #0284c7); display: flex; align-items: center; justify-content: center; font-size: 2rem; font-weight: 800; color: #fff; box-shadow: 0 0 25px rgba(14, 165, 233, 0.35); border: 3px solid #38bdf8;">
                ${counterpartAvatar}
              </div>
              <div style="position: absolute; bottom: 2px; right: 2px; width: 20px; height: 20px; border-radius: 50%; background: #10b981; border: 2px solid #090d16; display: flex; align-items: center; justify-content: center; font-size: 0.6rem; color: #fff;">
                <i class="fas fa-microphone"></i>
              </div>
            </div>
            <div style="text-align: center;">
              <h5 style="margin: 0; color: #ffffff; font-size: 1.05rem; font-weight: 700;">${counterpartName}</h5>
              <span id="sandboxRemoteStatus" style="font-size: 0.75rem; color: #38bdf8;">${counterpartRole} (Esperando enlace de video...)</span>
            </div>
            <!-- Visualizador de actividad -->
            <div style="display: flex; gap: 4px; align-items: center; height: 18px; margin-top: 4px;">
              <span style="width: 4px; height: 8px; background: #38bdf8; border-radius: 2px; animation: soundWave 1.2s infinite ease-in-out;"></span>
              <span style="width: 4px; height: 16px; background: #38bdf8; border-radius: 2px; animation: soundWave 0.8s infinite ease-in-out;"></span>
              <span style="width: 4px; height: 12px; background: #38bdf8; border-radius: 2px; animation: soundWave 1.4s infinite ease-in-out;"></span>
              <span style="width: 4px; height: 18px; background: #38bdf8; border-radius: 2px; animation: soundWave 1.0s infinite ease-in-out;"></span>
              <span style="width: 4px; height: 6px; background: #38bdf8; border-radius: 2px; animation: soundWave 1.3s infinite ease-in-out;"></span>
            </div>
          </div>

          <!-- Ventana PiP del Participante Local -->
          <div id="sandboxLocalPip" style="position: absolute; bottom: 16px; right: 16px; width: 140px; height: 105px; background: #1e293b; border-radius: 8px; border: 2px solid #38bdf8; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.6); z-index: 5;">
            <video id="sandboxLocalVideo" autoplay playsinline muted style="width: 100%; height: 100%; object-fit: cover; display: none;"></video>
            <div id="sandboxLocalAvatarPlaceholder" style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;">
              <div style="width: 34px; height: 34px; border-radius: 50%; background: #00a896; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; font-weight: 700;">
                ${isProf ? 'EG' : 'M'}
              </div>
              <span style="font-size: 0.65rem; color: #94a3b8; font-weight: 600;">Tú</span>
            </div>
          </div>
        </div>
      </div>
    `;

    // 1. Inicializar conexión WebRTC P2P con servidores STUN públicos de Google
    const rtcConfig = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    };
    const pc = new RTCPeerConnection(rtcConfig);
    state.p2pPeerConnection = pc;

    // Manejo de pistas remotas recibidas por WebRTC
    pc.ontrack = (event) => {
      console.log('[WebRTC P2P] Pista remota recibida:', event.track.kind);
      const remoteVideo = document.getElementById('sandboxRemoteVideo');
      const avatarPh = document.getElementById('sandboxAvatarPlaceholder');
      if (remoteVideo && event.streams[0]) {
        state.remoteMediaStream = event.streams[0];
        remoteVideo.srcObject = event.streams[0];
        remoteVideo.style.display = 'block';
        if (avatarPh) avatarPh.style.display = 'none';
        showToast('🎥 ¡Transmisión de video en vivo conectada con la contraparte!', 'success');
      }
    };

    // Envío de candidatos ICE a través de Socket.io
    pc.onicecandidate = (event) => {
      if (event.candidate && window.PuenteDB?.realtime?.socket) {
        window.PuenteDB.realtime.socket.emit('webrtc_ice_candidate', {
          caseId: targetCase.id,
          candidate: event.candidate,
          sender: userName
        });
      }
    };

    // 2. Activar cámara y micrófono local
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        .then(stream => {
          state.localMediaStream = stream;
          const v = document.getElementById('sandboxLocalVideo');
          const ph = document.getElementById('sandboxLocalAvatarPlaceholder');
          if (v && ph) {
            v.srcObject = stream;
            v.style.display = 'block';
            ph.style.display = 'none';
          }

          // Añadir pistas locales al PeerConnection
          stream.getTracks().forEach(track => pc.addTrack(track, stream));

          // Si es el profesional o ya hay alguien en la sala, iniciar la oferta
          if (isProf && window.PuenteDB?.realtime?.socket) {
            setTimeout(async () => {
              try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                window.PuenteDB.realtime.socket.emit('webrtc_offer', {
                  caseId: targetCase.id,
                  offer: offer,
                  sender: userName
                });
              } catch (e) {
                console.warn('[WebRTC P2P] Error creando oferta:', e);
              }
            }, 1000);
          }
        })
        .catch(err => {
          console.warn('[WebRTC] Permiso de cámara no concedido:', err.message);
        });
    }

    // Escuchar ofertas, respuestas y candidatos de la contraparte mediante Socket.io
    const socket = window.PuenteDB?.realtime?.socket;
    if (socket) {
      socket.on('webrtc_offer', async ({ offer, sender }) => {
        if (!state.p2pPeerConnection) return;
        console.log('[WebRTC P2P] Oferta recibida de:', sender);
        try {
          await state.p2pPeerConnection.setRemoteDescription(new RTCSessionDescription(offer));
          const answer = await state.p2pPeerConnection.createAnswer();
          await state.p2pPeerConnection.setLocalDescription(answer);
          socket.emit('webrtc_answer', {
            caseId: targetCase.id,
            answer: answer,
            sender: userName
          });
        } catch (e) {
          console.warn('[WebRTC P2P] Error respondiendo oferta:', e);
        }
      });

      socket.on('webrtc_answer', async ({ answer, sender }) => {
        if (!state.p2pPeerConnection) return;
        console.log('[WebRTC P2P] Respuesta recibida de:', sender);
        try {
          await state.p2pPeerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (e) {
          console.warn('[WebRTC P2P] Error procesando respuesta:', e);
        }
      });

      socket.on('webrtc_ice_candidate', async ({ candidate }) => {
        if (!state.p2pPeerConnection) return;
        try {
          await state.p2pPeerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {}
      });
    }

    // Cronómetro en vivo
    state.callTimerInterval = setInterval(() => {
      state.callSeconds = (state.callSeconds || 0) + 1;
      const mins = Math.floor(state.callSeconds / 60);
      const secs = state.callSeconds % 60;
      const timerEl = document.getElementById('sandboxCallTimer');
      if (timerEl) {
        timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      }
    }, 1000);
  }

  // ABRIR SALA VIRTUAL DE ORIENTACIÓN (JITSI MEET 100% LIBRE Y GRATUITO)
  window.openVirtualRoom = async (caseId) => {
    state.activeCaseIdForRoom = caseId;
    state.userExplicitlyLeftCall = false;

    const targetCase = state.cases.find(c => c.id === caseId) || state.cases[0] || {
      id: caseId || 'CAS-00138',
      citizen: 'Mariana Sibaja',
      assignedTo: 'Dra. Elena Gómez',
      type: 'Problema laboral',
      institution: 'Inspección del Trabajo'
    };

    const isProf = state.currentUser?.role === 'professional';
    const cleanCaseId = String(targetCase.id).toLowerCase().replace(/[^a-z0-9]/g, '');

    // Enlace limpio y público de Jitsi Meet solicitado para pestaña nueva
    const cleanRoomUrl = 'https://meet.jit.si/puente-ciudadano-caso-' + cleanCaseId;
    state.activeDailyRoomUrl = cleanRoomUrl;

    // 1. Títulos y metadatos
    if (vRoomTitle) vRoomTitle.textContent = 'Sala de Orientación Virtual: #' + targetCase.id;
    if (dailyRoomLabel) dailyRoomLabel.textContent = '#' + targetCase.id;

    if (vRoomSubtitle) {
      if (isProf) {
        vRoomSubtitle.textContent = 'Ciudadano(a): ' + targetCase.citizen + ' | Caso: ' + (targetCase.subType || targetCase.type) + ' | Entidad: ' + targetCase.institution;
      } else {
        vRoomSubtitle.textContent = 'En consulta con ' + (targetCase.assignedTo || 'Dra. Elena Gómez') + ' (Asesora Verificada)';
      }
    }

    // 2. Chat contextual de la sala con historial previo
    const box = document.getElementById('vroomChatMessages');
    if (box) {
      const existingMsgs = window.PuenteDB?.messages.getByCase(targetCase.id) || [];
      if (existingMsgs.length > 0) {
        box.innerHTML = existingMsgs.map(m => `
          <div class="chat-msg ${m.role || 'citizen'}">
            <strong>${m.sender}:</strong><br>${m.text}
          </div>
        `).join('');
      } else {
        box.innerHTML = `
          <div class="chat-msg professional">
            <strong>${targetCase.assignedTo || 'Dra. Elena Gómez'}:</strong><br>
            Hola ${targetCase.citizen}, bienvenida(o) a la sesión de orientación jurídica sobre <em>${targetCase.subType || targetCase.type}</em>. Estamos conectados en videollamada para orientarte ante <strong>${targetCase.institution}</strong>.
          </div>
        `;
      }
      box.scrollTop = box.scrollHeight;
    }

    // 3. Abrir modal
    const chatToggle = document.getElementById('vroomChatToggle');
    const chatPanel = document.getElementById('vroomChatPanel');
    const vBody = document.querySelector('.virtual-room-body');
    if (chatToggle && chatPanel) {
      chatToggle.onclick = () => {
        const isHidden = chatPanel.style.display === 'none' || chatPanel.style.display === '';
        chatPanel.style.display = isHidden ? 'flex' : 'none';
        if (vBody) vBody.classList.toggle('with-chat', isHidden);
        chatToggle.classList.toggle('active', isHidden);
      };
    }

    if (virtualRoomModal) { virtualRoomModal.classList.add('active'); virtualRoomModal.style.display = 'flex'; }

    // 4. Activar caso en el motor de sincronización polling
    if (window.PuenteDB?.polling) {
      window.PuenteDB.polling.setActiveCase(targetCase.id);
    }
    if (window.PuenteDB?.realtime) {
      window.PuenteDB.realtime.joinCase(targetCase.id, state.currentUser);
    }

    // 5. Enlace visible y botón grande de 1 clic para abrir en pestaña nueva
    const btnJoinDirect = document.getElementById('btnJoinJitsiRoomDirect');
    if (btnJoinDirect) {
      btnJoinDirect.href = cleanRoomUrl;
      btnJoinDirect.onclick = () => {
        showToast('Abriendo videollamada Jitsi Meet en nueva pestaña...', 'success');
      };
    }

    const cleanDisplayEl = document.getElementById('cleanJitsiUrlDisplay');
    if (cleanDisplayEl) {
      cleanDisplayEl.textContent = cleanRoomUrl;
    }

    const btnCopyClean = document.getElementById('btnCopyJitsiCleanUrl');
    if (btnCopyClean) {
      btnCopyClean.onclick = () => {
        navigator.clipboard.writeText(cleanRoomUrl).then(() => {
          showToast('Enlace de Jitsi Meet copiado al portapapeles.', 'success');
        });
      };
    }

    if (dailyRoomUrlText) {
      dailyRoomUrlText.textContent = cleanRoomUrl;
      dailyRoomUrlText.style.color = '#38bdf8';
      dailyRoomUrlText.title = "Enlace público de Jitsi Meet. Clic para copiar.";
      dailyRoomUrlText.onclick = () => {
        navigator.clipboard.writeText(cleanRoomUrl).then(() => {
          showToast('Enlace de la videollamada copiado al portapapeles.', 'success');
        });
      };
    }

    if (btnCopyDailyUrl) {
      btnCopyDailyUrl.onclick = () => {
        navigator.clipboard.writeText(cleanRoomUrl).then(() => {
          showToast('Enlace de la sala Jitsi copiado al portapapeles.', 'success');
        });
      };
    }

    const btnOpenExt = document.getElementById('btnOpenExternalRoom');
    if (btnOpenExt) {
      btnOpenExt.href = cleanRoomUrl;
      btnOpenExt.style.display = 'inline-flex';
    }

    // 6. Montar componente Jitsi Meet incrustado exactamente como en la Imagen 1
    const mount = document.getElementById('dailyIframeMount');
    if (mount) {
      const userName = state.currentUser?.name || (isProf ? 'Dra. Elena Gómez' : 'Mariana Sibaja');
      console.log('[Jitsi Meet Incrustado] Conectando a sala:', cleanRoomUrl);

      mount.innerHTML = `
        <iframe 
          id="jitsiMeetDirectFrame"
          src="${cleanRoomUrl}#config.prejoinPageEnabled=false&config.prejoinConfig.enabled=false&config.enableLobby=false&config.startWithAudioMuted=false&config.startWithVideoMuted=false&userInfo.displayName=${encodeURIComponent(userName)}" 
          allow="camera *; microphone *; fullscreen *; display-capture *; autoplay *; clipboard-write *" 
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-presentation"
          style="width: 100%; height: 100%; min-height: 480px; border: none; border-radius: 8px; background: #0b0f19;"
        ></iframe>
      `;
      showToast('Conectado a la videollamada de orientación (#' + targetCase.id + ')', 'success');
    }
  };

    function mountEmbedIframe(mount, src) {
    mount.innerHTML = `
      <iframe 
        id="vroomActiveIframe"
        src="${src}" 
        allow="camera *; microphone *; fullscreen *; display-capture *; autoplay *; clipboard-write *" 
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-presentation"
        style="width: 100%; height: 100%; min-height: 460px; border: none; border-radius: 8px; background: #0f172a;"
      ></iframe>
    `;
  }

  // Función para abandonar la videollamada limpiamente
  window.leaveDailyCall = () => {
    state.userExplicitlyLeftCall = true;

    // Desmontar el iframe de la videollamada
    const mount = document.getElementById('dailyIframeMount');
    if (mount) mount.innerHTML = '';

    // Detener pistas de medios locales
    if (state.localMediaStream) {
      try {
        state.localMediaStream.getTracks().forEach(track => track.stop());
      } catch (e) {}
      state.localMediaStream = null;
    }

    // Detener PeerConnection WebRTC si estaba activo
    if (state.p2pPeerConnection) {
      try { state.p2pPeerConnection.close(); } catch (e) {}
      state.p2pPeerConnection = null;
    }

    // Limpiar elementos de audio remoto
    document.querySelectorAll('[id^="dailyRemoteAudio_"]').forEach(el => {
      try { el.srcObject = null; el.remove(); } catch (e) {}
    });

    // Detener temporizador
    if (state.callTimerInterval) {
      clearInterval(state.callTimerInterval);
      state.callTimerInterval = null;
    }

    if (state.dailyCallFrame) {
      try {
        state.dailyCallFrame.leave();
        state.dailyCallFrame.destroy();
      } catch (e) {}
      state.dailyCallFrame = null;
    }

    if (state.jitsiApi) {
      try {
        state.jitsiApi.dispose();
      } catch (e) {}
      state.jitsiApi = null;
    }

    if (virtualRoomModal) { virtualRoomModal.classList.remove('active'); virtualRoomModal.style.display = 'none'; }

    // Redirección coherente según el perfil activo
    const isProf = state.currentUser?.role === 'professional';
    if (isProf) {
      if (viewProfessionalSection) viewProfessionalSection.style.display = 'block';
      if (viewCitizenSection) viewCitizenSection.style.display = 'none';
      renderProfessionalTable();
      showToast('Has salido de la videollamada. Has regresado al Panel Profesional.', 'info');
    } else {
      if (viewCitizenSection) viewCitizenSection.style.display = 'block';
      if (viewProfessionalSection) viewProfessionalSection.style.display = 'none';
      renderCitizenTable();
      showToast('Has salido de la videollamada. Has regresado a tu Panel Ciudadano.', 'info');
    }
  };

  // Event Listeners de Controles Limpios
  vRoomClose?.addEventListener('click', () => window.leaveDailyCall());
  vroomEndCall?.addEventListener('click', () => window.leaveDailyCall());

  vroomMicToggle?.addEventListener('click', () => {
    state.isAudioMuted = !state.isAudioMuted;
    if (state.jitsiApi) {
      try { state.jitsiApi.executeCommand('toggleAudio'); } catch (e) {}
    }
    
    // Control en Daily.co CallFrame
    if (state.dailyCallFrame) {
      try { state.dailyCallFrame.setLocalAudio(!state.isAudioMuted); } catch (e) {}
    }
    
    // Control en pistas de getUserMedia
    if (state.localMediaStream) {
      state.localMediaStream.getAudioTracks().forEach(t => {
        t.enabled = !state.isAudioMuted;
      });
    }

    vroomMicToggle.classList.toggle('active-muted', state.isAudioMuted);
    vroomMicToggle.innerHTML = state.isAudioMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
    vroomMicToggle.title = state.isAudioMuted ? 'Activar micrófono' : 'Silenciar micrófono';

    showToast(state.isAudioMuted ? 'Micrófono silenciado.' : 'Micrófono activado.', state.isAudioMuted ? 'warning' : 'success');
  });

  vroomCamToggle?.addEventListener('click', async () => {
    state.isVideoOff = !state.isVideoOff;
    if (state.jitsiApi) {
      try { state.jitsiApi.executeCommand('toggleVideo'); } catch (e) {}
    }
    
    // Control en Daily.co CallFrame
    if (state.dailyCallFrame) {
      try { state.dailyCallFrame.setLocalVideo(!state.isVideoOff); } catch (e) {}
    }
    
    // Control en pistas de getUserMedia
    if (state.localMediaStream) {
      state.localMediaStream.getVideoTracks().forEach(t => {
        t.enabled = !state.isVideoOff;
      });
      const v = document.getElementById('sandboxLocalVideo');
      const ph = document.getElementById('sandboxLocalAvatarPlaceholder');
      if (v && ph) {
        v.style.display = state.isVideoOff ? 'none' : 'block';
        ph.style.display = state.isVideoOff ? 'flex' : 'none';
      }
    }

    vroomCamToggle.classList.toggle('active-muted', state.isVideoOff);
    vroomCamToggle.innerHTML = state.isVideoOff ? '<i class="fas fa-video-slash"></i>' : '<i class="fas fa-video"></i>';
    vroomCamToggle.title = state.isVideoOff ? 'Encender cámara' : 'Apagar cámara';

    showToast(state.isVideoOff ? 'Cámara desactivada.' : 'Cámara encendida.', state.isVideoOff ? 'warning' : 'success');
  });

  vroomShareToggle?.addEventListener('click', async () => {
    if (state.jitsiApi) {
      try {
        state.jitsiApi.executeCommand('toggleShareScreen');
        state.isScreenSharing = !state.isScreenSharing;
        vroomShareToggle.classList.toggle('active-muted', state.isScreenSharing);
        showToast(state.isScreenSharing ? 'Compartiendo pantalla.' : 'Pantalla compartida finalizada.', 'info');
        return;
      } catch (e) {}
    }
    if (state.dailyCallFrame) {
      try {
        if (state.isScreenSharing) {
          await state.dailyCallFrame.stopScreenShare();
          state.isScreenSharing = false;
          vroomShareToggle.classList.remove('active-muted');
          showToast('Pantalla compartida finalizada.', 'info');
        } else {
          await state.dailyCallFrame.startScreenShare();
          state.isScreenSharing = true;
          vroomShareToggle.classList.add('active-muted');
          showToast('Compartiendo pantalla en la orientación.', 'success');
        }
      } catch (err) {
        console.warn('Error al compartir pantalla:', err);
      }
    } else {
      showToast('La función de compartir pantalla se gestiona dentro de la llamada en vivo.', 'info');
    }
  });

  btnEmitRoadmapFromRoom?.addEventListener('click', () => {
    window.leaveDailyCall();
    window.openRoadmap(state.activeCaseIdForRoom);
  });

  const vChatSend = document.getElementById('vroomChatSend');
  const vChatInput = document.getElementById('vroomChatInput');
  const vChatBox = document.getElementById('vroomChatMessages');

  if (vChatSend && vChatInput && vChatBox) {
    vChatSend.addEventListener('click', sendVRoomMsg);
    vChatInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') sendVRoomMsg();
    });
  }

  async function sendVRoomMsg() {
    const text = vChatInput.value.trim();
    if (!text) return;
    const caseId = state.activeCaseIdForRoom || 'CAS-00138';
    const user = state.currentUser || { name: 'Usuario', role: 'citizen', email: 'usuario@ejemplo.com' };

    const newMsg = {
      id: 'MSG-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      caseId: caseId,
      sender: user.name,
      senderEmail: user.email,
      role: user.role,
      text: text,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      date: new Date().toISOString().split('T')[0]
    };

    vChatInput.value = '';

    // 1. Guardar de inmediato localmente para reactividad instantánea
    if (window.PuenteDB?.messages) {
      window.PuenteDB.messages.insert(caseId, newMsg, true);
    }

    // 2. Persistir directamente en el servidor central usando URL dinámica
    try {
      const endpoint = (typeof window !== 'undefined' && window.PUENTE_CONFIG)
        ? window.PUENTE_CONFIG.getApiUrl('api/mensajes')
        : '/api/mensajes';
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMsg)
      });
    } catch (e) {
      console.warn('[Sala Virtual] Error enviando mensaje a BD:', e);
    }

    const msgEl = document.createElement('div');
    msgEl.className = 'chat-msg ' + (user.role || 'citizen');
    msgEl.innerHTML = '<strong>Tú:</strong><br>' + text;
    vChatBox.appendChild(msgEl);
    vChatBox.scrollTop = vChatBox.scrollHeight;
  }

  // Hoja de ruta
  const roadmapModal = document.getElementById('roadmapModal');
  const roadmapContent = document.getElementById('roadmapContent');
  const roadmapClose = document.getElementById('roadmapClose');

  window.openRoadmap = (caseId) => {
    const targetCase = state.cases.find(c => c.id === caseId) || state.cases[0];
    const instInfo = institutionsData[targetCase.institution] || institutionsData['Inspección del Trabajo'];

    if (!roadmapModal || !roadmapContent) return;

    roadmapContent.innerHTML = `
      <div class="roadmap-doc-header">
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <div style="width: 48px; height: 48px; border-radius: 12px; background: var(--primary-blue); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 1.4rem;">
            <i class="fas fa-balance-scale"></i>
          </div>
          <div>
            <h3 style="color: var(--dark-blue); margin: 0; font-size: 1.3rem;">Hoja de Ruta y Derivación Oficial</h3>
            <span style="font-size: 0.85rem; color: var(--accent-turquoise-hover); font-weight: 700;">ODS 16: Paz, Justicia e Instituciones Sólidas</span>
          </div>
        </div>
        <div class="roadmap-stamp"><i class="fas fa-shield-halved"></i> RADICADO CERTIFICADO</div>
      </div>

      <div class="roadmap-meta-grid">
        <div><strong>Radicado:</strong><br>${targetCase.id}</div>
        <div><strong>Ciudadano:</strong><br>${targetCase.citizen}</div>
        <div><strong>Fecha:</strong><br>${targetCase.date}</div>
        <div><strong>Especialista:</strong><br>${targetCase.assignedTo}</div>
      </div>

      <div style="margin-bottom: 1.25rem;">
        <h5 style="color: var(--dark-blue); margin-bottom: 0.35rem;">Diagnóstico Legal de la Situación:</h5>
        <p style="font-size: 0.95rem; background: var(--soft-blue); padding: 0.85rem; border-radius: 6px; margin: 0;">${targetCase.description}</p>
      </div>

      <div class="roadmap-institution-box">
        <h4 style="margin: 0 0 0.5rem; color: var(--dark-blue);"><i class="fas fa-landmark"></i> Entidad Oficial Asignada:</h4>
        <h3 style="color: var(--primary-blue); margin: 0 0 0.75rem;">${targetCase.institution}</h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.88rem;">
          <div><strong>Sede Física:</strong> ${instInfo.address}</div>
          <div><strong>Teléfono:</strong> ${instInfo.phone}</div>
          <div><strong>Horario:</strong> ${instInfo.hours}</div>
          <div><strong>Costo:</strong> 100% Gratuito (ODS 16)</div>
        </div>
      </div>

      <div class="roadmap-checklist-box">
        <h5 style="color: var(--dark-blue); margin-bottom: 0.5rem;">Documentos Requeridos a Presentar:</h5>
        ${(targetCase.checklist || instInfo.checklist).map(item => `
          <div class="roadmap-checklist-item">
            <i class="fas fa-square-check" style="color: #10b981; margin-top: 2px;"></i> <span>${item}</span>
          </div>
        `).join('')}
      </div>

      <div class="roadmap-actions-row" style="margin-top: 1.5rem; display: flex; gap: 1rem; justify-content: flex-end;">
        <button class="btn btn-secondary" onclick="window.print()"><i class="fas fa-print"></i> Imprimir / Guardar PDF</button>
        <button class="btn btn-primary" onclick="window.updateCaseStatus('${targetCase.id}', 'Finalizado'); document.getElementById('roadmapModal').classList.remove('active');">
          <i class="fas fa-check-circle"></i> Finalizar Orientación
        </button>
      </div>
    `;

    roadmapModal.classList.add('active');
  };

  roadmapClose?.addEventListener('click', () => roadmapModal?.classList.remove('active'));

  // ==========================================================================
  // 10. RECORRIDO DE 6 ESCENAS NARRATIVAS
  // ==========================================================================
  const stepDots = document.querySelectorAll('.step-dot');
  const sceneContainers = document.querySelectorAll('.scene-container');
  const btnPrevScene = document.getElementById('btnPrevScene');
  const btnNextScene = document.getElementById('btnNextScene');

  function renderScene(num) {
    if (num < 1 || num > 6) return;
    state.currentScene = num;

    stepDots.forEach((dot, idx) => {
      dot.classList.remove('active', 'completed');
      if (idx + 1 === num) dot.classList.add('active');
      else if (idx + 1 < num) dot.classList.add('completed');
    });

    sceneContainers.forEach((cont, idx) => {
      if (idx + 1 === num) cont.classList.add('active');
      else cont.classList.remove('active');
    });

    if (btnPrevScene) btnPrevScene.disabled = (num === 1);
    if (btnNextScene) {
      btnNextScene.innerHTML = (num === 6) ? 'Ir al Cuestionario <i class="fas fa-arrow-right"></i>' : 'Siguiente Escena <i class="fas fa-chevron-right"></i>';
    }

    if (num === 1) applySimulation(state.selectedSimulation);
  }

  stepDots.forEach(dot => {
    dot.addEventListener('click', () => renderScene(parseInt(dot.getAttribute('data-scene'))));
  });

  btnNextScene?.addEventListener('click', () => {
    if (state.currentScene < 6) renderScene(state.currentScene + 1);
    else window.scrollToQuestionnaire();
  });

  btnPrevScene?.addEventListener('click', () => {
    if (state.currentScene > 1) renderScene(state.currentScene - 1);
  });

  function applySimulation(issueKey) {
    const data = simulationData[issueKey] || simulationData.desconocida;
    state.selectedSimulation = issueKey;

    document.querySelectorAll('.quiz-btn').forEach(b => {
      if (b.getAttribute('data-issue') === issueKey) b.classList.add('active');
      else b.classList.remove('active');
    });

    const f = document.getElementById('quizFeedback');
    if (f) {
      f.innerHTML = `
        <div style="font-size: 0.9rem;">
          <strong style="color: var(--dark-blue);">${data.title}</strong><br>
          ${data.description}
          <button class="btn btn-turquoise btn-sm" style="width: 100%; margin-top: 0.5rem;" onclick="renderScene(2)">
            ${data.bridgeAction} <i class="fas fa-arrow-right"></i>
          </button>
        </div>
      `;
    }
  }

  document.querySelectorAll('.quiz-btn').forEach(btn => {
    btn.addEventListener('click', () => applySimulation(btn.getAttribute('data-issue')));
  });

  // ==========================================================================
  // 11. INICIALIZACIÓN
  // ==========================================================================
  renderConditionalViews();
  renderSubCategoryChips('Problema laboral');
  setWizardStep(1);
  renderScene(1);
  applySimulation('desconocida');


  // Apertura automática de sala virtual si se pasa por parámetro en la URL (?sala=CAS-00138)
  const urlParams = new URLSearchParams(window.location.search);
  const targetRoomParam = urlParams.get('sala') || urlParams.get('case') || urlParams.get('caso');
  if (targetRoomParam) {
    setTimeout(() => {
      window.openVirtualRoom(targetRoomParam);
    }, 600);
  }

});
