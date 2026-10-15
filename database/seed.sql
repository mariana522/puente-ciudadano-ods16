-- ==============================================================================
-- PROYECTO: Plataforma ODS 16 - Puente de Orientación Ciudadana
-- ARCHIVO: seed.sql (Poblado de Datos Iniciales en 3FN)
-- ==============================================================================

USE `puente_ciudadano`;

-- 1. Roles
INSERT INTO `roles` (`id`, `nombre`, `descripcion`) VALUES
(1, 'citizen', 'Ciudadano solicitante de orientación y protección de derechos'),
(2, 'professional', 'Asesor jurídico y profesional orientador verificado'),
(3, 'admin', 'Administrador de plataforma institucional ODS 16')
ON DUPLICATE KEY UPDATE `descripcion` = VALUES(`descripcion`);

-- 2. Instituciones Públicas de Justicia
INSERT INTO `instituciones` (`id`, `nombre`, `sigla`, `direccion`, `telefono`, `horario_atencion`) VALUES
(1, 'Inspección del Trabajo', 'MinTrabajo', 'Calle 28 # 4-50, Sede Central MinTrabajo', '01 8000 112518', 'Lunes a Viernes 8:00 am - 4:00 pm'),
(2, 'Personería Municipal', 'Personería', 'Palacio Municipal, Carrera 3 # 12-20, Piso 1', '(604) 789 2020 Ext. 104', 'Lunes a Viernes 7:30 am - 12:00 m / 1:30 pm - 5:00 pm'),
(3, 'Comisaría de Familia', 'Comisaría', 'Centro de Convivencia Ciudadana, Calle 15 # 8-30', 'Línea Familia 106 / (604) 782 1100', 'Atención 24 Horas en turno de urgencias'),
(4, 'Defensoría del Pueblo', 'Defensoría', 'Avenida Circunvalar # 32-15', '01 8000 914814', 'Lunes a Viernes 8:00 am - 5:00 pm'),
(5, 'Consultorio Jurídico Universidad', 'Consultorio', 'Campus Universitario Sede Centro, Calle 30 # 6-22', '(604) 781 5000', 'Lunes a Viernes 8:00 am - 12:00 m / 2:00 pm - 6:00 pm')
ON DUPLICATE KEY UPDATE `nombre` = VALUES(`nombre`);

-- 3. Categorías de Casos ODS 16
INSERT INTO `categorias_casos` (`id`, `nombre`, `descripcion`, `ods_meta`) VALUES
(1, 'Problema laboral', 'Asuntos de despidos injustificados, falta de liquidación, acoso laboral y contratos', 'ODS 16.3'),
(2, 'Conflicto familiar', 'Custodia, alimentos de menores, violencia intrafamiliar y conciliaciones extrajudiciales', 'ODS 16.3'),
(3, 'Derechos ciudadanos', 'Tutelas de salud, derechos de petición vencidos y debido proceso ante entidades', 'ODS 16.10'),
(4, 'Problema con institución', 'Cobros coactivos indebidos, negligencia administrativa y barreras en trámites públicos', 'ODS 16.6')
ON DUPLICATE KEY UPDATE `nombre` = VALUES(`nombre`);

-- 4. Usuarios
INSERT INTO `usuarios` (`id`, `codigo`, `nombre`, `correo`, `password_hash`, `rol_id`, `telefono`, `avatar`, `ciudad`) VALUES
(1, 'USR-001', 'Mariana Sibaja', 'mariana.sibaja@ejemplo.com', 'password123', 1, '+57 310 456 7890', 'M', 'Montería, Córdoba'),
(2, 'USR-002', 'Dra. Elena Gómez', 'elena.gomez@asesores.org', 'password123', 2, '+57 320 889 1234', 'EG', 'Montería, Córdoba'),
(3, 'USR-003', 'Carlos Rodríguez', 'carlos.rodriguez@ejemplo.com', 'password123', 1, '+57 312 901 2345', 'CR', 'Cereté, Córdoba'),
(4, 'USR-004', 'Dr. Mauricio Padilla', 'mauricio.padilla@asesores.org', 'password123', 2, '+57 301 555 4321', 'MP', 'Montería, Córdoba'),
(5, 'USR-005', 'Daniela Doria', 'daniela.doria@ejemplo.com', 'password123', 1, '+57 314 789 6543', 'DD', 'Montería, Córdoba'),
(6, 'USR-006', 'Andrés Morales', 'andres.morales@ejemplo.com', 'password123', 1, '+57 311 223 3445', 'AM', 'Planeta Rica, Córdoba')
ON DUPLICATE KEY UPDATE `nombre` = VALUES(`nombre`);

-- 5. Perfiles Ciudadanos (1:1)
INSERT INTO `perfiles_ciudadanos` (`usuario_id`, `documento_identidad`, `tipo_documento`, `direccion_residencia`, `estrato`, `ocupacion`) VALUES
(1, '1067890123', 'CC', 'Barrio La Castellana, Calle 58 # 11-40', 2, 'Auxiliar Contable'),
(3, '1068991234', 'CC', 'Barrio Cantaclaro, Manzana 12 Lote 4', 1, 'Comerciante Independiente'),
(5, '1066778899', 'CC', 'Barrio Pasatiempo, Carrera 14B # 22-10', 2, 'Docente de Primaria'),
(6, '1065554433', 'CC', 'Barrio Centro, Calle 10 # 5-30', 2, 'Técnico Electricista')
ON DUPLICATE KEY UPDATE `documento_identidad` = VALUES(`documento_identidad`);

