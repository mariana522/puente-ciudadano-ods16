import React, { createContext, useContext, useState } from 'react';

/**
 * ============================================================================
 * ODS 16 - PUENTE CIUDADANO: REACT FULL-STACK ARCHITECTURE (FIGMA M1)
 * Lógica de Autenticación, Estado Global y Renderizado Condicional de Vistas
 * Guía de Implementación para Universidad Cooperativa de Colombia
 * ============================================================================
 */

// 1. CONTEXTO Y MANEJADOR DE SESIÓN GLOBAL
const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  // Estado de Autenticación:
  // null = Sin sesión (Página Pública)
  // { role: 'citizen', name: 'Mariana Sibaja', ... } = Panel Ciudadano
  // { role: 'professional', name: 'Dra. Elena Gómez', ... } = Panel Profesional
  const [currentUser, setCurrentUser] = useState(null);

  // Casos activos
  const [cases, setCases] = useState([
    {
      id: 'CAS-00138',
      citizen: 'Mariana Sibaja',
      type: 'Problema laboral',
      status: 'En curso',
      date: '2026-09-20',
      assignedTo: 'Dra. Elena Gómez',
      institution: 'Inspección del Trabajo'
    },
    {
      id: 'CAS-00139',
      citizen: 'Carlos Rodríguez',
      type: 'Derechos ciudadanos',
      status: 'Pendiente',
      date: '2026-09-21',
      assignedTo: 'Por asignar',
      institution: 'Personería Municipal'
    }
  ]);

  // Funciones de simulación de inicio y cierre de sesión
  const loginAsCitizen = () => {
    setCurrentUser({
      name: 'Mariana Sibaja',
      role: 'citizen',
      email: 'mariana.sibaja@ejemplo.com',
      avatar: 'M'
    });
  };

  const loginAsProfessional = () => {
    setCurrentUser({
      name: 'Dra. Elena Gómez',
      role: 'professional',
      email: 'elena.gomez@asesores.org',
      avatar: 'EG'
    });
  };

  const logout = () => {
    setCurrentUser(null);
  };

  const updateCaseStatus = (id, newStatus) => {
    setCases(prev => prev.map(c => c.id === id ? { ...c, status: newStatus } : c));
  };

  return (
    <AuthContext.Provider value={{
      currentUser,
      loginAsCitizen,
      loginAsProfessional,
      logout,
      cases,
      updateCaseStatus
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);


// ============================================================================
// 2. COMPONENTE PRINCIPAL CON RENDERIZADO CONDICIONAL DE VISTAS (APP.JSX)
// ============================================================================
export const AppPuenteCiudadano = () => {
  const { currentUser, loginAsCitizen, loginAsProfessional, logout } = useAuth();

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      
      {/* 1. ESTADO SIN SESIÓN: Muestra Navbar Pública y Landing (Figma Pág 17) */}
      {currentUser === null && (
        <>
          <PublicNavbar onLoginCitizen={loginAsCitizen} onLoginProf={loginAsProfessional} />
          <PublicLandingView onLoginCitizen={loginAsCitizen} onLoginProf={loginAsProfessional} />
        </>
      )}

      {/* 2. ESTADO CON SESIÓN: Navbar Autenticada con Perfil y Campanita */}
      {currentUser !== null && (
        <AuthNavbar user={currentUser} />
      )}

      {/* 2A. VISTA DE CIUDADANO (Figma Pág 18 Superior) */}
      {currentUser?.role === 'citizen' && (
        <CitizenDashboardView user={currentUser} onLogout={logout} />
      )}

      {/* 2B. VISTA DE PROFESIONAL (Figma Pág 18 Inferior y Pág 19) */}
      {currentUser?.role === 'professional' && (
        <ProfessionalDashboardView user={currentUser} onLogout={logout} />
      )}

      {/* SELECTOR TEMPORAL DE PRUEBA PARA DESARROLLO (Fijo en esquina inferior) */}
      <DevQuickSwitcher
        currentRole={currentUser?.role || null}
        onSetPublic={logout}
        onSetCitizen={loginAsCitizen}
        onSetProf={loginAsProfessional}
      />
    </div>
  );
};


// ============================================================================
// 3. BARRA DE NAVEGACIÓN PÚBLICA (FIGMA PÁGINA 17)
// ============================================================================
export const PublicNavbar = ({ onLoginCitizen, onLoginProf }) => {
  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur border-b border-slate-200 py-4 px-8 flex justify-between items-center">
      <div className="flex items-center gap-3 cursor-pointer">
        <div className="w-10 h-10 rounded-lg bg-teal-500 text-white flex items-center justify-center font-bold">
          <i className="fas fa-balance-scale"></i>
        </div>
        <div>
          <span className="font-extrabold text-blue-900 text-lg">ODS 16</span>
          <div className="text-xs text-teal-600 font-semibold">Puente Ciudadano</div>
        </div>
      </div>

      <nav className="hidden md:flex gap-6 font-semibold text-slate-700 text-sm">
        <a href="#inicio" className="text-blue-700">Inicio</a>
        <a href="#como-funciona" className="hover:text-blue-700">¿Cómo funciona?</a>
        <a href="#servicios" className="hover:text-blue-700">Servicios</a>
        <a href="#faq" className="hover:text-blue-700">Preguntas frecuentes</a>
      </nav>

      <div className="flex gap-3">
        <button
          onClick={onLoginCitizen}
          className="px-4 py-2 text-sm font-semibold text-blue-700 bg-sky-50 border border-sky-200 rounded-full hover:bg-sky-100"
        >
          <i className="fas fa-user mr-1"></i> Iniciar sesión
        </button>
        <button
          onClick={onLoginProf}
          className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-full hover:bg-blue-700 shadow"
        >
          <i className="fas fa-user-plus mr-1"></i> Registrarse
        </button>
      </div>
    </header>
  );
};


