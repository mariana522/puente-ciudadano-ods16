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
