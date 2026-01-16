'use strict';

require('dotenv').config();

const fs = require('fs');
const nodePath = require('path');
const crypto = require('crypto');
const express = require('express');

// PRODUCCIÓN REACT - Configuración automática
const isProduction = process.env.NODE_ENV === 'production' || !process.env.NODE_ENV;

const fileUpload = require('express-fileupload');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const OpenAI = require('openai');
const pino = require('pino')();

// Imports para generación de documentos
const { Document, Packer, Paragraph, TextRun, HeadingLevel } = require('docx');
const { markdownToWordParagraphs, renderMarkdownToPdf, markdownToPlainText } = require('./engine/markdown_parser');
const PDFDocument = require('pdfkit');

// Configurar OpenAI para audio
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const { buildPromptFromConfig, legacyBuildPrompt } = require('./engine/loader');
const { answer, answerStream, reload } = require('./engine/index');
const creditManager = require('./engine/credit_manager');
const actionsMod = require('./actions');
const { loadContext } = require('./engine/memory');

// === helpers ===
function sha256(str){ return crypto.createHash('sha256').update(str, 'utf8').digest('hex'); }
function computeIdentityFromBuilder(raw, json){
  const hash = sha256(raw || '');
  const name = (json && json.name) ? json.name : 'Bot';
  const valid = !!(json && json.name);
  return { name, hash, valid };
}

// === system prompt loader (compat: v2-structured y v2-simple) ===
function loadSystemPrompt(){
  try {
    const raw = fs.readFileSync('./lexcode_instances/general/builder.json','utf-8');
    const cfg = JSON.parse(raw);
    global.builder_config = cfg;

    let prompt = '';
    if (cfg && (cfg.initial_configuration || cfg.configuration_base || cfg.configuration_functional)) {
      // v2-structured
      prompt = buildPromptFromConfig(cfg);
    } else {
      // compat v2-simple
      prompt = legacyBuildPrompt(cfg);
    }

    global.system_prompt = prompt || '';
    global.system_prompt_hash = sha256(global.system_prompt);

    const id = computeIdentityFromBuilder(global.system_prompt, cfg);
    global.builder_sha = id.hash;
    global.builder_name = id.name;
    global.builder_valid = id.valid;

    console.log('[builder] system prompt loaded. hash=', global.system_prompt_hash);
  } catch(e) {
    console.error('Failed to load system prompt:', e);
    if (!global.system_prompt) global.system_prompt = '';
  }
}

// === config loader ===
function loadBotConfig(){
  try{
    const raw = fs.readFileSync('./lexcode_instances/general/config.json','utf-8');
    global.bot_config = JSON.parse(raw);
  }catch(e){
    console.error('Failed to load bot config:', e);
    if (!global.bot_config) global.bot_config = {};
  }
}

// === boot ===
loadBotConfig();
loadSystemPrompt();

const app = express();

// 1. Body parser (JSON) debe ir antes de las rutas
app.use(express.json());

// 2. CORS y rate limiting (aplicados después)
// (se aplican en applyRuntimeGuards() más abajo)

// 3. === REDIS CACHE ===
const cacheManager = require('./engine/cache_manager_v2');
cacheManager.initializeRedis().catch(err => console.error('[Cache] Error al inicializar Redis:', err));

// 4. === AUTENTICACIÓN - MOVER AQUÍ (ANTES DE ARCHIVOS ESTÁTICOS) ===
const auth = require('./auth');
app.post('/api/auth/login', async (req,res)=>{
  console.log('🔐 Login attempt:', req.body?.email);
  try{
    const {email,password} = req.body || {};
    const result = await auth.login(email,password);
    console.log('✅ Login successful for:', email);
    return res.json({ok:true,...result});
  }catch(e){
    console.log('❌ Login failed for:', req.body?.email, e.message);
    return res.status(401).json({ok:false,error:'invalid_credentials'});
  }
});

app.get('/api/auth/me', auth.authRequired, (req,res)=>{
  const user = auth.getUser(req.userId);
  if(!user) return res.status(404).json({ok:false});
  
  // Verificar si es admin según pricing_config.json
  const creditManagerV2 = require('./engine/credit_manager_v2');
  const isAdmin = creditManagerV2.shouldShowTechnicalInfo(user.email);
  
  return res.json({ok:true, user: {...user, isAdmin}});
});

// 4. File upload middleware
app.use(fileUpload({ createParentPath: true }));

// 5. ARCHIVOS ESTÁTICOS - DESPUÉS DE LAS APIS
if (isProduction && fs.existsSync(nodePath.join(__dirname, 'react-src/dist'))) {
    console.log('📁 Sirviendo React desde react-src/dist/');
    app.use(express.static(nodePath.join(__dirname, 'react-src/dist')));
} else {
    // En desarrollo, servir archivos públicos
    console.log('📁 Sirviendo archivos públicos desde public/');
    app.use(express.static(nodePath.join(__dirname, 'public')));
}

// --- Core middleware ---

// RUTAS ELIMINADAS: Estas rutas interceptaban React Router y causaban el error de chat.html
// Las rutas del frontend ahora son manejadas completamente por React Router
// a través del catch-all al final del archivo (línea ~825)

// --- Simple user extraction ---
app.use((req, _res, next) => {
  req.userId = req.header('X-User-Id') || req.query.uid || 'anon';
  next();
});