-- 6. Perfiles Profesionales (1:1)
INSERT INTO `perfiles_profesionales` (`usuario_id`, `tarjeta_profesional`, `especialidad`, `institucion_id`, `experiencia_anos`, `verificado`) VALUES
(2, 'TP-84920-CSJ', 'Derecho Laboral y Seguridad Social', 1, 8, 1),
(4, 'TP-71204-CSJ', 'Derecho de Familia y Menores', 3, 10, 1)
ON DUPLICATE KEY UPDATE `tarjeta_profesional` = VALUES(`tarjeta_profesional`);

-- 7. Casos Radicados
INSERT INTO `casos` (`id`, `codigo`, `ciudadano_id`, `categoria_id`, `institucion_id`, `subtipo`, `descripcion`, `estado`, `fecha_radicacion`, `sala_url`) VALUES
(1, 'CAS-00138', 1, 1, 1, 'Despido injustificado sin liquidación', 'Despido laboral intempestivo sin liquidación de prestaciones sociales ni entrega de carta de despido.', 'En curso', '2026-09-20', 'https://puente-ciudadano.daily.co/puente-cas00138'),
(2, 'CAS-00139', 3, 3, 2, 'Falta de respuesta a petición oficial', 'Demora superior a 30 días hábiles en respuesta de derecho de petición radicado ante la administración municipal.', 'Pendiente', '2026-09-21', 'https://puente-ciudadano.daily.co/puente-cas00139'),
(3, 'CAS-00129', 5, 2, 3, 'Fijación de cuota alimentaria y visitas', 'Orientación para conciliación extrajudicial sobre custodia y régimen de visitas compartidas para hijo menor.', 'Finalizado', '2026-09-18', 'https://puente-ciudadano.daily.co/puente-cas00129'),
(4, 'CAS-00140', 6, 4, 2, 'Cobro coactivo indebido de predial', 'Notificación de embargo sobre inmueble vendido hace más de tres años debidamente registrado en Notaría.', 'Pendiente', '2026-09-22', 'https://puente-ciudadano.daily.co/puente-cas00140'),
(5, 'CAS-00141', 1, 3, 4, 'Tutela para entrega urgente de medicamentos', 'Negativa sistemática de EPS en suministrar tratamiento de alto costo prescrito por médico especialista.', 'Finalizado', '2026-08-30', 'https://puente-ciudadano.daily.co/puente-cas00141')
ON DUPLICATE KEY UPDATE `subtipo` = VALUES(`subtipo`);

-- 8. Asignaciones de Casos
INSERT INTO `asignaciones_casos` (`caso_id`, `profesional_id`, `activo`, `observaciones`) VALUES
(1, 2, 1, 'Se inició sesión de orientación virtual. Se redactó y radicó citación a audiencia en Inspección del Trabajo.'),
(3, 4, 1, 'Acta de acuerdo conciliatorio firmada con éxito. Expediente remitido a Comisaría de Familia.'),
(5, 2, 1, 'Fallo de tutela favorable obtenido en 48 horas. Medicamentos entregados.')
ON DUPLICATE KEY UPDATE `observaciones` = VALUES(`observaciones`);

-- 9. Mensajes de Chat en Tiempo Real
INSERT INTO `mensajes` (`caso_id`, `remitente_id`, `mensaje`, `hora`, `leido`) VALUES
(1, 2, 'Hola Mariana, bienvenida a tu sala de orientación legal ODS 16. Ya revisé los desprendibles que cargaste.', '10:00 AM', 1),
(1, 1, 'Muchas gracias Dra. Elena. No me quisieron entregar carta ni constancia de despido.', '10:02 AM', 1),
(1, 2, 'No te preocupes. La ley laboral protege tu derecho con la prueba de consignación bancaria y testigos. Radicaremos la citación formal.', '10:04 AM', 1),
(1, 1, 'Perfecto doctora, ya tengo los extractos listos para la audiencia.', '10:06 AM', 0),
(3, 4, 'Buenas tardes Daniela. El acta de conciliación fue aprobada por la Comisaría de Familia.', '02:30 PM', 1),
(3, 5, 'Excelente Dr. Mauricio, muchas gracias por su oportuna asesoría y acompañamiento.', '02:35 PM', 1)
ON DUPLICATE KEY UPDATE `mensaje` = VALUES(`mensaje`);

-- 10. Checklist Documental
INSERT INTO `checklist_casos` (`caso_id`, `requisito`, `completado`) VALUES
(1, 'Copia de cédula de ciudadanía del trabajador', 1),
(1, 'Contrato de trabajo o desprendibles de pago bancario', 1),
(1, 'Carta de despido o constancia de cese de labores', 0),
(1, 'Liquidación preliminar elaborada', 1),
(2, 'Copia radicada del Derecho de Petición con sello de radicado', 1),
(2, 'Copia del documento de identidad', 1),
(2, 'Constancia de vencimiento de términos legales', 0),
(3, 'Registro civil de nacimiento del menor', 1),
(3, 'Cédula de ciudadanía de la convocante', 1),
(3, 'Relación detallada de gastos mensuales de manutención', 1)
ON DUPLICATE KEY UPDATE `requisito` = VALUES(`requisito`);

-- 11. Salas de Videollamada Daily.co
INSERT INTO `salas_videollamada` (`caso_id`, `room_name`, `room_url`, `creado_por`, `duracion_minutos`, `expira_en`) VALUES
(1, 'puente-cas00138', 'https://puente-ciudadano.daily.co/puente-cas00138', 2, 60, DATE_ADD(NOW(), INTERVAL 24 HOUR)),
(3, 'puente-cas00129', 'https://puente-ciudadano.daily.co/puente-cas00129', 4, 60, DATE_ADD(NOW(), INTERVAL 24 HOUR))
ON DUPLICATE KEY UPDATE `room_url` = VALUES(`room_url`);