// ============================================================================
// 4. BARRA DE NAVEGACIÓN AUTENTICADA (FIGMA PÁGINAS 18 Y 19)
// ============================================================================
export const AuthNavbar = ({ user }) => {
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200 py-3 px-8 flex justify-between items-center shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-teal-500 text-white flex items-center justify-center font-bold">
          <i className="fas fa-balance-scale"></i>
        </div>
        <span className="font-extrabold text-blue-900 text-lg">ODS 16 Puente Ciudadano</span>
      </div>

      <nav className="hidden md:flex gap-6 font-semibold text-slate-700 text-sm">
        <span className="text-blue-700">Inicio</span>
        <span>¿Cómo funciona?</span>
        <span>Servicios</span>
        <span>Preguntas frecuentes</span>
      </nav>

      <div className="flex items-center gap-4">
        {/* Notificaciones Bell Icon */}
        <button className="text-slate-600 hover:text-blue-600 text-lg p-2 rounded-full hover:bg-slate-100 relative">
          <i className="fas fa-bell"></i>
          <span className="w-2 h-2 rounded-full bg-red-500 absolute top-2 right-2"></span>
        </button>

        {/* Perfil Tag */}
        <div className="flex items-center gap-2 bg-sky-50 px-3 py-1.5 rounded-full border border-sky-100 cursor-pointer">
          <div className="w-7 h-7 rounded-full bg-teal-600 text-white text-xs font-bold flex items-center justify-center">
            {user.avatar}
          </div>
          <span className="text-sm font-bold text-slate-800">Perfil</span>
        </div>
      </div>
    </header>
  );
};


