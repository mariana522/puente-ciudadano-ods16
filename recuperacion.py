"""
Puente Ciudadano (ODS 16 - Paz, Justicia e Instituciones Sólidas)
Módulo: recuperacion.py
Motor de recuperación vectorial (Retriever) para la arquitectura RAG.
Carga los embeddings en memoria como una matriz normalizada de NumPy (np.float32)
y computa la similitud coseno mediante álgebra lineal vectorial de alta velocidad.
"""

import os
import logging
from typing import List, Dict, Any, Optional
import numpy as np
from google import genai
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

# Importar modelos de la base de datos
from models import db, Fragmento, DocumentoFuente

logger = logging.getLogger(__name__)


class Indice:
    """
    Índice Vectorial en Memoria para Recuperación RAG de Normativa Oficial.
    
    Características clave:
    1. Carga todos los fragmentos persistidos en la base de datos relacional.
    2. Convierte los embeddings JSON a una matriz 2D de NumPy (dtype=np.float32).
    3. Normaliza las filas de la matriz con su norma euclidiana L2 (||v|| = 1.0),
       de modo que la similitud coseno se reduce a un producto punto matricial (np.dot),
       ejecutado en tiempo casi instantáneo a nivel de rutinas BLAS optimizadas en C.
    4. Proporciona el método `buscar(consulta, k=5)` para recuperar los fragmentos
       más relevantes junto con su contexto institucional y puntaje de afinidad.
    """

    def __init__(
        self,
        app=None,
        api_key: Optional[str] = None,
        modelo: str = "text-embedding-004"
    ):
        """
        Inicializa el índice en memoria.
        
        Args:
            app: Instancia de la aplicación Flask (opcional para cargar en el arranque).
            api_key: Clave de Gemini (opcional, lee de GEMINI_API_KEY).
            modelo: Modelo de embedding oficial de Gemini (por defecto: text-embedding-004).
        """
        self.app = app
        self.modelo = modelo
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY")

        # Matriz 2D de NumPy: dimensiones (N_fragmentos, Dimensiones_vector)
        self.matriz_normalizada: Optional[np.ndarray] = None
        
        # Lista paralela de metadatos (índice i en la matriz corresponde a self.metadatos[i])
        self.metadatos: List[Dict[str, Any]] = []

        # Cliente del SDK oficial de Gemini
        self._cliente: Optional[genai.Client] = None

        # Si se suministró la aplicación Flask al instanciar, cargar datos de inmediato
        if self.app is not None:
            self.cargar(self.app)

    @property
    def cliente(self) -> genai.Client:
        """Obtiene o inicializa de forma perezosa (lazy) el cliente de Gemini."""
        if self._cliente is None:
            clave = self.api_key or os.environ.get("GEMINI_API_KEY")
            if not clave:
                raise ValueError(
                    "No se encontró GEMINI_API_KEY. Configure la variable de entorno o pase api_key al Indice."
                )
            self._cliente = genai.Client(api_key=clave)
        return self._cliente

    def cargar(self, app=None) -> int:
        """
        Carga todos los fragmentos de la base de datos relacional, parsea sus
        embeddings JSON, genera la matriz en memoria y la normaliza para similitud coseno.
        
        Args:
            app: Instancia de Flask si se ejecuta fuera del contexto predeterminado.
            
        Returns:
            int: Número de fragmentos indexados en memoria.
        """
        aplicacion = app or self.app

        def _ejecutar_carga():
            logger.info("Cargando fragmentos normativos desde la base de datos...")
            
            # Consultar todos los fragmentos junto con los datos de su documento fuente
            fragmentos = Fragmento.query.join(
                DocumentoFuente, Fragmento.documento_id == DocumentoFuente.id
            ).order_by(Fragmento.id).all()

            if not fragmentos:
                logger.warning("No se encontraron fragmentos en la base de datos. El índice permanecerá vacío.")
                self.matriz_normalizada = np.empty((0, 768), dtype=np.float32)
                self.metadatos = []
                return 0

            vectores = []
            nuevos_metadatos = []

            for frag in fragmentos:
                # El campo embedding almacena la lista de flotantes desde la base de datos
                vec = frag.embedding
                if isinstance(vec, list) and len(vec) > 0:
                    vectores.append(vec)
                    nuevos_metadatos.append({
                        "id": frag.id,
                        "documento_id": frag.documento_id,
                        "orden": frag.orden,
                        "texto": frag.texto,
                        "titulo": frag.documento.titulo if frag.documento else "Sin Título",
                        "entidad": frag.documento.entidad if frag.documento else "No Especificada",
                        "url": frag.documento.url if frag.documento else None,
                    })
                else:
                    logger.warning(f"Fragmento id={frag.id} omitido por poseer un embedding no válido.")

            if not vectores:
                logger.warning("No se encontraron vectores válidos para indexar.")
                self.matriz_normalizada = np.empty((0, 768), dtype=np.float32)
                self.metadatos = []
                return 0

            # 1. Crear matriz NumPy con precisión de 32 bits (eficiente en memoria y cómputo)
            matriz_cruda = np.array(vectores, dtype=np.float32)

            # 2. Normalización L2 por filas:
            # ||v|| = sqrt(v_1^2 + v_2^2 + ... + v_d^2)
            # Al dividir cada vector por su norma, el producto punto entre dos vectores unitarios
            # es exactamente equivalente a su similitud coseno: cos(u, v) = (u . v) / (||u|| * ||v||) = u_unit . v_unit
            normas = np.linalg.norm(matriz_cruda, axis=1, keepdims=True)
            # Evitar división por cero asignando epsilon
            normas = np.where(normas == 0, 1e-10, normas)
            self.matriz_normalizada = matriz_cruda / normas
            self.metadatos = nuevos_metadatos

            total = len(self.metadatos)
            dims = self.matriz_normalizada.shape[1] if total > 0 else 0
            logger.info(f"Índice vectorial cargado exitosamente: {total} fragmentos en memoria (dim={dims}, dtype=float32).")
            return total

        if aplicacion is not None:
            with aplicacion.app_context():
                return _ejecutar_carga()
        else:
            return _ejecutar_carga()

    def recargar(self, app=None) -> int:
        """
        Actualiza y reconstruye el índice en memoria sin necesidad de reiniciar el servidor.
        Ideal para invocar tras la ingesta de un nuevo documento PDF oficial.
        """
        logger.info("Recargando índice vectorial en memoria...")
        return self.cargar(app=app)

    def buscar(self, consulta: str, k: int = 5) -> List[Dict[str, Any]]:
        """
        Recupera los 'k' fragmentos normativos más relevantes para la consulta ciudadana.
        
        Pasos del algoritmo:
        1. Genera el embedding de la pregunta mediante Gemini (google-genai).
        2. Normaliza el vector de consulta con su norma L2.
        3. Realiza la multiplicación de matrices: similitudes = Matriz_normalizada . vector_consulta_normalizado.
        4. Ordena descendentemente los puntajes y extrae los k mejores elementos.
        
        Args:
            consulta: Pregunta o texto formulado por el ciudadano (ej. '¿Dónde denunciar violencia doméstica?').
            k: Número de fragmentos a recuperar (por defecto: 5).
            
        Returns:
            List[Dict[str, Any]]: Lista de los k mejores fragmentos con id, orden, texto,
                                  metadatos de la fuente y su puntaje de similitud coseno (score).
        """
        if not consulta or not consulta.strip():
            logger.warning("Búsqueda abortada: la consulta está vacía.")
            return []

        if self.matriz_normalizada is None or len(self.metadatos) == 0:
            logger.warning("El índice está vacío. No hay fragmentos cargados para buscar.")
            return []

        total_fragmentos = len(self.metadatos)
        k = max(1, min(k, total_fragmentos))

        logger.info(f"Calculando embedding para consulta: '{consulta[:60]}...'")

        # 1. Generar embedding de la consulta con el SDK oficial
        respuesta_gemini = self.cliente.models.embed_content(
            model=self.modelo,
            contents=consulta.strip()
        )

        if not hasattr(respuesta_gemini, "embeddings") or not respuesta_gemini.embeddings:
            raise RuntimeError("La API de Gemini no devolvió embeddings para la consulta.")

        vector_consulta = respuesta_gemini.embeddings[0].values
        
        # 2. Convertir a vector NumPy (float32) y normalizar L2
        vec_q = np.array(vector_consulta, dtype=np.float32)
        norma_q = np.linalg.norm(vec_q)
        if norma_q == 0:
            norma_q = 1e-10
        vec_q_normalizado = vec_q / norma_q

        # 3. Similitud coseno vectorial mediante producto punto (np.dot)
        # self.matriz_normalizada es de dimensiones (N, D) y vec_q_normalizado es de (D,)
        # El resultado es un vector 1D de longitud N con valores entre -1.0 y 1.0
        similitudes = np.dot(self.matriz_normalizada, vec_q_normalizado)

        # 4. Obtener los índices de los 'k' puntajes más altos (orden descendente)
        indices_ordenados = np.argsort(similitudes)[::-1][:k]

        # 5. Estructurar el resultado final con metadatos y puntajes
        resultados: List[Dict[str, Any]] = []
        for idx in indices_ordenados:
            item = dict(self.metadatos[idx])
            # Redondear similitud a 4 decimales para claridad y estética
            item["score"] = float(round(float(similitudes[idx]), 4))
            resultados.append(item)

        logger.info(f"Búsqueda finalizada: {len(resultados)} fragmentos recuperados. Top score: {resultados[0]['score']}")
        return resultados

    def __len__(self) -> int:
        """Devuelve el total de fragmentos actualmente indexados en memoria."""
        return len(self.metadatos)

    def __repr__(self) -> str:
        total = len(self)
        dims = self.matriz_normalizada.shape[1] if self.matriz_normalizada is not None and total > 0 else 0
        return f"<Indice fragmentos={total} dimensiones={dims} dtype=np.float32>"
