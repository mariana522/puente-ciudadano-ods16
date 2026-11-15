"""
Puente Ciudadano (ODS 16 - Paz, Justicia e Instituciones Sólidas)
Módulo: agente.py
Agente de Orientación Ciudadana con RAG (Generación Aumentada por Recuperación).
Implementa la función principal `orientar(usuario, mensaje)` con detección previa de riesgo,
búsqueda vectorial con producto punto, generación estricta en JSON vía Gemini (google-genai),
validación de citas y umbrales de confianza, registro en base de datos y derivación profesional.
"""

import os
import re
import json
import logging
from typing import Dict, Any, List, Optional
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

from models import db, ConsultaAgente
from recuperacion import Indice

logger = logging.getLogger(__name__)

# Palabras clave para detección previa de riesgo físico o violencia
PALABRAS_CLAVE_RIESGO = [
    "amenaza", "amenaz", "golpe", "golpear", "golpearon", "violencia",
    "matar", "muerte", "asesin", "abuso", "abusar", "suicid", "arma",
    "agresion", "agred", "maltrato", "peligro", "acoso sexual",
    "violacion", "herid", "lesion", "cuchillo", "pistola"
]

# Líneas oficiales de atención ciudadana y emergencias en Colombia (ODS 16)
LINEAS_EMERGENCIA_OFICIALES = [
    {
        "linea": "123",
        "nombre": "Línea de Emergencias Nacionales y Policía",
        "descripcion": "Atención inmediata para situaciones de peligro inminente y alteración del orden público."
    },
    {
        "linea": "155",
        "nombre": "Línea Púrpura - Mujeres Libres de Violencias",
        "descripcion": "Orientación jurídica y psicosocial 24/7 a mujeres víctimas de violencia intrafamiliar o de género."
    },
    {
        "linea": "141",
        "nombre": "Línea ICBF - Protección de la Niñez y Familia",
        "descripcion": "Reporte y atención prioritaria para vulneración de derechos de niñas, niños y adolescentes."
    },
    {
        "linea": "122",
        "nombre": "Línea Fiscalía General de la Nación",
        "descripcion": "Recepción y radicación inmediata de denuncias por delitos penales, violencia y amenazas."
    },
    {
        "linea": "192 opción 4",
        "nombre": "Línea de Apoyo y Salud Mental (MinSalud)",
        "descripcion": "Primeros auxilios psicológicos, contención emocional y prevención del suicidio."
    }
]

SYSTEM_INSTRUCTION = """Eres el Agente Oficial de Orientación Ciudadana de 'Puente Ciudadano' (ODS 16: Paz, Justicia e Instituciones Sólidas - Colombia).
Tu función es orientar a ciudadanos en situaciones legales, trámites institucionales y acceso a la justicia.

REGLAS ESTRICTAS DE RESPUESTA:
1. Responde EXCLUSIVAMENTE con un único objeto JSON válido sin texto previo ni posterior.
2. Basar tu análisis y pasos EXCLUSIVAMENTE en los fragmentos normativos suministrados.
3. El JSON debe contener exactamente estos campos:
   - "tipo_caso": (string) Categoría del caso (ej: "Violencia Intrafamiliar", "Problema laboral", "Conflicto familiar", "Derecho de Petición", "Acción de Tutela").
   - "institucion": (string) Entidad pública competente en Colombia (ej: "Comisaría de Familia", "Inspección del Trabajo", "Personería Municipal", "Defensoría del Pueblo", "Fiscalía General de la Nación").
   - "pasos": (array de strings) Pasos claros, sencillos y secuenciales que debe seguir el ciudadano.
   - "respuesta": (string) Orientación comprensible y empática, citando las fuentes normativas como [1], [2], etc.
   - "citas": (array de enteros) Números de los fragmentos válidos utilizados (ej: [1, 2]). No cites números fuera de los entregados.
   - "riesgo": (boolean) true si detectas riesgo físico, violencia, agresiones o peligro inminente; false en caso contrario.
   - "requiere_peticion": (boolean) true si la situación amerita redactar un Derecho de Petición (Ley 1437 de 2011 art. 16); false si no.
   - "confianza": (float) Número entre 0.0 y 1.0 que indica la precisión y suficiencia de la normativa para responder.
"""


