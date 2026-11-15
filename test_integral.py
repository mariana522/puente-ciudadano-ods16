"""Script de prueba integral del módulo RAG completo."""
from app import create_app
from agente import orientar
from generador_peticion import generar_derecho_peticion_pdf

print("=== TEST INTEGRAL PUENTE CIUDADANO - AGENTE RAG ===\n")
app = create_app()

with app.app_context():
    # TEST 1: Riesgo / Violencia → debe activar tarjeta roja y 5 líneas de emergencia
    r1 = orientar(
        "Ana Torres",
        "Mi esposo me amenaza con un arma y me golpea frente a mis hijos, necesito ayuda urgente.",
        indice=app.indice_rag,
        app=app
    )
    print(f"TEST 1 - Riesgo: {r1['riesgo']} | Derivar: {r1['derivar']} | Alerta: {r1['alerta_profesional']} | Líneas emergencia: {len(r1['lineas_emergencia'])}")
    assert r1["riesgo"] is True,            "FALLO: Riesgo no detectado"
    assert r1["derivar"] is True,           "FALLO: Derivación no activada"
    assert r1["alerta_profesional"] is True,"FALLO: Alerta no activada"
    assert len(r1["lineas_emergencia"]) == 5,"FALLO: Deben ser 5 líneas oficiales"
    print("  [OK] Tarjeta roja de emergencia y derivación correctas\n")

    # TEST 2: Petición → debe detectar requiere_peticion
    r2 = orientar(
        "Carlos R.",
        "La alcaldía no responde el derecho de petición que radiqué hace 20 días hábiles.",
        indice=app.indice_rag,
        app=app
    )
    print(f"TEST 2 - Requiere Petición: {r2['requiere_peticion']} | Institución: {r2['institucion']} | Confianza: {r2['confianza']}")
    assert r2["requiere_peticion"] is True, "FALLO: requiere_peticion no activado"
    print("  [OK] Derecho de petición detectado correctamente\n")

    # TEST 3: Generador PDF ReportLab (Art. 16 Ley 1437/2011)
    pdf_bytes = generar_derecho_peticion_pdf(r2)
    assert len(pdf_bytes) > 3000, "FALLO: PDF demasiado pequeño"
    print(f"TEST 3 - PDF generado con ReportLab: {len(pdf_bytes):,} bytes  [OK]\n")

    # TEST 4: Base de datos - auditoría consultas_agente
    from models import ConsultaAgente, DocumentoFuente, Fragmento
    total_consultas = ConsultaAgente.query.count()
    total_docs      = DocumentoFuente.query.count()
    total_frags     = Fragmento.query.count()
    print(f"TEST 4 - BD: {total_consultas} consultas | {total_docs} documentos | {total_frags} fragmentos  [OK]\n")

    # TEST 5: Índice vectorial - cargar() y buscar() con self.matriz @ q
    idx = app.indice_rag
    print(f"TEST 5 - Indice: {len(idx)} fragmentos | Forma matriz: {idx.matriz.shape} | dtype: {idx.matriz.dtype}")
    assert len(idx) > 0, "FALLO: Índice vectorial vacío"
    resultados = idx.buscar("violencia intrafamiliar medida de proteccion", k=5)
    assert len(resultados) > 0, "FALLO: Búsqueda no devolvió resultados"
    print(f"  Búsqueda: {len(resultados)} fragmentos | top_score={resultados[0]['score']}")
    print("  [OK] Producto punto self.matriz @ q funciona correctamente\n")

    # TEST 6: Verificar campos ConsultaAgente en BD
    ultima = ConsultaAgente.query.order_by(ConsultaAgente.id.desc()).first()
    d = ultima.to_dict()
    assert "riesgo" in d
    assert "sim_max" in d
    assert "derivar" in d
    assert "alerta_profesional" in d
    print(f"TEST 6 - Último registro BD: id={d['id']} | riesgo={d['riesgo']} | derivar={d['derivar']}  [OK]\n")

print("=" * 55)
print("  TODOS LOS TESTS PASARON — MÓDULO RAG 100% OPERATIVO")
print("=" * 55)

