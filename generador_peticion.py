"""
Puente Ciudadano (ODS 16 - Paz, Justicia e Instituciones Sólidas)
Módulo: generador_peticion.py
Generador automático de documentos en formato PDF para Derechos de Petición,
en estricto cumplimiento del Artículo 16 de la Ley 1437 de 2011 (CPACA - Colombia).

Requisitos legales del Art. 16 Ley 1437/2011 cumplidos:
1. La designación de la autoridad a la que se dirige.
2. Los nombres y apellidos completos del solicitante, documento de identidad y dirección de notificación.
3. El objeto de la petición.
4. Las razones en las que fundamenta su petición (hechos fácticos y fundamentos normativos).
5. La relación de los documentos que desee presentar para iniciar el trámite (anexos).
6. El espacio para la firma del peticionario.
"""

import io
import os
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    HRFlowable,
    KeepTogether
)
from reportlab.pdfgen import canvas


class NumberedCanvas(canvas.Canvas):
    """Lienzo personalizado para incluir numeración de páginas y pie institucional."""
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._saved_page_states = []

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_decorations(num_pages)
            super().showPage()
        super().save()

    def draw_page_decorations(self, total_pages):
        self.saveState()
        self.setFont("Helvetica", 8)
        self.setFillColor(colors.HexColor("#64748b"))

        # Línea superior e inferior tenue
        self.setStrokeColor(colors.HexColor("#cbd5e1"))
        self.setLineWidth(0.5)
        self.line(54, 45, 612 - 54, 45)

        # Texto del pie de página
        pie_izq = "Plataforma Puente Ciudadano - ODS 16 (Paz, Justicia e Instituciones Sólidas)"
        pie_der = f"Página {self._pageNumber} de {total_pages}"
        ley_cita = "Documento estructurado en cumplimiento estricto del Art. 16 de la Ley 1437 de 2011 (CPACA)"

        self.drawString(54, 32, pie_izq)
        self.drawRightString(612 - 54, 32, pie_der)
        self.drawString(54, 22, ley_cita)
        self.restoreState()