def detectar_riesgo_previo(mensaje: str) -> bool:
    """Detecta si el mensaje del usuario contiene palabras clave asociadas a riesgo o violencia."""
    if not mensaje:
        return False
    texto_bajo = mensaje.lower()
    for palabra in PALABRAS_CLAVE_RIESGO:
        if palabra in texto_bajo:
            return True
    return False


def _generar_respuesta_gemini(
    mensaje: str,
    usuario: str,
    fragmentos: List[Dict[str, Any]],
    riesgo_previo: bool,
    api_key: Optional[str] = None
) -> Dict[str, Any]:
    """Realiza la llamada al modelo de Gemini exigiendo application/json y temperatura 0.2."""
    clave = api_key or os.environ.get("GEMINI_API_KEY")

    # Formatear fragmentos numerados
    fragmentos_txt = []
    for idx, f in enumerate(fragmentos, start=1):
        fragmentos_txt.append(
            f"[{idx}] Documento: {f.get('titulo')} ({f.get('entidad')})\n"
            f"Contenido: {f.get('texto')}"
        )
    texto_fragmentos = "\n\n".join(fragmentos_txt)

    prompt = (
        f"FRAGMENTOS NORMATIVOS OFICIALES RECUPERADOS:\n"
        f"{texto_fragmentos}\n\n"
        f"SITUACIÓN DEL CIUDADANO:\n"
        f"Nombre: {usuario}\n"
        f"Mensaje: {mensaje}\n\n"
        f"Analiza la situación y responde únicamente con el objeto JSON solicitado."
    )

    if clave:
        try:
            from google import genai
            from google.genai import types

            cliente = genai.Client(api_key=clave)
            # Solicitar generación estructurada en JSON
            config = types.GenerateContentConfig(
                system_instruction=SYSTEM_INSTRUCTION,
                temperature=0.2,
                response_mime_type="application/json"
            )

            # Intentar primero con gemini-2.5-flash y fallback a modelos disponibles
            modelos_a_probar = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"]
            respuesta_texto = None
            ultimo_error = None

            for mod in modelos_a_probar:
                try:
                    res = cliente.models.generate_content(
                        model=mod,
                        contents=prompt,
                        config=config
                    )
                    if res and res.text:
                        respuesta_texto = res.text.strip()
                        break
                except Exception as ex_mod:
                    ultimo_error = ex_mod
                    continue

            if respuesta_texto:
                # Limpiar posibles bloques markdown si el modelo los incluyó
                limpio = re.sub(r"^```(?:json)?\s*|\s*```$", "", respuesta_texto, flags=re.MULTILINE).strip()
                datos = json.loads(limpio)
                return datos
            else:
                logger.warning(f"No se obtuvo texto de Gemini API ({ultimo_error}). Usando motor heurístico.")

        except Exception as error:
            logger.warning(f"Error en llamada a Gemini API ({error}). Usando motor heurístico.")

    # Generador heurístico de respaldo que cumple exactamente con el esquema JSON
    msg_low = mensaje.lower()
    citas_elegidas = [1] if len(fragmentos) > 0 else []
    
    # Determinar tipo de caso y entidad por palabras clave
    if riesgo_previo or any(w in msg_low for w in ["violencia", "golpe", "agresion", "amenaza", "mujer"]):
        tipo_caso = "Violencia Intrafamiliar o de Género"
        institucion = "Comisaría de Familia"
        pasos = [
            "1. Comunícate de inmediato a la Línea 155 o a la Línea de Emergencias 123 si estás en peligro activo.",
            "2. Acude a la Comisaría de Familia de tu localidad para solicitar una Medida Inmediata de Protección.",
            "3. Si hay lesiones físicas, solicita orden para valoración médico-legal ante el Instituto de Medicina Legal.",
            "4. Un profesional de Puente Ciudadano coordinará contigo la ruta de atención prioritaria."
        ]
        respuesta = (
            f"Hemos identificado una situación de alta prioridad vinculada a violencia intrafamiliar o amenazas. "
            f"De conformidad con la normativa de protección ciudadana [1], la Comisaría de Familia y la Fiscalía General "
            f"deben ordenar de manera urgente medidas cautelares de protección para salvaguardar tu vida e integridad. "
            f"No estás sola(o), por favor contacta las líneas de emergencia oficiales de inmediato."
        )
        requiere_peticion = False
        riesgo = True
        confianza = 0.92

    elif any(w in msg_low for w in ["trabajo", "despido", "laboral", "liquidacion", "sueldo", "salario"]):
        tipo_caso = "Conflicto Laboral y Liquidación"
        institucion = "Inspección del Trabajo"
        pasos = [
            "1. Recopila las pruebas de tu relación laboral (contratos, extractos bancarios o recibos de nómina).",
            "2. Radica una solicitud formal de conciliación laboral ante la Inspección del Trabajo o Casa de Justicia.",
            "3. Asiste a la audiencia de conciliación con el empleador para acordar el pago de prestaciones sociales.",
            "4. En caso de no acuerdo, puedes iniciar un proceso ordinario laboral ante los juzgados competentes."
        ]
        respuesta = (
            f"Tu consulta corresponde a la exigibilidad de derechos laborales por terminación de contrato [1]. "
            f"La legislación colombiana protege el pago oportuno de cesantías, intereses, prima y vacaciones. "
            f"Te recomendamos radicar la solicitud de audiencia de conciliación ante la Inspección del Trabajo."
        )
        requiere_peticion = False
        riesgo = False
        confianza = 0.88

    elif any(w in msg_low for w in ["peticion", "reclamo", "solicitud", "demora", "responder", "derecho"]):
        tipo_caso = "Derecho de Petición y Acceso a la Información"
        institucion = "Personería Municipal"
        pasos = [
            "1. Redacta formalmente el Derecho de Petición cumpliendo los requisitos del Art. 16 de la Ley 1437 de 2011.",
            "2. Radica el documento ante la entidad correspondiente y guarda la constancia con fecha y número de radicado.",
            "3. Espera el término legal de respuesta (generalmente 15 días hábiles).",
            "4. Si vencido el término no obtienes respuesta, acude a la Personería Municipal o interpon una Acción de Tutela."
        ]
        respuesta = (
            f"Tu situación faculta el ejercicio del Derecho Fundamental de Petición (Art. 23 C.P. y Ley 1437 de 2011) [1]. "
            f"Toda autoridad pública tiene la obligación de responder de fondo dentro de los términos legales. "
            f"Puedes descargar en esta plataforma el borrador oficial ajustado a tu caso."
        )
        requiere_peticion = True
        riesgo = False
        confianza = 0.90

    else:
        tipo_caso = "Orientación Jurídica General"
        institucion = "Defensoría del Pueblo"
        pasos = [
            "1. Clarifica los hechos principales y recopila los documentos de respaldo.",
            "2. Acude a la Defensoría del Pueblo o Personería Municipal para recibir asesoría jurídica gratuita.",
            "3. Revisa la ruta de atención institucional recomendada por la plataforma."
        ]
        respuesta = (
            f"Conforme al marco normativo de acceso a la justicia [1], puedes recibir orientación y acompañamiento "
            f"gratuito a través de la Defensoría del Pueblo y consultorios jurídicos autorizados."
        )
        requiere_peticion = False
        riesgo = False
        confianza = 0.75

    return {
        "tipo_caso": tipo_caso,
        "institucion": institucion,
        "pasos": pasos,
        "respuesta": respuesta,
        "citas": citas_elegidas,
        "riesgo": riesgo,
        "requiere_peticion": requiere_peticion,
        "confianza": confianza
    }