// --- CORS + Rate limit from config (hot-reloadable) ---
const cfg = global.bot_config;
function applyRuntimeGuards(){
  // Identity-aware res.json wrapper (siempre activo)
  app.use(function(req,res,next){
    res.locals.identity = {
      name: global.builder_name || 'Bot',
      version: (global.builder_sha||'').slice(0,8),
      valid: !!global.builder_valid
    };
    const _json = res.json.bind(res);
    res.json = (obj)=>{
      try{
        if (obj && typeof obj==='object' && !obj.identity){ obj.identity = res.locals.identity; }
      }catch(_){ }
      return _json(obj);
    };
    next();
  });

  if (cfg?.cors?.enabled) {
    app.use(cors({ origin: cfg.cors.origins || cfg.cors.origin || '*' }));
  }
  if (cfg?.rate_limit) {
    const limiter = rateLimit({
      windowMs: cfg.rate_limit.windowMs || 60_000,
      max: cfg.rate_limit.max || 60
    });
    app.use(limiter);
  }
}
applyRuntimeGuards();

// --- Health ---
app.get('/healthz', (_req,res)=> res.json({ ok:true, time:new Date().toISOString() }));

// --- Dev: list knowledge files ---
if (cfg && cfg.dev_mode) app.get('/api/files', (_req,res)=>{
  try {
    const dir = nodePath.join(__dirname, 'lexcode_instances', 'general', 'conocimiento');
    if(!fs.existsSync(dir)) return res.json([]);
    const files = fs.readdirSync(dir).filter(f => fs.statSync(nodePath.join(dir,f)).isFile());
    res.json(files);
  } catch (e) {
    pino.error(e);
    res.status(500).json({ ok:false, error:'list_failed' });
  }
});

// --- Upload knowledge (ADMIN) ---
function requireAdmin(req, res, next) {
  const adminKey = process.env.ADMIN_KEY || (global.bot_config && global.bot_config.ADMIN_KEY);
  const header = req.headers['x-admin-key'];
  if (!adminKey || header !== adminKey) {
    return res.status(403).json({ ok: false, error: 'forbidden' });
  }
  return next();
}

function isAdmin(req){
  const key = process.env.ADMIN_KEY || '';
  return Boolean(key) && req.header('X-Admin-Key') === key;
}

app.post('/api/upload', requireAdmin, async (req,res)=>{
  try {
    if (!isAdmin(req)) return res.status(403).json({ ok:false, error:'forbidden' });
    const allow = (cfg?.uploads?.mime_allow) || ['text/plain','text/markdown','application/pdf'];
    if (!req.files) return res.status(400).json({ ok:false, error:'no_files' });

    const incoming = req.files.files || req.files.file || null;
    const arr = Array.isArray(incoming) ? incoming : (incoming ? [incoming] : []);
    if (arr.length === 0) return res.status(400).json({ ok:false, error:'no_files' });

    const destDir = nodePath.join(__dirname, 'lexcode_instances', 'general', 'conocimiento');
    fs.mkdirSync(destDir, { recursive: true });

    const saved = [];
    for (const f of arr) {
      const mime = (f.mimetype || '').toLowerCase();
      const ext = nodePath.extname(f.name).toLowerCase();
      if (!allow.includes(mime) && !['.txt','.md','.pdf'].includes(ext)) {
        return res.status(400).json({ ok:false, error:`mime_not_allowed:${mime}` });
      }
      const safe = f.name.replace(/[\w.\-]/g, '_').replace(/[^_\.\-\w]/g,'_');
      const out = nodePath.join(destDir, `${Date.now()}_${safe}`);
      await f.mv(out);
      saved.push(nodePath.basename(out));
    }
    res.json({ ok:true, saved });
  } catch (e) {
    pino.error(e);
    res.status(500).json({ ok:false, error:'upload_failed' });
  }
});

// --- INITIAL GREETING: endpoint para obtener el saludo inicial del bot ---
app.get('/api/initial-greeting', (req, res) => {
  try {
    const greetingPath = nodePath.join(__dirname, 'lexcode_instances', 'general', 'initial_greeting.txt');
    
    // Si el archivo no existe, crear uno con contenido por defecto
    if (!fs.existsSync(greetingPath)) {
      const defaultGreeting = `¡Hola! Soy **lEGITIMUS**, tu asistente de inteligencia jurídica especializado en derecho chileno.

Estoy aquí para ayudarte con:
- **Consultas legales** sobre derecho civil, laboral, penal y comercial
- **Análisis de documentos** legales y contratos
- **Asesoría jurídica** técnica, clara y fundada en normativa vigente

Para comenzar, simplemente cuéntame en qué puedo ayudarte. Puedes hacer preguntas específicas, solicitar análisis de situaciones legales o pedir orientación sobre procedimientos jurídicos.`;
      
      fs.writeFileSync(greetingPath, defaultGreeting, 'utf-8');
      pino.info('[Initial Greeting] Archivo creado con contenido por defecto');
    }
    
    const greeting = fs.readFileSync(greetingPath, 'utf-8');
    res.json({ ok: true, greeting });
  } catch (error) {
    pino.error('Error loading initial greeting:', error);
    res.status(500).json({ ok: false, error: 'greeting_load_failed', detail: error.message });
  }
});

