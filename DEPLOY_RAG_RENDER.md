# Despliegue del Agente RAG en Render

El error **«No fue posible conectar con el agente»** se producía porque en Render
sólo estaba desplegado el servidor **Node** (`server.js`), que sirve la interfaz y
el chat. Las peticiones a `/api/rag/*` no tenían ruta y terminaban devolviendo
`index.html` (HTML en vez de JSON). El servidor **Flask** (`app.py`), que contiene
el agente RAG, nunca se desplegó.

La solución tiene dos partes:

1. Desplegar `app.py` como **segundo servicio web** en Render.
2. Decirle al servicio Node dónde está ese Flask con la variable
   `RAG_SERVICE_URL`. El servidor Node reenvía `/api/rag/*` hacia esa URL
   (proxy reverso), así el navegador sólo usa rutas relativas.

---

## Opción A — Crear el servicio Flask a mano (la más rápida)

1. En Render: **New + → Web Service** y selecciona el mismo repositorio.
2. Configura:

   | Campo | Valor |
   | --- | --- |
   | **Name** | `puente-rag-ods16` |
   | **Language / Runtime** | `Python 3` |
   | **Root Directory** | *(vacío, raíz del repo)* |
   | **Build Command** | `pip install -r requirements.txt && python sembrar_normativa.py` |
   | **Start Command** | `gunicorn --bind 0.0.0.0:$PORT --timeout 180 --workers 1 --threads 4 app:app` |
   | **Health Check Path** | `/api/rag/estado` |
   | **Instance Type** | Free |

3. En **Environment Variables** agrega `GEMINI_API_KEY` con tu clave de
   [Google AI Studio](https://aistudio.google.com/apikey) (opcional: sin clave el
   agente responde con el motor heurístico de respaldo) y `FLASK_DEBUG=0`.
4. **Create Web Service** y espera a que el estado sea *Live*.
5. Abre `https://puente-rag-ods16.onrender.com/api/rag/estado`: debe responder JSON.

6. Vuelve al servicio **Node** (`puente-ciudadano-ods16`) → **Environment** y agrega:

   ```
   RAG_SERVICE_URL = https://puente-rag-ods16.onrender.com
   ```

7. **Manual Deploy → Deploy latest commit** (o `git push` a `main`).

## Opción B — Blueprint (`render.yaml`)

El repositorio incluye `render.yaml` con ambos servicios y la variable
`RAG_SERVICE_URL` enlazada automáticamente. En Render: **New + → Blueprint**,
selecciona el repositorio y confirma. Después define `GEMINI_API_KEY` en el
servicio `puente-rag-ods16`.

> Si los servicios ya existían creados a mano, el Blueprint puede crear
> duplicados. En ese caso usa la Opción A.

---

## Verificación

```bash
# 1) El proxy del Node habla con Flask (debe ser JSON, no HTML)
curl https://puente-ciudadano-ods16.onrender.com/api/rag/estado

# 2) Consulta real al agente
curl -X POST https://puente-ciudadano-ods16.onrender.com/api/rag/orientar \
  -H "Content-Type: application/json" \
  -d '{"usuario":"Prueba","mensaje":"Me despidieron sin liquidación"}'
```

En el panel de orientación de la web la consulta debe responder sin el mensaje
«No fue posible conectar con el agente».

Si `/api/rag/estado` responde `502`/`504` con `codigo: "rag_no_disponible"`,
el servicio Flask está dormido o la URL de `RAG_SERVICE_URL` es incorrecta
(los servicios gratuitos de Render se suspenden tras un periodo de inactividad;
la primera petición puede tardar ~30 s).

## Desarrollo local

```bash
npm start            # UI + chat en http://localhost:3001
python app.py        # Agente RAG en http://localhost:5000
```

Sin `RAG_SERVICE_URL`, el proxy usa `http://127.0.0.1:5000` por defecto.

## Notas

- El disco de Render es efímero: `puente_rag.db` se regenera con
  `python sembrar_normativa.py` (incluido en el build). Con `GEMINI_API_KEY`
  los embeddings usan Gemini; sin clave se generan de forma determinista.
- Si prefieres que el navegador llame a Flask directamente (sin proxy), define
  `window.RAG_API_BASE = "https://tu-servicio-flask.onrender.com"` antes de cargar
  `agente_rag.js`. Con el proxy configurado esto no es necesario.
