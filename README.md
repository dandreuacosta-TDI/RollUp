# Pipeline M&A · Roll-up Envases Alimentarios

Sistema de screening para ir dando de alta empresas target (envases y embalajes de uso alimentario),
con ficha completa: identificación, financieros, operativa, estrategia y estado del proceso.

Es una app muy simple: **Node.js + Express** sirviendo una página estática y una pequeña API REST.
En producción puede guardar las empresas en **PostgreSQL** usando `DATABASE_URL`. En local, si no hay
base de datos configurada, usa `data/companies.json` como fallback. La interfaz autoguarda los cambios
de cada ficha unos instantes después de editar.

Incluye análisis automático de documentos desde el inicio del flujo: subes primero un PDF, Excel o CSV
(teaser, CIM, cuentas anuales, informe comercial, lo que sea), la app crea una ficha provisional de la
target, el servidor extrae el texto, lo manda a la API de Claude, y rellena automáticamente los campos
que encuentre (financieros, operativos, estratégicos). También guarda el documento en un listado con un
resumen, añade un análisis narrativo al histórico de insights, y deja constancia en el timeline de
seguimiento (CRM).

También incluye un pequeño CRM de seguimiento por empresa: una línea de tiempo con notas manuales
(llamadas, reuniones, novedades) y las entradas automáticas de cada documento analizado, más un
campo de "próxima acción" con fecha para no perder de vista qué toca hacer con cada deal.

La ficha tiene tres pestañas principales:

- **Ficha de screening:** identificación, financieros, operativa, estrategia, documentos e histórico CRM.
- **Plan de adquisición:** generación de un plan base con valor empresa/EV, múltiplo de la transacción,
  capital a usar, deuda de adquisición, vendor loan, earn-out, condiciones clave, riesgos de financiación
  y plan 100 días post-cierre.
- **Cuadro de deuda:** calendario anual de devolución de deuda, intereses cash, amortización senior,
  vendor loan, deuda final, leverage y DSCR.

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

### Persistencia de datos

La app usa este orden:

1. Si existe `DATABASE_URL` o `POSTGRES_URL`, guarda y lee empresas desde PostgreSQL.
2. Si no existe base de datos configurada, usa `data/companies.json` en el disco local.

Cuando actives PostgreSQL por primera vez, si existe `data/companies.json` y la tabla está vacía, el
servidor migrará automáticamente esas empresas a la base de datos.

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
5. **Importante — persistencia de datos:** añade una base de datos PostgreSQL en Railway para que los
   datos no dependan del contenedor ni de los commits:
   - En Railway, pulsa **New → Database → PostgreSQL** dentro del proyecto.
   - Railway añadirá automáticamente `DATABASE_URL` al entorno del servicio o te permitirá referenciarla.
   - Redeploy.
   - Desde ese momento, las empresas se guardan en PostgreSQL y no se pierden al desplegar nuevos commits.

   Alternativa si no quieres PostgreSQL: añade un **Volume** montado en `/data` y configura `DATA_DIR=/data`.
   Esta opción mantiene el fallback JSON persistente, pero PostgreSQL es la opción recomendada.
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
- Para producción, usa PostgreSQL con `DATABASE_URL`. El JSON local queda solo como fallback de desarrollo
   o como migración inicial.
