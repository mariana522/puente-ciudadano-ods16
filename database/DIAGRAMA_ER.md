# Arquitectura de Base de Datos Relacional (3FN)
## Plataforma ODS 16: Puente de Orientación Ciudadana
### Paz, Justicia e Instituciones Sólidas (Metas 16.3 y 16.6)

Este documento detalla el diseño relacional normalizado en **Tercera Forma Normal (3FN)** implementado para el sistema **Puente Ciudadano**, garantizando integridad referencial, eliminación de dependencias transitivas y aislamiento estricto de datos entre ciudadanos y profesionales.

---

## 1. Diagrama Entidad - Relación (DER)

```mermaid
erDiagram
    ROLES ||--o{ USUARIOS : "asigna rol a"
    INSTITUCIONES ||--o{ PERFILES_PROFESIONALES : "emplea o asocia a"
    INSTITUCIONES ||--o{ CASOS : "recibe tramite de"
    CATEGORIAS_CASOS ||--o{ CASOS : "clasifica"
    
    USUARIOS ||--|| PERFILES_CIUDADANOS : "perfil diferenciado (1:1)"
    USUARIOS ||--|| PERFILES_PROFESIONALES : "perfil diferenciado (1:1)"
    USUARIOS ||--o{ CASOS : "radica (ciudadano)"
    USUARIOS ||--o{ ASIGNACIONES_CASOS : "orienta (profesional)"
    USUARIOS ||--o{ MENSAJES : "emite mensaje"

    CASOS ||--o{ ASIGNACIONES_CASOS : "es asignado mediante"
    CASOS ||--o{ MENSAJES : "contiene chat privado de"
    CASOS ||--o{ CHECKLIST_CASOS : "exige documentos"
    CASOS ||--|| SALAS_VIDEOLLAMADA : "sesion Daily.co de"

    ROLES {
        tinyint id PK
        varchar(50) nombre UK
        varchar(255) descripcion
    }

    INSTITUCIONES {
        int id PK
        varchar(150) nombre UK
        varchar(30) sigla
        varchar(255) direccion
        varchar(100) telefono
        varchar(150) horario_atencion
    }

    CATEGORIAS_CASOS {
        int id PK
        varchar(100) nombre UK
        text descripcion
        varchar(50) ods_meta
    }

    USUARIOS {
        int id PK
        varchar(20) codigo UK
        varchar(120) nombre
        varchar(150) correo UK
        varchar(255) password_hash
        tinyint rol_id FK
        varchar(30) telefono
        varchar(10) avatar
        varchar(100) ciudad
        tinyint activo
    }

    PERFILES_CIUDADANOS {
        int usuario_id PK_FK
        varchar(50) documento_identidad UK
        enum tipo_documento
        varchar(255) direccion_residencia
        tinyint estrato
        varchar(120) ocupacion
    }

    PERFILES_PROFESIONALES {
        int usuario_id PK_FK
        varchar(50) tarjeta_profesional UK
        varchar(150) especialidad
        int institucion_id FK
        int experiencia_anos
        tinyint verificado
    }

    CASOS {
        int id PK
        varchar(30) codigo UK
        int ciudadano_id FK
        int categoria_id FK
        int institucion_id FK
        varchar(150) subtipo
        text descripcion
        enum estado
        date fecha_radicacion
        varchar(300) sala_url
    }

    ASIGNACIONES_CASOS {
        int id PK
        int caso_id FK
        int profesional_id FK
        datetime fecha_asignacion
        tinyint activo
        text observaciones
    }

    MENSAJES {
        int id PK
        int caso_id FK
        int remitente_id FK
        text mensaje
        varchar(20) hora
        tinyint leido
        datetime creado_en
    }

    CHECKLIST_CASOS {
        int id PK
        int caso_id FK
        varchar(255) requisito
        tinyint completado
        varchar(300) archivo_adjunto
    }

    SALAS_VIDEOLLAMADA {
        int id PK
        int caso_id UK_FK
        varchar(100) room_name
        varchar(300) room_url
        int creado_por FK
        int duracion_minutos
        datetime expira_en
    }
```

---

## 2. Justificación Técnica de Normalización en 3FN

