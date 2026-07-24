const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const XLSX = require('xlsx');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 } // 20MB
});

function getAnthropicApiKey() {
  return process.env.ANTHROPIC_API_KEY ||
    process.env.API_CLAUDE ||
    process.env.CLAUDE_API_KEY ||
    process.env['API Claude'];
}

const OVERWRITE_FIELDS = [
  'nombre', 'pais_region', 'anio_fundacion', 'segmento', 'web', 'propietario', 'motivo_venta',
  'facturacion_actual', 'facturacion_historico', 'ebitda', 'margen_ebitda', 'deuda_neta',
  'multiplo_esperado', 'valoracion_estimada',
  'empleados', 'plantas_capacidad', 'certificaciones', 'clientes_principales', 'concentracion_clientes',
  'fortalezas', 'riesgos', 'sinergias'
];
const TIPOS_DOCUMENTO = ['Teaser', 'Cuentas anuales', 'NDA', 'Informe comercial', 'CIM', 'Otro'];
const DEFAULT_COMPANY = {
  id: '', nombre: '', estado: 'Screening inicial', prioridad: 'Sin definir',
  pais_region: '', anio_fundacion: '', segmento: '', web: '', propietario: '', motivo_venta: '',
  facturacion_actual: '', facturacion_historico: '', ebitda: '', margen_ebitda: '',
  deuda_neta: '', multiplo_esperado: '', valoracion_estimada: '',
  empleados: '', plantas_capacidad: '', certificaciones: '', clientes_principales: '',
  concentracion_clientes: '', fortalezas: '', riesgos: '', sinergias: '',
  precio_acordado_vendedor: '', valor_empresa_tx: '', multiplo_transaccion: '', capital_a_usar: '', deuda_adquisicion: '',
  vendor_loan: '', venture_debt: '', earn_out: '', caja_objetivo: '', working_capital_objetivo: '',
  fees_transaccion: '', pct_equity: '', pct_deuda_bancaria: '', pct_vendor_loan: '', pct_venture_debt: '',
  tipo_deuda_bancaria: '', tipo_venture_debt: '', tipo_vendor_loan: '', conversion_ebitda_fcf: '',
  estructura_pago: '', condiciones_clave: '', riesgos_financiacion: '', capacidad_repago: '', tesis_impacto: '',
  escenario_adquisicion_guardado: '', loi_borrador: '',
  plan_adquisicion: '', plan_100_dias: '',
  fuente_contacto: '', fecha_ultimo_contacto: '', proxima_accion: '', fecha_proxima_accion: '', notas: '',
  analisis_ia: '', documentos: [], actividades: []
};

function normalizeCompany(company) {
  const normalized = { ...DEFAULT_COMPANY, ...(company || {}) };
  normalized.documentos = Array.isArray(normalized.documentos) ? normalized.documentos : [];
  normalized.actividades = Array.isArray(normalized.actividades) ? normalized.actividades : [];
  return normalized;
}

async function extractTextFromFile(file) {
  const name = (file.originalname || '').toLowerCase();
  if (name.endsWith('.pdf') || file.mimetype === 'application/pdf') {
    const data = await pdfParse(file.buffer);
    return data.text;
  }
  if (name.endsWith('.xlsx') || name.endsWith('.xls') ||
      file.mimetype.includes('spreadsheet') || file.mimetype.includes('excel')) {
    const wb = XLSX.read(file.buffer, { type: 'buffer' });
    return wb.SheetNames.map(sheetName => {
      const sheet = wb.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      return `--- Hoja: ${sheetName} ---\n${csv}`;
    }).join('\n\n');
  }
  if (name.endsWith('.csv') || file.mimetype === 'text/csv') {
    return file.buffer.toString('utf-8');
  }
  throw new Error('Formato no soportado. Sube un PDF, Excel (.xlsx/.xls) o CSV.');
}