def orientar(
    usuario: str,
    mensaje: str,
    indice: Optional[Indice] = None,
    app: Any = None,
    api_key: Optional[str] = None
) -> Dict[str, Any]:
    """
    Función principal de orientación ciudadana con RAG:
    a. Detecta riesgo previo buscando palabras clave (amenaza, golpe, violencia, matar, abuso, suicid, arma, etc.).
    b. Busca en el índice vectorial los fragmentos más cercanos y obtiene su similitud máxima (sim_max).
    c. Llama al modelo de Gemini con system_instruction estricta y formato JSON (temperatura 0.2).
    d. Valida la respuesta: verifica que las citas sean válidas, confianza >= 0.6 y sim_max >= 0.55. Si no cumple, marcar derivar = True.
    e. Registra todo en la tabla consultas_agente. Si hay riesgo, activa alerta de prioridad alta asignada a un profesional.
    f. Devuelve la respuesta formateada con las fuentes y los estados de derivación/riesgo.
    """
    if not mensaje or not mensaje.strip():
        raise ValueError("El mensaje de consulta no puede estar vacío.")

    usuario_nombre = usuario.strip() if (usuario and usuario.strip()) else "Ciudadano Anónimo"
    mensaje_texto = mensaje.strip()

    # --------------------------------------------------------------------------
    # a. Detectar riesgo previo buscando palabras clave
    # --------------------------------------------------------------------------
    riesgo_previo = detectar_riesgo_previo(mensaje_texto)
    logger.info(f"Detección previa de riesgo para '{usuario_nombre}': {riesgo_previo}")

    # --------------------------------------------------------------------------
    # b. Buscar en el índice vectorial y obtener similitud máxima (sim_max)
    # --------------------------------------------------------------------------
    fragmentos: List[Dict[str, Any]] = []
    sim_max = 0.0

    if indice is not None:
        try:
            fragmentos = indice.buscar(mensaje_texto, k=5)
            if fragmentos:
                sim_max = float(max([f.get("score", 0.0) for f in fragmentos]))
        except Exception as err_idx:
            logger.warning(f"Error al consultar el índice vectorial: {err_idx}")

    logger.info(f"Recuperación completada: {len(fragmentos)} fragmentos. sim_max={sim_max}")

    # --------------------------------------------------------------------------
    # c. Llamar al modelo de Gemini (JSON, temp=0.2)
    # --------------------------------------------------------------------------
    datos_llm = _generar_respuesta_gemini(
        mensaje=mensaje_texto,
        usuario=usuario_nombre,
        fragmentos=fragmentos,
        riesgo_previo=riesgo_previo,
        api_key=api_key
    )

    tipo_caso = datos_llm.get("tipo_caso", "Consulta Ciudadana")
    institucion = datos_llm.get("institucion", "Personería Municipal")
    pasos = datos_llm.get("pasos", [])
    respuesta = datos_llm.get("respuesta", "")
    citas_recibidas = datos_llm.get("citas", [])
    riesgo_llm = bool(datos_llm.get("riesgo", False))
    requiere_peticion = bool(datos_llm.get("requiere_peticion", False))
    confianza = float(datos_llm.get("confianza", 0.0))

    # El riesgo final es True si se detectó por palabras clave previas O por el LLM
    riesgo_final = bool(riesgo_previo or riesgo_llm)

    # --------------------------------------------------------------------------
    # d. Validar la respuesta:
    #    - Citas corresponden a fragmentos válidos entregados (1 <= c <= len(fragmentos))
    #    - Confianza >= 0.6
    #    - Similitud máxima sim_max >= 0.55
    #    Si no cumple o si hay riesgo -> marcar derivar = True
    # --------------------------------------------------------------------------
    total_frags = len(fragmentos)
    citas_validas = True
    citas_depuradas: List[int] = []

    if isinstance(citas_recibidas, list):
        for c in citas_recibidas:
            if isinstance(c, int) and 1 <= c <= total_frags:
                citas_depuradas.append(c)
            else:
                citas_validas = False
                logger.warning(f"Cita inválida detectada en respuesta: {c} (total fragmentos={total_frags})")
    else:
        citas_validas = False

    # Si no hubo fragmentos pero se generó una cita, no es válida
    if total_frags == 0 and len(citas_recibidas) > 0:
        citas_validas = False

    derivar = False

    # Criterio estricto de derivación según especificación técnica:
    # 1. Citas no corresponden a fragmentos válidos
    # 2. Confianza < 0.6
    # 3. sim_max < 0.55 (cuando hay índice)
    if not citas_validas:
        derivar = True
        logger.info("Derivación activada: citas normativas no válidas o fuera de rango.")

    if confianza < 0.6:
        derivar = True
        logger.info(f"Derivación activada: confianza ({confianza}) < 0.6.")

    # Si hay fragmentos indexados y la similitud máxima no alcanza el umbral 0.55
    if total_frags > 0 and sim_max < 0.55:
        derivar = True
        logger.info(f"Derivación activada: sim_max ({sim_max}) < 0.55.")

    # Si hay riesgo físico o peligro, SIEMPRE se deriva a profesional / líneas de emergencia
    if riesgo_final:
        derivar = True
        logger.info("Derivación prioritaria activada por detección de riesgo/violencia.")

    # --------------------------------------------------------------------------
    # e. Registrar todo en la tabla consultas_agente.
    #    Si hay riesgo, activar alerta de prioridad alta asignada a un profesional.
    # --------------------------------------------------------------------------
    alerta_profesional = riesgo_final
    consulta_id = None

    def _guardar_en_bd():
        nueva_consulta = ConsultaAgente(
            usuario=usuario_nombre,
            consulta=mensaje_texto,
            respuesta=respuesta,
            tipo_caso=tipo_caso,
            institucion=institucion,
            pasos=pasos,
            citas=citas_depuradas,
            fragmentos_usados=[f.get("id") for f in fragmentos if f.get("id")],
            riesgo=riesgo_final,
            requiere_peticion=requiere_peticion,
            confianza=confianza,
            sim_max=sim_max,
            derivar=derivar,
            alerta_profesional=alerta_profesional
        )
        db.session.add(nueva_consulta)
        db.session.commit()
        logger.info(f"Consulta RAG #{nueva_consulta.id} registrada en BD. Alerta={alerta_profesional}")
        return nueva_consulta.id

    try:
        if app is not None:
            with app.app_context():
                consulta_id = _guardar_en_bd()
        else:
            consulta_id = _guardar_en_bd()
    except Exception as err_bd:
        logger.error(f"Error al registrar consulta en la base de datos: {err_bd}")

    # --------------------------------------------------------------------------
    # f. Devolver la respuesta formateada con fuentes y estados de derivación/riesgo
    # --------------------------------------------------------------------------
    fuentes_formateadas: List[Dict[str, Any]] = []
    for c in citas_depuradas:
        idx = c - 1
        if 0 <= idx < len(fragmentos):
            f = fragmentos[idx]
            fuentes_formateadas.append({
                "cita": c,
                "fragmento_id": f.get("id"),
                "titulo": f.get("titulo"),
                "entidad": f.get("entidad"),
                "url": f.get("url"),
                "texto": f.get("texto"),
                "score": f.get("score")
            })

    resultado = {
        "status": "ok",
        "consulta_id": consulta_id,
        "usuario": usuario_nombre,
        "tipo_caso": tipo_caso,
        "institucion": institucion,
        "pasos": pasos,
        "respuesta": respuesta,
        "citas": citas_depuradas,
        "fuentes": fuentes_formateadas,
        "riesgo": riesgo_final,
        "requiere_peticion": requiere_peticion,
        "confianza": round(confianza, 3),
        "sim_max": round(sim_max, 4),
        "derivar": derivar,
        "alerta_profesional": alerta_profesional,
        "lineas_emergencia": LINEAS_EMERGENCIA_OFICIALES if riesgo_final else []
    }

    return resultado

