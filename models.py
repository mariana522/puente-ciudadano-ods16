"""
Puente Ciudadano (ODS 16 - Paz, Justicia e Instituciones Sólidas)
Módulo: models.py
Definición de Modelos de Base de Datos con Flask-SQLAlchemy para la
arquitectura RAG (Generación Aumentada por Recuperación) sobre normativa oficial.
"""

from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy

# Instancia global de SQLAlchemy
db = SQLAlchemy()


class DocumentoFuente(db.Model):
    """
    Tabla: documentos_fuente
    Almacena los metadatos de las leyes, decretos, resoluciones, guías y
    normativas oficiales vinculadas al ODS 16 (acceso a la justicia,
    mecanismos de resolución de conflictos, derechos ciudadanos).
    """
    __tablename__ = 'documentos_fuente'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    titulo = db.Column(db.String(255), nullable=False, doc="Título oficial del documento o norma")
    entidad = db.Column(db.String(150), nullable=False, doc="Entidad emisora (ej. Defensoría del Pueblo, MinJusticia)")
    url = db.Column(db.String(500), nullable=True, doc="Enlace web oficial para verificación y trazabilidad")
    fecha_consulta = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        doc="Fecha y hora de registro/consulta de la fuente"
    )

    # Relación uno-a-muchos con Fragmento.
    # cascade='all, delete-orphan' garantiza que si se elimina un documento fuente,
    # todos sus fragmentos y vectores asociados se eliminan automáticamente (integridad referencial).
    fragmentos = db.relationship(
        'Fragmento',
        backref='documento',
        lazy='select',
        cascade='all, delete-orphan',
        order_by='Fragmento.orden'
    )

    def to_dict(self, incluir_conteo=True):
        """Serializa el modelo a un diccionario Python estándar."""
        datos = {
            'id': self.id,
            'titulo': self.titulo,
            'entidad': self.entidad,
            'url': self.url,
            'fecha_consulta': self.fecha_consulta.isoformat() if self.fecha_consulta else None
        }
        if incluir_conteo:
            datos['total_fragmentos'] = len(self.fragmentos) if self.fragmentos else 0
        return datos

    def __repr__(self):
        return f"<DocumentoFuente id={self.id} titulo='{self.titulo[:30]}...' entidad='{self.entidad}'>"


class Fragmento(db.Model):
    """
    Tabla: fragmentos
    Almacena los bloques de texto (chunks) limpios extraídos de los documentos oficiales,
    junto con sus representaciones vectoriales densas (embeddings) calculadas con Gemini.
    """
    __tablename__ = 'fragmentos'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    documento_id = db.Column(
        db.Integer,
        db.ForeignKey('documentos_fuente.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
        doc="Clave foránea hacia documentos_fuente con eliminación en cascada"
    )
    orden = db.Column(db.Integer, nullable=False, doc="Posición secuencial del fragmento en el documento original")
    texto = db.Column(db.Text, nullable=False, doc="Contenido textual limpio del fragmento para contextualizar el LLM")
    
    # El embedding se almacena nativamente como JSON (array de flotantes de longitud fija, ej: 768 dimensiones).
    # En SQLite y MySQL/PostgreSQL, db.JSON garantiza serialización y deserialización transparente.
    embedding = db.Column(db.JSON, nullable=False, doc="Vector de embedding generado por Gemini (text-embedding-004)")

    def to_dict(self, incluir_embedding=False):
        """Serializa el fragmento para consumo en API o depuración."""
        datos = {
            'id': self.id,
            'documento_id': self.documento_id,
            'orden': self.orden,
            'texto': self.texto,
            'documento_titulo': self.documento.titulo if self.documento else None,
            'documento_entidad': self.documento.entidad if self.documento else None,
            'documento_url': self.documento.url if self.documento else None
        }
        if incluir_embedding:
            datos['embedding'] = self.embedding
        return datos

    def __repr__(self):
        return f"<Fragmento id={self.id} doc_id={self.documento_id} orden={self.orden} len={len(self.texto)}>"


class ConsultaAgente(db.Model):
    """
    Tabla: consultas_agente
    Estructura para auditoría, trazabilidad y evaluación de las consultas ciudadanas:
    almacena la pregunta del usuario, la respuesta generada por el agente, los
    IDs de los fragmentos normativos recuperados que sirvieron como evidencia,
    el análisis de riesgo, métricas de confianza y derivación profesional.
    """
    __tablename__ = 'consultas_agente'

    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    usuario = db.Column(db.String(150), default="Ciudadano Anónimo", doc="Nombre o identificador del consultante")
    consulta = db.Column(db.Text, nullable=False, doc="Pregunta o situación formulada por el ciudadano")
    respuesta = db.Column(db.Text, nullable=True, doc="Respuesta emitida por el LLM sustentada en las fuentes")
    tipo_caso = db.Column(db.String(150), nullable=True, doc="Tipo de caso identificado")
    institucion = db.Column(db.String(150), nullable=True, doc="Entidad competente recomendada")
    pasos = db.Column(db.JSON, nullable=True, doc="Lista de pasos procesales sugeridos")
    citas = db.Column(db.JSON, nullable=True, doc="Lista de citas a fragmentos normativos ([1], [2], etc.)")
    fragmentos_usados = db.Column(
        db.JSON,
        nullable=True,
        doc="Lista de IDs o metadatos de los fragmentos recuperados por el índice"
    )
    riesgo = db.Column(db.Boolean, default=False, doc="Indicador de riesgo o peligro físico detectado")
    requiere_peticion = db.Column(db.Boolean, default=False, doc="Indica si amerita redactar Derecho de Petición")
    confianza = db.Column(db.Float, default=0.0, doc="Nivel de confianza de la respuesta (0.0 a 1.0)")
    sim_max = db.Column(db.Float, default=0.0, doc="Máxima similitud coseno de los fragmentos recuperados")
    derivar = db.Column(db.Boolean, default=False, doc="Indica si debe derivarse obligatoriamente a orientador humano")
    alerta_profesional = db.Column(db.Boolean, default=False, doc="Alerta de alta prioridad para profesionales")
    fecha_consulta = db.Column(
        db.DateTime,
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        doc="Estampa de tiempo de la interacción"
    )

    def to_dict(self):
        return {
            'id': self.id,
            'usuario': self.usuario,
            'consulta': self.consulta,
            'respuesta': self.respuesta,
            'tipo_caso': self.tipo_caso,
            'institucion': self.institucion,
            'pasos': self.pasos if self.pasos is not None else [],
            'citas': self.citas if self.citas is not None else [],
            'fragmentos_usados': self.fragmentos_usados if self.fragmentos_usados is not None else [],
            'riesgo': bool(self.riesgo),
            'requiere_peticion': bool(self.requiere_peticion),
            'confianza': round(float(self.confianza or 0.0), 3),
            'sim_max': round(float(self.sim_max or 0.0), 4),
            'derivar': bool(self.derivar),
            'alerta_profesional': bool(self.alerta_profesional),
            'fecha_consulta': self.fecha_consulta.isoformat() if self.fecha_consulta else None
        }

    def __repr__(self):
        return f"<ConsultaAgente id={self.id} usuario='{self.usuario}' riesgo={self.riesgo} derivar={self.derivar}>"