function buildAnalysisPrompt(text, docType) {
  return `Eres un analista de M&A senior especializado en el sector de envases y embalajes de uso alimentario, trabajando en un proyecto de roll-up (consolidación de varias empresas del sector).

Se te ha subido un documento de tipo "${docType}" sobre una empresa target. Puede ser un teaser, un CIM, unas cuentas anuales, un informe comercial o cualquier otro documento relevante para el screening. Extrae del texto TODA la información relevante que encuentres y devuelve EXCLUSIVAMENTE un objeto JSON válido, sin texto adicional antes o después, sin backticks ni markdown, con exactamente esta forma:

{
  "nombre": "",
  "pais_region": "",
  "anio_fundacion": "",
  "segmento": "",
  "web": "",
  "propietario": "",
  "motivo_venta": "",
  "facturacion_actual": "",
  "facturacion_historico": "",
  "ebitda": "",
  "margen_ebitda": "",
  "deuda_neta": "",
  "multiplo_esperado": "",
  "valoracion_estimada": "",
  "empleados": "",
  "plantas_capacidad": "",
  "certificaciones": "",
  "clientes_principales": "",
  "concentracion_clientes": "",
  "fortalezas": "",
  "riesgos": "",
  "sinergias": "",
  "tipo_documento_sugerido": "",
  "resumen_documento": "",
  "analisis_narrativo": ""
}

Instrucciones:
- Rellena SOLO los campos para los que encuentres información real en el texto. Si un dato no aparece, deja el campo como string vacío "" — nunca inventes ni estimes cifras sin base en el texto.
- Los importes de facturación, EBITDA, deuda neta y valoración van en millones de euros (ej. "12.4").
- margen_ebitda y concentracion_clientes van en porcentaje (ej. "14.2%").
- facturacion_historico: evolución de los últimos ejercicios disponibles, texto breve (ej. "2023: 10.1M€ / 2024: 11.8M€").
- fortalezas, riesgos y sinergias: frases breves separadas por " · " si hay varias, en español.
- tipo_documento_sugerido: elige el que mejor describa el documento entre: ${TIPOS_DOCUMENTO.join(', ')}.
- resumen_documento: 1-2 frases muy concisas describiendo qué es el documento (para un listado de archivos).
- analisis_narrativo: un análisis de 150-250 palabras, en español, con el tono de un analista de M&A senior, valorando lo que este documento aporta sobre la empresa de cara a una operación de compra dentro de un roll-up del sector (calidad de la información, señales de alerta, fortalezas, y qué preguntas quedarían pendientes de aclarar con el vendedor).

TEXTO DEL DOCUMENTO:
"""
${text}
"""`;
}


// DATA_DIR should point at a persistent volume in production (see README).
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'companies.json');
const DATABASE_URL = process.env.DATABASE_URL || process.env.POSTGRES_URL;
let pgPool;
let storeReadyPromise;

function ensureJsonStore() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({}));
}

function getPgPool() {
  if (!pgPool) {
    const needsSsl = DATABASE_URL && !DATABASE_URL.includes('localhost') && process.env.PGSSLMODE !== 'disable';
    pgPool = new Pool({
      connectionString: DATABASE_URL,
      ssl: needsSsl ? { rejectUnauthorized: false } : false
    });
  }
  return pgPool;
}

async function ensurePostgresStore() {
  const pool = getPgPool();
  await pool.query(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const countResult = await pool.query('SELECT COUNT(*)::int AS count FROM companies');
  if (countResult.rows[0].count === 0 && fs.existsSync(DATA_FILE)) {
    try {
      const jsonData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      const records = Object.values(jsonData).map(normalizeCompany).filter(c => c.id);
      for (const rec of records) {
        await pool.query(
          'INSERT INTO companies (id, data, updated) VALUES ($1, $2, $3) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated = EXCLUDED.updated',
          [rec.id, rec, rec.updated || new Date().toISOString()]
        );
      }
      if (records.length) console.log(`Migradas ${records.length} empresas desde JSON a PostgreSQL.`);
    } catch (e) {
      console.warn('No se pudo migrar el JSON local a PostgreSQL:', e.message);
    }
  }
}

async function ensureStore() {
  if (!DATABASE_URL) {
    ensureJsonStore();
    return;
  }
  if (!storeReadyPromise) storeReadyPromise = ensurePostgresStore();
  await storeReadyPromise;
}

async function readAll() {
  await ensureStore();
  if (DATABASE_URL) {
    const result = await getPgPool().query('SELECT id, data FROM companies ORDER BY updated DESC');
    return result.rows.reduce((acc, row) => {
      acc[row.id] = row.data;
      return acc;
    }, {});
  }
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
  } catch (e) {
    return {};
  }
}