// --- ASK: supports JSON or multipart (question + files[]) ---
app.post('/api/ask', async (req,res)=>{
  const __debug = (req.query.debug === '1') || (req.headers['x-debug'] === '1');
  const __prevDbg = global.__DEBUG_REQUEST__;
  global.__DEBUG_REQUEST__ = __debug;

  try {
    let question = '';
    let attachments = [];
    let chatId = 'default';
    let isInitialization = false;

    if (req.is('application/json')) {
      question = (req.body?.question || '').toString();
      chatId = (req.body?.chatId || 'default').toString();
      isInitialization = req.body?.isInitialization === true;
    } else {
      question = (req.body?.question || '').toString();
      chatId = (req.body?.chatId || 'default').toString();
      isInitialization = req.body?.isInitialization === true;
      if (req.files) {
        // (opcional) si no usarás 'allow', puedes borrar este array
        const allow = (global.bot_config?.uploads?.mime_allow) || [
          "text/plain","text/markdown","application/pdf","application/json"
        ];

        const incoming = req.files.files || req.files.file || null;
        const arr = Array.isArray(incoming) ? incoming : (incoming ? [incoming] : []);
        if (arr.length) {
          const userId = (req.userId || 'anon').toString().replace(/[^\w.-]/g,'_');
          const updir = nodePath.join(__dirname, 'files', userId);
          fs.mkdirSync(updir, { recursive: true });
          for (const f of arr) {
            // (opcional) filtra por MIME si quieres aplicar 'allow'
            // if (!allow.includes(f.mimetype)) { continue; }

            const safe = (f.name || 'file').replace(/[^\w.\-]/g, '_');
            const dest = nodePath.join(updir, `${Date.now()}_${safe}`);
            await f.mv(dest);
            attachments.push(dest);
          }
        }
      }
    }

    if (!question && attachments.length === 0) {
      return res.status(400).json({ ok:false, error:'question_or_files_required' });
    }

    // --- VERIFICACIÓN DE CRÉDITOS ANTES DE PROCESAR ---
    const costPerRequest = global.bot_config?.credits?.cost_per_request || 1;
    const availableCredits = creditManager.getAvailableCredits(req.userId);
    
    if (availableCredits < costPerRequest) {
      pino.warn(`[Chat] Usuario ${req.userId} sin créditos suficientes. Disponibles: ${availableCredits}, Requeridos: ${costPerRequest}`);
      return res.status(403).json({ 
        ok: false, 
        error: 'insufficient_credits', 
        detail: 'No tienes suficientes créditos para realizar esta consulta.',
        available: availableCredits,
        required: costPerRequest
      });
    }
    // --- FIN VERIFICACIÓN PREVIA ---

    // Procesar la consulta
    const out = await answer(question, req.userId, attachments, chatId);
    
    // Si es un mensaje de inicializacion, no mostrar respuesta al usuario
    if (isInitialization) {
      out.isInitialization = true;
      out.answer = ''; // Respuesta vacia para el frontend
    }

    // --- Decremento de créditos CON registro de tokens ---
    const tokenUsage = out.usage || null; // Capturar usage de la respuesta
    
    // Log detallado del usage capturado
    pino.info(`[Chat] Token usage recibido: ${JSON.stringify(tokenUsage)}`);
    
    try {
      await creditManager.checkAndDecrementCredits(
        req.userId, 
        costPerRequest, 
        chatId, 
        tokenUsage, 
        'chat'
      );
      
      // Log de éxito
      if (tokenUsage) {
        pino.info(`[Chat] Transacción registrada - Usuario: ${req.userId}, Tokens: ${tokenUsage.total_tokens || 0}`);
      }
    } catch (creditError) {
      // Este catch ahora solo debería ejecutarse en casos excepcionales
      pino.error('Error inesperado al decrementar créditos (ya verificados):', creditError);
      // No retornamos error aquí porque la consulta ya fue procesada
      // Solo registramos el problema para investigación
    }
    // --- Fin de decremento de créditos ---

    const responsePayload = Object.assign({ ok:true }, out);
    
    // Incluir Anexo Normativo Documental si existe
    if (out.normativeAnnex) {
      responsePayload.normativeAnnex = out.normativeAnnex;
      pino.info(`[Chat] Anexo Normativo Documental generado`);
    }
    
    if (__debug && global.__ASSISTANTS_DEBUG__) {
      responsePayload.debug = global.__ASSISTANTS_DEBUG__;
    }
    return res.json(responsePayload);
  } catch(e) {
    pino.error(e);
    return res.status(500).json({ ok:false, error:'ask_failed', detail: e?.message || String(e) });
  } finally {
    try {
      global.__DEBUG_REQUEST__ = __prevDbg;
      global.__ASSISTANTS_DEBUG__ = null;
    } catch(_){}
  }
});

