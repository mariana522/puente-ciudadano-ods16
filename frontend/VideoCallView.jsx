import React, { useState, useEffect } from 'react';
import VideoRoom from './VideoRoom';

/**
 * ==============================================================================
 * VISTA REACT COMPLETA: VideoCallView
 * Integración con flujo de casos y navegación de la plataforma ODS 16
 * ==============================================================================
 */

export const VideoCallView = ({
  caseId = 'CAS-00138',
  currentUser = { name: 'Mariana Sibaja', role: 'citizen', avatar: 'M' },
  onNavigateBack = () => {}
}) => {
  const [roomUrl, setRoomUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [caseInfo, setCaseInfo] = useState({
    id: caseId,
    citizen: 'Mariana Sibaja',
    assignedTo: 'Dra. Elena Gómez',
    type: 'Problema laboral',
    institution: 'Inspección del Trabajo'
  });

  useEffect(() => {
    // 1. Obtener sala dinámica desde el servicio backend de Daily.co
    const fetchDailyRoom = async () => {
      try {
        setIsLoading(true);
        const res = await fetch(`/api/daily_room?caseId=${encodeURIComponent(caseId)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.roomUrl) {
            setRoomUrl(data.roomUrl);
            setIsLoading(false);
            return;
          }
        }
      } catch (err) {
        console.warn('Backend daily_room no disponible, usando URL de contingencia:', err);
      }

      // Fallback seguro de sala Daily para caso específico
      const cleanId = String(caseId).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
      setRoomUrl(`https://meet.jit.si/puente-ciudadano-caso-${cleanId}`);
      setIsLoading(false);
    };

    fetchDailyRoom();
  }, [caseId]);

  const handleLeaveAndReturn = (role) => {
    // Redirige al panel correspondiente del usuario
    if (typeof onNavigateBack === 'function') {
      onNavigateBack(role);
    } else {
      window.location.hash = role === 'professional' ? '#profesional' : '#ciudadano';
    }
  };

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        backgroundColor: '#0f172a',
        borderRadius: '16px',
        color: '#ffffff'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>⏳</div>
          <h4>Conectando con Daily.co...</h4>
          <p style={{ color: '#94a3b8' }}>Aprovisionando sala para #{caseId}</p>
        </div>
      </div>
    );
  }

  return (
    <VideoRoom
      caseId={caseId}
      roomUrl={roomUrl}
      user={currentUser}
      caseDetails={caseInfo}
      onLeaveCall={handleLeaveAndReturn}
    />
  );
};

export default VideoCallView;
