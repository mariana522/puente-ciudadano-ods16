"""
Puente Ciudadano (ODS 16 - Paz, Justicia e Instituciones Sólidas)
Módulo: app.py
Servidor API Flask para el Agente RAG y Plataforma Web Completa.
Integra Modelos Relacionales, Ingesta de PDFs, Índice Vectorial en Memoria,
Agente de Orientación Ciudadana con Gemini y Generador de Derecho de Petición (ReportLab).
"""

import os
import io
import logging
from flask import Flask, request, jsonify, send_file, send_from_directory
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

# Importar modelos y módulos del sistema RAG
from models import db, DocumentoFuente, Fragmento, ConsultaAgente
from recuperacion import Indice
from ingesta import ingestar, ingerir
from agente import orientar, LINEAS_EMERGENCIA_OFICIALES
from generador_peticion import generar_derecho_peticion_pdf

# Configurar logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


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

    # Configuración de cabeceras CORS
    @app.after_request
    def habilitar_cors(response):
        response.headers["Access-Control-Allow-Origin"] = "*"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
        return response

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
    print(f"\n==================================================================")
    print(f" PUENTE CIUDADANO (ODS 16) - SERVIDOR AGENTE RAG & WEB INICIADO")
    print(f" Acceso Web: http://localhost:{puerto}")
    print(f" API RAG:    http://localhost:{puerto}/api/rag/estado")
    print(f"==================================================================\n")
    app.run(host="0.0.0.0", port=puerto, debug=True)
