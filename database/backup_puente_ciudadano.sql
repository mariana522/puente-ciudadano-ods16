-- ==============================================================================
-- RESPALDO COMPLETO DE BASE DE DATOS (DUMP / BACKUP + SEED DATA)
-- PROYECTO: Plataforma ODS 16 - Puente de Orientación Ciudadana
-- ARCHIVO: backup_puente_ciudadano.sql
-- GESTOR: MySQL / MariaDB (XAMPP phpMyAdmin)
-- FECHA DE EXPORTACIÓN: Octubre 2026
-- ==============================================================================

SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

-- ------------------------------------------------------------------------------
-- CREACIÓN Y SELECCIÓN DE BASE DE DATOS
-- ------------------------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS `puente_ciudadano` 
DEFAULT CHARACTER SET utf8mb4 
COLLATE utf8mb4_unicode_ci;

USE `puente_ciudadano`;

-- ------------------------------------------------------------------------------
-- ESTRUCTURA DE TABLA: usuarios
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `mensajes`;
DROP TABLE IF EXISTS `casos`;
DROP TABLE IF EXISTS `usuarios`;

CREATE TABLE `usuarios` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `codigo` VARCHAR(20) NOT NULL UNIQUE,
  `nombre` VARCHAR(120) NOT NULL,
  `correo` VARCHAR(150) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `rol` ENUM('citizen', 'professional') NOT NULL DEFAULT 'citizen',
  `avatar` VARCHAR(10) DEFAULT 'U',
  `telefono` VARCHAR(30) DEFAULT NULL,
  `especialidad` VARCHAR(150) DEFAULT NULL,
  `fecha_registro` DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_usuario_correo` (`correo`),
  INDEX `idx_usuario_rol` (`rol`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- DATOS DE TABLA: usuarios
-- ------------------------------------------------------------------------------
INSERT INTO `usuarios` (`id`, `codigo`, `nombre`, `correo`, `password`, `rol`, `avatar`, `telefono`, `especialidad`, `fecha_registro`) VALUES
(1, 'USR-001', 'Mariana Sibaja', 'mariana.sibaja@ejemplo.com', 'password123', 'citizen', 'M', '+57 310 456 7890', NULL, '2026-09-01 08:00:00'),
(2, 'USR-002', 'Dra. Elena Gómez', 'elena.gomez@asesores.org', 'password123', 'professional', 'EG', '+57 320 889 1234', 'Derecho Laboral y Conciliación', '2026-08-15 09:30:00'),
(3, 'USR-003', 'Carlos Rodríguez', 'carlos.rodriguez@ejemplo.com', 'password123', 'citizen', 'CR', '+57 312 901 2345', NULL, '2026-09-05 10:15:00'),
(4, 'USR-004', 'Dr. Mauricio Padilla', 'mauricio.padilla@asesores.org', 'password123', 'professional', 'MP', '+57 301 555 4321', 'Derecho de Familia y Menores', '2026-08-20 11:00:00'),
(5, 'USR-005', 'Daniela Doria', 'daniela.doria@ejemplo.com', 'password123', 'citizen', 'DD', '+57 315 222 3344', NULL, '2026-09-10 14:00:00'),
(6, 'USR-006', 'Hernando Ayala', 'hernando.ayala@ejemplo.com', 'password123', 'citizen', 'HA', '+57 318 444 5566', NULL, '2026-09-12 16:30:00');

-- ------------------------------------------------------------------------------
-- ESTRUCTURA DE TABLA: casos
-- ------------------------------------------------------------------------------
CREATE TABLE `casos` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `codigo` VARCHAR(30) NOT NULL UNIQUE,
  `ciudadano` VARCHAR(120) NOT NULL,
  `correo_ciudadano` VARCHAR(150) DEFAULT NULL,
  `tipo` VARCHAR(100) NOT NULL,
  `subtipo` VARCHAR(150) NOT NULL,
  `descripcion` TEXT NOT NULL,
  `estado` ENUM('Pendiente', 'En curso', 'Finalizado') NOT NULL DEFAULT 'Pendiente',
  `profesional_asignado` VARCHAR(120) DEFAULT 'Por asignar',
  `fecha` DATE NOT NULL,
  `institucion` VARCHAR(150) NOT NULL,
  `direccion_institucion` VARCHAR(255) DEFAULT NULL,
  `telefono_institucion` VARCHAR(100) DEFAULT NULL,
  `horario_institucion` VARCHAR(150) DEFAULT NULL,
  `checklist` TEXT DEFAULT NULL,
  `observaciones` TEXT DEFAULT NULL,
  `creado_en` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `actualizado_en` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_caso_codigo` (`codigo`),
  INDEX `idx_caso_estado` (`estado`),
  INDEX `idx_caso_ciudadano` (`ciudadano`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- DATOS DE TABLA: casos
-- ------------------------------------------------------------------------------
INSERT INTO `casos` (`id`, `codigo`, `ciudadano`, `correo_ciudadano`, `tipo`, `subtipo`, `descripcion`, `estado`, `profesional_asignado`, `fecha`, `institucion`, `direccion_institucion`, `telefono_institucion`, `horario_institucion`, `checklist`, `observaciones`) VALUES
(1, 'CAS-00138', 'Mariana Sibaja', 'mariana.sibaja@ejemplo.com', 'Problema laboral', 'Despido injustificado sin liquidación', 'Despido injustificado sin liquidación de prestaciones sociales ni entrega de certificado laboral.', 'En curso', 'Dra. Elena Gómez', '2026-09-20', 'Inspección del Trabajo', 'Calle 28 # 4-50, Sede Central MinTrabajo', 'Línea Gratuita Nacional 01 8000 112518', 'Lunes a Viernes 8:00 am - 4:00 pm', '["Copia de cédula de ciudadanía del trabajador","Contrato de trabajo o desprendibles de pago","Carta de despido laboral","Liquidación preliminar elaborada"]', 'Se inició sesión de orientación virtual y se redactó borrador de solicitud de conciliación laboral.'),
(2, 'CAS-00139', 'Carlos Rodríguez', 'carlos.rodriguez@ejemplo.com', 'Derechos ciudadanos', 'Falta de respuesta a petición oficial', 'Demora superior a 30 días hábiles en respuesta de petición oficial ante la administración municipal.', 'Pendiente', 'Por asignar', '2026-09-21', 'Personería Municipal', 'Palacio Municipal, Carrera 3 # 12-20', '(604) 789 2020 Ext. 104', 'Lunes a Viernes 7:30 am - 12:00 m / 1:30 pm - 5:00 pm', '["Copia radicada del Derecho de Petición","Copia del documento de identidad","Constancia de vencimiento de términos"]', ''),
(3, 'CAS-00129', 'Daniela Doria', 'daniela.doria@ejemplo.com', 'Conflicto familiar', 'Fijación de cuota alimentaria y custodia', 'Orientación para conciliación extrajudicial de alimentos y visitas compartidas de menor de edad.', 'Finalizado', 'Dr. Mauricio Padilla', '2026-09-18', 'Comisaría de Familia', 'Centro de Convivencia Ciudadana, Calle 15 # 8-30', 'Línea Familia 106 / (604) 782 1100', 'Atención 24 Horas en turno de urgencias', '["Registro civil de nacimiento de hijos menores","Cédula de convocante","Relación de gastos mensuales"]', 'Acta de acuerdo conciliatorio firmada con éxito. Expediente remitido a Comisaría.'),
(4, 'CAS-00140', 'Hernando Ayala', 'hernando.ayala@ejemplo.com', 'Problema con institución', 'Cobro coactivo indebido de impuesto predial', 'Notificación de cobro por predio que ya no es de su propiedad desde hace tres años.', 'Pendiente', 'Por asignar', '2026-09-22', 'Personería Municipal', 'Palacio Municipal, Carrera 3 # 12-20, Piso 1', '(604) 789 2020 Ext. 104', 'Lunes a Viernes 7:30 am - 12:00 m / 1:30 pm - 5:00 pm', '["Certificado de tradición actualizado","Escritura pública de compraventa","Oficio de aclaración catastral"]', ''),
(5, 'CAS-00141', 'Mariana Sibaja', 'mariana.sibaja@ejemplo.com', 'Derechos ciudadanos', 'Derecho a la salud - Tutela de medicamentos', 'EPS niega entrega oportuna de tratamiento de alto costo ordenado por médico especialista.', 'Finalizado', 'Dra. Elena Gómez', '2026-08-30', 'Defensoría del Pueblo', 'Avenida Circunvalar # 32-15', 'Línea Nacional 01 8000 914814', 'Lunes a Viernes 8:00 am - 5:00 pm', '["Fórmula médica e historia clínica","Negativa por escrito de la EPS","Acción de tutela radicada"]', 'Fallo de tutela favorable obtenido en 48 horas. Medicamentos entregados.');

-- ------------------------------------------------------------------------------
-- ESTRUCTURA DE TABLA: mensajes
-- ------------------------------------------------------------------------------
CREATE TABLE `mensajes` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `caso_codigo` VARCHAR(30) NOT NULL,
  `remitente` VARCHAR(120) NOT NULL,
  `rol` ENUM('citizen', 'professional') NOT NULL,
  `mensaje` TEXT NOT NULL,
  `hora` VARCHAR(20) NOT NULL,
  `creado_en` DATETIME DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `fk_mensajes_caso` FOREIGN KEY (`caso_codigo`) REFERENCES `casos` (`codigo`) ON DELETE CASCADE ON UPDATE CASCADE,
  INDEX `idx_mensaje_caso` (`caso_codigo`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- DATOS DE TABLA: mensajes
-- ------------------------------------------------------------------------------
INSERT INTO `mensajes` (`id`, `caso_codigo`, `remitente`, `rol`, `mensaje`, `hora`) VALUES
(1, 'CAS-00138', 'Dra. Elena Gómez', 'professional', 'Hola Mariana, bienvenida. Ya revisé tus documentos iniciales.', '10:00 AM'),
(2, 'CAS-00138', 'Mariana Sibaja', 'citizen', 'Gracias doctora, no me quisieron entregar la carta de despido.', '10:02 AM'),
(3, 'CAS-00138', 'Dra. Elena Gómez', 'professional', 'No te preocupes. Con la constancia de consignación y testigos podemos radicar la citación en Inspección del Trabajo.', '10:04 AM');

SET FOREIGN_KEY_CHECKS = 1;
COMMIT;
