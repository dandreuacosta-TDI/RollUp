# Pipeline M&A · Roll-up Envases Alimentarios

Sistema de screening para ir dando de alta empresas target (envases y embalajes de uso alimentario),
con ficha completa: identificación, financieros, operativa, estrategia y estado del proceso.

Es una app muy simple: **Node.js + Express** sirviendo una página estática y una pequeña API REST.
Los datos se guardan en un archivo `data/companies.json`. No necesita ninguna base de datos externa.
La interfaz autoguarda los cambios de cada ficha contra ese archivo unos instantes después de editar.

Incluye análisis automático de documentos desde el inicio del flujo: subes primero un PDF, Excel o CSV
(teaser, CIM, cuentas anuales, informe comercial, lo que sea), la app crea una ficha provisional de la
target, el servidor extrae el texto, lo manda a la API de Claude, y rellena automáticamente los campos
que encuentre (financieros, operativos, estratégicos). También guarda el documento en un listado con un
resumen, añade un análisis narrativo al histórico de insights, y deja constancia en el timeline de
seguimiento (CRM).

También incluye un pequeño CRM de seguimiento por empresa: una línea de tiempo con notas manuales
(llamadas, reuniones, novedades) y las entradas automáticas de cada documento analizado, más un
campo de "próxima acción" con fecha para no perder de vista qué toca hacer con cada deal.

La ficha tiene dos pestañas principales:

- **Ficha de screening:** identificación, financieros, operativa, estrategia, documentos e histórico CRM.
- **Plan de adquisición:** generación de un plan base con valor empresa/EV, múltiplo de la transacción,
  capital a usar, deuda de adquisición, vendor loan, earn-out, condiciones clave, riesgos de financiación
  y plan 100 días post-cierre.

### Variable de entorno necesaria para el análisis de documentos

```
ANTHROPIC_API_KEY=sk-ant-xxxxx
```

Consigue tu clave en https://console.anthropic.com/settings/keys. Sin esta variable, el resto de la
app funciona igual, pero el botón "Analizar con IA" devolverá un aviso pidiendo configurarla.

## Probarlo en tu máquina (opcional)

```bash
npm install
npm start
```

Abre http://localhost:3000

El primer paso recomendado es subir el documento recibido de la empresa target desde el panel principal.
Si prefieres arrancar manualmente, usa el botón **Nueva desde cero**.

Si el puerto 3000 ya está ocupado, puedes arrancarlo en otro puerto:

```bash
PORT=3100 npm start
```

En PowerShell:

```powershell
$env:PORT=3100; npm start
```

## Subirlo a GitHub

```bash
cd RollUp
git init
git add .
git commit -m "Pipeline M&A - roll-up envases alimentarios"
```

Luego crea un repo vacío en https://github.com/new (puede ser privado) y:

```bash
git remote add origin https://github.com/TU_USUARIO/TU_REPO.git
git branch -M main
git push -u origin main
```

## Desplegarlo en Railway

1. Entra en https://railway.app y haz login con tu cuenta de GitHub.
2. **New Project → Deploy from GitHub repo** → selecciona el repo que acabas de subir.
3. Railway usará el `Dockerfile` incluido para construir la app con Node 20 y ejecutar `npm start`. Esto evita depender del builder automático de Railway/Railpack.
4. En **Variables**, añade `ANTHROPIC_API_KEY` con tu clave de https://console.anthropic.com/settings/keys
   para que funcione el análisis automático de cuentas anuales.
5. **Importante — persistencia de datos:** por defecto, el sistema de archivos de Railway se reinicia
   en cada nuevo despliegue. Para que las empresas que vayas dando de alta no se pierdan cuando actualices
   el código, añade un **Volume**:
   - En el proyecto de Railway, ve a la pestaña del servicio → **Volumes** → **New Volume**.
   - Móntalo, por ejemplo, en `/data`.
   - Añade la variable de entorno `DATA_DIR=/data` en **Variables**.
   - Redeploy.
   Sin este Volume, la app funciona, pero los datos pueden perderse al redeplegar aunque el autoguardado esté activo.
6. Railway te da una URL pública (algo como `tu-proyecto.up.railway.app`). Esa es tu herramienta,
   accesible desde cualquier navegador, sin pasar por Claude.

## Estructura del proyecto

```
├── server.js          # API REST + servidor de archivos estáticos
├── package.json
├── Dockerfile          # Build explícita para Railway
├── railway.json        # Fuerza builder DOCKERFILE en Railway
├── .gitignore
├── public/
│   └── index.html      # Toda la interfaz (sin frameworks, JS plano)
└── data/                # Se crea solo; aquí vive companies.json (no subir a git)
```

## Notas

- No hay login ni control de acceso — cualquiera con la URL puede ver y editar los datos.
  Si varias personas del equipo van a usarlo, considera añadir una contraseña simple (basic auth)
  antes de compartir la URL fuera del equipo.
- Si el equipo crece o quieres histórico/auditoría de cambios, el siguiente paso natural es
  sustituir `data/companies.json` por una base de datos real (Postgres, que Railway también
  ofrece como plugin con un clic).
