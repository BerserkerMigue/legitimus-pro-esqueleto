const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildPromptFromConfig } = require('./loader');
const { loadContext, saveTurn, loadTurnCount } = require('./memory');
const { getInteractionStatus, incrementInteractionCount } = require('./interaction_manager');
const { makeMessages } = require('./prompt');
const { chat } = require('./llm');
const { loadFixedKnowledge } = require('./identity_memory');
const { userDocumentsManager } = require('./user_documents_manager');
const creditManager = require('./credit_manager_v2');
const { buildContextBlock, buildUserContextBlock, buildGeneralContextBlock, getCurrentDateTime } = require('./context_injector');
const { getGeneralContext } = require('../auth/general_context_manager');
const auth = require('../auth');
const { buildInstanceFilesContext } = require('./instance_files_loader');

// Sistema de citación normativa automática con doble vista (modelo/usuario)
const { processMessageWithDualAnnex, generateAnexoModelo, generateAnexoUsuario } = require('./normative_citation_processor');

function getConfig(){ return global.bot_config; }
function getBuilder(){ return global.builder_config; }
function loadBuilderFromDisk(){
  try{
    const p = path.resolve(__dirname, '../lexcode_instances/general/builder.json');
    const raw = fs.readFileSync(p, 'utf-8');
    return JSON.parse(raw);
  }catch(e){
    return null;
  }
}
function buildSystemPrompt(){
  const builder = getBuilder() || loadBuilderFromDisk() || {};
  return buildPromptFromConfig(builder);
}

function collectKnowledgeHits(question, options = {}) {
  try {
    const cfg = getConfig() || {};
    const kcfg = (cfg.knowledge || {});
    const maxChars = kcfg.maxCharsPerFile || 12000;
    const dirs = (kcfg.paths || []).map(p => path.join(process.cwd(), p));
    const q = (question || '').toString().trim().toLowerCase();
    if (!q || !dirs.length) return [];
    const hits = [];
    for (const d of dirs){
      if (!fs.existsSync(d)) continue;
      const files = fs.readdirSync(d).filter(f => fs.statSync(path.join(d,f)).isFile());
      for (const f of files){
        const full = path.join(d,f);
        let raw = '';
        try{
          if (f.endsWith('.txt') || f.endsWith('.md')) {
            raw = fs.readFileSync(full,'utf-8').slice(0,maxChars);
          } else {
            continue; // ligero: PDF ya se expone como adjunto
          }
        } catch { raw = ''; }
        if (!raw) continue;
        const pos = raw.toLowerCase().indexOf(q);
        if (pos >= 0){
          const start = Math.max(0, pos - 240);
          const end = Math.min(raw.length, pos + 600);
          const frag = raw.slice(start, end);
          const before = raw.slice(0, start);
          const lineApprox = (before.match(/\n/g)||[]).length + 1;
          const sum = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex').slice(0,10);
          hits.push({
            file: f,
            loc: `linea~${lineApprox}`,
            checksum: sum,
            preview: frag.replace(/\s+/g,' ').trim()
          });
        }
      }
    }
    return hits.slice(0, 5);
  } catch { return []; }
}

function renderAnchors(hits){
  if (!hits || !hits.length) return '';
  const bullets = hits.map(h => {
    const file = h.file || 'desconocido';
    const loc = h.loc ? ` — ${h.loc}` : '';
    const sum = h.checksum || '';
    const preview = (h.preview || '').replace(/\s+/g,' ').slice(0,180);
    return `• ${file}${loc} — sum ${sum}\n  "${preview}..."`;
  }).join('\n');
  return `\n[Fuentes]\n${bullets}\n`;
}

function reload(){
  // Recarga caliente de builder y config
  global.builder_config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'lexcode_instances', 'general', 'builder.json'), 'utf-8'));
  global.bot_config = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'lexcode_instances', 'general', 'config.json'), 'utf-8'));
  return true;
}

function renderAttachmentPreviews(attachments = [], opts = {}){
  const maxChars = opts.maxChars || 8000;
  const out = [];
  for (const a of attachments){
    try{
      const ext = path.extname(a || '').toLowerCase();
      if (!a || !fs.existsSync(a)) continue;
      if (ext === '.txt' || ext === '.md'){
        const raw = fs.readFileSync(a, 'utf-8').slice(0, maxChars);
        out.push(`--- Archivo: ${path.basename(a)} ---\n${raw}`);
      } else if (ext === '.pdf'){
        out.push(`[PDF adjunto: ${path.basename(a)}]`);
      } else {
        out.push(`[Adjunto: ${path.basename(a)}]`);
      }
    } catch {}
  }
  return out.length ? `\n\n[Adjuntos resumidos]\n${out.join('\n\n')}` : '';
}