// --- ASK STREAM: Endpoint con streaming SSE ---
app.post('/api/ask-stream', async (req, res) => {
  const __debug = (req.query.debug === '1') || (req.headers['x-debug'] === '1');

  try {
    let question = '';
    let attachments = [];
    let chatId = 'default';

    if (req.is('application/json')) {
      question = (req.body?.question || '').toString();
      chatId = (req.body?.chatId || 'default').toString();
    } else {
      question = (req.body?.question || '').toString();
      chatId = (req.body?.chatId || 'default').toString();
      if (req.files) {
        const incoming = req.files.files || req.files.file || null;
        const arr = Array.isArray(incoming) ? incoming : (incoming ? [incoming] : []);
        if (arr.length) {
          const userId = (req.userId || 'anon').toString().replace(/[^\w.-]/g,'_');
          const updir = nodePath.join(__dirname, 'files', userId);
          fs.mkdirSync(updir, { recursive: true });
          for (const f of arr) {
            const safe = (f.name || 'file').replace(/[^\w.\-]/g, '_');
            const dest = nodePath.join(updir, `${Date.now()}_${safe}`);
            await f.mv(dest);
            attachments.push(dest);
          }
        }
      }
    }

    if (!question && attachments.length === 0) {
      return res.status(400).json({ ok: false, error: 'question_or_files_required' });
    }

    // Verificación de créditos antes de procesar
    const costPerRequest = global.bot_config?.credits?.cost_per_request || 1;
    const availableCredits = creditManager.getAvailableCredits(req.userId);
    
    if (availableCredits < costPerRequest) {
      pino.warn(`[Chat Stream] Usuario ${req.userId} sin créditos suficientes`);
      return res.status(403).json({ 
        ok: false, 
        error: 'insufficient_credits', 
        detail: 'No tienes suficientes créditos para realizar esta consulta.',
        available: availableCredits,
        required: costPerRequest
      });
    }

    // Configurar headers para Server-Sent Events (SSE)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Para nginx
    res.flushHeaders();

    pino.info(`[Chat Stream] Iniciando streaming para usuario: ${req.userId}`);

    // Usar answerStream con callbacks
    await answerStream({
      question,
      userId: req.userId,
      attachments,
      chatId,
      onDelta: (delta) => {
        // Enviar cada fragmento como evento SSE
        if (delta) {
          res.write(`data: ${JSON.stringify({ type: 'delta', content: delta })}\n\n`);
        }
      },
      onComplete: (completionData) => {
        // Enviar evento de completado con metadata
        res.write(`data: ${JSON.stringify({ 
          type: 'done', 
          usage: completionData.usage,
          interactionStatus: completionData.interactionStatus,
          creditConsumption: completionData.creditConsumption,
          normativeAnnex: completionData.normativeAnnex
        })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      },
      onError: (error) => {
        pino.error('[Chat Stream] Error:', error);
        res.write(`data: ${JSON.stringify({ type: 'error', message: error.message || 'Error desconocido' })}\n\n`);
        res.end();
      }
    });

  } catch (e) {
    pino.error('[Chat Stream] Error fatal:', e);
    // Si aún no hemos enviado headers, enviar JSON de error
    if (!res.headersSent) {
      return res.status(500).json({ ok: false, error: 'stream_failed', detail: e?.message || String(e) });
    }
    // Si ya enviamos headers SSE, enviar error como evento
    res.write(`data: ${JSON.stringify({ type: 'error', message: e?.message || 'Error interno' })}\n\n`);
    res.end();
  }
});

// --- Chat Management endpoints ---
const { getUserChats, createUserChat, deleteUserChat, renameUserChat } = require('./chat_management');
const { addChatHistoryEndpoint } = require('./chat_history_endpoint');
const { addInteractionStatusEndpoint } = require('./interaction_status_endpoint');

// Obtener lista de chats del usuario
app.get('/api/chats', auth.authRequired, async (req, res) => {
  try {
    const chats = getUserChats(global.bot_config, req.userId);
    res.json({ ok: true, chats });
  } catch (e) {
    pino.error(e);
    res.status(500).json({ ok: false, error: 'get_chats_failed' });
  }
});

// Crear un nuevo chat con nombre
app.post('/api/chats', auth.authRequired, async (req, res) => {
  try {
    const { chatId, name, instanceId } = req.body;
    
    if (!chatId) {
      return res.status(400).json({ ok: false, error: 'chatId_required' });
    }
    
    const success = createUserChat(global.bot_config, req.userId, chatId, name || '', instanceId || 'general');
    
    if (success) {
      res.json({ ok: true, message: 'Chat creado correctamente', chatId });
    } else {
      res.status(500).json({ ok: false, error: 'create_chat_failed' });
    }
  } catch (e) {
    pino.error(e);
    res.status(500).json({ ok: false, error: 'create_chat_failed' });
  }
});

// Eliminar un chat específico
app.delete('/api/chats/:chatId', auth.authRequired, async (req, res) => {
  try {
    const { chatId } = req.params;
    const success = deleteUserChat(global.bot_config, req.userId, chatId);
    
    if (success) {
      res.json({ ok: true, message: 'Chat eliminado correctamente' });
    } else {
      res.status(404).json({ ok: false, error: 'chat_not_found' });
    }
  } catch (e) {
    pino.error(e);
    res.status(500).json({ ok: false, error: 'delete_chat_failed' });
  }
});

// Renombrar un chat
app.put('/api/chats/:chatId/rename', auth.authRequired, async (req, res) => {
  try {
    const { chatId } = req.params;
    const { name } = req.body;
    
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ ok: false, error: 'name_required' });
    }
    
    const success = renameUserChat(global.bot_config, req.userId, chatId, name);
    
    if (success) {
      res.json({ ok: true, message: 'Chat renombrado correctamente' });
    } else {
      res.status(404).json({ ok: false, error: 'chat_not_found' });
    }
  } catch (e) {
    pino.error(e);
    res.status(500).json({ ok: false, error: 'rename_chat_failed' });
  }
});

// Agregar endpoint de historial de chat
addChatHistoryEndpoint(app, auth.authRequired);

// Agregar endpoint de estado de interacciones
addInteractionStatusEndpoint(app, auth.authRequired);

// --- Multi-Instance endpoints ---
const { addMultiInstanceEndpoints } = require('./multi_instance_endpoints');
addMultiInstanceEndpoints(app, auth.authRequired);

// --- Knowledge v2 endpoints (solo si existen) ---
try {
  const { listKnowledgeFiles, summarizePlain, readTextSync, searchAll } = require('./engine/knowledge_readers');

  if (cfg && cfg.dev_mode) app.get('/api/knowledge2/inventory', (_req, res)=>{
    try{
      const files = listKnowledgeFiles().map(f=>f.name);
      res.json({ ok:true, files });
    }catch(e){
      pino.error(e);
      res.status(500).json({ ok:false, error:'inventory_failed' });
    }
  });

  if (cfg && cfg.dev_mode) app.get('/api/knowledge2/summary', async (_req, res)=>{
    try{
      const files = listKnowledgeFiles();
      const items = files.map(f=>{
        let preview = '';
        try{
          if (f.ext === '.pdf'){
            preview = 'PDF: usar /api/knowledge2/search?q=... para ver páginas coincidentes';
          } else {
            preview = summarizePlain(readTextSync(f.path), 350);
          }
        }catch(e){
          preview = '(no leíble)';
        }
        return { file: f.name, preview };
      });
      res.json({ ok:true, summary: items });
    }catch(e){
      pino.error(e);
      res.status(500).json({ ok:false, error:'summary_failed' });
    }
  });

  if (cfg && cfg.dev_mode) app.get('/api/knowledge2/search', async (req, res)=>{
    try{
      const q = (req.query.q||'').toString();
      if (!q.trim()) return res.status(400).json({ ok:false, error:'missing q' });
      const hits = await searchAll(q);
      res.json({ ok:true, q, hits });
    }catch(e){
      pino.error(e);
      res.status(500).json({ ok:false, error:'search_failed' });
    }
  });
} catch(e) {
  // readers opcionales, no bloquear server
}

// === Inspector: listar acciones disponibles ===
app.get('/api/actions', (req, res) => {
  try {
    const list = (actionsMod && typeof actionsMod.list==='function') ? actionsMod.list() : [];
    res.json({ ok:true, actions: list });
  } catch(e){
    res.status(500).json({ ok:false, error:'actions_list_failed', detail: String(e && e.message || e) });
  }
});

// === Inspector: ejecutar acción (requiere Admin Key) ===
app.post('/api/actions/execute', requireAdmin, async (req, res) => {
  try {
    const { name, args } = req.body || {};
    if (!name) return res.status(400).json({ ok:false, error:'missing_name' });
    if (!actionsMod || typeof actionsMod.run !== 'function') return res.status(503).json({ ok:false, error:'actions_module_missing' });
    const result = await actionsMod.run(String(name), args || {});
    res.json({ ok:true, name, result });
  } catch(e){
    res.status(500).json({ ok:false, error:'actions_execute_failed', detail: String(e && e.message || e) });
  }
});

// === Inspector: ver memoria del usuario actual ===
app.get('/api/memory', async (req, res) => {
  try {
    const current = req.userId || 'anon';
    const qUid = (req.query && req.query.uid) ? String(req.query.uid) : current;
    const userId = (qUid === current) ? current : current; // solo permite su propia memoria
    const mem = loadContext(global.bot_config || {}, userId) || [];
    res.json({ ok:true, userId, memory: mem });
  } catch(e){
    res.status(500).json({ ok:false, error:'memory_read_failed', detail: String(e && e.message || e) });
  }
});

// --- public config endpoint (safe) ---
app.get('/public-config', (req, res) => {
  const ccfg = (global.bot_config || {});
  res.json({ dev_mode: !!ccfg.dev_mode, product_mode: !!ccfg.product_mode });
});

// === AUDIO ENDPOINTS ===

// --- Transcripción de audio (Speech-to-Text) ---
app.post('/api/audio/transcribe', async (req, res) => {
  try {
    if (!req.files || !req.files.audio) {
      return res.status(400).json({ ok: false, error: 'no_audio_file' });
    }

    const audioFile = req.files.audio;
    pino.info(`Transcribiendo audio: ${audioFile.name} (${audioFile.size} bytes)`);

    // Crear archivo temporal
    const tempPath = nodePath.join(__dirname, 'temp', `${Date.now()}_${audioFile.name}`);
    await audioFile.mv(tempPath);

    // Transcribir usando OpenAI Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempPath),
      model: 'whisper-1',
      language: 'es', // Español
      response_format: 'json'
    });

    // Limpiar archivo temporal
    fs.unlinkSync(tempPath);

    // Registrar consumo (Whisper se cobra por minuto de audio)
    const durationMinutes = (transcription.duration || 0) / 60;
    const audioUsage = {
      audio_duration_seconds: transcription.duration || 0,
      audio_duration_minutes: parseFloat(durationMinutes.toFixed(4)),
      model: 'whisper-1',
      estimated_cost_usd: parseFloat((durationMinutes * 0.006).toFixed(6))
    };

    // Registrar transacción si hay usuario autenticado
    const userId = req.userId || 'anon';
    try {
      creditManager.recordTransaction(
        userId,
        'audio_usage',
        0, // No se cobran créditos por transcripción (puedes ajustar esto)
        `Transcripción de audio (${Math.round(transcription.duration || 0)}s)`,
        null,
        audioUsage,
        'audio_transcription'
      );
      pino.info(`[Audio] Transcripción registrada para ${userId}: ${Math.round(transcription.duration || 0)}s`);
    } catch (err) {
      pino.error('Error registrando transacción de audio:', err);
    }

    res.json({ 
      ok: true, 
      text: transcription.text,
      duration: transcription.duration || null
    });

  } catch (error) {
    pino.error('Error en transcripción:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      type: error.type
    });
    
    res.status(500).json({ 
      ok: false, 
      error: 'transcription_failed',
      detail: error.message,
      code: error.code 
    });
  }
});

// --- Síntesis de voz (Text-to-Speech) ---
app.post('/api/audio/synthesize', async (req, res) => {
  try {
    const { text, voice = 'alloy', speed = 1.0 } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ ok: false, error: 'text_required' });
    }

    if (text.length > 4096) {
      return res.status(400).json({ ok: false, error: 'text_too_long' });
    }

    pino.info(`Sintetizando voz: ${text.length} caracteres`);

    // Generar audio usando OpenAI TTS
    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice: voice, // alloy, echo, fable, onyx, nova, shimmer
      input: text,
      speed: speed
    });

    // Convertir a buffer
    const buffer = Buffer.from(await mp3.arrayBuffer());

    // Registrar consumo (TTS se cobra por cada 1,000 caracteres)
    const charCount = text.length;
    const ttsUsage = {
      character_count: charCount,
      model: 'tts-1',
      voice: voice,
      estimated_cost_usd: parseFloat(((charCount / 1000) * 0.015).toFixed(6))
    };

    // Registrar transacción si hay usuario autenticado
    const userId = req.userId || 'anon';
    try {
      creditManager.recordTransaction(
        userId,
        'audio_usage',
        0, // No se cobran créditos por TTS (puedes ajustar esto)
        `Síntesis de voz (${charCount} caracteres)`,
        null,
        ttsUsage,
        'audio_synthesis'
      );
      pino.info(`[TTS] Síntesis registrada para ${userId}: ${charCount} caracteres`);
    } catch (err) {
      pino.error('Error registrando transacción de TTS:', err);
    }

    // Enviar como audio
    res.set({
      'Content-Type': 'audio/mpeg',
      'Content-Length': buffer.length,
      'Content-Disposition': 'inline; filename="response.mp3"'
    });

    res.send(buffer);

  } catch (error) {
    pino.error('Error en síntesis:', error);
    res.status(500).json({ 
      ok: false, 
      error: 'synthesis_failed',
      detail: error.message 
    });
  }
});

// === ENDPOINTS DE DOCUMENTOS ===

// Endpoint principal para generar documentos
app.post('/api/documents/generate', async (req, res) => {
  try {
    const { text, format } = req.body;
    
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ ok: false, error: 'text_required' });
    }
    
    if (!format || !['txt', 'word', 'pdf'].includes(format)) {
      return res.status(400).json({ ok: false, error: 'invalid_format' });
    }

    const title = 'Respuesta LEGITIMUS';
    const timestamp = new Date().toISOString();
    
    switch (format) {
      case 'txt':
        return generateTxtDocument(res, text, title);
      case 'word':
        return generateWordDocument(res, text, title);
      case 'pdf':
        return generatePdfDocument(res, text, title);
      default:
        return res.status(400).json({ ok: false, error: 'unsupported_format' });
    }

  } catch (error) {
    pino.error('Error en generación de documento:', error);
    res.status(500).json({ 
      ok: false, 
      error: 'document_generation_failed',
      detail: error.message 
    });
  }
});

// Función para generar documento TXT (con conversión de Markdown a texto limpio)
function generateTxtDocument(res, content, title) {
  // Convertir Markdown a texto plano limpio
  const cleanContent = markdownToPlainText(content);
  const txtContent = `${title}\n${'='.repeat(title.length)}\n\nGenerado: ${new Date().toLocaleString('es-CL')}\n\n${cleanContent}`;
  
  res.set({
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Disposition': `attachment; filename="${title.replace(/[^a-zA-Z0-9]/g, '_')}.txt"`
  });
  
  res.send(txtContent);
}

// Función para generar documento Word (con soporte Markdown)
async function generateWordDocument(res, content, title) {
  // Convertir Markdown a párrafos de Word
  const contentParagraphs = markdownToWordParagraphs(content);
  
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        // Título del documento
        new Paragraph({
          children: [
            new TextRun({
              text: title,
              bold: true,
              size: 36
            })
          ],
          spacing: { after: 200 }
        }),
        // Fecha de generación
        new Paragraph({
          children: [
            new TextRun({
              text: `Generado: ${new Date().toLocaleString('es-CL')}`,
              italics: true,
              size: 20,
              color: '666666'
            })
          ],
          spacing: { after: 400 }
        }),
        // Contenido parseado desde Markdown
        ...contentParagraphs
      ]
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  
  res.set({
    'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'Content-Disposition': `attachment; filename="${title.replace(/[^a-zA-Z0-9]/g, '_')}.docx"`
  });
  
  res.send(buffer);
}

// Función para generar documento PDF (con soporte Markdown)
function generatePdfDocument(res, content, title) {
  const doc = new PDFDocument({
    margins: { top: 50, bottom: 50, left: 60, right: 60 },
    size: 'LETTER'
  });
  const chunks = [];

  doc.on('data', chunk => chunks.push(chunk));
  doc.on('end', () => {
    const buffer = Buffer.concat(chunks);
    
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`
    });

    res.send(buffer);
  });

  // Título del documento
  doc.fontSize(22).font('Helvetica-Bold').text(title, { align: 'center' });
  doc.moveDown(0.5);
  
  // Fecha de generación
  doc.fontSize(10).font('Helvetica').fillColor('#666666')
     .text(`Generado: ${new Date().toLocaleString('es-CL')}`, { align: 'right' });
  doc.fillColor('#000000');
  doc.moveDown(1);
  
  // Línea separadora
  doc.strokeColor('#cccccc')
     .lineWidth(1)
     .moveTo(doc.page.margins.left, doc.y)
     .lineTo(doc.page.width - doc.page.margins.right, doc.y)
     .stroke();
  doc.moveDown(1);

  // Contenido parseado desde Markdown
  renderMarkdownToPdf(doc, content);

  doc.end();
}

// Endpoint para generar documento Word
app.post('/api/documents/word', async (req, res) => {
  try {
    const { content, title = 'Documento LEGITIMUS' } = req.body;
    
    if (!content) {
      return res.status(400).json({ ok: false, error: 'no_content' });
    }

    // Crear documento Word
    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: title,
                bold: true,
                size: 28
              })
            ]
          }),
          new Paragraph({
            children: [new TextRun({ text: "" })] // Línea en blanco
          }),
          ...content.split('\n').map(line => 
            new Paragraph({
              children: [new TextRun({ text: line })]
            })
          )
        ]
      }]
    });

    // Generar buffer
    const buffer = await Packer.toBuffer(doc);

    // Enviar archivo
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${title.replace(/[^a-zA-Z0-9]/g, '_')}.docx"`
    });

    res.send(buffer);

  } catch (error) {
    pino.error('Error generando Word:', error);
    res.status(500).json({ ok: false, error: 'word_generation_failed' });
  }
});

