"""
Puente Ciudadano (ODS 16 - Paz, Justicia e Instituciones Sólidas)
Módulo: app.py
Servidor API Flask para el Agente RAG y Plataforma Web Completa.
Integra Modelos Relacionales, Ingesta de PDFs, Índice Vectorial en Memoria,
Agente de Orientación Ciudadana con Gemini y Generador de Derecho de Petición (ReportLab).
"""

import os
import io
import re
import base64
import random
import logging
import threading
import time
from datetime import datetime, timezone
from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

# Importar modelos y módulos del sistema RAG
from models import db, DocumentoFuente, Fragmento, ConsultaAgente, Caso, MensajeChat
from recuperacion import Indice
from ingesta import ingestar, ingerir
from agente import orientar, LINEAS_EMERGENCIA_OFICIALES
from generador_peticion import generar_derecho_peticion_pdf

# Configurar logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# ==============================================================================
# ADJUNTOS DEL CHAT — almacén acotado en memoria (Render tiene disco efímero)
# ------------------------------------------------------------------------------
# Los archivos se reciben por /api/upload y se sirven desde /api/attachments/<id>.
# Se limita el tamaño por archivo, el total en memoria y el tiempo de vida, igual
# que hace server.js en el backend Node.
# ==============================================================================
MAX_ADJUNTO_BYTES = 15 * 1024 * 1024          # 15 MB por archivo
MAX_CUERPO_BYTES = 20 * 1024 * 1024           # 20 MB por petición (multipart/JSON)
MAX_DATA_URL_BYTES = 512 * 1024               # base64 inline solo para vistas previas
ADJUNTOS_MAX_TOTAL_BYTES = 64 * 1024 * 1024   # 64 MB en memoria
ADJUNTOS_TTL_SEGUNDOS = 6 * 60 * 60           # 6 horas

_ADJUNTOS = {}          # id -> {buffer, mimetype, originalname, size, creado}
_ADJUNTOS_BYTES = 0
_ADJUNTOS_SEQ = 0
_ADJUNTOS_LOCK = threading.Lock()

_EXTENSIONES_PERMITIDAS = re.compile(
    r"\.(pdf|doc|docx|xls|xlsx|png|jpg|jpeg|gif|webp|txt|csv|zip)$", re.IGNORECASE
)


def _limpiar_adjuntos():
    """Elimina adjuntos vencidos para no crecer sin control en memoria."""
    global _ADJUNTOS_BYTES
    ahora = time.time()
    for adjunto_id, item in list(_ADJUNTOS.items()):
        if ahora - item["creado"] > ADJUNTOS_TTL_SEGUNDOS:
            _ADJUNTOS.pop(adjunto_id, None)
            _ADJUNTOS_BYTES -= item["size"]


def _guardar_adjunto(nombre, mimetype, datos):
    """Guarda el archivo en memoria y devuelve el id público."""
    global _ADJUNTOS_BYTES, _ADJUNTOS_SEQ
    with _ADJUNTOS_LOCK:
        _limpiar_adjuntos()
        while _ADJUNTOS_BYTES + len(datos) > ADJUNTOS_MAX_TOTAL_BYTES and _ADJUNTOS:
            adjunto_id, item = next(iter(_ADJUNTOS.items()))
            _ADJUNTOS.pop(adjunto_id, None)
            _ADJUNTOS_BYTES -= item["size"]

        _ADJUNTOS_SEQ += 1
        adjunto_id = "att_%s_%s" % (int(time.time()), _ADJUNTOS_SEQ)
        _ADJUNTOS[adjunto_id] = {
            "buffer": datos,
            "mimetype": mimetype or "application/octet-stream",
            "originalname": nombre or "adjunto",
            "size": len(datos),
            "creado": time.time()
        }
        _ADJUNTOS_BYTES += len(datos)
        return adjunto_id


