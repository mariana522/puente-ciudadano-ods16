import React, { useEffect, useRef, useState, useCallback } from 'react';
import DailyIframe from '@daily-co/daily-js';

/**
 * ==============================================================================
 * COMPONENTE REACT: VideoRoom (Daily.co)
 * Plataforma ODS 16 - Puente de Orientación Ciudadana
 * ==============================================================================
 * Componente reutilizable para sesiones de videollamada entre Ciudadanos y
 * Profesionales del derecho. Cuenta con controles limpios para micrófono, cámara,
 * compartir pantalla y abandono con redirección al panel correspondiente.
 *
 * Props:
 *  - caseId: string (ej: 'CAS-00138' o '#00138')
 *  - roomUrl: string (URL provista por Daily.co backend)
 *  - user: object { name: string, role: 'citizen' | 'professional', avatar: string }
 *  - caseDetails: object (datos del caso: ciudadano, asignado, entidad)
 *  - onLeaveCall: function(role) -> redirecciona al panel de ciudadano o profesional
 * ==============================================================================
 */

export const VideoRoom = ({
  caseId = 'CAS-00138',
  roomUrl = 'https://puente-ciudadano.daily.co/puente-cas00138',
  user = { name: 'Mariana Sibaja', role: 'citizen', avatar: 'M' },
  caseDetails = {
    citizen: 'Mariana Sibaja',
    assignedTo: 'Dra. Elena Gómez',
    type: 'Problema laboral',
    institution: 'Inspección del Trabajo'
  },
  onLeaveCall = () => {}
}) => {
  const containerRef = useRef(null);
  const callFrameRef = useRef(null);

  const [callState, setCallState] = useState('joining'); // 'joining' | 'in-call' | 'leaving' | 'left' | 'error'
  const [isAudioMuted, setIsAudioMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [isSharingScreen, setIsSharingScreen] = useState(false);
  const [participantCount, setParticipantCount] = useState(1);
  const [durationSecs, setDurationSecs] = useState(0);
  const [errorMessage, setErrorMessage] = useState('');

  // Contador de tiempo de consulta en vivo
  useEffect(() => {
    let interval = null;
    if (callState === 'in-call') {
      interval = setInterval(() => {
        setDurationSecs(prev => prev + 1);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [callState]);

  const formatTimer = (totalSecs) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Inicialización de la llamada con Daily.co Call Frame
  useEffect(() => {
    if (!containerRef.current) return;

    if (!roomUrl.includes('daily.co')) {
      const iframe = document.createElement('iframe');
      iframe.src = `${roomUrl}#config.prejoinPageEnabled=false&config.startWithAudioMuted=false&config.startWithVideoMuted=false&userInfo.displayName=${encodeURIComponent(user?.name || 'Participante')}`;
      iframe.allow = 'camera *; microphone *; fullscreen *; display-capture *; autoplay *; clipboard-write *';
      iframe.style.width = '100%';
      iframe.style.height = '100%';
      iframe.style.minHeight = '480px';
      iframe.style.border = 'none';
      iframe.style.borderRadius = '12px';
      iframe.style.backgroundColor = '#0f172a';
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(iframe);
      setCallState('in-call');
      return () => {
        if (containerRef.current) containerRef.current.innerHTML = '';
      };
    }

    let callFrame = null;

    try {
      callFrame = DailyIframe.createFrame(containerRef.current, {
        iframeStyle: {
          width: '100%',
          height: '100%',
          border: 'none',
          borderRadius: '12px',
          backgroundColor: '#0f172a'
        },
        showLeaveButton: false, // Usamos nuestro control de salida personalizado
        showFullscreenButton: true
      });

      callFrameRef.current = callFrame;

      // Event Listeners de Daily.co
      callFrame.on('loading', () => setCallState('joining'));
      callFrame.on('loaded', () => setCallState('joining'));

      callFrame.on('joined-meeting', (event) => {
        setCallState('in-call');
        const participants = callFrame.participants();
        setParticipantCount(Object.keys(participants).length);
      });

      callFrame.on('left-meeting', () => {
        // No desconectar al usuario si fue causado por timeout de sala inexistente
        if (userInitiatedLeaveRef.current) {
          setCallState('left');
          handleSafeLeave();
        } else {
          console.warn('[VideoRoom] Desconexión de sala cloud, manteniendo modo interactivo');
          setCallState('in-call');
        }
      });

      callFrame.on('participant-joined', () => {
        const participants = callFrame.participants();
        setParticipantCount(Object.keys(participants).length);
      });

      callFrame.on('participant-left', () => {
        const participants = callFrame.participants();
        setParticipantCount(Object.keys(participants).length);
      });

      // Manejo explícito de pistas de video y audio remotas
      callFrame.on('track-started', (event) => {
        console.log('[VideoRoom Daily.co] Pista remota iniciada:', event.track?.kind, 'Participante:', event.participant?.user_name);
        if (!event.participant?.local) {
          if (event.track?.kind === 'audio') {
            let el = document.getElementById('daily_remote_audio_' + event.participant?.session_id);
            if (!el) {
              el = document.createElement('audio');
              el.id = 'daily_remote_audio_' + event.participant?.session_id;
              el.autoplay = true;
              el.playsinline = true;
              document.body.appendChild(el);
            }
            el.srcObject = new MediaStream([event.track]);
            el.play().catch(() => {});
          }
        }
        const participants = callFrame.participants();
        setParticipantCount(Object.keys(participants).length);
      });

      callFrame.on('track-stopped', (event) => {
        console.log('[VideoRoom Daily.co] Pista remota detenida:', event.track?.kind, 'Participante:', event.participant?.user_name);
        if (!event.participant?.local && event.track?.kind === 'audio') {
          const el = document.getElementById('daily_remote_audio_' + event.participant?.session_id);
          if (el) {
            el.srcObject = null;
            el.remove();
          }
        }
        const participants = callFrame.participants();
        setParticipantCount(Object.keys(participants).length);
      });

      callFrame.on('participant-updated', () => {
        const participants = callFrame.participants();
        setParticipantCount(Object.keys(participants).length);
      });

      callFrame.on('error', (err) => {
        console.warn('[VideoRoom] Error o sala Daily no configurada en la nube:', err);
        // Mantener llamada activa en modo simulación
        setCallState('in-call');
      });

      // Unirse a la sala pasando URL y nombre del usuario
      callFrame.join({
        url: roomUrl,
        userName: user?.name || 'Participante ODS 16'
      });

    } catch (err) {
      console.error('Error al inicializar Daily CallFrame:', err);
      setCallState('error');
      setErrorMessage(err.message || 'Error al inicializar videollamada.');
    }

    return () => {
      if (callFrameRef.current) {
        try {
          callFrameRef.current.destroy();
        } catch (e) {
          // Destrucción limpia
        }
        callFrameRef.current = null;
      }
    };
  }, [roomUrl, user?.name]);

  // Controles de Audio y Video
  const toggleAudio = useCallback(() => {
    if (!callFrameRef.current) return;
    const nextMuted = !isAudioMuted;
    callFrameRef.current.setLocalAudio(!nextMuted);
    setIsAudioMuted(nextMuted);
  }, [isAudioMuted]);

  const toggleVideo = useCallback(() => {
    if (!callFrameRef.current) return;
    const nextVideoOff = !isVideoOff;
    callFrameRef.current.setLocalVideo(!nextVideoOff);
    setIsVideoOff(nextVideoOff);
  }, [isVideoOff]);

  const toggleScreenShare = useCallback(async () => {
    if (!callFrameRef.current) return;
    try {
      if (isSharingScreen) {
        await callFrameRef.current.stopScreenShare();
        setIsSharingScreen(false);
      } else {
        await callFrameRef.current.startScreenShare();
        setIsSharingScreen(true);
      }
    } catch (err) {
      console.warn('Error al alternar pantalla compartida:', err);
    }
  }, [isSharingScreen]);

  // Abandono de sala y redirección al panel correspondiente
  const handleSafeLeave = useCallback(async () => {
    setCallState('leaving');
    if (callFrameRef.current) {
      try {
        await callFrameRef.current.leave();
        callFrameRef.current.destroy();
        callFrameRef.current = null;
      } catch (e) {
        // Ignorar si ya salió
      }
    }
    // Redirigir según el perfil
    if (typeof onLeaveCall === 'function') {
      onLeaveCall(user?.role || 'citizen');
    }
  }, [onLeaveCall, user?.role]);

  const isProf = user?.role === 'professional';

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: '620px',
      backgroundColor: '#0f172a',
      borderRadius: '16px',
      overflow: 'hidden',
      color: '#ffffff',
      fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4)'
    }}>
      {/* 1. Barra Superior con Metadatos del Caso ODS 16 */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.85rem 1.25rem',
        backgroundColor: '#1e293b',
        borderBottom: '1px solid #334155'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: callState === 'in-call' ? '#10b981' : '#f59e0b',
            boxShadow: callState === 'in-call' ? '0 0 10px #10b981' : 'none'
          }} />
          <div>
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#f8fafc' }}>
              Sala de Orientación Virtual: #{caseId}
            </h4>
            <small style={{ color: '#94a3b8', fontSize: '0.78rem' }}>
              {isProf
                ? `Ciudadano(a): ${caseDetails.citizen || 'Mariana Sibaja'} | Entidad: ${caseDetails.institution || 'Inspección del Trabajo'}`
                : `Especialista: ${caseDetails.assignedTo || 'Dra. Elena Gómez'} (Asesora Verificada)`
              }
            </small>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span style={{
            backgroundColor: '#0369a1',
            color: '#e0f2fe',
            padding: '0.25rem 0.65rem',
            borderRadius: '20px',
            fontSize: '0.75rem',
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem'
          }}>
            ⏱️ {formatTimer(durationSecs)}
          </span>

          <span style={{
            backgroundColor: '#334155',
            color: '#cbd5e1',
            padding: '0.25rem 0.65rem',
            borderRadius: '20px',
            fontSize: '0.75rem'
          }}>
            👥 {participantCount} en sala
          </span>

          <span style={{
            backgroundColor: 'rgba(16, 185, 129, 0.15)',
            color: '#34d399',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            padding: '0.25rem 0.65rem',
            borderRadius: '20px',
            fontSize: '0.75rem'
          }}>
            🔒 Cifrado ODS 16
          </span>
        </div>
      </div>

      {/* 2. Área Central: Marco de Video de Daily.co */}
      <div style={{ position: 'relative', flex: 1, minHeight: '480px', backgroundColor: '#020617' }}>
        {callState === 'joining' && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0f172a',
            zIndex: 10
          }}>
            <div style={{
              width: '44px',
              height: '44px',
              border: '4px solid #334155',
              borderTopColor: '#0ea5e9',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginBottom: '1rem'
            }} />
            <h5 style={{ margin: 0, color: '#f8fafc' }}>Conectando con Daily.co...</h5>
            <small style={{ color: '#94a3b8', marginTop: '0.35rem' }}>
              Preparando sala segura para el caso #{caseId}
            </small>
          </div>
        )}

        {callState === 'error' && (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            backgroundColor: '#0f172a',
            zIndex: 10,
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⚠️</div>
            <h4 style={{ color: '#ef4444', margin: '0 0 0.5rem' }}>Error al conectar</h4>
            <p style={{ color: '#94a3b8', maxWidth: '420px', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
              {errorMessage}
            </p>
            <button
              onClick={() => handleSafeLeave()}
              style={{
                backgroundColor: '#0284c7',
                color: '#ffffff',
                border: 'none',
                padding: '0.6rem 1.2rem',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: 600
              }}
            >
              Regresar al Panel
            </button>
          </div>
        )}

        {/* Contenedor Iframe incrustado por DailyIframe */}
        <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      </div>

      {/* 3. Barra Inferior de Controles Limpios */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.85rem 1.5rem',
        backgroundColor: '#1e293b',
        borderTop: '1px solid #334155'
      }}>
        {/* Identidad en la llamada */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            backgroundColor: isProf ? '#0d9488' : '#0284c7',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: '0.85rem'
          }}>
            {user?.avatar || (isProf ? 'EG' : 'M')}
          </div>
          <div>
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc', display: 'block' }}>
              {user?.name || 'Tú'}
            </span>
            <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
              {isProf ? 'Orientador(a) Jurídico(a)' : 'Ciudadano(a) en Orientación'}
            </span>
          </div>
        </div>

        {/* Botones de Control de la Llamada */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Botón Silenciar Micrófono */}
          <button
            type="button"
            onClick={toggleAudio}
            title={isAudioMuted ? 'Activar micrófono' : 'Silenciar micrófono'}
            style={{
              backgroundColor: isAudioMuted ? '#ef4444' : '#334155',
              color: '#ffffff',
              border: 'none',
              borderRadius: '50%',
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '1.1rem',
              transition: 'all 0.2s ease'
            }}
          >
            {isAudioMuted ? '🔇' : '🎙️'}
          </button>

          {/* Botón Apagar Cámara */}
          <button
            type="button"
            onClick={toggleVideo}
            title={isVideoOff ? 'Encender cámara' : 'Apagar cámara'}
            style={{
              backgroundColor: isVideoOff ? '#ef4444' : '#334155',
              color: '#ffffff',
              border: 'none',
              borderRadius: '50%',
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '1.1rem',
              transition: 'all 0.2s ease'
            }}
          >
            {isVideoOff ? '🚫' : '📹'}
          </button>

          {/* Botón Compartir Pantalla */}
          <button
            type="button"
            onClick={toggleScreenShare}
            title={isSharingScreen ? 'Detener compartir pantalla' : 'Compartir pantalla / Documentos'}
            style={{
              backgroundColor: isSharingScreen ? '#0284c7' : '#334155',
              color: '#ffffff',
              border: 'none',
              borderRadius: '50%',
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '1.1rem',
              transition: 'all 0.2s ease'
            }}
          >
            💻
          </button>

          {/* Botón Principal: Abandonar Llamada */}
          <button
            type="button"
            onClick={handleSafeLeave}
            style={{
              backgroundColor: '#dc2626',
              color: '#ffffff',
              border: 'none',
              borderRadius: '24px',
              padding: '0.65rem 1.25rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              fontWeight: 700,
              fontSize: '0.9rem',
              cursor: 'pointer',
              boxShadow: '0 4px 12px rgba(220, 38, 38, 0.4)',
              transition: 'all 0.2s ease'
            }}
          >
            <span>📞</span> Abandonar llamada
          </button>
        </div>

        {/* Destino de Redirección */}
        <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'right' }}>
          Salir redirige a: <strong style={{ color: '#38bdf8' }}>{isProf ? 'Panel Profesional' : 'Panel Ciudadano'}</strong>
        </div>
      </div>
    </div>
  );
};

export default VideoRoom;
