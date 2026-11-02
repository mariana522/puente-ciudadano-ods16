"""
Puente Ciudadano (ODS 16 - Paz, Justicia e Instituciones Sólidas)
Módulo: ingesta.py
Script de ingesta de documentos normativos en formato PDF, troceado semántico (chunking)
y generación de embeddings por lotes mediante el SDK oficial de Gemini (google-genai).
"""

import os
import re
import sys
import logging
from typing import List, Tuple, Optional
import pypdf
from google import genai
from dotenv import load_dotenv

# Cargar variables de entorno desde el archivo .env si existe
load_dotenv()

# Importar modelos y base de datos
from models import db, DocumentoFuente, Fragmento

# Configuración del registro de eventos
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# Configuración predeterminada de Gemini y procesamiento
MODELO_EMBEDDING_DEFECTO = "text-embedding-004"
TAMANIO_LOTE_MAX = 50  # Límite por petición para embedding en lotes


def extraer_texto_pdf(pdf_path: str) -> str:
    """
    Lee un archivo PDF oficial y extrae el texto completo utilizando pypdf.
    
    Args:
        pdf_path: Ruta absoluta o relativa al archivo PDF.
        
    Returns:
        str: Texto consolidado de todas las páginas del PDF.
        
    Raises:
        FileNotFoundError: Si el archivo no existe en la ruta dada.
        ValueError: Si el PDF está vacío o no contiene texto legible (ej. escaneo sin OCR).
    """
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"No se encontró el archivo PDF en la ruta: {pdf_path}")

    logger.info(f"Iniciando extracción de texto con pypdf desde: {pdf_path}")
    reader = pypdf.PdfReader(pdf_path)
    total_paginas = len(reader.pages)
    
    if total_paginas == 0:
        raise ValueError(f"El archivo PDF '{pdf_path}' no contiene páginas.")

    paginas_texto: List[str] = []
    for num_pagina, pagina in enumerate(reader.pages, start=1):
        texto = pagina.extract_text() or ""
        if texto.strip():
            paginas_texto.append(texto)
        else:
            logger.warning(f"La página {num_pagina} de {total_paginas} no contiene texto extraíble.")

    texto_completo = "\n\n".join(paginas_texto).strip()
    if not texto_completo:
        raise ValueError(
            f"El documento '{pdf_path}' no contiene texto extraíble legible. "
            "Verifique si requiere OCR para documentos escaneados."
        )

    logger.info(f"Extracción exitosa: {total_paginas} páginas leídas, {len(texto_completo)} caracteres extraídos.")
    return texto_completo


def trocear(texto: str, tam: int = 900, solape: int = 150) -> List[str]:
    """
    Divide un texto largo en fragmentos (chunks) limpios con ventana deslizante y solape,
    preservando en la medida de lo posible los límites de oraciones o párrafos.
    
    Args:
        texto: Texto a dividir.
        tam: Longitud máxima objetivo de cada fragmento (en caracteres, defecto 900).
        solape: Cantidad de caracteres de superposición entre fragmentos contiguos (defecto 150).
        
    Returns:
        List[str]: Lista de fragmentos limpios y ordenados.
    """
    if tam <= 0:
        raise ValueError("El tamaño de fragmento (tam) debe ser mayor a 0.")
    if solape < 0 or solape >= tam:
        raise ValueError("El solape debe ser mayor o igual a 0 y estrictamente menor que tam.")

    # 1. Normalización y limpieza previa del texto
    texto_limpio = re.sub(r"\r\n|\r", "\n", texto)       # Unificar saltos de línea
    texto_limpio = re.sub(r"[ \t]+", " ", texto_limpio)    # Eliminar espacios múltiples
    texto_limpio = re.sub(r"\n{3,}", "\n\n", texto_limpio) # Limitar saltos triples a dobles
    texto_limpio = texto_limpio.strip()

    if not texto_limpio:
        return []

    # Si el texto completo cabe en un solo fragmento, retornarlo directamente
    if len(texto_limpio) <= tam:
        return [texto_limpio]

    fragmentos: List[str] = []
    inicio = 0
    total_len = len(texto_limpio)

    delimitadores = [".\n", ". ", ";\n", "?\n", "!\n", "\n\n", "\n", " "]

    while inicio < total_len:
        fin_tentativo = min(inicio + tam, total_len)

        # Si ya llegamos al final del texto
        if fin_tentativo == total_len:
            ultimo_chunk = texto_limpio[inicio:fin_tentativo].strip()
            if ultimo_chunk:
                fragmentos.append(ultimo_chunk)
            break

        # Buscar un límite semántico natural (signo de puntuación o salto) dentro de la zona de solape
        ventana = texto_limpio[inicio:fin_tentativo]
        corte_optimo = -1

        # Buscamos en el tramo final del chunk (zona de corte respetuosa)
        margen_busqueda = tam - solape
        for delim in delimitadores:
            pos = ventana.rfind(delim)
            if pos != -1 and pos >= margen_busqueda:
                corte_optimo = inicio + pos + len(delim)
                break

        # Si no encontramos ningún delimitador natural en el margen, cortar en el límite fijo
        if corte_optimo == -1:
            corte_optimo = fin_tentativo

        chunk = texto_limpio[inicio:corte_optimo].strip()
        if chunk:
            fragmentos.append(chunk)

        # Calcular el siguiente inicio retrocediendo el solape desde el corte real
        siguiente_inicio = max(corte_optimo - solape, inicio + 1)
        
        # Garantizar avance estricto para evitar bucles infinitos
        if siguiente_inicio <= inicio:
            siguiente_inicio = inicio + (tam - solape)

        inicio = siguiente_inicio

    logger.info(f"Texto de {total_len} caracteres troceado en {len(fragmentos)} fragmentos (tam={tam}, solape={solape}).")
    return fragmentos


