-- ==============================================================================
-- PROYECTO: Plataforma ODS 16 - Puente de Orientación Ciudadana
-- ARCHIVO: schema.sql (Definición de Esquema DDL en Tercera Forma Normal - 3FN)
-- GESTOR: MySQL 8.0+ / MariaDB 10.4+ (Compatible SQLite 3)
-- OBJETIVO ODS: ODS 16 - Paz, Justicia e Instituciones Sólidas (Meta 16.3 / 16.6)
-- ==============================================================================

CREATE DATABASE IF NOT EXISTS `puente_ciudadano` 
DEFAULT CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE `puente_ciudadano`;

SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS `salas_videollamada`;
DROP TABLE IF EXISTS `checklist_casos`;
DROP TABLE IF EXISTS `mensajes`;
DROP TABLE IF EXISTS `asignaciones_casos`;
DROP TABLE IF EXISTS `casos`;
DROP TABLE IF EXISTS `perfiles_profesionales`;
DROP TABLE IF EXISTS `perfiles_ciudadanos`;
DROP TABLE IF EXISTS `usuarios`;
DROP TABLE IF EXISTS `categorias_casos`;
DROP TABLE IF EXISTS `instituciones`;
DROP TABLE IF EXISTS `roles`;

SET FOREIGN_KEY_CHECKS = 1;