def extraer_datos_desde_consulta(consulta_dict: Dict[str, Any], datos_usuario: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Extrae y estandariza los campos requeridos por el Art. 16 de la Ley 1437/2011
    a partir de la interacción previa con el agente RAG.
    """
    datos_usr = datos_usuario or {}
    
    # 1. Autoridad competente
    autoridad = (
        datos_usr.get("autoridad") or
        consulta_dict.get("institucion") or
        "PERSONERÍA MUNICIPAL / ENTIDAD PÚBLICA COMPETENTE"
    )

    # 2. Datos del solicitante
    nombre_solicitante = (
        datos_usr.get("nombre") or
        consulta_dict.get("usuario") or
        "Mariana Sibaja Diaz"
    )
    documento = datos_usr.get("documento") or "C.C. 1.067.890.123 de Montería"
    ciudad = datos_usr.get("ciudad") or "Montería, Córdoba"
    direccion = datos_usr.get("direccion") or "Calle 28 No. 4-50, Barrio Centro"
    telefono = datos_usr.get("telefono") or "+57 310 456 7890"
    correo = datos_usr.get("correo") or "mariana.sibaja@ejemplo.com"

    # 3. Objeto de la petición
    tipo_caso = consulta_dict.get("tipo_caso") or "Trámite de Garantía Ciudadana"
    objeto_base = datos_usr.get("objeto")
    if not objeto_base:
        objeto_base = (
            f"Solicitar de manera respetuosa y con carácter prioritario la intervención, aclaración y resolución "
            f"formal de fondo respecto a mi situación de {tipo_caso.lower()}, garantizando mis derechos fundamentales "
            f"al debido proceso, a la respuesta oportuna y al acceso a la justicia."
        )

    # 4. Razones fundamentadas (hechos y derecho)
    consulta_usuario = consulta_dict.get("consulta") or "Situación ciudadana expuesta ante el orientador."
    respuesta_agente = consulta_dict.get("respuesta") or ""
    pasos_agente = consulta_dict.get("pasos") or []
    fuentes = consulta_dict.get("fuentes") or []

    # Redacción de hechos y fundamentos
    hechos_redactados = [
        f"Primero: En fecha reciente he venido afrontando la siguiente situación fáctica: \"{consulta_usuario}\".",
        "Segundo: Ante los hechos expuestos no he recibido una solución oportuna, generándose afectación a mis derechos ciudadanos e incertidumbre jurídica.",
        "Tercero: Acudo a esta instancia mediante la orientación legal ciudadana orientada por la red institucional del ODS 16."
    ]

    fundamentos_redactados = [
        "1. Artículo 23 de la Constitución Política de Colombia, que consagra el Derecho Fundamental de Petición ante autoridades y particulares.",
        "2. Artículos 13 y siguientes de la Ley 1437 de 2011 (Código de Procedimiento Administrativo y de lo Contencioso Administrativo), sustituidos por la Ley 1755 de 2015, los cuales establecen los términos de 15 días hábiles para resolver peticiones de interés particular.",
        "3. Principio constitucional de eficacia, celeridad y debido proceso administrativo consagrado en el Artículo 209 de la Carta Política."
    ]

    if fuentes:
        for idx, f in enumerate(fuentes, start=4):
            tit = f.get("titulo", "Norma oficial")
            ent = f.get("entidad", "Autoridad pública")
            fundamentos_redactados.append(f"{idx}. {tit} emitida por {ent}, citada por el agente como marco de protección.")

    # 5. Anexos
    anexos = datos_usr.get("anexos") or [
        "1. Copia del Documento de Identidad del solicitante.",
        "2. Evidencias documentales y soportes fácticos de los hechos narrados.",
        "3. Hoja de orientación legal generada en la plataforma Puente Ciudadano."
    ]

    return {
        "autoridad": autoridad,
        "solicitante": {
            "nombre": nombre_solicitante,
            "documento": documento,
            "ciudad": ciudad,
            "direccion": direccion,
            "telefono": telefono,
            "correo": correo
        },
        "objeto": objeto_base,
        "hechos": hechos_redactados,
        "fundamentos": fundamentos_redactados,
        "anexos": anexos,
        "tipo_caso": tipo_caso,
        "fecha": datetime.now(timezone.utc).strftime("%d de %B de %Y")
    }


def generar_derecho_peticion_pdf(
    datos_completos: Dict[str, Any],
    output_path: Optional[str] = None
) -> bytes:
    """
    Genera el archivo PDF del Derecho de Petición con ReportLab, cumpliendo
    con cada uno de los literales del Art. 16 de la Ley 1437 de 2011.
    
    Args:
        datos_completos: Diccionario con la estructura de la petición o respuesta del agente.
        output_path: Ruta de archivo opcional para guardar en disco.
        
    Returns:
        bytes: Flujo binario del PDF generado listo para descarga o envío por red.
    """
    # Si viene con formato crudo del agente, normalizar campos
    if "solicitante" not in datos_completos:
        datos = extraer_datos_desde_consulta(datos_completos)
    else:
        datos = datos_completos

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        leftMargin=54,   # 0.75 pulgadas
        rightMargin=54,
        topMargin=54,
        bottomMargin=64
    )

    # Estilos tipográficos
    estilos = getSampleStyleSheet()

    color_primario = colors.HexColor("#00689D")   # Azul ODS 16
    color_oscuro = colors.HexColor("#0f172a")     # Slate 900
    color_gris = colors.HexColor("#475569")       # Slate 600
    color_fondo_caja = colors.HexColor("#f1f5f9") # Slate 100

    estilo_titulo = ParagraphStyle(
        'TituloPeticion',
        parent=estilos['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=15,
        leading=19,
        textColor=color_primario,
        alignment=1,  # Centrado
        spaceAfter=4
    )

    estilo_subtitulo = ParagraphStyle(
        'SubtituloPeticion',
        parent=estilos['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=14,
        textColor=color_gris,
        alignment=1,
        spaceAfter=15
    )

    estilo_autoridad = ParagraphStyle(
        'AutoridadPeticion',
        parent=estilos['Normal'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=color_oscuro,
        spaceAfter=10
    )

    estilo_seccion = ParagraphStyle(
        'SeccionPeticion',
        parent=estilos['Heading2'],
        fontName='Helvetica-Bold',
        fontSize=11,
        leading=15,
        textColor=color_primario,
        spaceBefore=12,
        spaceAfter=6
    )

    estilo_cuerpo = ParagraphStyle(
        'CuerpoPeticion',
        parent=estilos['BodyText'],
        fontName='Helvetica',
        fontSize=10,
        leading=14.5,
        textColor=color_oscuro,
        alignment=4,  # Justificado
        spaceAfter=8
    )

    estilo_lista = ParagraphStyle(
        'ListaPeticion',
        parent=estilos['Normal'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=13.5,
        textColor=color_oscuro,
        leftIndent=15,
        spaceAfter=4
    )

    story: List[Any] = []

    # 1. ENCABEZADO FORMAL Y ARTÍCULO 16 LEY 1437/2011
    story.append(Paragraph("DERECHO DE PETICIÓN", estilo_titulo))
    story.append(Paragraph(
        "EN INTERÉS PARTICULAR — ARTÍCULO 23 DE LA CONSTITUCIÓN POLÍTICA Y ARTÍCULO 16 DE LA LEY 1437 DE 2011",
        estilo_subtitulo
    ))
    story.append(HRFlowable(width="100%", thickness=1.5, color=color_primario, spaceAfter=14))

    # Fecha y lugar
    solic = datos.get("solicitante", {})
    fecha_txt = f"{solic.get('ciudad', 'Colombia')}, {datetime.now().strftime('%d de %m de %Y')}"
    story.append(Paragraph(f"<b>Fecha:</b> {fecha_txt}", estilo_cuerpo))
    story.append(Spacer(1, 6))

    # 2. AUTORIDAD A LA QUE SE DIRIGE (Requisito 1, Art. 16)
    story.append(Paragraph(
        f"<b>SEÑORES:</b><br/>"
        f"<b>{datos.get('autoridad', 'AUTORIDAD PÚBLICA COMPETENTE').upper()}</b><br/>"
        f"E. S. D.",
        estilo_autoridad
    ))
    story.append(Spacer(1, 8))

    # 3. IDENTIFICACIÓN COMPLETA DEL SOLICITANTE (Requisito 2, Art. 16)
    intro_solicitante = (
        f"Yo, <b>{solic.get('nombre', 'CIUDADANO PETICIONARIO')}</b>, mayor de edad, identificado(a) con "
        f"<b>{solic.get('documento', 'Cédula de Ciudadanía')}</b>, domiciliado(a) en la ciudad de "
        f"<b>{solic.get('ciudad', 'Colombia')}</b>, en ejercicio del <b>Derecho Fundamental de Petición</b> consagrado en "
        f"el artículo 23 de la Constitución Política y conforme a las disposiciones del artículo 16 de la "
        f"Ley 1437 de 2011 (Código de Procedimiento Administrativo y de lo Contencioso Administrativo), sustituido por la "
        f"Ley 1755 de 2015, me dirijo respetuosamente ante su despacho para formular la presente petición:"
    )
    story.append(Paragraph(intro_solicitante, estilo_cuerpo))
    story.append(Spacer(1, 6))

    # 4. OBJETO DE LA PETICIÓN (Requisito 3, Art. 16)
    story.append(Paragraph("I. OBJETO DE LA PETICIÓN", estilo_seccion))
    story.append(Paragraph(datos.get("objeto", ""), estilo_cuerpo))
    story.append(Spacer(1, 6))

    # 5. RAZONES EN QUE SE FUNDAMENTA (HECHOS Y DERECHO) (Requisito 4, Art. 16)
    story.append(Paragraph("II. RAZONES EN QUE SE FUNDAMENTA LA PETICIÓN", estilo_seccion))
    
    story.append(Paragraph("<b>A. Fundamentos Fácticos (Hechos):</b>", estilo_cuerpo))
    hechos = datos.get("hechos", [])
    for h in hechos:
        story.append(Paragraph(f"• {h}", estilo_lista))
    story.append(Spacer(1, 6))

    story.append(Paragraph("<b>B. Fundamentos Jurídicos y Normativos:</b>", estilo_cuerpo))
    fundamentos = datos.get("fundamentos", [])
    for f in fundamentos:
        story.append(Paragraph(f"• {f}", estilo_lista))
    story.append(Spacer(1, 8))

    # 6. RELACIÓN DE DOCUMENTOS Y ANEXOS (Requisito 5, Art. 16)
    story.append(Paragraph("III. RELACIÓN DE DOCUMENTOS Y ANEXOS", estilo_seccion))
    anexos = datos.get("anexos", [])
    for anexo in anexos:
        story.append(Paragraph(f"[ ] {anexo}", estilo_lista))
    story.append(Spacer(1, 8))

    # 7. NOTIFICACIONES (Requisito 2 in fine, Art. 16)
    story.append(Paragraph("IV. LUGAR Y CANAL DE NOTIFICACIONES", estilo_seccion))
    notif_texto = (
        f"Para los efectos de ley, recibiré correspondencia y notificaciones oficiales en:<br/>"
        f"• <b>Dirección física:</b> {solic.get('direccion', 'Dirección reportada')}<br/>"
        f"• <b>Teléfono / Móvil:</b> {solic.get('telefono', 'Línea de contacto')}<br/>"
        f"• <b>Correo electrónico:</b> {solic.get('correo', 'correo@ejemplo.com')}"
    )
    story.append(Paragraph(notif_texto, estilo_cuerpo))
    story.append(Spacer(1, 14))

    # 8. ESPACIO PARA FIRMA DEL PETICIONARIO (Requisito 6, Art. 16)
    firma_bloque = []
    firma_bloque.append(Paragraph("Atentamente,", estilo_cuerpo))
    firma_bloque.append(Spacer(1, 35))
    firma_bloque.append(HRFlowable(width="55%", hAlign='LEFT', thickness=1, color=color_oscuro, spaceAfter=6))
    firma_bloque.append(Paragraph(f"<b>FIRMA DEL PETICIONARIO</b>", estilo_cuerpo))
    firma_bloque.append(Paragraph(f"<b>Nombre:</b> {solic.get('nombre', 'Peticionario')}", estilo_cuerpo))
    firma_bloque.append(Paragraph(f"<b>C.C. / Documento:</b> {solic.get('documento', 'Documento de identidad')}", estilo_cuerpo))
    firma_bloque.append(Paragraph(f"<b>Teléfono:</b> {solic.get('telefono', 'Teléfono')}", estilo_cuerpo))

    story.append(KeepTogether(firma_bloque))

    # Construir documento PDF con lienzo numerado
    doc.build(story, canvasmaker=NumberedCanvas)

    pdf_bytes = buffer.getvalue()
    buffer.close()

    if output_path:
        with open(output_path, "wb") as f_out:
            f_out.write(pdf_bytes)

    return pdf_bytes