/**
 * Procesa archivos adjuntos con RAG mejorado
 * Sube automáticamente los archivos al sistema RAG de documentos de usuario
 */
async function processAttachmentsWithRAG(attachments = [], userId = 'anon', sessionId = null, opts = {}) {
  const {
    maxChars = 8000,
    useRAG = true,
    autoUpload = true
  } = opts;

  if (!attachments || attachments.length === 0) {
    return '';
  }

  const cfg = getConfig() || {};
  const userDocsConfig = cfg.user_documents || {};
  
  // Si RAG está deshabilitado o no hay configuración, usar método tradicional
  if (!useRAG || !userDocsConfig.allow_temporary) {
    return renderAttachmentPreviews(attachments, { maxChars });
  }

  const out = [];
  const uploadPromises = [];

  for (const attachmentPath of attachments) {
    try {
      const ext = path.extname(attachmentPath || '').toLowerCase();
      if (!attachmentPath || !fs.existsSync(attachmentPath)) continue;

      const filename = path.basename(attachmentPath);

      // Para archivos de texto, subir al RAG automáticamente si está habilitado
      if (autoUpload && (ext === '.txt' || ext === '.md')) {
        const actualSessionId = sessionId || `session_${Date.now()}`;
        
        // Subir al sistema RAG de forma asíncrona
        const uploadPromise = userDocumentsManager.uploadDocument(
          userId,
          actualSessionId,
          attachmentPath,
          {
            mode: 'temporary', // Por defecto temporal para archivos adjuntos
            filename: filename
          }
        ).then(result => {
          console.log(`✅ Archivo subido al RAG: ${filename}`);
          return {
            filename,
            documentId: result.documentId,
            storeId: result.storeId,
            uploaded: true
          };
        }).catch(error => {
          console.error(`❌ Error subiendo ${filename} al RAG:`, error);
          return {
            filename,
            uploaded: false,
            error: error.message
          };
        });

        uploadPromises.push(uploadPromise);

        // Mientras tanto, mostrar preview tradicional
        const raw = fs.readFileSync(attachmentPath, 'utf-8').slice(0, maxChars);
        out.push(`--- Archivo: ${filename} (procesando con RAG...) ---\n${raw}`);
        
      } else if (ext === '.txt' || ext === '.md') {
        // Si no se sube al RAG, usar método tradicional
        const raw = fs.readFileSync(attachmentPath, 'utf-8').slice(0, maxChars);
        out.push(`--- Archivo: ${filename} ---\n${raw}`);
        
      } else if (ext === '.pdf') {
        out.push(`[PDF adjunto: ${filename}]`);
        
      } else {
        out.push(`[Adjunto: ${filename}]`);
      }
    } catch (error) {
      console.error('❌ Error procesando archivo adjunto:', error);
    }
  }

  // Esperar a que se completen las subidas al RAG
  if (uploadPromises.length > 0) {
    try {
      const uploadResults = await Promise.all(uploadPromises);
      const successfulUploads = uploadResults.filter(r => r.uploaded);
      
      if (successfulUploads.length > 0) {
        out.push(`\n🔍 ${successfulUploads.length} archivo(s) indexado(s) con RAG para búsquedas semánticas.`);
        out.push(`💡 Usa "busca en mis documentos: [tu consulta]" para encontrar información específica.`);
      }
    } catch (error) {
      console.error('❌ Error esperando subidas RAG:', error);
    }
  }

  return out.length ? `\n\n[Adjuntos procesados]\n${out.join('\n\n')}` : '';
}