-- ------------------------------------------------------------------------------
-- 1. TABLA: roles
-- Catálogo de perfiles y privilegios (1FN, 2FN, 3FN)
-- ------------------------------------------------------------------------------
CREATE TABLE `roles` (
  `id` TINYINT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT 'Clave primaria del rol',
  `nombre` VARCHAR(50) NOT NULL UNIQUE COMMENT 'Identificador único del rol: citizen | professional | admin',
  `descripcion` VARCHAR(255) NOT NULL COMMENT 'Descripción de los alcances del rol'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Catálogo de roles';

-- ------------------------------------------------------------------------------
-- 2. TABLA: instituciones
-- Catálogo de entidades públicas y de justicia (Elimina dependencia transitiva en casos)
-- ------------------------------------------------------------------------------
CREATE TABLE `instituciones` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT 'Clave primaria de la institución',
  `nombre` VARCHAR(150) NOT NULL UNIQUE COMMENT 'Nombre oficial de la entidad (ej: Inspección del Trabajo)',
  `sigla` VARCHAR(30) DEFAULT NULL COMMENT 'Acrónimo o sigla oficial',
  `direccion` VARCHAR(255) NOT NULL COMMENT 'Dirección física de atención ciudadana',
  `telefono` VARCHAR(100) NOT NULL COMMENT 'Línea de contacto o conmutador oficial',
  `horario_atencion` VARCHAR(150) NOT NULL COMMENT 'Horario de recepción ciudadana',
  `creado_en` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Entidades públicas competentes';

-- ------------------------------------------------------------------------------
-- 3. TABLA: categorias_casos
-- Clasificación jurídica y temática de las situaciones reportadas
-- ------------------------------------------------------------------------------
CREATE TABLE `categorias_casos` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT 'Clave primaria de la categoría',
  `nombre` VARCHAR(100) NOT NULL UNIQUE COMMENT 'Nombre: Problema laboral, Conflicto familiar, etc.',
  `descripcion` TEXT DEFAULT NULL COMMENT 'Ámbito de aplicación y marco de protección',
  `ods_meta` VARCHAR(50) DEFAULT 'ODS 16.3' COMMENT 'Meta del ODS 16 asociada'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Categorías de casos de orientación';

-- ------------------------------------------------------------------------------
-- 4. TABLA: usuarios
-- Entidad base de autenticación y credenciales de acceso
-- ------------------------------------------------------------------------------
CREATE TABLE `usuarios` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT 'Identificador numérico interno',
  `codigo` VARCHAR(20) NOT NULL UNIQUE COMMENT 'Código único del usuario (ej: USR-001)',
  `nombre` VARCHAR(120) NOT NULL COMMENT 'Nombre completo del usuario',
  `correo` VARCHAR(150) NOT NULL UNIQUE COMMENT 'Correo electrónico (identificador de login)',
  `password_hash` VARCHAR(255) NOT NULL COMMENT 'Hash seguro de contraseña o credencial',
  `rol_id` TINYINT UNSIGNED NOT NULL COMMENT 'Llave foránea al rol',
  `telefono` VARCHAR(30) DEFAULT NULL COMMENT 'Número telefónico de contacto',
  `avatar` VARCHAR(10) DEFAULT 'U' COMMENT 'Iniciales para avatar visual',
  `ciudad` VARCHAR(100) DEFAULT 'Montería, Córdoba' COMMENT 'Ciudad de residencia o ejercicio',
  `activo` TINYINT(1) DEFAULT 1 COMMENT 'Estado de la cuenta: 1 activo, 0 inactivo',
  `creado_en` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_usuarios_rol` FOREIGN KEY (`rol_id`) REFERENCES `roles` (`id`) ON UPDATE CASCADE,
  INDEX `idx_usuario_correo` (`correo`),
  INDEX `idx_usuario_rol` (`rol_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Cuentas de usuarios';

-- ------------------------------------------------------------------------------
-- 5. TABLA: perfiles_ciudadanos
-- Especialización 1:1 para ciudadanos (3FN)
-- ------------------------------------------------------------------------------
CREATE TABLE `perfiles_ciudadanos` (
  `usuario_id` INT UNSIGNED PRIMARY KEY COMMENT 'FK hacia usuarios.id',
  `documento_identidad` VARCHAR(50) UNIQUE DEFAULT NULL COMMENT 'Número de cédula o documento',
  `tipo_documento` ENUM('CC', 'TI', 'CE', 'PASAPORTE') DEFAULT 'CC',
  `direccion_residencia` VARCHAR(255) DEFAULT NULL COMMENT 'Dirección de residencia',
  `estrato` TINYINT DEFAULT 2 COMMENT 'Estrato socioeconómico para focalización ODS',
  `ocupacion` VARCHAR(120) DEFAULT NULL COMMENT 'Ocupación u oficio del ciudadano',
  CONSTRAINT `fk_perfil_ciudadano_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Perfil diferenciado de Ciudadanos';

-- ------------------------------------------------------------------------------
-- 6. TABLA: perfiles_profesionales
-- Especialización 1:1 para profesionales jurídicos orientadores (3FN)
-- ------------------------------------------------------------------------------
CREATE TABLE `perfiles_profesionales` (
  `usuario_id` INT UNSIGNED PRIMARY KEY COMMENT 'FK hacia usuarios.id',
  `tarjeta_profesional` VARCHAR(50) UNIQUE NOT NULL COMMENT 'Número de tarjeta profesional o colegiatura',
  `especialidad` VARCHAR(150) NOT NULL COMMENT 'Área de especialidad jurídica',
  `institucion_id` INT UNSIGNED DEFAULT NULL COMMENT 'Entidad vinculada o consultorio',
  `experiencia_anos` INT DEFAULT 5 COMMENT 'Años de ejercicio profesional',
  `verificado` TINYINT(1) DEFAULT 1 COMMENT '1 verificado por plataforma ODS 16, 0 en revisión',
  CONSTRAINT `fk_perfil_profesional_usuario` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_perfil_profesional_institucion` FOREIGN KEY (`institucion_id`) REFERENCES `instituciones` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Perfil diferenciado de Profesionales Orientadores';

-- ------------------------------------------------------------------------------
-- 7. TABLA: casos
-- Expediente ciudadano sin dependencias transitivas (3FN)
-- ------------------------------------------------------------------------------
CREATE TABLE `casos` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY COMMENT 'Identificador autonumérico interno',
  `codigo` VARCHAR(30) NOT NULL UNIQUE COMMENT 'Código público de radicación (ej: CAS-00138)',
  `ciudadano_id` INT UNSIGNED NOT NULL COMMENT 'FK hacia el ciudadano titular en usuarios',
  `categoria_id` INT UNSIGNED NOT NULL COMMENT 'FK hacia la categoría legal',
  `institucion_id` INT UNSIGNED NOT NULL COMMENT 'FK hacia la institución competente',
  `subtipo` VARCHAR(150) NOT NULL COMMENT 'Detalle específico del problema',
  `descripcion` TEXT NOT NULL COMMENT 'Relato detallado de los hechos',
  `estado` ENUM('Pendiente', 'En curso', 'Finalizado') NOT NULL DEFAULT 'Pendiente',
  `fecha_radicacion` DATE NOT NULL COMMENT 'Fecha de ingreso de la situación',
  `sala_url` VARCHAR(300) DEFAULT NULL COMMENT 'Enlace oficial dinámico a sala Daily.co',
  `creado_en` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `fk_casos_ciudadano` FOREIGN KEY (`ciudadano_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_casos_categoria` FOREIGN KEY (`categoria_id`) REFERENCES `categorias_casos` (`id`) ON UPDATE CASCADE,
  CONSTRAINT `fk_casos_institucion` FOREIGN KEY (`institucion_id`) REFERENCES `instituciones` (`id`) ON UPDATE CASCADE,
  INDEX `idx_casos_codigo` (`codigo`),
  INDEX `idx_casos_estado` (`estado`),
  INDEX `idx_casos_ciudadano` (`ciudadano_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Expedientes de orientación ciudadana';

-- ------------------------------------------------------------------------------
-- 8. TABLA: asignaciones_casos
-- Relación M:N formalizada entre Casos y Profesionales (3FN)
-- ------------------------------------------------------------------------------
CREATE TABLE `asignaciones_casos` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `caso_id` INT UNSIGNED NOT NULL,
  `profesional_id` INT UNSIGNED NOT NULL,
  `fecha_asignacion` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `activo` TINYINT(1) DEFAULT 1 COMMENT '1 si es la asignación actual vigente',
  `observaciones` TEXT DEFAULT NULL COMMENT 'Notas de seguimiento redactadas por el asesor',
  CONSTRAINT `fk_asignacion_caso` FOREIGN KEY (`caso_id`) REFERENCES `casos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_asignacion_profesional` FOREIGN KEY (`profesional_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX `idx_asignacion_caso` (`caso_id`),
  INDEX `idx_asignacion_profesional` (`profesional_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Asignaciones y trazabilidad de expedientes';

-- ------------------------------------------------------------------------------
-- 9. TABLA: mensajes
-- Mensajería bidireccional en tiempo real vinculada a caso (3FN)
-- ------------------------------------------------------------------------------
CREATE TABLE `mensajes` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `caso_id` INT UNSIGNED NOT NULL,
  `remitente_id` INT UNSIGNED NOT NULL,
  `mensaje` TEXT NOT NULL,
  `hora` VARCHAR(20) NOT NULL,
  `leido` TINYINT(1) DEFAULT 0,
  `creado_en` DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_mensajes_caso` FOREIGN KEY (`caso_id`) REFERENCES `casos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_mensajes_remitente` FOREIGN KEY (`remitente_id`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX `idx_mensajes_caso_tiempo` (`caso_id`, `creado_en`),
  INDEX `idx_mensajes_remitente` (`remitente_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Mensajes instantáneos de la sala virtual';

-- ------------------------------------------------------------------------------
-- 10. TABLA: checklist_casos
-- Requisitos y documentos requeridos descompuestos atómicamente (1FN)
-- ------------------------------------------------------------------------------
CREATE TABLE `checklist_casos` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `caso_id` INT UNSIGNED NOT NULL,
  `requisito` VARCHAR(255) NOT NULL,
  `completado` TINYINT(1) DEFAULT 0,
  `archivo_adjunto` VARCHAR(300) DEFAULT NULL,
  CONSTRAINT `fk_checklist_caso` FOREIGN KEY (`caso_id`) REFERENCES `casos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Checklist documental normalizado';

-- ------------------------------------------------------------------------------
-- 11. TABLA: salas_videollamada
-- Gestión de reuniones y videollamadas Daily.co
-- ------------------------------------------------------------------------------
CREATE TABLE `salas_videollamada` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `caso_id` INT UNSIGNED NOT NULL UNIQUE,
  `room_name` VARCHAR(100) NOT NULL,
  `room_url` VARCHAR(300) NOT NULL,
  `creado_por` INT UNSIGNED NOT NULL,
  `duracion_minutos` INT DEFAULT 60,
  `expira_en` DATETIME NOT NULL,
  `creado_en` DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_salas_caso` FOREIGN KEY (`caso_id`) REFERENCES `casos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_salas_usuario` FOREIGN KEY (`creado_por`) REFERENCES `usuarios` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Salas de videollamada Daily.co';

-- ------------------------------------------------------------------------------
-- 12. VISTA SQL: vista_casos_resumen
-- Proyección unificada con JOINs para consultas eficientes y aislamiento
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW `vista_casos_resumen` AS
SELECT 
    c.id AS caso_id,
    c.codigo AS codigo,
    u_c.id AS ciudadano_id,
    u_c.nombre AS ciudadano,
    u_c.correo AS correo_ciudadano,
    cat.nombre AS tipo,
    c.subtipo AS subtipo,
    c.descripcion AS descripcion,
    c.estado AS estado,
    COALESCE(u_p.nombre, 'Por asignar') AS profesional_asignado,
    u_p.id AS profesional_id,
    u_p.correo AS correo_profesional,
    c.fecha_radicacion AS fecha,
    inst.nombre AS institucion,
    inst.direccion AS direccion_institucion,
    inst.telefono AS telefono_institucion,
    inst.horario_atencion AS horario_institucion,
    COALESCE(c.sala_url, s.room_url) AS sala_url,
    ac.observaciones AS observaciones,
    c.creado_en AS creado_en,
    c.actualizado_en AS actualizado_en
FROM `casos` c
JOIN `usuarios` u_c ON c.ciudadano_id = u_c.id
JOIN `categorias_casos` cat ON c.categoria_id = cat.id
JOIN `instituciones` inst ON c.institucion_id = inst.id
LEFT JOIN `asignaciones_casos` ac ON (ac.caso_id = c.id AND ac.activo = 1)
LEFT JOIN `usuarios` u_p ON ac.profesional_id = u_p.id
LEFT JOIN `salas_videollamada` s ON s.caso_id = c.id;


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
(6, 'USR-006', 'Hernando Ayala', 'hernando.ayala@ejemplo.com', 'password123', 1, '+57 311 223 3445', 'HA', 'Planeta Rica, Córdoba')
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