// ============================================================================
// 5. VISTA DEL CIUDADANO CON MENÚ LATERAL IZQUIERDO (FIGMA PÁGINA 18)
// ============================================================================
export const CitizenDashboardView = ({ user, onLogout }) => {
  const { cases, updateCaseStatus } = useAuth();
  const [activeTab, setActiveTab] = useState('cases');

  // FILTRADO ESTRICTO: Solo los casos pertenecientes a este ciudadano (Mariana)
  const myCases = cases.filter(c => c.citizen === user.name || c.citizen?.toLowerCase().includes('mariana'));

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 flex flex-col md:flex-row gap-8">
      
      {/* MENÚ LATERAL IZQUIERDO (FIGMA PÁGINA 18) */}
      <aside className="w-full md:w-64 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between shrink-0">
        <div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 px-2">
            Menú Ciudadano
          </div>
          <ul className="space-y-1">
            <li>
              <button
                onClick={() => setActiveTab('report')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${activeTab === 'report' ? 'bg-sky-50 text-blue-700 font-bold' : 'text-slate-700 hover:bg-slate-50'}`}
              >
                <i className="fas fa-file-circle-plus text-slate-500"></i> Reportar situación
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('cases')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${activeTab === 'cases' ? 'bg-sky-50 text-blue-700 font-bold border-l-4 border-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}
              >
                <i className="fas fa-folder-open text-blue-600"></i> Mis casos
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('messages')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <i className="fas fa-comments text-slate-500"></i> Mensajes
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('videocalls')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <i className="fas fa-video text-slate-500"></i> Videollamadas
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('notifications')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <i className="fas fa-bell text-slate-500"></i> Notificaciones
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('institutions')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <i className="fas fa-building-columns text-slate-500"></i> Instituciones
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('profile')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <i className="fas fa-user text-slate-500"></i> Mi perfil
              </button>
            </li>
            <li className="pt-4 border-t border-slate-100">
              <button
                onClick={onLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 transition"
              >
                <i className="fas fa-arrow-right-from-bracket"></i> Cerrar Sesión
              </button>
            </li>
          </ul>
        </div>

        <div className="text-center text-xs italic text-slate-400 mt-8 pt-4 border-t border-dashed border-slate-200">
          "Juntos por una sociedad más justa"
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL DEL CIUDADANO (FIGMA PÁGINA 18) */}
      <main className="flex-1 space-y-6">
        
        {/* Welcome Card: Hola, Mariana */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 mb-1">Hola, {user.name.split(' ')[0]}</h1>
            <p className="text-slate-500 text-sm">
              ¿En qué podemos ayudarte hoy? Recuerda que tu situación importa.
            </p>
          </div>
          <div className="w-16 h-16 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-2xl font-bold">
            <i className="fas fa-user"></i>
          </div>
        </div>

        {/* Card: Mis casos */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-900">Mis casos</h2>
            <span className="text-xs font-bold bg-teal-50 text-teal-700 px-3 py-1 rounded-full border border-teal-100">
              Expedientes activos
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase">
                  <th className="py-3 px-2"># casos</th>
                  <th className="py-3 px-2">Situación</th>
                  <th className="py-3 px-2">Estado</th>
                  <th className="py-3 px-2">Fecha</th>
                  <th className="py-3 px-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {myCases.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-2 font-bold text-blue-700">{c.id}</td>
                    <td className="py-3 px-2 font-semibold text-slate-800">{c.type}</td>
                    <td className="py-3 px-2">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold inline-block border ${
                          c.status === 'Finalizado' 
                            ? 'bg-green-100 text-green-700 border-green-200' 
                            : c.status === 'Pendiente' 
                            ? 'bg-amber-100 text-amber-800 border-amber-200' 
                            : 'bg-sky-100 text-blue-700 border-sky-200'
                        }`}
                        title="Estado del caso (solo editable por el profesional)"
                      >
                        {c.status === 'Finalizado' ? '✅ Finalizado' : c.status === 'Pendiente' ? '⏳ Pendiente' : '🔄 En curso'}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-slate-500">{c.date}</td>
                    <td className="py-3 px-2">
                      <button className="px-3 py-1 bg-slate-100 text-slate-700 rounded-full font-semibold text-xs hover:bg-slate-200">
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Botones Inferiores de Figma (Página 18) */}
          <div className="flex gap-4 pt-4 border-t border-slate-100">
            <button className="px-4 py-2 bg-slate-100 text-slate-700 rounded-full text-sm font-semibold hover:bg-slate-200">
              <i className="fas fa-video mr-1.5 text-blue-600"></i> Programar videollamada
            </button>
            <button className="px-4 py-2 bg-slate-100 text-slate-700 rounded-full text-sm font-semibold hover:bg-slate-200">
              <i className="fas fa-comments mr-1.5 text-teal-600"></i> Mis mensajes
            </button>
          </div>
        </div>

      </main>
    </div>
  );
};


