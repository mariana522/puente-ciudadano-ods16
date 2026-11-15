"""
Puente Ciudadano (ODS 16 - Paz, Justicia e Instituciones Sólidas)
Script: sembrar_normativa.py
Genera PDFs con la normativa oficial colombiana del ODS 16 y los ingesta
en la base de datos relacional (documentos_fuente y fragmentos con embeddings).
"""

import os
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, HRFlowable

from app import create_app
from ingesta import ingestar

CARPETA_NORMATIVAS = os.path.join(os.path.abspath(os.path.dirname(__file__)), "normativas")
os.makedirs(CARPETA_NORMATIVAS, exist_ok=True)


def crear_pdf_norma(ruta_pdf: str, titulo: str, entidad: str, texto_normativo: str):
    """Crea un documento PDF formateado con el texto oficial de la norma."""
    doc = SimpleDocTemplate(
        ruta_pdf,
        pagesize=letter,
        leftMargin=54,
        rightMargin=54,
        topMargin=54,
        bottomMargin=54
    )
    estilos = getSampleStyleSheet()

    estilo_titulo = ParagraphStyle(
        'TituloNorma',
        parent=estilos['Heading1'],
        fontName='Helvetica-Bold',
        fontSize=13,
        leading=16,
        textColor=colors.HexColor("#00689D"),
        spaceAfter=4
    )
    estilo_entidad = ParagraphStyle(
        'EntidadNorma',
        parent=estilos['Normal'],
        fontName='Helvetica-Bold',
        fontSize=10,
        leading=13,
        textColor=colors.HexColor("#475569"),
        spaceAfter=12
    )
    estilo_parrafo = ParagraphStyle(
        'ParrafoNorma',
        parent=estilos['BodyText'],
        fontName='Helvetica',
        fontSize=9.5,
        leading=14,
        textColor=colors.HexColor("#1e293b"),
        spaceAfter=8
    )

    story = [
        Paragraph(titulo, estilo_titulo),
        Paragraph(f"Entidad Emisora: {entidad}", estilo_entidad),
        HRFlowable(width="100%", thickness=1, color=colors.HexColor("#00689D"), spaceAfter=12)
    ]

    for p in texto_normativo.strip().split("\n\n"):
        p_limpio = p.strip().replace("\n", " ")
        if p_limpio:
            story.append(Paragraph(p_limpio, estilo_parrafo))

    doc.build(story)
    print(f"  [PDF Creado] {ruta_pdf}")


