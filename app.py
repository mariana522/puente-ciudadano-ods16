"""
Puente Ciudadano (ODS 16 - Paz, Justicia e Instituciones Sólidas)
Módulo: app.py
Servidor API Flask para el Agente RAG.
Integra los Modelos de Base de Datos, el Motor de Ingesta y el Índice Vectorial en memoria.
"""

import os
import logging
from flask import Flask, request, jsonify
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

# Importar componentes de la arquitectura RAG
from models import db, DocumentoFuente, Fragmento, ConsultaAgente
from recuperacion import Indice
from ingesta import ingerir

# Configurar logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)


def create_app(config_override=None):
    """Fábrica de aplicaciones Flask para Puente Ciudadano."""
    app = Flask(__name__)

    # Determinar URI de base de datos
    db_path = os.path.join(os.path.abspath(os.path.dirname(__file__)), "puente_rag.db")
    db_uri = os.environ.get("DATABASE_URL")

    # Si se especificó MySQL en el archivo .env, verificar si el servidor está activo
    if not db_uri and os.environ.get("DB_CONNECTION") == "mysql":
        db_user = os.environ.get("DB_USERNAME", "root")
        db_pass = os.environ.get("DB_PASSWORD", "")
        db_host = os.environ.get("DB_HOST", "127.0.0.1")
        db_port = os.environ.get("DB_PORT", "3306")
        db_name = os.environ.get("DB_DATABASE", "puente_ciudadano")
        db_uri_candidata = f"mysql+pymysql://{db_user}:{db_pass}@{db_host}:{db_port}/{db_name}"

        # Comprobar si el servidor MySQL responde en 1 segundo
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
                f"Servidor MySQL inactivo o no disponible ({ex_mysql}). "
                f"Activando automáticamente base de datos de respaldo SQLite: {db_path}"
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

    # --------------------------------------------------------------------------
    # ENDPOINTS DE LA API RAG
    # --------------------------------------------------------------------------

    @app.route("/api/rag/estado", methods=["GET"])
    def estado():
        """Retorna el estado de la base de datos y de la matriz vectorial en memoria."""
        total_docs = DocumentoFuente.query.count()
        total_frags = Fragmento.query.count()
        return jsonify({
            "status": "ok",
            "servicio": "Puente Ciudadano - Agente RAG ODS 16",
            "base_de_datos": {
                "uri": app.config["SQLALCHEMY_DATABASE_URI"].split("@")[-1],  # Oculta credenciales si hay
                "total_documentos": total_docs,
                "total_fragmentos": total_frags
            },
            "indice_memoria": {
                "total_fragmentos_indexados": len(indice),
                "dimensiones_vector": int(indice.matriz_normalizada.shape[1]) if indice.matriz_normalizada is not None and len(indice) > 0 else 0,
                "modelo_embedding": indice.modelo
            }
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

    @app.route("/api/rag/buscar", methods=["POST"])
    def buscar_fragmentos():
        """
        Busca los fragmentos más relevantes para una consulta ciudadana.
        Body JSON esperado:
        {
            "consulta": "¿Cómo solicitar una medida de protección por violencia de género?",
            "k": 5
        }
        """
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
            logger.error(f"Error al realizar búsqueda RAG: {e}")
            return jsonify({"status": "error", "mensaje": str(e)}), 500

    @app.route("/api/rag/ingerir", methods=["POST"])
    def ingerir_documento():
        """
        Ejecuta la ingesta de un PDF oficial y actualiza el índice en memoria.
        Body JSON esperado:
        {
            "pdf_path": "ruta/al/documento.pdf",
            "titulo": "Ley 1257 de 2008 - No Violencia contra la Mujer",
            "entidad": "Congreso de la República de Colombia",
            "url": "https://www.secretariasenado.gov.co/senado/basedoc/ley_1257_2008.html"
        }
        """
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
            doc, frags = ingerir(
                pdf_path=pdf_path,
                titulo=titulo,
                entidad=entidad,
                url=url,
                app=app
            )
            # Recargar la matriz en memoria para incluir los nuevos fragmentos
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

    # Adjuntar referencia del índice a la app para conveniencia
    app.indice_rag = indice
    return app


# Instancia para ejecución directa o servidores WSGI (gunicorn / flask run)
app = create_app()

if __name__ == "__main__":
    puerto = int(os.environ.get("PORT", 5000))
    print(f"\nIniciando Servidor Flask RAG de Puente Ciudadano en http://localhost:{puerto} ...\n")
    app.run(host="0.0.0.0", port=puerto, debug=True)
