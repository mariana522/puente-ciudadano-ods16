/**
 * ==============================================================================
 * ODS 16 - PUENTE CIUDADANO: AGENTE DE ORIENTACIÓN CIUDADANA CON RAG
 * Módulo: agente_rag.js
 * Conecta el panel de orientación con la API Flask RAG (Python + Gemini + NumPy).
 * Implementa:
 *   - Envío de consultas al endpoint /api/rag/orientar
 *   - Renderizado de respuesta con tipo_caso, institución, pasos y citas
 *   - Tarjeta roja de emergencia animada con líneas oficiales (123, 155, 141, 122, 192)
 *   - Etiquetas de confianza (alta / media / baja)
 *   - Fuentes normativas como enlaces interactivos
 *   - Alerta de derivación a profesional (chat + videollamada)
 *   - Descarga del borrador de Derecho de Petición en PDF (Art. 16 Ley 1437/2011)
 * ==============================================================================
 */

(function () {
  'use strict';

  // ============================================================================
  // CONFIGURACIÓN: URL base de la API Flask
  // ============================================================================
  // En Render/producción Flask sirve el frontend y la API en el mismo origen,
  // por lo que las peticiones deben ser relativas ("/api/rag/...") para no
  // depender de localhost. Se puede forzar una URL externa definiendo
  // window.RAG_API_BASE antes de cargar este script.
  const RAG_API_BASE = (() => {
    if (typeof window === 'undefined') return '';

    const configurada = window.RAG_API_BASE || window.PUENTE_RAG_API_BASE;
    if (configurada) return String(configurada).replace(/\/+$/, '');

    // Desarrollo local con el frontend servido por otro puerto (Node/Live Server):
    // mantener la conexión al Flask local. En cualquier otro host, mismo origen.
    const host = window.location.hostname;
    const esLocal = host === 'localhost' || host === '127.0.0.1';
    if (esLocal && window.location.port && window.location.port !== '5000') {
      return `${window.location.protocol}//${host}:5000`;
    }

    return '';
  })();

  // Estado interno del módulo RAG
  const ragState = {
    lastConsultaId: null,
    lastResultado: null,
    cargando: false
  };

  // ============================================================================
  // HELPERS INTERNOS
  // ============================================================================

  /** Muestra u oculta elementos por ID */
  function mostrar(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = '';
  }
  function ocultar(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
  function ocultarTodos(...ids) {
    ids.forEach(ocultar);
  }

  /** Genera la etiqueta de confianza según el score */
  function buildConfianzaBadge(confianza) {
    const pct = Math.round(confianza * 100);
    if (confianza >= 0.75) {
      return `<span class="confianza-badge confianza-alta"><i class="fas fa-circle-check"></i> Confianza Alta ${pct}%</span>`;
    } else if (confianza >= 0.6) {
      return `<span class="confianza-badge confianza-media"><i class="fas fa-circle-half-stroke"></i> Confianza Media ${pct}%</span>`;
    } else {
      return `<span class="confianza-badge confianza-baja"><i class="fas fa-circle-xmark"></i> Confianza Baja ${pct}%</span>`;
    }
  }

  /** Renderiza las líneas de emergencia en la tarjeta roja */
  function renderLineasEmergencia(lineas) {
    const grid = document.getElementById('ragLineasGrid');
    if (!grid || !lineas || !lineas.length) return;

    grid.innerHTML = lineas.map(l => `
      <div class="linea-item-card">
        <div>
          <div style="font-size:0.78rem; font-weight:700; color:#7f1d1d; text-transform:uppercase; margin-bottom:4px;">${l.nombre}</div>
          <div style="font-size:0.8rem; color:#991b1b; line-height:1.4;">${l.descripcion}</div>
        </div>
        <a href="tel:${l.linea.replace(/\s+/g, '')}" class="linea-numero-btn">
          <i class="fas fa-phone-volume"></i> ${l.linea}
        </a>
      </div>
    `).join('');
  }

  /** Renderiza las fuentes normativas como enlaces interactivos */
  function renderFuentes(fuentes) {
    const grid = document.getElementById('ragFuentesGrid');
    if (!grid || !fuentes || !fuentes.length) return;

    grid.innerHTML = fuentes.map(f => {
      const href = f.url ? `href="${f.url}" target="_blank" rel="noopener"` : '';
      const scoreLabel = f.score ? `<span class="fuente-score">Sim: ${(f.score * 100).toFixed(1)}%</span>` : '';
      const extIcon = f.url ? `<i class="fas fa-arrow-up-right-from-square" style="font-size:0.7rem; opacity:0.7;"></i>` : '';
      const fragmento = f.texto ? `<div style="font-size:0.78rem; color:#64748b; margin-top:5px; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden;">"${f.texto.substring(0, 160)}..."</div>` : '';

      return `
        <a class="fuente-chip-interactive" ${href}>
          <div class="fuente-titulo">[${f.cita}] ${f.titulo || 'Documento normativo'} ${extIcon}</div>
          <div class="fuente-entidad"><i class="fas fa-landmark"></i> ${f.entidad || 'Entidad oficial'}</div>
          ${fragmento}
          ${scoreLabel}
        </a>
      `;
    }).join('');
  }

  /** Renderiza la lista de pasos procesales */
  function renderPasos(pasos) {
    const lista = document.getElementById('ragPasosList');
    if (!lista || !pasos || !pasos.length) return;
    lista.innerHTML = pasos.map(p => `<li style="margin-bottom:0.5rem;">${p}</li>`).join('');
  }

  /** Renderiza el resultado completo del agente en el panel de orientación */
  function renderResultado(data) {
    // --- Tarjeta roja de emergencia ---
    if (data.riesgo) {
      mostrar('ragEmergenciaCard');
      renderLineasEmergencia(data.lineas_emergencia);
    } else {
      ocultar('ragEmergenciaCard');
    }

    // --- Tipo de caso ---
    const tipoCasoEl = document.getElementById('ragTipoCaso');
    if (tipoCasoEl) tipoCasoEl.textContent = data.tipo_caso || 'Consulta ciudadana';

    // --- Badge de confianza ---
    const badgeEl = document.getElementById('ragConfianzaBadge');
    if (badgeEl) badgeEl.outerHTML = buildConfianzaBadge(data.confianza || 0);

    // --- Badge de derivación ---
    const derivarBadge = document.getElementById('ragDerivarBadge');
    if (derivarBadge) {
      derivarBadge.style.display = data.derivar ? '' : 'none';
    }

    // --- Institución competente ---
    const instNombre = document.getElementById('ragInstitucionNombre');
    const instDesc   = document.getElementById('ragInstitucionDesc');
    if (instNombre) instNombre.textContent = data.institucion || '—';
    if (instDesc)   instDesc.textContent = data.riesgo
      ? 'Atención prioritaria — también puede acudir a la Fiscalía y Comisaría de Familia.'
      : 'Entidad pública competente según normativa colombiana vigente.';

    // --- Respuesta textual del agente ---
    const textoEl = document.getElementById('ragRespuestaTexto');
    if (textoEl) {
      // Resaltar citas [1], [2]... en la respuesta
      const html = (data.respuesta || '').replace(
        /\[(\d+)\]/g,
        '<sup style="background:#dbeafe;color:#1d4ed8;padding:0 4px;border-radius:3px;font-weight:700;cursor:pointer;" title="Ver fuente normativa $1">[$1]</sup>'
      );
      textoEl.innerHTML = html;
    }

    // --- Pasos procesales ---
    const pasosCont = document.getElementById('ragPasosContainer');
    if (data.pasos && data.pasos.length) {
      renderPasos(data.pasos);
      mostrar('ragPasosContainer');
    } else {
      ocultar('ragPasosContainer');
    }

    // --- Fuentes normativas interactivas ---
    if (data.fuentes && data.fuentes.length) {
      renderFuentes(data.fuentes);
      mostrar('ragFuentesContainer');
    } else {
      ocultar('ragFuentesContainer');
    }

    // --- Box de derivación a profesional ---
    if (data.derivar) {
      mostrar('ragDerivarBox');
    } else {
      ocultar('ragDerivarBox');
    }

    // --- Box de Derecho de Petición ---
    if (data.requiere_peticion) {
      mostrar('ragPeticionBox');
      const btnPDF = document.getElementById('ragDescargarPeticionBtn');
      if (btnPDF) {
        btnPDF.onclick = () => descargarPeticionPDF(data);
      }
    } else {
      ocultar('ragPeticionBox');
    }

    // --- Mostrar tarjeta resultado ---
    mostrar('ragResultadoCard');
  }

  // ============================================================================
  // DESCARGA DEL BORRADOR DE DERECHO DE PETICIÓN EN PDF
  // ============================================================================
  async function descargarPeticionPDF(resultado) {
    const btn = document.getElementById('ragDescargarPeticionBtn');
    const textoOriginal = btn ? btn.innerHTML : '';
    if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generando PDF...';

    try {
      const payload = {
        consulta_id: ragState.lastConsultaId,
        tipo_caso: resultado.tipo_caso,
        institucion: resultado.institucion,
        usuario: resultado.usuario || (window.state && window.state.currentUser ? window.state.currentUser.name : 'Ciudadano'),
        consulta: document.getElementById('ragMensajeInput')?.value || '',
        respuesta: resultado.respuesta,
        pasos: resultado.pasos,
        fuentes: resultado.fuentes
      };

      const res = await fetch(`${RAG_API_BASE}/api/rag/peticion/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href  = url;
      link.download = 'Borrador_Derecho_Peticion_Art16_Ley1437.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      if (typeof window.showToast === 'function') {
        window.showToast('✅ Borrador de Derecho de Petición descargado exitosamente.', 'success');
      }
    } catch (err) {
      console.error('[RAG] Error descargando PDF:', err);
      // Fallback: generar PDF simple desde el frontend si el servidor no está disponible
      generarPeticionFallback(resultado);
    } finally {
      if (btn) btn.innerHTML = textoOriginal;
    }
  }

  /** Fallback: imprime la ventana con el borrador si el servidor no está disponible */
  function generarPeticionFallback(resultado) {
    const ventana = window.open('', '_blank', 'width=800,height=900');
    const hoy = new Date().toLocaleDateString('es-CO', { day:'2-digit', month:'long', year:'numeric' });
    ventana.document.write(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Derecho de Petición – Art. 16 Ley 1437/2011</title>
        <style>
          body { font-family: Georgia, serif; max-width: 740px; margin: 2rem auto; color: #1a1a1a; line-height: 1.6; }
          h1 { color: #00689D; font-size: 1.3rem; text-align: center; border-bottom: 2px solid #00689D; padding-bottom: 0.5rem; }
          h2 { font-size: 1rem; color: #00689D; margin: 1.5rem 0 0.4rem; }
          .firma-line { border-bottom: 1px solid #333; margin: 3rem 0 0.4rem; width: 55%; }
          footer { font-size: 0.75rem; color: #666; text-align: center; margin-top: 2rem; border-top: 1px solid #ccc; padding-top: 0.75rem; }
        </style>
      </head>
      <body>
        <h1>DERECHO DE PETICIÓN</h1>
        <p style="text-align:center; color:#555; font-size:0.9rem;">Art. 23 Constitución Política · Art. 16 Ley 1437 de 2011 (CPACA)</p>
        <p><strong>Fecha:</strong> ${hoy}</p>
        <p><strong>SEÑORES:</strong><br><strong>${(resultado.institucion || 'AUTORIDAD PÚBLICA COMPETENTE').toUpperCase()}</strong><br>E. S. D.</p>
        <h2>I. OBJETO DE LA PETICIÓN</h2>
        <p>Solicitar la intervención formal respecto a mi situación de <em>${resultado.tipo_caso || 'trámite ciudadano'}</em>, garantizando mis derechos fundamentales al debido proceso y al acceso a la justicia.</p>
        <h2>II. RAZONES EN QUE SE FUNDAMENTA</h2>
        <p><strong>Hechos:</strong><br>${document.getElementById('ragMensajeInput')?.value || 'Ver orientación del agente.'}</p>
        <p><strong>Fundamentos jurídicos:</strong><br>
          1. Artículo 23 de la Constitución Política de Colombia (Derecho de Petición).<br>
          2. Artículo 14 de la Ley 1437 de 2011 (término de respuesta: 15 días hábiles).<br>
          3. Principio de eficacia y celeridad administrativa (Art. 209 C.P.).
        </p>
        <h2>III. DOCUMENTOS ADJUNTOS</h2>
        <p>[ ] Copia del documento de identidad.<br>[ ] Soportes documentales de los hechos.</p>
        <h2>IV. NOTIFICACIONES</h2>
        <p>Recibiré notificaciones en los datos de contacto registrados en la plataforma.</p>
        <br><br>
        <div class="firma-line"></div>
        <p><strong>FIRMA DEL PETICIONARIO</strong></p>
        <footer>Documento generado en la Plataforma Puente Ciudadano (ODS 16 - Paz, Justicia e Instituciones Sólidas) | ${hoy}</footer>
      </body>
      </html>
    `);
    ventana.document.close();
    ventana.print();
  }

  // ============================================================================
  // FUNCIÓN PRINCIPAL: ENVIAR CONSULTA AL AGENTE RAG
  // ============================================================================
  window.ragEnviarConsulta = async function () {
    if (ragState.cargando) return;

    const textarea = document.getElementById('ragMensajeInput');
    const mensaje  = (textarea?.value || '').trim();

    if (!mensaje || mensaje.length < 10) {
      if (typeof window.showToast === 'function') {
        window.showToast('Por favor escribe tu situación con más detalle para que el agente pueda orientarte.', 'warning');
      }
      return;
    }

    // Obtener nombre del usuario desde el estado global de la app
    const usuario = (window.state?.currentUser?.name) ||
                    document.getElementById('cWelcomeName')?.textContent?.replace('Hola, ', '') ||
                    'Ciudadano';

    ragState.cargando = true;
    const btnEnviar = document.getElementById('ragEnviarBtn');
    if (btnEnviar) {
      btnEnviar.disabled = true;
      btnEnviar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Consultando...';
    }

    // Ocultar resultados anteriores y mostrar estado de carga
    ocultarTodos('ragResultadoCard', 'ragEmergenciaCard');
    mostrar('ragLoadingState');

    try {
      const res = await fetch(`${RAG_API_BASE}/api/rag/orientar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, mensaje })
      });

      if (!res.ok) {
        const tipoRespuesta = res.headers.get('content-type') || '';
        const err = tipoRespuesta.indexOf('application/json') !== -1
          ? await res.json().catch(() => ({}))
          : {};
        throw new Error(err.mensaje || `Error HTTP ${res.status}`);
      }

      const data = await res.json();
      ragState.lastConsultaId = data.consulta_id;
      ragState.lastResultado  = data;

      ocultar('ragLoadingState');
      renderResultado(data);

      // Toast contextual según el tipo de resultado
      if (data.riesgo) {
        if (typeof window.showToast === 'function') {
          window.showToast('⚠️ Situación de riesgo detectada. Se ha activado alerta prioritaria.', 'warning');
        }
      } else {
        if (typeof window.showToast === 'function') {
          window.showToast('✅ Orientación generada con éxito.', 'success');
        }
      }

    } catch (error) {
      console.error('[RAG] Error al consultar el agente:', error);
      ocultar('ragLoadingState');

      const esLocal = window.location.hostname === 'localhost' ||
                      window.location.hostname === '127.0.0.1';
      const ayuda = esLocal
        ? `En desarrollo local el servidor Flask debe estar activo:<br>
           <code style="background:#f1f5f9; padding:4px 10px; border-radius:4px; font-size:0.85rem;">python app.py</code>`
        : `El servicio de orientación no respondió. Intenta de nuevo en unos segundos;
           si el problema continúa, comunícate con un profesional desde el chat.`;

      // Mostrar error en el panel con mensaje amigable
      const resultCard = document.getElementById('ragResultadoCard');
      if (resultCard) {
        resultCard.style.display = '';
        resultCard.innerHTML = `
          <div style="text-align:center; padding: 2rem;">
            <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">⚠️</div>
            <h4 style="color:#b91c1c; margin-bottom:0.5rem;">No fue posible conectar con el agente</h4>
            <p style="color:#64748b; font-size:0.9rem; margin-bottom:1.25rem;">
              ${ayuda}
            </p>
            <div style="display:flex; gap:0.75rem; justify-content:center; flex-wrap:wrap;">
              <button class="btn btn-secondary" onclick="window.openMessagesModal()">
                <i class="fas fa-comments"></i> Ir al Chat con un Profesional
              </button>
              <button class="btn btn-primary" onclick="window.openScheduleCallModal()">
                <i class="fas fa-video"></i> Solicitar Videollamada
              </button>
            </div>
          </div>
        `;
      }

      if (typeof window.showToast === 'function') {
        window.showToast('No se pudo conectar con el Agente RAG. Intenta nuevamente en unos segundos.', 'warning');
      }

    } finally {
      ragState.cargando = false;
      if (btnEnviar) {
        btnEnviar.disabled = false;
        btnEnviar.innerHTML = '<i class="fas fa-paper-plane"></i> Consultar';
      }
    }
  };

  // ============================================================================
  // CHIPS DE CONSULTA RÁPIDA
  // ============================================================================
  window.ragUsarChip = function (btn) {
    const texto = btn.textContent.trim();
    const textarea = document.getElementById('ragMensajeInput');
    if (textarea) {
      textarea.value = texto;
      textarea.focus();
    }
    // Resaltar chip seleccionado
    document.querySelectorAll('.rag-chip').forEach(c => c.style.outline = '');
    btn.style.outline = '2px solid var(--primary-blue)';
  };

  // ============================================================================
  // ENTER KEY en el textarea del agente
  // ============================================================================
  document.addEventListener('DOMContentLoaded', () => {
    const textarea = document.getElementById('ragMensajeInput');
    if (textarea) {
      textarea.addEventListener('keydown', (e) => {
        // Ctrl+Enter o Cmd+Enter para enviar
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault();
          window.ragEnviarConsulta();
        }
      });
    }
  });

  // ============================================================================
  // HELPERS DE VISIBILIDAD DEL PANEL (usados por sidebarCitizenAction en app.js)
  // ============================================================================
  window.mostrarPanelAgente = function () {
    // Ocultar otras secciones del dashboard ciudadano
    const secciones = [
      'citizenDashboardTableBody',
    ];
    // Ocultar tabla de casos y botonera inferior
    const trackCard = document.querySelector('#viewCitizenSection .tracking-card');
    if (trackCard) trackCard.style.display = 'none';
    // Mostrar el panel del agente
    mostrar('agenteRAGPanel');
  };

  window.ocultarPanelAgente = function () {
    ocultar('agenteRAGPanel');
    const trackCard = document.querySelector('#viewCitizenSection .tracking-card');
    if (trackCard) trackCard.style.display = '';
  };

})();