DOCUMENTOS_ODS16 = [
    {
        "archivo": "Ley_1257_2008_No_Violencia_Mujeres.pdf",
        "titulo": "Ley 1257 de 2008 - Normas de Sensibilización, Prevención y Sanción de Violencias contra las Mujeres",
        "entidad": "Congreso de la República y Ministerio de Justicia",
        "url": "https://www.secretariasenado.gov.co/senado/basedoc/ley_1257_2008.html",
        "texto": (
            "Artículo 1. Objeto de la ley. La presente ley tiene por objeto la adopción de normas que permitan "
            "garantizar para todas las mujeres una vida libre de violencia, tanto en el ámbito público como en el privado, "
            "el ejercicio de los derechos reconocidos en el ordenamiento jurídico interno e internacional, el acceso a los "
            "procedimientos administrativos y judiciales para su debida protección y atención, y la adopción de las políticas "
            "públicas necesarias para su realización.\n\n"
            "Artículo 2. Definición de violencia contra las mujeres. Por violencia contra las mujeres se entiende cualquier "
            "acción u omisión, que le cause muerte, daño o sufrimiento físico, sexual, psicológico, económico o patrimonial por "
            "su condición de mujer, así como las amenazas de tales actos, la coacción o la privación arbitraria de la libertad, "
            "bien sea que se produzca en la vida pública o en la vida privada.\n\n"
            "Artículo 16. Medidas de Protección Inmediatas. La Comisaría de Familia o el Juez Civil Municipal o Promiscuo "
            "deberán dictar medidas de protección definitivas o provisionales en favor de la víctima de violencia intrafamiliar. "
            "Entre las medidas inmediatas se contemplan: ordenar al agresor el desalojo inmediato de la casa de habitación que "
            "comparte con la víctima; prohibir al agresor acercarse o comunicarse con la víctima, su lugar de trabajo o residencia; "
            "ordenar el acompañamiento de la Policía Nacional para el reingreso de la víctima a su hogar o retiro de bienes personales.\n\n"
            "Artículo 18. Canales de emergencia y asistencia integral. Toda mujer en riesgo inminente de violencia física, psicológica "
            "o de amenazas tiene derecho a atención telefónica 24 horas a través de la Línea Púrpura Nacional 155 y la Línea de Emergencias 123. "
            "Asimismo, la Fiscalía General de la Nación debe recibir la denuncia penal sin dilación mediante la línea 122 o en las Unidades "
            "de Reacción Inmediata (URI)."
        )
    },
    {
        "archivo": "Ley_1437_2011_Derecho_Peticion.pdf",
        "titulo": "Ley 1437 de 2011 y Ley 1755 de 2015 - Código de Procedimiento Administrativo y Derecho de Petición",
        "entidad": "Congreso de la República y Procuraduría General de la Nación",
        "url": "https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=41249",
        "texto": (
            "Artículo 13. Objeto y modalidades del derecho de petición. Toda persona tiene derecho de presentar peticiones "
            "respetuosas a las autoridades, en los términos señalados en este código, por motivos de interés general o particular, "
            "y a obtener pronta resolución completa y de fondo sobre la misma.\n\n"
            "Artículo 14. Términos para resolver las distintas modalidades de peticiones. Salvo norma legal especial, toda petición "
            "deberá resolverse dentro de los quince (15) días hábiles siguientes a su recepción. Las peticiones de documentos y de "
            "información deberán resolverse dentro de los diez (10) días hábiles siguientes. Las peticiones mediante las cuales se "
            "eleva una consulta a las autoridades en relación con las materias a su cargo deberán resolverse dentro de los treinta (30) días hábiles.\n\n"
            "Artículo 16. Contenido formal de las peticiones. Toda petición escrita deberá contener por lo menos: "
            "1. La designación de la autoridad a la que se dirige. "
            "2. Los nombres y apellidos completos del solicitante y de su representante si fuere el caso, con indicación de su documento de identidad y de la dirección donde recibirá notificaciones. "
            "3. El objeto claro de la petición. "
            "4. Las razones fundamentadas en que se apoya la petición (hechos y fundamentos jurídicos). "
            "5. La relación de los documentos que desee presentar para iniciar el trámite (anexos). "
            "6. La firma del peticionario cuando fuere el caso.\n\n"
            "Artículo 20. Consecuencias por mora e intervención de Personería. La falta de respuesta en los términos legales constituirá "
            "falta disciplinaria gravísima para el servidor público responsable. El ciudadano podrá acudir ante la Personería Municipal o "
            "la Defensoría del Pueblo para exigir la mediación preventiva o interponer una Acción de Tutela por vulneración del artículo 23 constitucional."
        )
    },
    {
        "archivo": "Guia_Laboral_Conciliacion_CST.pdf",
        "titulo": "Código Sustantivo del Trabajo y Ley 640 de 2001 - Conciliación Laboral y Liquidación de Prestaciones",
        "entidad": "Ministerio del Trabajo de Colombia",
        "url": "https://www.mintrabajo.gov.co/normatividad",
        "texto": (
            "Artículo 64. Terminación unilateral del contrato de trabajo sin justa causa. En todo contrato de trabajo va envuelta "
            "la condición resolutoria por incumplimiento de lo pactado. En caso de terminación unilateral del contrato de trabajo sin "
            "justa causa comprobada, por parte del empleador, este deberá pagar al trabajador una indemnización que compense el daño causado, "
            "además del pago íntegro de la liquidación de prestaciones sociales.\n\n"
            "Artículo 249. Cesantías y prestaciones sociales de ley. El empleador está obligado a pagar a sus trabajadores, al terminar el contrato, "
            "el auxilio de cesantías equivalente a un mes de salario por cada año de servicios y proporcionalmente por fracción de año, así como "
            "los intereses a las cesantías (12% anual), prima legal de servicios y compensación de vacaciones causadas no disfrutadas.\n\n"
            "Artículo 28. Conciliación extrajudicial ante la Inspección del Trabajo. Cuando surja controversia sobre la liquidación final o el despido "
            "injustificado, el trabajador tiene derecho a solicitar una audiencia de conciliación extrajudicial gratuita ante los inspectores del trabajo "
            "del Ministerio del Trabajo o en los Centros de Conciliación y Casas de Justicia habilitados. El acuerdo conciliatorio hace tránsito a "
            "cosa juzgada y presta mérito ejecutivo, garantizando el recaudo efectivo de los derechos laborales ciertos e indiscutibles."
        )
    },
    {
        "archivo": "Codigo_Infancia_Adolescencia_Ley_1098.pdf",
        "titulo": "Ley 1098 de 2006 - Código de la Infancia y la Adolescencia (Custodia, Alimentos y Medidas de Restablecimiento)",
        "entidad": "Instituto Colombiano de Bienestar Familiar (ICBF)",
        "url": "https://www.icbf.gov.co/normatividad",
        "texto": (
            "Artículo 24. Derecho a los alimentos. Los niños, las niñas y los adolescentes tienen derecho a los alimentos y demás medios para su "
            "desarrollo físico, psicológico, espiritual, moral, cultural y social, de acuerdo con la capacidad económica del alimentante. "
            "Se entiende por alimentos todo lo que es indispensable para el sustento, habitación, vestido, asistencia médica, recreación, "
            "educación e instrucción.\n\n"
            "Artículo 111. Fijación provisional de cuota alimentaria y custodia. La Comisaría de Familia o el Defensor de Familia del ICBF fijará "
            "cuota provisional de alimentos y régimen de visitas cuando las partes no logren un acuerdo voluntario en la audiencia de conciliación. "
            "La inasistencia injustificada dará lugar a que se fije la cuota con base en el salario mínimo legal vigente.\n\n"
            "Artículo 52. Medidas de restablecimiento de derechos y línea de urgencia 141. En situaciones donde se evidencie amenaza, vulneración "
            "o violencia grave contra menores de edad, las autoridades de policía, comisarías e ICBF dictarán medidas urgentes de ubicación en medio "
            "familiar o institucional. La ciudadanía dispone de la Línea Gratuita Nacional 141 del ICBF para atención y denuncia prioritaria 24 horas al día."
        )
    }
]


