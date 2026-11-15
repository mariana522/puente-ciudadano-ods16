"""
Puente Ciudadano (ODS 16 - Paz, Justicia e Instituciones Sólidas)
Módulo: recuperacion.py
Motor de recuperación vectorial (Retriever) para la arquitectura RAG.
Carga los embeddings en memoria como una matriz normalizada de NumPy (np.float32)
y computa la similitud coseno mediante álgebra lineal vectorial con producto punto (self.matriz @ q).
"""

import os
import logging
from typing import List, Dict, Any, Optional
import numpy as np
from dotenv import load_dotenv

# Cargar variables de entorno
load_dotenv()

# Importar modelos de la base de datos
from models import db, Fragmento, DocumentoFuente
from ingesta import _generar_embedding_simulado

logger = logging.getLogger(__name__)


class Indice:
    """
    Índice Vectorial en Memoria para Recuperación RAG de Normativa Oficial.
    
    Características clave:
    1. Carga todos los fragmentos persistidos en la base de datos relacional (MySQL / SQLite).
    2. Convierte los embeddings JSON a una matriz 2D de NumPy (dtype=np.float32).
    3. Normaliza las filas de la matriz con su norma euclidiana L2 (||v|| = 1.0).
    4. Proporciona el método `buscar(consulta, k=5)` que calcula la similitud coseno
       utilizando producto punto directo (self.matriz @ q) y devuelve los 5 fragmentos más similares.
    """

    def __init__(
        self,
        app: Any = None,
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
        self.matriz: Optional[np.ndarray] = None
        self.matriz_normalizada: Optional[np.ndarray] = None
        
        # Lista paralela de metadatos (índice i en la matriz corresponde a self.metadatos[i])
        self.metadatos: List[Dict[str, Any]] = []

        # Cliente lazy del SDK de Gemini
        self._cliente = None

        # Cargar datos si se suministró la aplicación
        if self.app is not None:
            self.cargar(self.app)

    @property
    def cliente(self):
        """Obtiene o inicializa de forma perezosa el cliente de Gemini."""
        if self._cliente is None:
            clave = self.api_key or os.environ.get("GEMINI_API_KEY")
            if clave:
                try:
                    from google import genai
                    self._cliente = genai.Client(api_key=clave)
                except Exception as e:
                    logger.warning(f"No se pudo inicializar cliente de Gemini: {e}")
                    self._cliente = None
        return self._cliente

    def cargar(self, app: Any = None) -> int:
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
            
            fragmentos = Fragmento.query.join(
                DocumentoFuente, Fragmento.documento_id == DocumentoFuente.id
            ).order_by(Fragmento.id).all()

            if not fragmentos:
                logger.warning("No se encontraron fragmentos en la base de datos. El índice permanecerá vacío.")
                self.matriz = np.empty((0, 768), dtype=np.float32)
                self.matriz_normalizada = self.matriz
                self.metadatos = []
                return 0

            vectores = []
            nuevos_metadatos = []

            for frag in fragmentos:
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
                self.matriz = np.empty((0, 768), dtype=np.float32)
                self.matriz_normalizada = self.matriz
                self.metadatos = []
                return 0

            # 1. Crear matriz NumPy con precisión de 32 bits
            matriz_cruda = np.array(vectores, dtype=np.float32)

            # 2. Normalización L2 por filas: ||v|| = 1.0
            normas = np.linalg.norm(matriz_cruda, axis=1, keepdims=True)
            normas = np.where(normas == 0, 1e-10, normas)
            self.matriz = matriz_cruda / normas
            self.matriz_normalizada = self.matriz
            self.metadatos = nuevos_metadatos

            total = len(self.metadatos)
            dims = self.matriz.shape[1] if total > 0 else 0
            logger.info(f"Índice vectorial cargado: {total} fragmentos en matriz NumPy (dim={dims}, dtype=float32).")
            return total

        if aplicacion is not None:
            with aplicacion.app_context():
                return _ejecutar_carga()
        else:
            return _ejecutar_carga()

    def recargar(self, app: Any = None) -> int:
        """Actualiza y reconstruye el índice en memoria sin reiniciar el servidor."""
        logger.info("Recargando índice vectorial...")
        return self.cargar(app=app)

    def _obtener_embedding_consulta(self, consulta: str) -> np.ndarray:
        """Obtiene el embedding de la consulta mediante Gemini API o generador determinista."""
        if self.cliente:
            try:
                res = self.cliente.models.embed_content(
                    model=self.modelo,
                    contents=consulta.strip()
                )
                if hasattr(res, "embeddings") and res.embeddings:
                    return np.array(res.embeddings[0].values, dtype=np.float32)
            except Exception as e:
                logger.warning(f"Fallo al obtener embedding con Gemini API ({e}). Usando generador de respaldo.")

        # Generador de respaldo
        dims = self.matriz.shape[1] if (self.matriz is not None and self.matriz.shape[0] > 0) else 768
        vec = _generar_embedding_simulado(consulta, dim=dims)
        return np.array(vec, dtype=np.float32)

    def buscar(self, consulta: str, k: int = 5) -> List[Dict[str, Any]]:
        """
        Recupera los 'k' fragmentos más similares utilizando producto punto (self.matriz @ q).
        
        Args:
            consulta: Texto o pregunta del ciudadano.
            k: Número de fragmentos a recuperar (por defecto: 5).
            
        Returns:
            List[Dict[str, Any]]: Lista de los 5 fragmentos más similares con metadatos y score.
        """
        if not consulta or not consulta.strip():
            logger.warning("Búsqueda cancelada: consulta vacía.")
            return []

        if self.matriz is None or len(self.metadatos) == 0:
            logger.warning("Índice vacío. Cargando base de datos...")
            if self.app is not None:
                self.cargar(self.app)
            if self.matriz is None or len(self.metadatos) == 0:
                return []

        total_fragmentos = len(self.metadatos)
        k = max(1, min(k, total_fragmentos))

        # 1. Obtener embedding de consulta
        vec_q = self._obtener_embedding_consulta(consulta)

        # 2. Normalizar vector de consulta con su norma L2
        norma_q = np.linalg.norm(vec_q)
        if norma_q == 0:
            norma_q = 1e-10
        q = vec_q / norma_q

        # 3. Similitud coseno calculada mediante producto punto: self.matriz @ q
        # self.matriz tiene dimensiones (N, D) y q tiene (D,) -> resultado (N,)
        similitudes = self.matriz @ q

        # 4. Ordenar descendentemente los k puntajes más altos
        indices_ordenados = np.argsort(similitudes)[::-1][:k]

        # 5. Estructurar lista de resultados
        resultados: List[Dict[str, Any]] = []
        for idx in indices_ordenados:
            item = dict(self.metadatos[idx])
            score_val = float(round(float(similitudes[idx]), 4))
            item["score"] = score_val
            item["similitud"] = score_val
            resultados.append(item)

        return resultados

    def __len__(self) -> int:
        return len(self.metadatos)

    def __repr__(self) -> str:
        total = len(self)
        dims = self.matriz.shape[1] if self.matriz is not None and total > 0 else 0
        return f"<Indice fragmentos={total} dimensiones={dims} dtype=np.float32>"