def embeber(
    textos: List[str],
    api_key: Optional[str] = None,
    modelo: str = MODELO_EMBEDDING_DEFECTO,
    tamanio_lote: int = TAMANIO_LOTE_MAX
) -> List[List[float]]:
    """
    Genera los vectores de embedding para una lista de textos utilizando el SDK oficial
    de Google Gemini (google-genai), procesando en lotes de hasta 50 textos por llamada.
    
    Args:
        textos: Lista de cadenas de texto a embeber.
        api_key: Clave de API de Gemini. Si no se suministra, se lee de GEMINI_API_KEY.
        modelo: Nombre del modelo de embedding de Gemini (por defecto: text-embedding-004).
        tamanio_lote: Tamaño del lote de textos por petición (máximo 50 según API).
        
    Returns:
        List[List[float]]: Matriz de embeddings, donde cada fila es una lista de flotantes.
    """
    if not textos:
        return []

    # Obtener API Key del parámetro o del entorno
    clave = api_key or os.environ.get("GEMINI_API_KEY")
    if not clave:
        raise ValueError(
            "No se encontró la clave de API de Gemini. Configure la variable de entorno 'GEMINI_API_KEY' "
            "o pásela como argumento a la función embeber()."
        )

    # Inicializar cliente del SDK oficial google-genai
    cliente = genai.Client(api_key=clave)
    todos_los_embeddings: List[List[float]] = []
    total_textos = len(textos)

    logger.info(f"Generando embeddings para {total_textos} fragmentos con modelo '{modelo}' en lotes de {tamanio_lote}...")

    # Iterar por lotes de máximo tamanio_lote (50)
    for i in range(0, total_textos, tamanio_lote):
        lote = textos[i : i + tamanio_lote]
        lote_num = (i // tamanio_lote) + 1
        total_lotes = (total_textos + tamanio_lote - 1) // tamanio_lote

        logger.info(f"Procesando lote {lote_num}/{total_lotes} ({len(lote)} fragmentos)...")
        try:
            # Llamada al endpoint embed_content del SDK google-genai
            respuesta = cliente.models.embed_content(
                model=modelo,
                contents=lote
            )

            # Extraer los vectores de flotantes de cada ContentEmbedding devuelto
            if not hasattr(respuesta, "embeddings") or not respuesta.embeddings:
                raise RuntimeError(f"La API de Gemini no devolvió embeddings para el lote {lote_num}.")

            for emb in respuesta.embeddings:
                todos_los_embeddings.append(emb.values)

        except Exception as error:
            logger.error(f"Error al generar embeddings en el lote {lote_num}: {error}")
            raise

    logger.info(f"Generación de embeddings completada: {len(todos_los_embeddings)} vectores obtenidos.")
    return todos_los_embeddings


def ingerir(
    pdf_path: str,
    titulo: str,
    entidad: str,
    url: Optional[str] = None,
    app=None,
    tam: int = 900,
    solape: int = 150,
    api_key: Optional[str] = None
) -> Tuple[DocumentoFuente, List[Fragmento]]:
    """
    Pipeline completo de ingesta RAG para normativa oficial de Puente Ciudadano:
    1. Lee y extrae el texto del archivo PDF oficial usando pypdf.
    2. Trocea el texto en fragmentos con solape semántico.
    3. Genera los embeddings en lotes de a 50 con el SDK google-genai.
    4. Persiste el DocumentoFuente y todos sus Fragmentos en la base de datos de Flask.
    
    Args:
        pdf_path: Ruta al archivo PDF normativo.
        titulo: Título oficial del documento (ej: 'Guía de Mecanismos de Justicia Comunitaria').
        entidad: Entidad oficial emisora (ej: 'Defensoría del Pueblo').
        url: URL oficial para trazabilidad ciudadana.
        app: Instancia de Flask (opcional si ya se ejecuta dentro de un contexto de aplicación).
        tam: Tamaño máximo de fragmento (defecto 900).
        solape: Solapamiento entre fragmentos (defecto 150).
        api_key: Clave de Gemini (opcional, lee de GEMINI_API_KEY).
        
    Returns:
        Tuple[DocumentoFuente, List[Fragmento]]: Instancia del documento guardado y lista de fragmentos creados.
    """
    logger.info(f"=== INICIANDO INGESTA: '{titulo}' ({entidad}) ===")
    
    # 1. Extracción de texto con pypdf
    texto = extraer_texto_pdf(pdf_path)

    # 2. Troceado en fragmentos limpios
    fragmentos_texto = trocear(texto, tam=tam, solape=solape)
    if not fragmentos_texto:
        raise ValueError(f"No se pudieron generar fragmentos de texto válidos desde '{pdf_path}'.")

    # 3. Cálculo de embeddings por lotes (SDK oficial google-genai)
    vectores_embedding = embeber(fragmentos_texto, api_key=api_key)

    if len(fragmentos_texto) != len(vectores_embedding):
        raise ValueError(
            f"Discrepancia en la ingesta: se obtuvieron {len(fragmentos_texto)} fragmentos "
            f"pero {len(vectores_embedding)} vectores de embedding."
        )

    # 4. Función interna para persistencia en base de datos
    def _guardar_en_bd():
        # Crear documento fuente
        doc = DocumentoFuente(
            titulo=titulo.strip(),
            entidad=entidad.strip(),
            url=url.strip() if url else None
        )
        db.session.add(doc)
        db.session.flush()  # Obtener el id autoincremental sin cerrar la transacción

        # Crear y asociar cada fragmento
        lista_fragmentos: List[Fragmento] = []
        for orden, (txt, vec) in enumerate(zip(fragmentos_texto, vectores_embedding), start=1):
            frag = Fragmento(
                documento_id=doc.id,
                orden=orden,
                texto=txt,
                embedding=vec  # Guardado como JSON nativo
            )
            db.session.add(frag)
            lista_fragmentos.append(frag)

        db.session.commit()
        logger.info(f"Ingesta guardada exitosamente: Documento ID={doc.id} con {len(lista_fragmentos)} fragmentos.")
        return doc, lista_fragmentos

    # Manejar contexto de aplicación de Flask si fue suministrado
    if app is not None:
        with app.app_context():
            return _guardar_en_bd()
    else:
        # Asume que ya existe un contexto activo de Flask (ej. llamado desde una ruta HTTP o shell)
        return _guardar_en_bd()


# ---------------------------------------------------------------------------
# Ejecución directa desde línea de comandos para pruebas del profesor
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    if len(sys.argv) < 4:
        print("\nUso del script de ingesta (Puente Ciudadano RAG):")
        print("  python ingesta.py <ruta_pdf> <titulo> <entidad> [url_oficial]\n")
        print("Ejemplo:")
        print("  python ingesta.py normativa_justicia.pdf \"Ruta de Atención Violencia Intrafamiliar\" \"Comisaría de Familia\" \"https://defensoria.gov.co\"\n")
        sys.exit(1)

    ruta_pdf_arg = sys.argv[1]
    titulo_arg = sys.argv[2]
    entidad_arg = sys.argv[3]
    url_arg = sys.argv[4] if len(sys.argv) > 4 else None

    # Inicializar una aplicación Flask mínima para proveer el contexto de BD
    from flask import Flask
    app_cli = Flask("puente_ingesta_cli")
    db_path = os.path.join(os.path.dirname(__file__), "puente_rag.db")
    app_cli.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get("DATABASE_URL", f"sqlite:///{db_path}")
    app_cli.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app_cli)

    with app_cli.app_context():
        db.create_all()
        try:
            documento, frags = ingerir(
                pdf_path=ruta_pdf_arg,
                titulo=titulo_arg,
                entidad=entidad_arg,
                url=url_arg,
                app=app_cli
            )
            print(f"\n[ÉXITO] Documento #{documento.id} '{documento.titulo}' ingerido correctamente.")
            print(f"Total de fragmentos normativos creados: {len(frags)}")
        except Exception as e:
            print(f"\n[ERROR EN INGESTA]: {e}")
            sys.exit(1)