async function answer(question = '', userId = 'anon', attachments = [], chatId = 'default', instanceConfig = null){
  // Si se proporciona configuración de instancia, usarla; sino usar la global
  const cfg = instanceConfig ? instanceConfig.bot_config : (getConfig() || {});
  const systemPrompt = instanceConfig ? instanceConfig.system_prompt : buildSystemPrompt();
  
  // Inyectar contexto temporal y geográfico DINÁMICO
  const contextBlock = buildContextBlock(cfg);
  
  // Inyectar contexto del usuario (nombre)
  let userContextBlock = '';
  try {
    const user = auth.getUser(userId);
    if (user && user.username) {
      userContextBlock = buildUserContextBlock({ name: user.username });
    }
  } catch (e) {
    // Si falla, simplemente no inyectar contexto de usuario (no romper nada)
    console.log('[Context Injector] No se pudo obtener info del usuario:', e.message);
  }
  
  // Inyectar contexto general del usuario (editable en Settings)
  let generalContextBlock = '';
  try {
    const generalContext = getGeneralContext(userId);
    if (generalContext) {
      generalContextBlock = buildGeneralContextBlock(generalContext);
    }
  } catch (e) {
    console.log('[Context Injector] No se pudo obtener contexto general:', e.message);
  }
  
  // Inyectar archivos de configuración de la instancia
  let instanceFilesContext = '';
  try {
    instanceFilesContext = buildInstanceFilesContext({
      maxCharsPerFile: cfg.instance_files?.maxCharsPerFile || 50000,
      maxTotalChars: cfg.instance_files?.maxTotalChars || 200000
    });
  } catch (e) {
    console.log('[Instance Files] Error cargando archivos de configuración:', e.message);
  }
  
  const systemPromptWithContext = systemPrompt + contextBlock + userContextBlock + generalContextBlock + instanceFilesContext;
  
  // Log para debugging (opcional)
  if (contextBlock) {
    console.log('[Context Injector] Contexto inyectado:', getCurrentDateTime(cfg));
  }
  if (userContextBlock) {
    console.log('[Context Injector] Contexto de usuario inyectado');
  }
  if (generalContextBlock) {
    console.log('[Context Injector] Contexto general del usuario inyectado');
  }
  if (instanceFilesContext) {
    console.log('[Instance Files] Archivos de configuración inyectados');
  }

  const apiMode = (cfg.api_mode || '').toLowerCase();

  // Modo Assistants (si está habilitado en config.json)
  if (apiMode === 'assistants'){
    const { askWithAssistant } = require('./openai_assistants');
    const hits = (cfg.anchored_mode ? collectKnowledgeHits(question) : []);
    const result = await askWithAssistant({
      userId,
      userMessage:
        (question && question.toString ? question.toString() : String(question || '')) +
        (hits.length
          ? `\n\n[Fragmentos relevantes]\n${hits.map(h=>`Archivo:${h.file}\n${h.preview}`).join('\n\n---\n\n')}`
          : ''),
      instructions: systemPromptWithContext,
      model: cfg.modelo || 'gpt-4.1',
      attachments,
      knowledgeDirs: (cfg.knowledge && Array.isArray(cfg.knowledge.paths))
        ? cfg.knowledge.paths.map(p => path.isAbsolute(p) ? p : path.join(process.cwd(), p))
        : [],
      maxCharsPerFile: (cfg.knowledge && cfg.knowledge.maxCharsPerFile) || 5000
    });
    const text = result?.answer || result?.error || '[Sin respuesta generada]';
    const tokenUsage = result?.usage; // Asumiendo que askWithAssistant también devuelve usage
    
    // Descontar créditos basado en tokens
    let creditConsumption = null;
    try {
      if (tokenUsage && tokenUsage.input_tokens && tokenUsage.output_tokens) {
        const deductResult = creditManager.deductCreditsForQuery(userId, tokenUsage, chatId);
        creditConsumption = deductResult.consumption;
      }
    } catch (creditError) {
      console.error('[Engine] Error al descontar créditos:', creditError.message);
      // Si no tiene créditos suficientes, retornar error
      if (creditError.message.includes('insuficientes')) {
        return { mode:'assistants', answer: '⚠️ Créditos insuficientes. Por favor, recarga tu cuenta para continuar usando LexCode.', error: 'insufficient_credits' };
      }
    }
    
    try { saveTurn(cfg, userId, chatId, question || '', text, tokenUsage); } catch {}
    return { mode:'assistants', answer: text, creditConsumption: creditConsumption };
  }
  // Modo Responses API (no rompe flujo actual; tools se activarán por config en pasos siguientes)
  if ((cfg.api_mode || '').toLowerCase() === 'responses'){
    const { askWithResponses } = require('./responses_adapter');

    const ctx = loadContext(cfg, userId, chatId);
    const rollingMax = (cfg.memory && cfg.memory.rolling_max_turns) || 6;
    const ctxRolling = ctx.slice(-rollingMax * 2);
    console.log(`[ROLLING DEBUG] Total mensajes cargados: ${ctx.length}, Enviando al LLM: ${ctxRolling.length}, Rolling max turnos: ${rollingMax}`);
    const turnCount = loadTurnCount(cfg, userId, chatId);
    const maxChatInteractions = cfg.memory?.max_chat_interactions || 0;

    // Lógica para el límite de interacciones
    if (maxChatInteractions > 0 && turnCount >= maxChatInteractions) {
      return { mode: 'responses', answer: 'Este chat ha alcanzado el límite máximo de interacciones. Por favor, inicia un nuevo chat para continuar o resume la conversación actual.', usage: null };
    }

    // Advertencia antes de alcanzar el límite
    let warningMessage = '';
    if (maxChatInteractions > 0 && turnCount >= maxChatInteractions - 3 && turnCount < maxChatInteractions) {
      const remainingTurns = maxChatInteractions - turnCount;
      warningMessage = `\n\n⚠️ Advertencia: Quedan ${remainingTurns} interacciones en este chat. Considera iniciar uno nuevo pronto.`;
    }
    const hits = (cfg.anchored_mode ? collectKnowledgeHits(question) : []);
    
    // Usar el nuevo sistema RAG para archivos adjuntos
    const previews = await processAttachmentsWithRAG(attachments, userId, `session_${userId}_${Date.now()}`, {
      maxChars: (cfg.knowledge && cfg.knowledge.maxCharsPerFile) || 7000,
      useRAG: cfg.enable_file_search && cfg.user_documents?.allow_temporary,
      autoUpload: true
    });
    
    const questionPlus =
      (question || '').toString() +
      (hits.length ? `\n\n[Fragmentos relevantes]\n${hits.map(h=>`Archivo:${h.file}\n${h.preview}`).join('\n\n---\n\n')}` : '') +
      (previews ? `\n\n${previews}` : '');

    const fixedKnowledge = loadFixedKnowledge();
  const messages = [
    ...fixedKnowledge,
    ...makeMessages(systemPromptWithContext, ctxRolling, questionPlus)
  ];
    // Render simple de messages a texto plano para Responses API
    const inputText = messages.map(m => `${m.role.toUpperCase()}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n\n');

    const result = await askWithResponses({ inputText, config: cfg });
    let text = result?.text || '[Sin respuesta generada]';
    const tokenUsage = result?.usage || result?.raw?.usage || null;
    
    // Log para debugging
    console.log('[Engine] Token usage capturado:', JSON.stringify(tokenUsage));
    
    if (hits.length) { text = text + renderAnchors(hits); }
    
    // Procesar citas normativas y generar Anexo Normativo Documental automático
    let normativeAnnex = null;
    try {
      const citationResult = processNormativeCitations(text);
      if (citationResult && citationResult.hasResults) {
        normativeAnnex = generateNormativeAnnex(citationResult.resolved);
        console.log(`[Normative Citations] Procesadas ${citationResult.total} citas, ${citationResult.resolved.length} resueltas`);
      }
    } catch (citationError) {
      console.error('[Normative Citations] Error procesando citas:', citationError.message);
    }
    
    // Añadir el mensaje de advertencia al final de la respuesta si existe
    if (warningMessage) { text += warningMessage; }
    // Descontar créditos basado en tokens
    let creditConsumption = null;
    try {
      if (tokenUsage && tokenUsage.input_tokens && tokenUsage.output_tokens) {
        const deductResult = creditManager.deductCreditsForQuery(userId, tokenUsage, chatId);
        creditConsumption = deductResult.consumption;
      }
    } catch (creditError) {
      console.error('[Engine] Error al descontar créditos:', creditError.message);
      // Si no tiene créditos suficientes, retornar error
      if (creditError.message.includes('insuficientes')) {
        return { mode:'responses', answer: '⚠️ Créditos insuficientes. Por favor, recarga tu cuenta para continuar usando LexCode.', error: 'insufficient_credits' };
      }
    }
    
    try { 
      saveTurn(cfg, userId, chatId, question || '', text, tokenUsage); 
      incrementInteractionCount(userId, chatId);
    } catch {}
    const finalInteractionStatus = getInteractionStatus(userId, chatId);
    return { 
      mode:'responses', 
      answer: text, 
      usage: tokenUsage, 
      interactionStatus: finalInteractionStatus, 
      creditConsumption: creditConsumption,
      normativeAnnex: normativeAnnex  // Anexo Normativo Documental automático
    };
  }


  // Modo Chat Completions clásico
  const ctx = loadContext(cfg, userId, chatId);
  const rollingMax = (cfg.memory && cfg.memory.rolling_max_turns) || 6;
  const ctxRolling = ctx.slice(-rollingMax * 2);
  console.log(`[ROLLING DEBUG] Total mensajes cargados: ${ctx.length}, Enviando al LLM: ${ctxRolling.length}, Rolling max turnos: ${rollingMax}`);
  const interactionStatus = getInteractionStatus(userId, chatId);
  const maxChatInteractions = cfg.memory?.max_chat_interactions || 0;

  // Lógica para el límite de interacciones
  if (interactionStatus.isLimitReached) {
    return { mode: 'chat', answer: 'Este chat ha alcanzado el límite máximo de interacciones. Por favor, inicia un nuevo chat para continuar o resume la conversación actual.', usage: null, interactionStatus };
  }

  // Advertencia antes de alcanzar el límite
  let warningMessage = '';
  if (interactionStatus.isNearLimit) {
    warningMessage = `\n\n⚠️ Advertencia: Quedan ${interactionStatus.remaining} interacciones en este chat. Considera iniciar uno nuevo pronto.`;
  }
  const hits = (cfg.anchored_mode ? collectKnowledgeHits(question) : []);
  const previews = renderAttachmentPreviews(attachments, { maxChars: (cfg.knowledge && cfg.knowledge.maxCharsPerFile) || 7000 });
  const questionPlus =
    (question || '').toString() +
    (hits.length ? `\n\n[Fragmentos relevantes]\n${hits.map(h=>`Archivo:${h.file}\n${h.preview}`).join('\n\n---\n\n')}` : '') +
    previews;

  const fixedKnowledge = loadFixedKnowledge();
  const messages = [
    ...fixedKnowledge,
    ...makeMessages(systemPrompt, ctxRolling, questionPlus)
  ];
  const chatResponse = await chat(cfg, messages);
  const modelUsed = chatResponse.model || cfg.modelo; // Capturar el modelo usado por el router
  let text = chatResponse.content;
  const tokenUsage = chatResponse.usage;
  
  // Log para debugging
  console.log('[Engine] Token usage capturado (chat):', JSON.stringify(tokenUsage));
  
  if (hits.length) { text = text + renderAnchors(hits); }
  // Añadir el mensaje de advertencia al final de la respuesta si existe
  if (warningMessage) { text += warningMessage; }
  // Descontar créditos basado en tokens
  let creditConsumption = null;
  try {
    if (tokenUsage && tokenUsage.input_tokens && tokenUsage.output_tokens) {
      const deductResult = creditManager.deductCreditsForQuery(userId, tokenUsage, chatId);
      creditConsumption = deductResult.consumption;
    }
  } catch (creditError) {
    console.error('[Engine] Error al descontar créditos:', creditError.message);
    // Si no tiene créditos suficientes, retornar error
    if (creditError.message.includes('insuficientes')) {
      return { mode:'chat', answer: '⚠️ Créditos insuficientes. Por favor, recarga tu cuenta para continuar usando LexCode.', error: 'insufficient_credits' };
    }
  }
  
  try { 
    saveTurn(cfg, userId, chatId, question || '', text, tokenUsage); 
    incrementInteractionCount(userId, chatId);
  } catch {}
  const finalInteractionStatus = getInteractionStatus(userId, chatId);
  return { mode:'chat', answer: text, usage: tokenUsage, model: modelUsed, interactionStatus: finalInteractionStatus, creditConsumption: creditConsumption };
}

/**
 * answerStream - Versión con streaming de la función answer
 * Genera respuestas en tiempo real usando SSE
 * @param {object} params
 *   - question {string} Pregunta del usuario
 *   - userId {string} ID del usuario
 *   - attachments {Array} Archivos adjuntos
 *   - chatId {string} ID del chat
 *   - instanceConfig {object} Configuración de instancia (opcional)
 *   - onDelta {function} Callback para cada fragmento de texto
 *   - onComplete {function} Callback al completar
 *   - onError {function} Callback en caso de error
 */
async function answerStream({
  question = '',
  userId = 'anon',
  attachments = [],
  chatId = 'default',
  instanceConfig = null,
  onDelta = () => {},
  onComplete = () => {},
  onError = () => {}
}) {
  const cfg = instanceConfig ? instanceConfig.bot_config : (getConfig() || {});
  const systemPrompt = instanceConfig ? instanceConfig.system_prompt : buildSystemPrompt();
  
  // Solo soportamos streaming en modo Responses API
  if ((cfg.api_mode || '').toLowerCase() !== 'responses') {
    throw new Error('Streaming solo está disponible en modo Responses API');
  }

  // Inyectar contexto temporal y geográfico DINÁMICO
  const contextBlock = buildContextBlock(cfg);
  
  // Inyectar contexto del usuario (nombre)
  let userContextBlock = '';
  try {
    const user = auth.getUser(userId);
    if (user && user.username) {
      userContextBlock = buildUserContextBlock({ name: user.username });
    }
  } catch (e) {
    console.log('[Context Injector] No se pudo obtener info del usuario:', e.message);
  }
  
  // Inyectar contexto general del usuario
  let generalContextBlock = '';
  try {
    const generalContext = getGeneralContext(userId);
    if (generalContext) {
      generalContextBlock = buildGeneralContextBlock(generalContext);
    }
  } catch (e) {
    console.log('[Context Injector] No se pudo obtener contexto general:', e.message);
  }
  
  // Inyectar archivos de configuración de la instancia
  let instanceFilesContext = '';
  try {
    instanceFilesContext = buildInstanceFilesContext({
      maxCharsPerFile: cfg.instance_files?.maxCharsPerFile || 50000,
      maxTotalChars: cfg.instance_files?.maxTotalChars || 200000
    });
  } catch (e) {
    console.log('[Instance Files] Error cargando archivos de configuración:', e.message);
  }
  
  const systemPromptWithContext = systemPrompt + contextBlock + userContextBlock + generalContextBlock + instanceFilesContext;

  const { askWithResponsesStream } = require('./responses_adapter');

  const ctx = loadContext(cfg, userId, chatId);
  const rollingMax = (cfg.memory && cfg.memory.rolling_max_turns) || 6;
  const ctxRolling = ctx.slice(-rollingMax * 2);
  const turnCount = loadTurnCount(cfg, userId, chatId);
  const maxChatInteractions = cfg.memory?.max_chat_interactions || 0;

  // Verificar límite de interacciones
  if (maxChatInteractions > 0 && turnCount >= maxChatInteractions) {
    onDelta('Este chat ha alcanzado el límite máximo de interacciones. Por favor, inicia un nuevo chat.');
    onComplete({ text: 'Límite alcanzado', usage: null });
    return { mode: 'responses-stream', answer: 'Límite alcanzado', usage: null };
  }

  const hits = (cfg.anchored_mode ? collectKnowledgeHits(question) : []);
  
  // Procesar archivos adjuntos
  const previews = await processAttachmentsWithRAG(attachments, userId, `session_${userId}_${Date.now()}`, {
    maxChars: (cfg.knowledge && cfg.knowledge.maxCharsPerFile) || 7000,
    useRAG: cfg.enable_file_search && cfg.user_documents?.allow_temporary,
    autoUpload: true
  });
  
  const questionPlus =
    (question || '').toString() +
    (hits.length ? `\n\n[Fragmentos relevantes]\n${hits.map(h=>`Archivo:${h.file}\n${h.preview}`).join('\n\n---\n\n')}` : '') +
    (previews ? `\n\n${previews}` : '');

  const fixedKnowledge = loadFixedKnowledge();
  const messages = [
    ...fixedKnowledge,
    ...makeMessages(systemPromptWithContext, ctxRolling, questionPlus)
  ];
  
  // Convertir messages a texto plano para Responses API
  const inputText = messages.map(m => `${m.role.toUpperCase()}: ${typeof m.content === 'string' ? m.content : JSON.stringify(m.content)}`).join('\n\n');

  console.log('[Engine Stream] Iniciando streaming para usuario:', userId);

  // === VERIFICAR CACHÉ EN REDIS ANTES DE CONSULTAR OPENAI ===
  const cacheManager = require('./cache_manager_v2');
  const cachedResponse = await cacheManager.getFromCache(question, userId, cfg);
  
  if (cachedResponse) {
    console.log('[Engine Stream] 🎯 RESPUESTA RECUPERADA DEL CACHÉ (Redis)');
    const cachedText = cachedResponse.text || '';
    onDelta(cachedText);
    onComplete({
      text: cachedText,
      usage: cachedResponse.usage || null,
      interactionStatus: cachedResponse.interactionStatus || null,
      creditConsumption: { tokens: 0, cost: 0, message: 'Respuesta desde caché (sin costo)' },
      normativeAnnex: cachedResponse.normativeAnnex || null,
      fromCache: true
    });
    return { mode: 'responses-stream-cached', answer: cachedText, usage: null, fromCache: true };
  }
  // === FIN VERIFICACIÓN DE CACHÉ ===

  try {
    const result = await askWithResponsesStream({
      inputText,
      config: cfg,
      onDelta: (delta) => {
        onDelta(delta);
      },
      onComplete: async (completionData) => {
        const { text, usage } = completionData;
        
        // Guardar turno en memoria
        try {
          // Procesar citas normativas primero para obtener el anexo
          let normativeAnnexForStorage = null;
          try {
            const citationResult = processMessageWithDualAnnex(text);
            if (citationResult && citationResult.hasResults && citationResult.anexoUsuario) {
              normativeAnnexForStorage = citationResult.anexoUsuario;
            }
          } catch (e) {
            console.error('[Engine Stream] Error procesando citas para almacenamiento:', e);
          }
          
          saveTurn(cfg, userId, chatId, question || '', text, usage, normativeAnnexForStorage);
          incrementInteractionCount(userId, chatId);
        } catch (e) {
          console.error('[Engine Stream] Error guardando turno:', e);
        }
        
        // Descontar créditos
        let creditConsumption = null;
        try {
          if (usage && usage.input_tokens && usage.output_tokens) {
            const deductResult = creditManager.deductCreditsForQuery(userId, usage, chatId);
            creditConsumption = deductResult.consumption;
          }
        } catch (creditError) {
          console.error('[Engine Stream] Error al descontar créditos:', creditError.message);
        }
        
        // Procesar citas normativas y generar Anexo Normativo consolidado
        let normativeAnnexUsuario = null;
        
        try {
          const citationResult = processMessageWithDualAnnex(text);
          if (citationResult && citationResult.hasResults) {
            normativeAnnexUsuario = citationResult.anexoUsuario;
            console.log(`[Normative Citations Stream] Procesadas ${citationResult.total} citas, ${citationResult.resolved.length} resueltas`);
            console.log('[Engine Stream] Anexo normativo consolidado para memoria del modelo');
          }
        } catch (citationError) {
          console.error('[Engine Stream] Error procesando citas normativas:', citationError.message);
        }
        
        const finalInteractionStatus = getInteractionStatus(userId, chatId);
        
        // === GUARDAR RESPUESTA EN CACHE (REDIS) ===
        try {
          await cacheManager.setInCache(question, {
            text: text,
            usage: usage,
            interactionStatus: finalInteractionStatus,
            creditConsumption: creditConsumption,
            normativeAnnex: normativeAnnexUsuario,
            timestamp: new Date().toISOString()
          }, userId, cfg);
          console.log('[Engine Stream] 💾 Respuesta guardada en caché (Redis)');
        } catch (cacheError) {
          console.error('[Engine Stream] Error guardando en caché:', cacheError.message);
        }
        // === FIN GUARDADO EN CACHE ===
        
        onComplete({
          text: text,
          usage,
          interactionStatus: finalInteractionStatus,
          creditConsumption,
          normativeAnnex: normativeAnnexUsuario
        });
      },
      onError: (error) => {
        console.error('[Engine Stream] Error:', error);
        onError(error);
      }
    });

    return {
      mode: 'responses-stream',
      answer: result.text,
      usage: result.usage
    };

  } catch (error) {
    console.error('[Engine Stream] Error fatal:', error);
    onError(error);
    throw error;
  }
}

module.exports = {
  getConfig,
  getBuilder,
  buildSystemPrompt,
  answer,
  answerStream,
  reload
};

const { generarAnexoTexto } = require('./generar_anexo');

if (typeof anexo_modelo !== 'undefined' && anexo_modelo && anexo_modelo.length > 0) {
  const textoAnexo = generarAnexoTexto(anexo_modelo);
  context.push({ role: "user", content: textoAnexo });
}