def _obtener_adjunto(adjunto_id):
    """Devuelve el adjunto vigente o None si no existe/venció."""
    global _ADJUNTOS_BYTES
    with _ADJUNTOS_LOCK:
        item = _ADJUNTOS.get(adjunto_id)
        if not item:
            return None
        if time.time() - item["creado"] > ADJUNTOS_TTL_SEGUNDOS:
            _ADJUNTOS.pop(adjunto_id, None)
            _ADJUNTOS_BYTES -= item["size"]
            return None
        return item


def _normalizar_caso(case_id):
    """Mismo normalizador que server.js: CAS-00138 -> cas00138."""
    return re.sub(r"[^a-z0-9]", "", str(case_id or "").lower()) or "cas00138"


def create_app(config_override=None):
    """Fábrica de aplicaciones Flask para Puente Ciudadano (ODS 16)."""
    base_dir = os.path.abspath(os.path.dirname(__file__))
    app = Flask(__name__, static_folder=base_dir, static_url_path="")

    # Determinar URI de base de datos
    db_path = os.path.join(base_dir, "puente_rag.db")
    db_uri = os.environ.get("DATABASE_URL")

    # Si se especificó MySQL en el archivo .env, verificar si el servidor está activo
    if not db_uri and os.environ.get("DB_CONNECTION") == "mysql":
        db_user = os.environ.get("DB_USERNAME", "root")
        db_pass = os.environ.get("DB_PASSWORD", "")
        db_host = os.environ.get("DB_HOST", "127.0.0.1")
        db_port = os.environ.get("DB_PORT", "3306")
        db_name = os.environ.get("DB_DATABASE", "puente_ciudadano")
        db_uri_candidata = f"mysql+pymysql://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"

        try:
            from sqlalchemy import create_engine, text
            test_engine = create_engine(db_uri_candidata, connect_args={"connect_timeout": 1})
            with test_engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            test_engine.dispose()
            db_uri = db_uri_candidata
            logger.info("Conexión con servidor MySQL establecida exitosamente.")
        except Exception as ex_mysql:
            logger.warning(
                f"Servidor MySQL inactivo ({ex_mysql}). Activando base de datos SQLite: {db_path}"
            )
            db_uri = f"sqlite:///{db_path}"

    app.config["SQLALCHEMY_DATABASE_URI"] = db_uri or f"sqlite:///{db_path}"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["JSON_AS_ASCII"] = False
    # Permite subir adjuntos de hasta 15 MB por multipart/JSON.
    app.config["MAX_CONTENT_LENGTH"] = MAX_CUERPO_BYTES

    if config_override:
        app.config.update(config_override)

    # Inicializar base de datos
    db.init_app(app)

    # Crear tablas si no existen
    with app.app_context():
        db.create_all()

    # Inicializar índice en memoria
    indice = Indice(app=app)
    app.indice_rag = indice

    # Configuración CORS (Render, Vercel y desarrollo local).
    # Flask-CORS responde también los preflight OPTIONS automáticamente.
    CORS(app, resources={r"/*": {"origins": "*"}})

    # --------------------------------------------------------------------------
    # API DE CASOS COMPARTIDOS (MISMAS RUTAS QUE server.js)
    # Permite que la UI servida por Flask en Render comparta los expedientes
    # entre ciudadanos y profesionales de distintos dispositivos.
    # --------------------------------------------------------------------------
    def _texto(valor):
        return "" if valor is None else str(valor).strip()

    def _esta_sin_asignar(caso):
        asignado = _texto(caso.assigned_to or "").lower()
        return asignado in ("", "por asignar", "sin asignar", "null", "undefined")

    def _limpiar_titulo(nombre):
        nombre = _texto(nombre).lower()
        for prefijo in ("dra. ", "dr. ", "dra.", "dr."):
            if nombre.startswith(prefijo):
                return nombre[len(prefijo):].strip()
        return nombre

    @app.route("/health", methods=["GET"])
    def healthcheck():
        """Healthcheck para Render y para el diagnóstico del frontend."""
        return jsonify({
            "status": "ok",
            "service": "Puente Ciudadano ODS 16 - Flask (UI + API de casos + RAG)",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "casos": Caso.query.count()
        })

    @app.route("/api/casos", methods=["GET", "POST", "PUT", "OPTIONS"])
    def api_casos():
        if request.method == "OPTIONS":
            return jsonify({"success": True}), 200

        # ---------------- GET: consultar expedientes ----------------
        if request.method == "GET":
            codigo = _texto(request.args.get("codigo") or request.args.get("id"))
            if codigo:
                caso = db.session.get(Caso, codigo)
                if not caso:
                    return jsonify({"success": False, "message": "Expediente no encontrado."}), 404
                return jsonify({"success": True, "data": caso.to_dict()})

            casos = Caso.query.order_by(Caso.created_at.desc()).all()

            sin_asignar = (request.args.get("unassigned") or "").lower() in ("true", "1")
            rol = _texto(request.args.get("user_role") or request.headers.get("X-User-Role") or "citizen").lower()
            email = _texto(request.args.get("user_email") or request.headers.get("X-User-Email")).lower()
            nombre = _texto(request.args.get("user_name") or request.headers.get("X-User-Name")).lower()

            if sin_asignar:
                casos = [c for c in casos if _esta_sin_asignar(c)]
            elif rol == "professional" and (email or nombre):
                nombre_limpio = _limpiar_titulo(nombre)
                casos = [
                    c for c in casos
                    if (c.assigned_to_email and c.assigned_to_email.lower() == email)
                    or (_limpiar_titulo(c.assigned_to) == nombre_limpio and nombre_limpio != "")
                ]
            elif rol == "citizen" and (email or nombre):
                casos = [
                    c for c in casos
                    if (c.citizen_email and c.citizen_email.lower() == email)
                    or (_texto(c.citizen).lower() == nombre and nombre != "")
                ]

            return jsonify({
                "success": True,
                "count": len(casos),
                "data": [c.to_dict() for c in casos]
            })

        # ---------------- POST / PUT: crear, asignar o actualizar ----------------
        data = request.get_json(silent=True) or {}
        accion = _texto(request.args.get("action") or data.get("action")).lower()

        if accion == "claim":
            case_id = _texto(data.get("caseId") or data.get("id") or request.args.get("caseId") or request.args.get("id"))
            caso = db.session.get(Caso, case_id) if case_id else None
            if not caso:
                return jsonify({"success": False, "message": "Expediente no encontrado para asignación."}), 404

            prof_name = _texto(data.get("profName") or data.get("assignedTo")) or "Dra. Elena Gómez"
            prof_email = _texto(data.get("profEmail") or data.get("assignedToEmail"))
            caso.assigned_to = prof_name
            if prof_email:
                caso.assigned_to_email = prof_email
            if (caso.status or "") == "Pendiente":
                caso.status = "En curso"
            caso.updated_at = datetime.now(timezone.utc)
            db.session.commit()
            return jsonify({
                "success": True,
                "message": f"Caso {caso.id} asignado exitosamente a {prof_name}",
                "data": caso.to_dict()
            })

        if accion == "update" or request.method == "PUT":
            case_id = _texto(data.get("id") or data.get("codigo") or request.args.get("id"))
            caso = db.session.get(Caso, case_id) if case_id else None
            if not caso:
                return jsonify({"success": False, "message": "Expediente no encontrado para actualizar."}), 404

            if data.get("status") or data.get("estado"):
                caso.status = _texto(data.get("status") or data.get("estado"))
            if "observations" in data:
                caso.observations = _texto(data.get("observations"))
            if data.get("roomUrl") or data.get("sala_url"):
                caso.room_url = _texto(data.get("roomUrl") or data.get("sala_url"))
            caso.updated_at = datetime.now(timezone.utc)
            db.session.commit()
            return jsonify({
                "success": True,
                "message": f"Expediente {caso.id} actualizado exitosamente.",
                "data": caso.to_dict()
            })

        # Crear o actualizar (upsert) un expediente completo
        case_id = _texto(data.get("id") or data.get("codigo"))
        if not case_id:
            case_id = f"CAS-00{random.randint(100, 999)}"
        caso = db.session.get(Caso, case_id)

        if caso is None:
            caso = Caso(id=case_id)
            caso.citizen = _texto(data.get("citizen")) or "Ciudadano Anónimo"
            caso.type = _texto(data.get("type")) or "Orientación Jurídica"
            caso.status = _texto(data.get("status")) or "Pendiente"
            caso.assigned_to = _texto(data.get("assignedTo")) or "Por asignar"
            caso.date = _texto(data.get("date")) or datetime.now(timezone.utc).strftime("%Y-%m-%d")
            caso.institution = _texto(data.get("institution")) or "Consultorio Jurídico"
            caso.created_at = datetime.now(timezone.utc)
            db.session.add(caso)

        caso.citizen = _texto(data.get("citizen")) or caso.citizen or "Ciudadano Anónimo"
        caso.citizen_email = _texto(data.get("citizenEmail"))
        caso.type = _texto(data.get("type")) or caso.type or "Orientación Jurídica"
        caso.sub_type = _texto(data.get("subType") or data.get("subtipo")) or caso.sub_type or ""
        caso.description = _texto(data.get("description") or data.get("descripcion"))
        caso.status = _texto(data.get("status")) or caso.status or "Pendiente"
        caso.assigned_to = _texto(data.get("assignedTo")) or caso.assigned_to or "Por asignar"
        caso.assigned_to_email = _texto(data.get("assignedToEmail"))
        caso.date = _texto(data.get("date")) or caso.date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        caso.institution = _texto(data.get("institution")) or caso.institution or "Consultorio Jurídico"
        caso.inst_address = _texto(data.get("instAddress"))
        caso.inst_phone = _texto(data.get("instPhone"))
        caso.inst_hours = _texto(data.get("instHours"))
        if isinstance(data.get("checklist"), list):
            caso.checklist = data.get("checklist")
        elif caso.checklist is None:
            caso.checklist = []
        caso.observations = _texto(data.get("observations"))
        caso.updated_at = datetime.now(timezone.utc)
        db.session.commit()

        logger.info("[Casos] Expediente %s registrado/actualizado en la base compartida.", caso.id)
        return jsonify({
            "success": True,
            "message": "Expediente registrado exitosamente con estado inicial Pendiente.",
            "data": caso.to_dict()
        }), 201

    # --------------------------------------------------------------------------
    # API DE MENSAJES Y ADJUNTOS DEL CHAT (MISMAS RUTAS QUE server.js)
    # Permite enviar PDF/imágenes desde el chat cuando la UI la sirve Flask.
    # --------------------------------------------------------------------------
    @app.route("/api/upload", methods=["POST", "OPTIONS"])
    def api_upload():
        if request.method == "OPTIONS":
            return jsonify({"success": True}), 200

        archivo = (
            request.files.get("file")
            or request.files.get("archivo")
            or request.files.get("adjunto")
        )
        if archivo is None:
            return jsonify({
                "success": False,
                "error": "archivo_requerido",
                "message": "No se recibió ningún archivo. Envía el campo \"file\" en el FormData."
            }), 400

        if not _EXTENSIONES_PERMITIDAS.search(archivo.filename or ""):
            return jsonify({
                "success": False,
                "error": "tipo_no_permitido",
                "message": "Tipo de archivo no permitido."
            }), 415

        datos = archivo.read()
        if len(datos) > MAX_ADJUNTO_BYTES:
            return jsonify({
                "success": False,
                "error": "archivo_demasiado_grande",
                "message": "El archivo supera el límite de 15 MB."
            }), 413
        if not datos:
            return jsonify({
                "success": False,
                "error": "archivo_vacio",
                "message": "El archivo está vacío."
            }), 400

        mimetype = archivo.mimetype or "application/octet-stream"
        adjunto_id = _guardar_adjunto(archivo.filename, mimetype, datos)
        data_url = None
        if len(datos) <= MAX_DATA_URL_BYTES:
            data_url = "data:%s;base64,%s" % (
                mimetype,
                base64.b64encode(datos).decode("ascii")
            )

        logger.info("[Adjuntos] %s (%s KB) guardado como %s",
                    archivo.filename, max(1, len(datos) // 1024), adjunto_id)

        return jsonify({
            "success": True,
            "id": adjunto_id,
            "filename": adjunto_id,
            "originalname": archivo.filename,
            "mimetype": mimetype,
            "size": len(datos),
            "storage": "memory",
            "url": "/api/attachments/" + adjunto_id,
            "dataUrl": data_url
        }), 200

    @app.route("/api/attachments/<adjunto_id>", methods=["GET"])
    def api_attachment(adjunto_id):
        item = _obtener_adjunto(adjunto_id)
        if not item:
            return jsonify({
                "success": False,
                "error": "not_found",
                "message": "El adjunto no existe o expiró."
            }), 404
        return send_file(
            io.BytesIO(item["buffer"]),
            mimetype=item["mimetype"],
            download_name=item["originalname"],
            as_attachment=False,
            max_age=0
        )

    @app.route("/api/mensajes", methods=["GET", "POST", "OPTIONS"])
    def api_mensajes():
        if request.method == "OPTIONS":
            return jsonify({"success": True}), 200

        if request.method == "GET":
            case_id = _texto(
                request.args.get("caseId")
                or request.args.get("caso_codigo")
                or request.args.get("id")
            ) or "CAS-00138"
            registros = MensajeChat.query.filter_by(
                case_key=_normalizar_caso(case_id)
            ).order_by(MensajeChat.created_at.asc()).all()
            return jsonify({
                "success": True,
                "caseId": case_id,
                "count": len(registros),
                "data": [m.to_dict() for m in registros]
            })

        data = request.get_json(silent=True) or {}
        case_id = _texto(
            data.get("caseId") or data.get("caso_codigo") or request.args.get("caseId")
        ) or "CAS-00138"
        texto = _texto(data.get("text") or data.get("mensaje"))
        adjunto = data.get("attachment") if isinstance(data.get("attachment"), dict) else None
        if not texto and not adjunto:
            return jsonify({
                "success": False,
                "message": "El mensaje debe tener texto o un archivo adjunto."
            }), 400

        mensaje_id = _texto(data.get("id")) or "MSG-%s-%s" % (
            int(time.time() * 1000), random.randint(100, 999)
        )
        registro = db.session.get(MensajeChat, mensaje_id)
        if registro is None:
            registro = MensajeChat(id=mensaje_id, created_at=datetime.now(timezone.utc))
            db.session.add(registro)

        registro.case_id = case_id
        registro.case_key = _normalizar_caso(case_id)
        registro.sender = _texto(data.get("sender") or data.get("remitente")) or "Usuario"
        registro.sender_email = _texto(data.get("senderEmail")).lower()
        registro.role = _texto(data.get("role")) or "citizen"
        registro.text = texto
        registro.time = _texto(data.get("time")) or datetime.now(timezone.utc).strftime("%H:%M")
        registro.date = _texto(data.get("date")) or datetime.now(timezone.utc).strftime("%Y-%m-%d")
        registro.attachment = adjunto
        db.session.commit()

        return jsonify({
            "success": True,
            "message": "Mensaje persistido.",
            "data": registro.to_dict()
        }), 201

    @app.errorhandler(413)
    def _cuerpo_demasiado_grande(_error):
        return jsonify({
            "success": False,
            "error": "payload_too_large",
            "message": "La petición supera el límite de 15 MB. Comprime el archivo o usa /api/upload."
        }), 413

    # --------------------------------------------------------------------------
    # RUTAS DE SERVIDO WEB ESTÁTICO (UI FRONTEND)
    # --------------------------------------------------------------------------
    @app.route("/", methods=["GET"])
    def index():
        return send_from_directory(base_dir, "index.html")

    @app.route("/<path:path>", methods=["GET"])
    def servir_estaticos(path):
        archivo_solicitado = os.path.join(base_dir, path)
        if os.path.isfile(archivo_solicitado):
            return send_from_directory(base_dir, path)
        return send_from_directory(base_dir, "index.html")

    # --------------------------------------------------------------------------
    # ENDPOINTS DE LA API RAG (ODS 16)
    # --------------------------------------------------------------------------

    @app.route("/api/rag/estado", methods=["GET"])
    def estado():
        """Retorna el estado de la base de datos y de la matriz vectorial en memoria."""
        total_docs = DocumentoFuente.query.count()
        total_frags = Fragmento.query.count()
        total_consultas = ConsultaAgente.query.count()
        return jsonify({
            "status": "ok",
            "servicio": "Puente Ciudadano - Agente RAG ODS 16",
            "base_de_datos": {
                "uri": app.config["SQLALCHEMY_DATABASE_URI"].split("@")[-1],
                "total_documentos": total_docs,
                "total_fragmentos": total_frags,
                "total_consultas_registradas": total_consultas
            },
            "indice_memoria": {
                "total_fragmentos_indexados": len(indice),
                "dimensiones_vector": int(indice.matriz.shape[1]) if indice.matriz is not None and len(indice) > 0 else 0,
                "modelo_embedding": indice.modelo
            },
            "lineas_emergencia": LINEAS_EMERGENCIA_OFICIALES
        })

    @app.route("/api/rag/documentos", methods=["GET"])
    def listar_documentos():
        """Lista todos los documentos oficiales normativos ingeridos."""
        documentos = DocumentoFuente.query.order_by(DocumentoFuente.id.desc()).all()
        return jsonify({
            "status": "ok",
            "total": len(documentos),
            "documentos": [doc.to_dict(incluir_conteo=True) for doc in documentos]
        })

    @app.route("/api/rag/buscar", methods=["POST", "OPTIONS"])
    def buscar_fragmentos():
        """Busca los fragmentos más relevantes para una consulta ciudadana."""
        if request.method == "OPTIONS":
            return jsonify({"status": "ok"}), 200

        datos = request.get_json() or {}
        consulta = datos.get("consulta", "").strip()
        k = int(datos.get("k", 5))

        if not consulta:
            return jsonify({"status": "error", "mensaje": "El campo 'consulta' es obligatorio."}), 400

        try:
            resultados = indice.buscar(consulta=consulta, k=k)
            return jsonify({
                "status": "ok",
                "consulta": consulta,
                "k_solicitado": k,
                "total_recuperados": len(resultados),
                "fragmentos": resultados
            })
        except Exception as e:
            logger.error(f"Error en búsqueda RAG: {e}")
            return jsonify({"status": "error", "mensaje": str(e)}), 500

    @app.route("/api/rag/ingerir", methods=["POST", "OPTIONS"])
    def ingerir_documento():
        """Ejecuta la ingesta de un PDF oficial y actualiza el índice en memoria."""
        if request.method == "OPTIONS":
            return jsonify({"status": "ok"}), 200

        datos = request.get_json() or {}
        pdf_path = datos.get("pdf_path")
        titulo = datos.get("titulo")
        entidad = datos.get("entidad")
        url = datos.get("url")

        if not pdf_path or not titulo or not entidad:
            return jsonify({
                "status": "error",
                "mensaje": "Los campos 'pdf_path', 'titulo' y 'entidad' son requeridos."
            }), 400

        try:
            doc, frags = ingestar(
                pdf_path=pdf_path,
                titulo=titulo,
                entidad=entidad,
                url=url,
                app=app
            )
            indice.recargar(app=app)

            return jsonify({
                "status": "ok",
                "mensaje": "Documento oficial ingerido e indexado con éxito.",
                "documento": doc.to_dict(),
                "fragmentos_creados": len(frags),
                "total_indice_actualizado": len(indice)
            }), 201

        except Exception as e:
            logger.error(f"Error al procesar ingesta: {e}")
            return jsonify({"status": "error", "mensaje": str(e)}), 500

    @app.route("/api/rag/orientar", methods=["POST", "OPTIONS"])
    def orientar_ciudadano():
        """
        Endpoint principal del Agente de Orientación Ciudadana con RAG:
        Recibe 'usuario' y 'mensaje', ejecuta el pipeline RAG y retorna la orientación con citas,
        métricas de confianza, banderas de riesgo y derivación profesional.
        """
        if request.method == "OPTIONS":
            return jsonify({"status": "ok"}), 200

        datos = request.get_json() or {}
        usuario = datos.get("usuario", "Ciudadano").strip()
        mensaje = datos.get("mensaje", "").strip()

        if not mensaje:
            return jsonify({
                "status": "error",
                "mensaje": "El campo 'mensaje' es obligatorio para orientar la situación."
            }), 400

        try:
            resultado = orientar(
                usuario=usuario,
                mensaje=mensaje,
                indice=indice,
                app=app
            )
            return jsonify(resultado), 200
        except Exception as e:
            logger.error(f"Error en orientación RAG: {e}", exc_info=True)
            return jsonify({"status": "error", "mensaje": str(e)}), 500

    @app.route("/api/rag/peticion/pdf", methods=["POST", "OPTIONS"])
    def generar_peticion_pdf():
        """
        Genera y descarga el borrador formal del Derecho de Petición en formato PDF
        conforme al Artículo 16 de la Ley 1437 de 2011 (ReportLab).
        """
        if request.method == "OPTIONS":
            return jsonify({"status": "ok"}), 200

        datos = request.get_json() or {}

        # Si se suministró consulta_id, buscar la consulta registrada
        consulta_id = datos.get("consulta_id")
        if consulta_id:
            consulta_reg = ConsultaAgente.query.get(consulta_id)
            if consulta_reg:
                datos["tipo_caso"] = datos.get("tipo_caso") or consulta_reg.tipo_caso
                datos["institucion"] = datos.get("institucion") or consulta_reg.institucion
                datos["usuario"] = datos.get("usuario") or consulta_reg.usuario
                datos["consulta"] = datos.get("consulta") or consulta_reg.consulta
                datos["respuesta"] = datos.get("respuesta") or consulta_reg.respuesta
                datos["pasos"] = datos.get("pasos") or consulta_reg.pasos

        try:
            pdf_bytes = generar_derecho_peticion_pdf(datos)
            return send_file(
                io.BytesIO(pdf_bytes),
                mimetype="application/pdf",
                as_attachment=True,
                download_name="Borrador_Derecho_de_Peticion_Art16_Ley1437.pdf"
            )
        except Exception as e:
            logger.error(f"Error al generar PDF de derecho de petición: {e}", exc_info=True)
            return jsonify({"status": "error", "mensaje": str(e)}), 500

    @app.route("/api/rag/consultas", methods=["GET"])
    def listar_consultas():
        """Retorna el historial de consultas ciudadanas orientadas para auditoría."""
        consultas = ConsultaAgente.query.order_by(ConsultaAgente.id.desc()).limit(50).all()
        return jsonify({
            "status": "ok",
            "total": len(consultas),
            "consultas": [c.to_dict() for c in consultas]
        })

    @app.route("/api/rag/consultas/<int:consulta_id>", methods=["GET"])
    def detalle_consulta(consulta_id):
        """Retorna el detalle completo de una consulta ciudadana por su ID."""
        c = ConsultaAgente.query.get_or_404(consulta_id)
        return jsonify({
            "status": "ok",
            "consulta": c.to_dict()
        })

    return app


# Instancia principal de la aplicación Flask
app = create_app()

if __name__ == "__main__":
    puerto = int(os.environ.get("PORT", 5000))
    depurar = os.environ.get("FLASK_DEBUG", "0").strip().lower() in ("1", "true", "yes", "on")
    print(f"\n==================================================================")
    print(f" PUENTE CIUDADANO (ODS 16) - SERVIDOR AGENTE RAG & WEB INICIADO")
    print(f" Acceso Web: http://localhost:{puerto}")
    print(f" API RAG:    http://localhost:{puerto}/api/rag/estado")
    print(f" Puerto Render (PORT): {puerto} | Depuración: {depurar}")
    print(f"==================================================================\n")
    app.run(host="0.0.0.0", port=puerto, debug=depurar)
