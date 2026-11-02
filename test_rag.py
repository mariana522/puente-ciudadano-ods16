"""
Puente Ciudadano (ODS 16) - Suite de Pruebas y Demostración Funcional
Módulo: test_rag.py
Valida los 3 componentes solicitados:
1. Modelos relacionales con Flask-SQLAlchemy y eliminación en cascada.
2. Algoritmo de troceado semántico (chunking con solape) e ingesta.
3. Índice en memoria, normalización L2 con NumPy (np.float32) y similitud coseno.
"""

import os
import unittest
import numpy as np
from flask import Flask
from models import db, DocumentoFuente, Fragmento, ConsultaAgente
from ingesta import trocear
from recuperacion import Indice


class TestPuenteCiudadanoRAG(unittest.TestCase):

    def setUp(self):
        """Configura un entorno de pruebas aislado con SQLite en memoria."""
        self.app = Flask("test_puente_rag")
        self.app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///:memory:'
        self.app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
        db.init_app(self.app)

        with self.app.app_context():
            db.create_all()

    def tearDown(self):
        """Limpia la base de datos después de cada prueba."""
        with self.app.app_context():
            db.session.remove()
            db.drop_all()

    def test_01_modelos_y_cascada(self):
        """Valida inserción de documentos, fragmentos con embedding JSON y cascada."""
        with self.app.app_context():
            # Crear documento oficial
            doc = DocumentoFuente(
                titulo="Ley 1257 de 2008 - Sensibilización y Prevención de Violencia",
                entidad="Congreso de Colombia",
                url="https://normativa.gov.co/ley1257"
            )
            db.session.add(doc)
            db.session.flush()

            # Insertar dos fragmentos con embeddings ficticios
            emb1 = [0.12, -0.45, 0.88, 0.05]
            emb2 = [-0.31, 0.77, -0.19, 0.62]

            f1 = Fragmento(documento_id=doc.id, orden=1, texto="Artículo 1. Objeto de la ley...", embedding=emb1)
            f2 = Fragmento(documento_id=doc.id, orden=2, texto="Artículo 2. Definición de daño psicológico...", embedding=emb2)
            db.session.add_all([f1, f2])
            db.session.commit()

            # Verificar conteos
            self.assertEqual(DocumentoFuente.query.count(), 1)
            self.assertEqual(Fragmento.query.count(), 2)

            # Verificar recuperación de datos y JSON
            frag_recuperado = Fragmento.query.filter_by(orden=1).first()
            self.assertEqual(frag_recuperado.embedding, emb1)
            self.assertEqual(frag_recuperado.documento.titulo, doc.titulo)

            # Probar eliminación en cascada
            db.session.delete(doc)
            db.session.commit()

            self.assertEqual(DocumentoFuente.query.count(), 0)
            self.assertEqual(Fragmento.query.count(), 0, "La eliminación en cascada debió borrar todos los fragmentos.")

    def test_02_troceado_semantico(self):
        """Valida que la función trocear() respete tam, solape y no genere bucles."""
        parrafo = (
            "El acceso a la justicia es un derecho fundamental que garantiza el Estado social de derecho. "
            "Toda persona tiene derecho a acudir ante los jueces y tribunales competentes para obtener la "
            "protección efectiva de sus derechos e intereses legítimos. Las casas de justicia y los centros "
            "de conciliación comunitaria son pilares del ODS 16 para resolver controversias pacíficamente."
        )
        texto_largo = " ".join([parrafo] * 10)  # ~3800 caracteres

        tam = 500
        solape = 100
        fragmentos = trocear(texto_largo, tam=tam, solape=solape)

        self.assertGreater(len(fragmentos), 1)
        for i, frag in enumerate(fragmentos):
            self.assertTrue(len(frag) > 0)
            # Ningún fragmento debe exceder significativamente el tamaño asignado
            self.assertLessEqual(len(frag), tam + 100)

        # Probar texto corto
        texto_corto = "Definición corta de conciliación."
        chunks_cortos = trocear(texto_corto, tam=500, solape=100)
        self.assertEqual(len(chunks_cortos), 1)
        self.assertEqual(chunks_cortos[0], texto_corto)

    def test_03_matriz_numpy_normalizacion_y_similitud(self):
        """Valida la carga del Indice, normalización euclidiana L2 y similitud coseno."""
        with self.app.app_context():
            doc = DocumentoFuente(
                titulo="Guía de Conciliación Comunitaria",
                entidad="Ministerio de Justicia",
                url="https://minjusticia.gov.co"
            )
            db.session.add(doc)
            db.session.flush()

            # Insertar 3 fragmentos con vectores conocidos en R^4
            # v1 apunta en dirección [1, 0, 0, 0]
            # v2 apunta en dirección [0, 1, 0, 0]
            # v3 apunta en dirección [0.7071, 0.7071, 0, 0] (diagonal)
            f1 = Fragmento(documento_id=doc.id, orden=1, texto="Tema A: Acceso a mediación", embedding=[5.0, 0.0, 0.0, 0.0])
            f2 = Fragmento(documento_id=doc.id, orden=2, texto="Tema B: Derechos de la niñez", embedding=[0.0, 8.0, 0.0, 0.0])
            f3 = Fragmento(documento_id=doc.id, orden=3, texto="Tema C: Conciliación mixta", embedding=[3.0, 3.0, 0.0, 0.0])
            db.session.add_all([f1, f2, f3])
            db.session.commit()

            # Inicializar índice
            indice = Indice(app=self.app)
            self.assertEqual(len(indice), 3)

            # Verificar tipo de dato de la matriz: np.float32
            self.assertEqual(indice.matriz_normalizada.dtype, np.float32)
            self.assertEqual(indice.matriz_normalizada.shape, (3, 4))

            # Verificar que todas las filas tengan norma L2 = 1.0 (tolerancia 1e-5)
            normas_filas = np.linalg.norm(indice.matriz_normalizada, axis=1)
            for norma in normas_filas:
                self.assertAlmostEqual(norma, 1.0, places=5)

            # Simular búsqueda con consulta afín a Tema A: vector_q = [1.0, 0.0, 0.0, 0.0]
            # Probamos el cálculo matemático directo de similitud coseno
            vec_q = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)
            vec_q_norm = vec_q / np.linalg.norm(vec_q)
            similitudes = np.dot(indice.matriz_normalizada, vec_q_norm)

            # El orden de afinidad esperado debe ser: f1 (sim=1.0) > f3 (sim=~0.7071) > f2 (sim=0.0)
            indices_ord = np.argsort(similitudes)[::-1]
            self.assertEqual(indice.metadatos[indices_ord[0]]["id"], f1.id)
            self.assertAlmostEqual(similitudes[indices_ord[0]], 1.0, places=4)
            self.assertAlmostEqual(similitudes[indices_ord[1]], 0.7071, places=3)
            self.assertAlmostEqual(similitudes[indices_ord[2]], 0.0, places=4)


if __name__ == "__main__":
    print("\n==================================================================")
    print(" EJECUTANDO PRUEBAS UNITARIAS - ARQUITECTURA RAG PUENTE CIUDADANO")
    print("==================================================================\n")
    unittest.main(verbosity=2)