// ============================================================================
// 6. VISTA DEL PROFESIONAL CON MENÚ LATERAL IZQUIERDO (FIGMA PÁGINAS 18 Y 19)
// ============================================================================
export const ProfessionalDashboardView = ({ user, onLogout }) => {
  const { cases, updateCaseStatus } = useAuth();
  const [activeTab, setActiveTab] = useState('cases');
  const [profFilter, setProfFilter] = useState('all');

  const displayedCases = profFilter === 'all' ? cases : cases.filter(c => c.status === profFilter);

  return (
    <div className="max-w-7xl mx-auto py-8 px-4 flex flex-col md:flex-row gap-8">
      
      {/* MENÚ LATERAL DEL PROFESIONAL (FIGMA PÁGINAS 18 Y 19) */}
      <aside className="w-full md:w-64 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between shrink-0">
        <div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 px-2">
            Panel Profesional
          </div>
          <ul className="space-y-1">
            <li>
              <button
                onClick={() => setActiveTab('report')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <i className="fas fa-chart-line text-slate-500"></i> Reportar situación
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('agenda')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${activeTab === 'agenda' ? 'bg-sky-50 text-blue-700 font-bold border-l-4 border-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}
              >
                <i className="fas fa-calendar-day text-blue-600"></i> Agenda
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('cases')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold transition ${activeTab === 'cases' ? 'bg-sky-50 text-blue-700 font-bold border-l-4 border-blue-600' : 'text-slate-700 hover:bg-slate-50'}`}
              >
                <i className="fas fa-list-check text-teal-600"></i> Mis casos pendientes
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('availability')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <i className="fas fa-clock text-slate-500"></i> Mis Disponibilidades
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('messages')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <i className="fas fa-comments text-slate-500"></i> Mensajes
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('videocalls')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <i className="fas fa-video text-slate-500"></i> Videollamadas
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('notifications')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <i className="fas fa-bell text-slate-500"></i> Notificaciones
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('institutions')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <i className="fas fa-building-columns text-slate-500"></i> Instituciones
              </button>
            </li>
            <li>
              <button
                onClick={() => setActiveTab('profile')}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <i className="fas fa-user-doctor text-slate-500"></i> Mi perfil
              </button>
            </li>
            <li className="pt-4 border-t border-slate-100">
              <button
                onClick={onLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 transition"
              >
                <i className="fas fa-arrow-right-from-bracket"></i> Cerrar Sesión
              </button>
            </li>
          </ul>
        </div>

        <div className="text-center text-xs italic text-slate-400 mt-8 pt-4 border-t border-dashed border-slate-200">
          "Juntos por una sociedad más justa"
        </div>
      </aside>

      {/* CONTENIDO PRINCIPAL DEL PROFESIONAL */}
      <main className="flex-1 space-y-6">
        
        {/* Welcome Card */}
        <div className="bg-gradient-to-r from-teal-50 to-white p-6 rounded-2xl border border-slate-200 shadow-sm flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 mb-1">Bienvenido, {user.name}</h1>
            <p className="text-slate-600 italic text-sm">
              "La orientación también transforma vidas. Tu conocimiento y experiencia generan gran impacto."
            </p>
          </div>
          <div className="w-16 h-16 rounded-full bg-teal-700 text-white flex items-center justify-center text-2xl font-bold">
            {user.avatar}
          </div>
        </div>

        {/* Metrics Row (Figma Página 18) - Interactivo */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div 
            onClick={() => setProfFilter(profFilter === 'Pendiente' ? 'all' : 'Pendiente')}
            className={`p-5 rounded-2xl border cursor-pointer transition transform hover:-translate-y-1 ${profFilter === 'Pendiente' ? 'bg-amber-50 border-amber-400 shadow-md ring-2 ring-amber-300' : 'bg-white border-slate-200 shadow-sm'}`}
            title="Clic para filtrar casos pendientes"
          >
            <div className="text-3xl font-extrabold text-amber-500 mb-1">8</div>
            <div className="text-xs font-bold text-slate-500">Casos Pendientes (Asignados recientemente)</div>
            <span className="text-[11px] font-bold text-amber-600 mt-2 inline-block"><i className="fas fa-filter mr-1"></i> Clic para filtrar</span>
          </div>

          <div 
            onClick={() => setProfFilter(profFilter === 'En curso' ? 'all' : 'En curso')}
            className={`p-5 rounded-2xl border cursor-pointer transition transform hover:-translate-y-1 ${profFilter === 'En curso' ? 'bg-sky-50 border-sky-400 shadow-md ring-2 ring-sky-300' : 'bg-teal-50 border-teal-200 shadow-sm'}`}
            title="Clic para filtrar casos en curso"
          >
            <div className="text-3xl font-extrabold text-teal-700 mb-1">15</div>
            <div className="text-xs font-bold text-teal-800">Casos en Cursos (En proceso de orientación)</div>
            <span className="text-[11px] font-bold text-teal-600 mt-2 inline-block"><i className="fas fa-filter mr-1"></i> Clic para filtrar</span>
          </div>

          <div 
            onClick={() => setProfFilter(profFilter === 'Finalizado' ? 'all' : 'Finalizado')}
            className={`p-5 rounded-2xl border cursor-pointer transition transform hover:-translate-y-1 ${profFilter === 'Finalizado' ? 'bg-emerald-50 border-emerald-400 shadow-md ring-2 ring-emerald-300' : 'bg-white border-slate-200 shadow-sm'}`}
            title="Clic para filtrar casos atendidos"
          >
            <div className="text-3xl font-extrabold text-emerald-600 mb-1">42</div>
            <div className="text-xs font-bold text-slate-500">Ciudadanos atendidos (Este mes)</div>
            <span className="text-[11px] font-bold text-emerald-600 mt-2 inline-block"><i className="fas fa-chart-line mr-1"></i> Clic para filtrar</span>
          </div>
        </div>

        {/* Card: Casos Asignados */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-900">Casos Asignados</h2>
            <div className="flex gap-2">
              <button onClick={() => setProfFilter('all')} className={`px-2.5 py-1 rounded-full text-xs font-bold ${profFilter === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Todos</button>
              <button onClick={() => setProfFilter('Pendiente')} className={`px-2.5 py-1 rounded-full text-xs font-bold ${profFilter === 'Pendiente' ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600'}`}>Pendientes</button>
              <button onClick={() => setProfFilter('En curso')} className={`px-2.5 py-1 rounded-full text-xs font-bold ${profFilter === 'En curso' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600'}`}>En curso</button>
              <button onClick={() => setProfFilter('Finalizado')} className={`px-2.5 py-1 rounded-full text-xs font-bold ${profFilter === 'Finalizado' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Finalizados</button>
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-xs uppercase">
                  <th className="py-3 px-2"># casos</th>
                  <th className="py-3 px-2">Ciudadano</th>
                  <th className="py-3 px-2">Situación</th>
                  <th className="py-3 px-2">Estado</th>
                  <th className="py-3 px-2">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {displayedCases.map((c) => (
                  <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                    <td className="py-3 px-2 font-bold text-blue-700">{c.id}</td>
                    <td className="py-3 px-2 text-slate-800 font-semibold">{c.citizen}</td>
                    <td className="py-3 px-2 text-slate-600">{c.type}</td>
                    <td className="py-3 px-2">
                      <select
                        value={c.status}
                        onChange={(e) => updateCaseStatus(c.id, e.target.value)}
                        className={`px-2.5 py-1 rounded-full text-xs font-bold border cursor-pointer outline-none transition ${
                          c.status === 'Finalizado' 
                            ? 'bg-green-100 text-green-700 border-green-200' 
                            : c.status === 'Pendiente' 
                            ? 'bg-amber-100 text-amber-800 border-amber-200' 
                            : 'bg-sky-100 text-sky-800 border-sky-200'
                        }`}
                        title="Cambiar estado del caso"
                      >
                        <option value="Pendiente">⏳ Pendiente</option>
                        <option value="En curso">🔄 En curso</option>
                        <option value="Finalizado">✅ Finalizado</option>
                      </select>
                    </td>
                    <td className="py-3 px-2">
                      <button className="px-3 py-1 bg-teal-600 text-white rounded-full text-xs font-semibold hover:bg-teal-700">
                        Atender
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Card: Mi agenda hoy (Figma Página 19) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <div className="flex justify-between items-center border-b border-slate-100 pb-3">
            <h2 className="text-lg font-bold text-slate-900">Mi agenda hoy</h2>
            <span className="text-xs font-bold text-blue-700 bg-sky-50 px-3 py-1 rounded-full">
              Martes, 1 de septiembre 2026
            </span>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-4 p-3 bg-sky-50 rounded-xl border-l-4 border-teal-500 text-sm">
              <span className="font-bold text-blue-900 w-24">09:00 a.m.</span>
              <span className="flex-1 text-slate-700 font-medium">Videollamada caso #00138</span>
            </div>
            <div className="flex items-center gap-4 p-3 bg-sky-50 rounded-xl border-l-4 border-teal-500 text-sm">
              <span className="font-bold text-blue-900 w-24">11:00 a.m.</span>
              <span className="flex-1 text-slate-700 font-medium">Revisión de caso caso #00139</span>
            </div>
            <div className="flex items-center gap-4 p-3 bg-sky-50 rounded-xl border-l-4 border-teal-500 text-sm">
              <span className="font-bold text-blue-900 w-24">03:00 p.m.</span>
              <span className="flex-1 text-slate-700 font-medium">Videollamada caso #00129</span>
            </div>
          </div>

          <button className="px-5 py-2.5 bg-blue-600 text-white rounded-full text-sm font-semibold hover:bg-blue-700 shadow">
            Programar video llamada
          </button>
        </div>

      </main>
    </div>
  );
};


// ============================================================================
// 7. VISTA PÚBLICA DE INICIO (FIGMA PÁGINA 17)
// ============================================================================
export const PublicLandingView = ({ onLoginCitizen, onLoginProf }) => {
  return (
    <div className="space-y-12 pb-16">
      
      {/* Hero */}
      <section className="max-w-7xl mx-auto pt-12 px-6 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        <div>
          <h1 className="text-4xl font-extrabold text-blue-950 leading-tight mb-4">
            ¿No sabes a dónde acudir con tu situación?
          </h1>
          <p className="text-slate-600 text-lg mb-8">
            Encuentra orientación y conoce las opciones disponibles para tu caso.
          </p>
          <div className="flex gap-4">
            <button
              onClick={onLoginCitizen}
              className="px-6 py-3 bg-blue-600 text-white rounded-full font-bold shadow-lg hover:bg-blue-700"
            >
              Necesito orientación
            </button>
            <button
              onClick={onLoginProf}
              className="px-6 py-3 bg-white border-2 border-blue-600 text-blue-700 rounded-full font-bold hover:bg-blue-50"
            >
              Soy profesional
            </button>
          </div>
          <div className="mt-8 pt-4 border-t border-slate-200">
            <strong className="text-blue-800 text-sm block">Tu situación, nuestra orientación.</strong>
            <p className="text-xs text-slate-500">Conoce las opciones disponibles y encuentra el canal adecuado para recibir ayuda.</p>
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden shadow-xl border border-slate-200">
          <img src="assets/hero_bridge.jpg" alt="Puente digital ODS 16" className="w-full h-80 object-cover" />
        </div>
      </section>

      {/* Sección "¿Qué necesitas?" y Cuestionario */}
      <section className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-2 gap-12">
        <div className="space-y-6">
          <h2 className="text-3xl font-extrabold text-blue-950">¿Qué necesitas?</h2>
          <p className="text-slate-600 text-sm">
            Cuéntanos brevemente qué está sucediendo y te ayudaremos a identificar las opciones disponibles.
          </p>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <i className="fas fa-file-shield text-blue-600 text-xl"></i>
              <span className="text-sm font-semibold text-slate-800">Orientación clara y confiable</span>
            </div>
            <div className="flex items-center gap-3">
              <i className="fas fa-handshake-angle text-teal-600 text-xl"></i>
              <span className="text-sm font-semibold text-slate-800">Conexión con profesionales</span>
            </div>
            <div className="flex items-center gap-3">
              <i className="fas fa-building-columns text-amber-600 text-xl"></i>
              <span className="text-sm font-semibold text-slate-800">Información sobre instituciones confiables</span>
            </div>
          </div>
        </div>

        {/* Cuestionario Card */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-lg font-bold text-slate-900">Responde el cuestionario</h3>
          <p className="text-xs text-slate-500">Esto nos permitirá conocer mejor tu situación.</p>
          <div className="space-y-2 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="tipo" defaultChecked /> Problema laboral
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="tipo" /> Conflicto familiar
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="tipo" /> Problema con una institución
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" name="tipo" /> Derechos ciudadanos
            </label>
          </div>
          <button
            onClick={onLoginCitizen}
            className="w-full py-2.5 bg-teal-600 text-white rounded-full font-bold text-sm hover:bg-teal-700 shadow"
          >
            Continuar al diagnóstico
          </button>
        </div>
      </section>

    </div>
  );
};


// ============================================================================
// 8. SELECTOR TEMPORAL DE PRUEBA PARA DESARROLLO (DEV SWITCHER BAR)
// ============================================================================
export const DevQuickSwitcher = ({ currentRole, onSetPublic, onSetCitizen, onSetProf }) => {
  return (
    <div className="fixed bottom-4 left-4 bg-slate-900/90 backdrop-blur text-white px-3 py-2 rounded-full flex items-center gap-2 shadow-2xl border border-white/20 z-50 text-xs">
      <span className="text-slate-400 font-bold ml-1">
        <i className="fas fa-sliders mr-1"></i> Modo:
      </span>
      <button
        onClick={onSetPublic}
        className={`px-3 py-1 rounded-full font-semibold transition ${currentRole === null ? 'bg-teal-500 text-white' : 'bg-white/10 hover:bg-white/20'}`}
      >
        🌐 Pública
      </button>
      <button
        onClick={onSetCitizen}
        className={`px-3 py-1 rounded-full font-semibold transition ${currentRole === 'citizen' ? 'bg-teal-500 text-white' : 'bg-white/10 hover:bg-white/20'}`}
      >
        👤 Ciudadano (Mariana)
      </button>
      <button
        onClick={onSetProf}
        className={`px-3 py-1 rounded-full font-semibold transition ${currentRole === 'professional' ? 'bg-teal-500 text-white' : 'bg-white/10 hover:bg-white/20'}`}
      >
        🩺 Profesional (Dra. Elena)
      </button>
    </div>
  );
};