// Endpoint para generar documento PDF
app.post('/api/documents/pdf', async (req, res) => {
  try {
    const { content, title = 'Documento LEGITIMUS' } = req.body;
    
    if (!content) {
      return res.status(400).json({ ok: false, error: 'no_content' });
    }

    // Crear documento PDF
    const doc = new PDFDocument();
    const chunks = [];

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => {
      const buffer = Buffer.concat(chunks);
      
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${title.replace(/[^a-zA-Z0-9]/g, '_')}.pdf"`
      });

      res.send(buffer);
    });

    // Agregar contenido
    doc.fontSize(18).text(title, { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).text(content, { align: 'left' });

    doc.end();

  } catch (error) {
    pino.error('Error generando PDF:', error);
    res.status(500).json({ ok: false, error: 'pdf_generation_failed' });
  }
});

// Endpoint para generar archivo TXT
app.post('/api/documents/txt', async (req, res) => {
  try {
    const { content, title = 'Documento LEGITIMUS' } = req.body;
    
    if (!content) {
      return res.status(400).json({ ok: false, error: 'no_content' });
    }

    // Crear contenido TXT
    const txtContent = `${title}\n${'='.repeat(title.length)}\n\n${content}`;

    // Enviar archivo
    res.set({
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="${title.replace(/[^a-zA-Z0-9]/g, '_')}.txt"`
    });

    res.send(txtContent);

  } catch (error) {
    pino.error('Error generando TXT:', error);
    res.status(500).json({ ok: false, error: 'txt_generation_failed' });
  }
});

// --- Credit Management (ADMIN) ---
app.post("/api/admin/credits/assign", requireAdmin, async (req, res) => {
  try {
    const { userId, amount, description } = req.body;
    if (!userId || !amount || typeof amount !== "number" || amount <= 0) {
      return res.status(400).json({ ok: false, error: "invalid_parameters" });
    }
    await creditManager.addCredits(userId, amount, description);
    res.json({ ok: true, message: `Créditos asignados a ${userId}` });
  } catch (e) {
    pino.error("Error al asignar créditos:", e);
    res.status(500).json({ ok: false, error: "assign_credits_failed", detail: e.message });
  }
});

app.get("/api/admin/credits/user/:userId", requireAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const credits = creditManager.getAvailableCredits(userId);
    res.json({ ok: true, userId, credits });
  } catch (e) {
    pino.error("Error al obtener créditos de usuario:", e);
    res.status(500).json({ ok: false, error: "get_user_credits_failed", detail: e.message });
  }
});

app.get("/api/admin/credits/transactions", requireAdmin, async (req, res) => {
  try {
    const transactionsStore = creditManager.readTransactionsStore();
    res.json({ ok: true, transactions: transactionsStore.transactions });
  } catch (e) {
    pino.error("Error al obtener transacciones:", e);
    res.status(500).json({ ok: false, error: "get_transactions_failed", detail: e.message });
  }
});

// --- Contexto General del Usuario ---
const generalContextManager = require('./auth/general_context_manager');

app.get('/api/user/general-context', auth.authRequired, (req, res) => {
  try {
    const userId = req.user?.id || req.headers['x-user-id'] || 'anon';
    const context = generalContextManager.getGeneralContext(userId);
    res.json({ ok: true, context });
  } catch (e) {
    pino.error('Error getting general context:', e);
    res.status(500).json({ ok: false, error: 'get_context_failed', detail: e.message });
  }
});

app.post('/api/user/general-context', auth.authRequired, (req, res) => {
  try {
    const userId = req.user?.id || req.headers['x-user-id'] || 'anon';
    const context = req.body?.context || '';
    
    // Validar longitud
    if (context.length > 2000) {
      return res.status(400).json({ ok: false, error: 'context_too_long', max: 2000 });
    }
    
    const success = generalContextManager.saveGeneralContext(userId, context);
    if (success) {
      res.json({ ok: true, message: 'Contexto guardado exitosamente' });
    } else {
      res.status(500).json({ ok: false, error: 'save_context_failed' });
    }
  } catch (e) {
    pino.error('Error saving general context:', e);
    res.status(500).json({ ok: false, error: 'save_context_failed', detail: e.message });
  }
});

// --- User Preferences ---
app.get('/api/user/preferences', auth.authRequired, (req, res) => {
  try {
    const userId = req.user?.id || req.headers['x-user-id'] || 'anon';
    // Devolver preferencias por defecto (se guardan en localStorage del cliente)
    res.json({ 
      ok: true, 
      preferences: {
        audioEnabled: true,
        audioSpeed: 1,
        audioVolume: 1,
        audioVoice: 'onyx'
      }
    });
  } catch (e) {
    pino.error('Error getting user preferences:', e);
    res.status(500).json({ ok: false, error: 'get_preferences_failed' });
  }
});

app.post('/api/user/preferences', auth.authRequired, (req, res) => {
  try {
    // Las preferencias se guardan en localStorage del cliente
    // Este endpoint es solo para compatibilidad
    res.json({ ok: true, message: 'Preferencias guardadas' });
  } catch (e) {
    pino.error('Error saving user preferences:', e);
    res.status(500).json({ ok: false, error: 'save_preferences_failed' });
  }
});

// --- reload (admin) ---
app.post('/api/reload', requireAdmin, (req,res)=>{
  if(!isAdmin(req)) return res.status(403).json({ ok:false, error:'forbidden' });
  const previous = { name: global.builder_name, version: (global.builder_sha||'').slice(0,8), valid: !!global.builder_valid };
  try {
    reload();
    loadSystemPrompt();
    const current = { name: global.builder_name, version: (global.builder_sha||'').slice(0,8), valid: !!global.builder_valid };
    res.json({ ok:true, reload:{ previous, current } });
  } catch (e) {
    pino.error(e);
    res.status(500).json({ ok:false, error:'reload_failed', previous });
  }
});

// --- Startup: prepare dirs & seed copy ---
try {
  const filesDir = nodePath.join(__dirname, 'files', 'anon');
  fs.mkdirSync(filesDir, { recursive: true });
  
  // Crear directorio temporal para archivos de audio
  const tempDir = nodePath.join(__dirname, 'temp');
  fs.mkdirSync(tempDir, { recursive: true });
  
  pino.info('Directorios preparados correctamente.');
} catch (e) {
  pino.warn('No se pudo preparar seed de conocimiento:', e?.message || e);
}

const PORT = process.env.PORT || 3000;

// Ruta catch-all para React Router (debe ir al final)
// Funciona tanto en producción como en desarrollo
app.get('*', (req, res) => {
    const requestPath = req.path || req.url || '';
    console.log('🌐 Catch-all route hit:', requestPath);
    
    // Excluir APIs, uploads y otros recursos
    if (requestPath.startsWith('/api') || 
        requestPath.startsWith('/uploads') || 
        requestPath.startsWith('/healthz') ||
        requestPath.startsWith('/public-config')) {
        console.log('❌ API route not found:', requestPath);
        return res.status(404).json({ok:false,error:'not_found'});
    }
    
    // En producción, servir desde dist/
    if (isProduction) {
        const indexPath = nodePath.join(__dirname, 'react-src/dist/index.html');
        if (fs.existsSync(indexPath)) {
            console.log('📄 Serving React index.html (production) for:', requestPath);
            res.sendFile(indexPath);
        } else {
            res.status(404).send('Frontend no encontrado. Ejecuta: node build-production.js');
        }
    } else {
        // En desarrollo, servir desde public/
        const indexPath = nodePath.join(__dirname, 'public/index.html');
        if (fs.existsSync(indexPath)) {
            console.log('📄 Serving React index.html (development) for:', requestPath);
            res.sendFile(indexPath);
        } else {
            res.status(404).send('Frontend de desarrollo no encontrado en public/index.html');
        }
    }
});

const server = app.listen(PORT, ()=> console.log(`Bot Carpeta UI activo en puerto ${PORT}`));
server.timeout = 120000; // 2 minutos de timeout para todas las solicitudes
server.headersTimeout = 120000; // También para headers