async function writeAll(data) {
  await ensureStore();
  if (DATABASE_URL) {
    const pool = getPgPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM companies');
      for (const rec of Object.values(data).map(normalizeCompany).filter(c => c.id)) {
        await client.query(
          'INSERT INTO companies (id, data, updated) VALUES ($1, $2, $3)',
          [rec.id, rec, rec.updated || new Date().toISOString()]
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    return;
  }
  ensureJsonStore();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// GET /api/companies -> lightweight index for the sidebar list
app.get('/api/companies', async (req, res) => {
  const all = await readAll();
  const index = Object.values(all).map(normalizeCompany).map(c => ({
    id: c.id,
    nombre: c.nombre,
    estado: c.estado,
    segmento: c.segmento,
    updated: c.updated
  }));
  res.json(index);
});

// GET /api/companies/:id -> full record
app.get('/api/companies/:id', async (req, res) => {
  const all = await readAll();
  const rec = all[req.params.id];
  if (!rec) return res.status(404).json({ error: 'not_found' });
  res.json(normalizeCompany(rec));
});

// POST /api/companies -> create or update (upsert). Body must include "id".
app.post('/api/companies', async (req, res) => {
  const rec = normalizeCompany(req.body);
  if (!rec || !rec.id) return res.status(400).json({ error: 'missing_id' });
  const all = await readAll();
  rec.updated = new Date().toISOString();
  all[rec.id] = rec;
  await writeAll(all);
  res.json(rec);
});

// DELETE /api/companies/:id
app.delete('/api/companies/:id', async (req, res) => {
  const all = await readAll();
  delete all[req.params.id];
  await writeAll(all);
  res.json({ deleted: true });
});

// POST /api/companies/:id/analyze-document -> sube cualquier documento (PDF/Excel/CSV: teaser,
// CIM, cuentas anuales, informe...), lo manda a la API de Claude y rellena la ficha automáticamente,
// dejando además constancia del documento y de la acción en el historial (CRM).
app.post('/api/companies/:id/analyze-document', upload.single('file'), async (req, res) => {
  try {
    const anthropicApiKey = getAnthropicApiKey();
    if (!anthropicApiKey) {
      return res.status(400).json({
        error: 'missing_api_key',
        message: 'Falta configurar la variable de entorno ANTHROPIC_API_KEY en el servidor. En Railway, el nombre de la variable debe ser ANTHROPIC_API_KEY y el valor debe ser tu API key de Anthropic.'
      });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'no_file', message: 'No se ha recibido ningún archivo.' });
    }

    const all = await readAll();
    if (!all[req.params.id]) {
      return res.status(404).json({ error: 'not_found', message: 'Guarda la ficha antes de analizar documentos.' });
    }
    const rec = normalizeCompany(all[req.params.id]);

    let text;
    try {
      text = await extractTextFromFile(req.file);
    } catch (e) {
      return res.status(400).json({ error: 'extract_error', message: e.message });
    }
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'empty_text', message: 'No se ha podido extraer texto del archivo (¿está escaneado como imagen?).' });
    }

    const docTypeHint = (req.body && req.body.tipo) || 'Otro';
    const truncated = text.slice(0, 60000);
    const prompt = buildAnalysisPrompt(truncated, docTypeHint);

    const apiRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicApiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await apiRes.json();
    if (data.error) {
      return res.status(502).json({ error: 'api_error', message: data.error.message || 'Error llamando a la API de Claude.' });
    }

    const rawText = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
    let parsed;
    try {
      const cleaned = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return res.status(502).json({ error: 'parse_error', message: 'La respuesta del análisis no se pudo interpretar como JSON.', raw: rawText });
    }

    OVERWRITE_FIELDS.forEach(key => {
      if (parsed[key]) rec[key] = parsed[key];
    });

    const today = new Date().toISOString().slice(0, 10);
    const tipoFinal = parsed.tipo_documento_sugerido && TIPOS_DOCUMENTO.includes(parsed.tipo_documento_sugerido)
      ? parsed.tipo_documento_sugerido : docTypeHint;

    rec.documentos = rec.documentos || [];
    rec.documentos.push({
      nombre: req.file.originalname,
      tipo: tipoFinal,
      fecha: today,
      resumen: parsed.resumen_documento || ''
    });

    rec.analisis_ia = rec.analisis_ia
      ? rec.analisis_ia + `\n\n— ${today} · ${req.file.originalname} —\n${parsed.analisis_narrativo || ''}`
      : `— ${today} · ${req.file.originalname} —\n${parsed.analisis_narrativo || ''}`;

    rec.actividades = rec.actividades || [];
    rec.actividades.push({
      fecha: today,
      tipo: 'documento',
      texto: `Documento analizado: ${req.file.originalname} (${tipoFinal})`
    });

    rec.updated = new Date().toISOString();
    all[req.params.id] = rec;
    await writeAll(all);

    res.json(rec);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'server_error', message: err.message });
  }
});

// POST /api/companies/:id/activities -> añade una nota manual al histórico de seguimiento (CRM)
app.post('/api/companies/:id/activities', async (req, res) => {
  const { texto, fecha } = req.body || {};
  if (!texto || !texto.trim()) {
    return res.status(400).json({ error: 'missing_text', message: 'La nota no puede estar vacía.' });
  }
  const all = await readAll();
  const rec = all[req.params.id];
  if (!rec) return res.status(404).json({ error: 'not_found' });

  rec.actividades = rec.actividades || [];
  rec.actividades.push({
    fecha: fecha || new Date().toISOString().slice(0, 10),
    tipo: 'nota',
    texto: texto.trim()
  });
  rec.updated = new Date().toISOString();
  all[req.params.id] = rec;
  await writeAll(all);
  res.json(rec);
});

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Pipeline M&A escuchando en puerto ${PORT}`));
