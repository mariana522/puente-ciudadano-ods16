
USE `puente_ciudadano`;

-- Actualizar usuarios con datos completos de perfil independiente
UPDATE `usuarios` SET 
  `documento` = '1.067.892.340',
  `ciudad` = 'Montería, Córdoba',
  `direccion` = 'Barrio La Castellana, Calle 58 # 12-40'
WHERE `codigo` = 'USR-001' OR `correo` = 'mariana.sibaja@ejemplo.com';

UPDATE `usuarios` SET 
  `documento` = '52.489.102',
  `tarjeta_profesional` = 'TP-84920-CSJ',
  `institucion` = 'Consultorio Jurídico MinTrabajo',
  `especialidad` = 'Derecho Laboral y Conciliación',
  `ciudad` = 'Montería, Córdoba'
WHERE `codigo` = 'USR-002' OR `correo` = 'elena.gomez@asesores.org';

UPDATE `usuarios` SET 
  `documento` = '1.098.765.432',
  `ciudad` = 'Bogotá D.C.',
  `direccion` = 'Carrera 7 # 45-10'
WHERE `codigo` = 'USR-003' OR `correo` = 'carlos.rodriguez@ejemplo.com';

UPDATE `usuarios` SET 
  `documento` = '79.345.678',
  `tarjeta_profesional` = 'TP-63211-CSJ',
  `institucion` = 'Defensoría de Familia / Comisaría',
  `especialidad` = 'Derecho de Familia y Menores',
  `ciudad` = 'Montería, Córdoba'
WHERE `codigo` = 'USR-004' OR `correo` = 'mauricio.padilla@asesores.org';

UPDATE `usuarios` SET 
  `documento` = '1.065.432.890',
  `tarjeta_profesional` = 'TP-99412-CSJ',
  `institucion` = 'Colegio de Abogados de Córdoba',
  `especialidad` = 'Derecho Administrativo y Constitucional',
  `ciudad` = 'Montería, Córdoba',
  `direccion` = 'Calle 15 # 8-30'
WHERE `nombre` LIKE '%Daniela Doria%';

-- Insertar casos adicionales para que cada profesional tenga sus propios casos
INSERT IGNORE INTO `casos` (
  `codigo`, `ciudadano`, `correo_ciudadano`, `tipo`, `subtipo`, `descripcion`,
  `estado`, `profesional_asignado`, `fecha`, `institucion`, `direccion_institucion`,
  `telefono_institucion`, `horario_institucion`, `checklist`, `observaciones`
) VALUES 
(
  'CAS-00140', 'Andrés Meza', 'andres.meza@ejemplo.com', 'Problema con institución',
  'Cobro coactivo indebido de predial', 'Notificación de cobro por predio enajenado hace tres años.',
  'Pendiente', 'Por asignar', '2026-09-22', 'Personería Municipal',
  'Palacio Municipal, Carrera 3 # 12-20', '(604) 789 2020', 'Lunes a Viernes 7:30 am - 12:00 m',
  '["Certificado de tradición actualizado", "Escritura de venta", "Oficio de solicitud"]', ''
),
(
  'CAS-00141', 'Mariana Sibaja', 'mariana.sibaja@ejemplo.com', 'Derechos ciudadanos',
  'Derecho a la salud - Tutela de medicamentos', 'EPS niega entrega de medicamento vital ordenado por especialista.',
  'Finalizado', 'Dra. Elena Gómez', '2026-08-30', 'Defensoría del Pueblo',
  'Avenida Circunvalar # 32-15', '01 8000 914814', 'Lunes a Viernes 8:00 am - 5:00 pm',
  '["Fórmula médica", "Negativa de la EPS", "Fallo de tutela"]', 'Fallo favorable obtenido. Medicamentos entregados.'
),
(
  'CAS-00142', 'Hernando Ayala', 'hernando.ayala@ejemplo.com', 'Derechos ciudadanos',
  'Protección de datos y hábeas data financiero', 'Reporte negativo en central de riesgo sin previa notificación de ley.',
  'En curso', 'Daniela Doria', '2026-09-23', 'Superintendencia de Industria y Comercio',
  'Carrera 13 # 27-00, Sede Central', '01 8000 910165', 'Lunes a Viernes 8:00 am - 4:30 pm',
  '["Copia de reclamación radicada", "Constancia de reporte en CIFIN/Datacrédito", "Borrador de tutela"]', 'Orientación en marcha con la profesional Daniela Doria.'
),
(
  'CAS-00143', 'Lucía Morales', 'lucia.morales@ejemplo.com', 'Conflicto familiar',
  'Custodia y régimen de visitas concertado', 'Orientación previa para firma de acta de mutuo acuerdo ante defensoría.',
  'Pendiente', 'Daniela Doria', '2026-09-24', 'Comisaría de Familia',
  'Centro de Convivencia, Calle 15 # 8-30', 'Línea 106', 'Atención 24 Horas',
  '["Registro civil de los menores", "Propuesta de acuerdo de visitas"]', 'Cita agendada para revisión documental.'
);