| Forma Normal | Regla Aplicada | Implementación en Puente Ciudadano |
| :--- | :--- | :--- |
| **Primera Forma Normal (1FN)** | Todos los atributos son atómicos y existe clave primaria única. No hay grupos repetitivos. | Cada campo contiene un valor elemental. Los requisitos documentales que antes estaban en un JSON dentro de `casos` se extrajeron a la tabla atómica `checklist_casos`. |
| **Segunda Forma Normal (2FN)** | Cumple 1FN y todos los atributos no clave dependen funcionalmente de la totalidad de la clave primaria. | No existen dependencias parciales. Todas las tablas tienen clave primaria simple (`id` o `usuario_id`), garantizando que cada columna dependa de la clave completa. |
| **Tercera Forma Normal (3FN)** | Cumple 2FN y **no existen dependencias transitivas** (ningún atributo no clave depende de otro atributo no clave). | **Descomposición crítica:**<br>1. La dirección, teléfono y horario de las instituciones no se almacenan en `casos`, sino en `instituciones` (`institucion_id`).<br>2. El nombre y correo del ciudadano no se duplican en `casos`, se referencian vía `ciudadano_id`.<br>3. Los datos profesionales (tarjeta, especialidad) y ciudadanos (documento, estrato) están aislados en tablas 1:1 especializadas (`perfiles_ciudadanos` y `perfiles_profesionales`).<br>4. La asignación del orientador al caso se normaliza en `asignaciones_casos` eliminando cadenas de texto ambiguas. |

---

## 3. Diccionario de Datos Relacional

### Tabla: `usuarios`
| Campo | Tipo | Nulo | Clave | Descripción |
| :--- | :--- | :---: | :---: | :--- |
| `id` | `INT UNSIGNED` | NO | PK | Identificador único autonumérico |
| `codigo` | `VARCHAR(20)` | NO | UK | Código público (ej: `USR-001`) |
| `nombre` | `VARCHAR(120)` | NO | - | Nombre completo de la persona |
| `correo` | `VARCHAR(150)` | NO | UK | Correo de acceso y contacto |
| `password_hash` | `VARCHAR(255)` | NO | - | Contraseña segura cifrada |
| `rol_id` | `TINYINT UNSIGNED` | NO | FK | Rol (1=Ciudadano, 2=Profesional, 3=Admin) |
| `telefono` | `VARCHAR(30)` | SÍ | - | Teléfono celular |
| `avatar` | `VARCHAR(10)` | SÍ | - | Iniciales visuales |
| `ciudad` | `VARCHAR(100)` | SÍ | - | Ciudad de residencia |
| `activo` | `TINYINT(1)` | NO | - | 1=Activo, 0=Bloqueado |

### Tabla: `casos`
| Campo | Tipo | Nulo | Clave | Descripción |
| :--- | :--- | :---: | :---: | :--- |
| `id` | `INT UNSIGNED` | NO | PK | Clave primaria del expediente |
| `codigo` | `VARCHAR(30)` | NO | UK | Código público (ej: `CAS-00138`) |
| `ciudadano_id` | `INT UNSIGNED` | NO | FK | FK a `usuarios.id` (Titular del caso) |
| `categoria_id` | `INT UNSIGNED` | NO | FK | FK a `categorias_casos.id` |
| `institucion_id` | `INT UNSIGNED` | NO | FK | FK a `instituciones.id` |
| `subtipo` | `VARCHAR(150)` | NO | - | Detalle específico de la solicitud |
| `descripcion` | `TEXT` | NO | - | Relato de los hechos |
| `estado` | `ENUM` | NO | - | 'Pendiente', 'En curso', 'Finalizado' |
| `fecha_radicacion`| `DATE` | NO | - | Fecha de registro |
| `sala_url` | `VARCHAR(300)` | SÍ | - | Enlace generado en Daily.co |

### Tabla: `mensajes`
| Campo | Tipo | Nulo | Clave | Descripción |
| :--- | :--- | :---: | :---: | :--- |
| `id` | `INT UNSIGNED` | NO | PK | Clave primaria del mensaje |
| `caso_id` | `INT UNSIGNED` | NO | FK | FK a `casos.id` |
| `remitente_id` | `INT UNSIGNED` | NO | FK | FK a `usuarios.id` |
| `mensaje` | `TEXT` | NO | - | Contenido de texto del mensaje |
| `hora` | `VARCHAR(20)` | NO | - | Hora legible de emisión |
| `leido` | `TINYINT(1)` | NO | - | 0=No leído, 1=Leído |
| `creado_en` | `DATETIME` | NO | - | Timestamp de creación |

---

## 4. Garantía de Aislamiento de Datos por Diseño

1. **Restricción a Nivel de Tupla:** Un usuario solo puede tener acceso a filas de `mensajes` donde su `usuario_id` sea el `ciudadano_id` del caso asociado, o el `profesional_id` de la tupla activa en `asignaciones_casos`.
2. **Integridad Referencial en Cascada:** Al eliminar o archivar un caso, se eliminan en cascada sus mensajes (`ON DELETE CASCADE`), garantizando que no queden datos huérfanos ni fugas de información.
3. **Auditabilidad:** Cada mensaje conserva su `remitente_id` y `creado_en`, garantizando no repudio y trazabilidad en el marco del ODS 16 (Instituciones transparentes y responsables).
