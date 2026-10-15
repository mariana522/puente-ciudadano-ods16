# Plataforma ODS 16: Puente de Orientación Ciudadana
### Paz, Justicia e Instituciones Sólidas

[![ODS 16](https://img.shields.io/badge/ODS%2016-Paz%2C%20Justicia%20e%20Instituciones%20S%C3%B3lidas-00689D?style=for-the-badge&logo=united-nations&logoColor=white)](https://sdgs.un.org/goals/goal16)
[![Vercel Deployment](https://img.shields.io/badge/Vercel-Desplegado-black?style=for-the-badge&logo=vercel)](https://puente-ciudadano-ods16.vercel.app)
[![PHP](https://img.shields.io/badge/PHP-8.x%20%2F%20PDO-777BB4?style=for-the-badge&logo=php&logoColor=white)](https://php.net)
[![MySQL](https://img.shields.io/badge/MySQL-8.0%20%2F%20XAMPP-4479A1?style=for-the-badge&logo=mysql&logoColor=white)](https://mysql.com)
[![JavaScript](https://img.shields.io/badge/JavaScript-ES6%2B-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)](https://developer.mozilla.org/es/docs/Web/JavaScript)

---

## 👥 Integrantes del Equipo

* **Mariana Sibaja Diaz** 
* **Daniela Doria Ochoa** 
* **Hernando Ayala** 

*Proyecto académico de desarrollo Full-Stack - Universidad / Laboratorio Web.*

---

## 🌍 ODS Abordado

**Objetivo de Desarrollo Sostenible 16: Paz, Justicia e Instituciones Sólidas**  
*Promover sociedades pacíficas e inclusivas para el desarrollo sostenible, facilitar el acceso a la justicia para todos y crear instituciones eficaces, responsables e inclusivas a todos los niveles.*

### Metas Específicas Impactadas:
* **Meta 16.3:** Promover el estado de derecho en los planos nacional e internacional y garantizar la igualdad de acceso a la justicia para todos los ciudadanos sin distinción socioeconómica.
* **Meta 16.6:** Crear a todos los niveles instituciones eficaces, transparentes y que rindan cuentas, reduciendo la desorientación en los trámites y evitando la revictimización por traslados innecesarios.
* **Meta 16.10:** Garantizar el acceso público a la información y proteger las libertades fundamentales, entregando al solicitante rutas claras, requisitos exactos y entidades de competencia directa.

---

## 💡 Descripción de la Solución

En muchas ocasiones, las personas vulnerables enfrentan barreras insalvables para acceder a la justicia: desconocimiento de las entidades competentes (¿acudo a Personería, MinTrabajo, Fiscalía o Comisaría?), confusión en los requisitos documentales y largas esperas burocráticas.

**Puente Ciudadano** es una plataforma web integral que actúa como un canal de orientación jurídica y social temprana. Conecta al ciudadano con las rutas de atención institucionales adecuadas, ofreciendo:
1. **Asistente de Clasificación y Diagnóstico:** Guía al usuario según su problemática (laboral, familiar, derechos fundamentales o controversias institucionales).
2. **Hoja de Ruta Oficial Imprimible:** Genera un documento estructurado con la entidad exacta competente, dirección, horarios de atención, teléfonos y lista de chequeo de documentos requeridos.
3. **Sala Virtual de Orientación:** Permite la comunicación segura y directa entre el ciudadano y un orientador profesional para resolver dudas previas a la radicación.
4. **Bandeja de Expedientes y Seguimiento:** Permite a ciudadanos y profesionales revisar el estado de avance (`Pendiente`, `En curso`, `Finalizado`) y las observaciones de su caso.
5. **Arquitectura Resiliente Dual (PuenteDB):** La plataforma opera conectada a una base de datos relacional MySQL (mediante backend PHP en XAMPP o producción) y cuenta con un motor de respaldo automático en `LocalStorage`, garantizando alta disponibilidad incluso en entornos offline o despliegues estáticos en la nube.

---

## 🚀 Despliegue en la Nube (Vercel)

* **Enlace de Producción en Vercel:**  
  👉 **[https://puente-ciudadano-ods16.vercel.app](https://puente-ciudadano-ods16.vercel.app)** *(o enlace configurado por el equipo)*

> **Nota de Despliegue:**  
> Gracias a la configuración del archivo [`vercel.json`](./vercel.json) y el motor dual `PuenteDB`, la interfaz se sirve optimizada en Vercel con precarga de datos semilla (Mock Data) y persistencia en navegador, mientras que en entornos locales con Apache/MySQL se sincroniza automáticamente con la base de datos relacional.

---

## 🛠️ Tecnologías Utilizadas

| Capa | Tecnologías | Descripción |
| :--- | :--- | :--- |
| **Frontend** | HTML5 Semántico, CSS3 Vanilla, JavaScript (ES6+), React/JSX | Interfaz accesible, diseño responsivo, glassmorphism, modales dinámicos y arquitectura de componentes. |
| **Backend** | PHP 8.x, API REST, PDO | Endpoints seguros para autenticación, gestión de casos y salud de conexión. Consultas preparadas contra inyecciones SQL. |
| **Base de Datos** | MySQL 8.0 / MariaDB (XAMPP phpMyAdmin) | Esquema relacional normalizado en 3FN, claves foráneas con eliminación en cascada (`ON DELETE CASCADE`) y UTF-8 mb4. |
| **Seguridad & Config** | `.env.example`, `.gitignore`, CORS Headers | Protección de datos sensibles, control de acceso de orígenes y variables de entorno estándar. |
| **Despliegue & DevOps** | Git, GitHub, Vercel (`vercel.json`) | Control de versiones, ramas limpias y despliegue continuo. |

---

## 📁 Estructura del Proyecto

El repositorio cumple con la siguiente organización modular de carpetas:

```text
puente_ciudadano/
│
├── frontend/                               # Código de la interfaz de usuario
│   ├── assets/                             # Recursos multimedia (imágenes del flujo)
│   │   ├── hero_bridge.jpg
│   │   ├── problem_scene.jpg
│   │   └── closing_globe.jpg
│   ├── index.html                          # Página principal de la plataforma
│   ├── styles.css                          # Sistema de diseño, temas y responsividad
│   ├── app.js                              # Lógica de interacción, modales y flujos
│   ├── db.js                               # Motor PuenteDB (LocalStorage + Cliente API MySQL)
│   └── CitizenJourneyComponents.jsx        # Componente visual del viaje del ciudadano
│
├── backend/                                # Lógica de negocio, rutas y API REST (PHP)
│   ├── db_connect.php                      # Conexión PDO con soporte para variables de entorno
│   ├── auth.php                            # Endpoints de autenticación (Login / Registro)
│   ├── casos.php                           # Endpoints CRUD para expedientes y seguimiento
│   ├── test_connection.php                 # Endpoint de prueba de conexión con MySQL
│   └── index.php                           # Portal y resumen de estado de la API
│
├── database/                               # Esquema, diagramas y respaldos
│   ├── schema.sql                          # Definición DDL de tablas y restricciones
│   ├── backup_puente_ciudadano.sql         # Respaldo completo SQL (Esquema + Datos semilla)
│   └── DIAGRAMA_ER.md                      # Diagrama Entidad-Relación (Mermaid) y diccionario
│
├── .env.example                            # Plantilla de variables de entorno (sin datos sensibles)
├── .gitignore                              # Exclusión de archivos sensibles y dependencias
├── vercel.json                             # Configuración de rutas y reescrituras para Vercel
└── README.md                               # Documentación principal del proyecto
```

---

## ⚙️ Instrucciones de Instalación y Ejecución Local

### Opción A: Ejecución con Servidor Completo (XAMPP - Apache, PHP y MySQL)

1. **Clonar el repositorio:**
   ```bash
   git clone https://github.com/mariana522/recetario.git puente_ciudadano
   cd puente_ciudadano
   ```

2. **Iniciar servicios en XAMPP:**
   * Abre **XAMPP Control Panel**.
   * Inicia los módulos **Apache** y **MySQL** haciendo clic en **Start**.

3. **Importar la Base de Datos en phpMyAdmin:**
   * Ingresa a [http://localhost/phpmyadmin](http://localhost/phpmyadmin) en tu navegador.
   * Haz clic en la pestaña **Importar** (o crea una nueva base de datos llamada `puente_ciudadano`).
   * Selecciona el archivo [`database/backup_puente_ciudadano.sql`](./database/backup_puente_ciudadano.sql) y pulsa **Continuar**.
   * *Alternativa:* Puedes ejecutar el script [`database/schema.sql`](./database/schema.sql) para crear solo las tablas.

4. **Configurar el entorno:**
   * Crea una copia del archivo de configuración:
     ```bash
     cp .env.example .env
     ```
   * Si tus credenciales de XAMPP son las predeterminadas (`root`, sin contraseña, puerto `3306`), no requieres modificar nada adicional.

5. **Abrir la plataforma:**
   * Copia la carpeta del proyecto dentro del directorio `htdocs` de XAMPP (por ejemplo, `C:\xampp\htdocs\puente_ciudadano`).
   * Accede desde tu navegador a:
     ```text
     http://localhost/puente_ciudadano/frontend/index.html
     ```
   * En la esquina superior o en el modal de login podrás hacer clic en **"Probar Conexión MySQL"** para verificar que la base de datos esté respondiendo activamente.

---

### Opción B: Ejecución en Modo Local / Live Server (Desarrollo Frontend)

Si no tienes XAMPP instalado o deseas probar la plataforma inmediatamente:
1. Abre la carpeta del proyecto en **VS Code**.
2. Haz clic derecho sobre [`frontend/index.html`](./frontend/index.html) y selecciona **Open with Live Server** (o ábrelo directamente en tu navegador).
3. **Persistencia Automática:** La plataforma detectará que no hay backend PHP activo y operará en modo local con `PuenteDB` y `LocalStorage`, permitiendo registrar casos, chatear y navegar con los datos de prueba.

---

## 🔑 Credenciales de Acceso de Prueba (Seed Data)

Para ingresar y probar los distintos roles disponibles en el sistema:

| Rol | Correo Electrónico | Contraseña | Nombre / Perfil |
| :--- | :--- | :--- | :--- |
| **Ciudadano** | `mariana.sibaja@ejemplo.com` | `password123` | Mariana Sibaja (Caso CAS-00138 activo) |
| **Ciudadano** | `daniela.doria@ejemplo.com` | `password123` | Daniela Doria (Caso CAS-00129 resuelto) |
| **Ciudadano** | `carlos.rodriguez@ejemplo.com`| `password123` | Carlos Rodríguez |
| **Asesora Jurídica**| `elena.gomez@asesores.org` | `password123` | Dra. Elena Gómez (Laboral y Conciliación) |
| **Asesor Jurídico** | `mauricio.padilla@asesores.org`| `password123` | Dr. Mauricio Padilla (Familia y Menores) |

---

## 🔐 Variables de Entorno (`.env.example`)

El proyecto incluye el archivo [`.env.example`](./.env.example) con las siguientes variables documentadas:

```env
# ENTORNO DE LA APLICACIÓN
APP_NAME="Puente Ciudadano ODS 16"
APP_ENV=development
APP_DEBUG=true
APP_URL=http://localhost/puente_ciudadano

# BASE DE DATOS MYSQL (XAMPP)
DB_CONNECTION=mysql
DB_HOST=localhost
DB_PORT=3306
DB_DATABASE=puente_ciudadano
DB_USERNAME=root
DB_PASSWORD=

# CORS Y CLIENTE FRONTEND
FRONTEND_URL=http://localhost:5500
ALLOWED_ORIGINS="http://localhost,http://localhost:5500,https://puente-ciudadano-ods16.vercel.app"

# DESPLIEGUE EN VERCEL
VERCEL_URL=https://puente-ciudadano-ods16.vercel.app
```

---

## 📄 Licencia y Entrega Académica

Proyecto desarrollado para evaluación académica de desarrollo web y cumplimiento del **ODS 16**.  
Todos los derechos reservados por los integrantes del equipo. Licencia educativa MIT.