def sembrar_base_datos():
    print("\n" + "="*75)
    print("  PUENTE CIUDADANO (ODS 16) - SIEMBRA DE NORMATIVAS OFICIALES")
    print("="*75)

    app = create_app()

    with app.app_context():
        # Generar PDFs e Ingestar cada documento
        for item in DOCUMENTOS_ODS16:
            ruta_pdf = os.path.join(CARPETA_NORMATIVAS, item["archivo"])
            print(f"\nProcesando: {item['titulo']}...")
            crear_pdf_norma(
                ruta_pdf=ruta_pdf,
                titulo=item["titulo"],
                entidad=item["entidad"],
                texto_normativo=item["texto"]
            )

            # Ingestar documento normativo con bloques de 900 y 150 solape
            doc, frags = ingestar(
                pdf_path=ruta_pdf,
                titulo=item["titulo"],
                entidad=item["entidad"],
                url=item["url"],
                app=app,
                tam=900,
                solape=150
            )
            print(f"  [OK] Documento #{doc.id} guardado con {len(frags)} fragmentos indexados.")

        # Recargar índice en memoria de la app
        app.indice_rag.recargar(app=app)
        total_frags = len(app.indice_rag)
        print(f"\n[ÉXITO TOTAL] Matriz vectorial lista con {total_frags} fragmentos normalizados (NumPy float32).")
        print("="*75 + "\n")


if __name__ == "__main__":
    sembrar_base_datos()

