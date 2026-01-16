// engine/responses_adapter.js — Responses API adapter (Step 2: web_search + file_search toggles + STREAMING)
// ACTUALIZADO: Integración de validación de URLs BCN para blindar citas normativas
const OpenAI = require("openai");
const { cleanMarkdown } = require('./markdown_cleaner');
const { processResponseWithUrlValidation } = require('./url_validator');

function getOpenAIClient(config) {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: config.openai_timeout_ms || 100000, // Nuevo timeout configurable, 100s por defecto
  });
}

/** Local function executors registry */
const navigateWebExec = require('./tools/navigate_web');
// const { literal_search } = require('./tools/literal_search'); // DESACTIVADO: No compatible con Responses API

async function executeToolCalls(resp, config){
  // Supports Responses API required_action .
  // Finds tool calls and executes locally, then submits tool outputs until completion.
  if (!resp) return resp;
  if (!resp.required_action || !resp.required_action.submit_tool_outputs) return resp;

  // Collect outputs
  const calls = resp.required_action.submit_tool_outputs.tool_calls || [];
  const outputs = [];
  for (const call of calls) {
    const name = call.function?.name;
    let args = {};
    try { args = JSON.parse(call.function?.arguments || '{}'); } catch {}
    let result = { error: `Unknown tool: ${name}` };
    if (name === 'navigate_web') {
      try { result = await navigateWebExec(args, config); } catch(e){ result = { error: String(e.message || e) }; }
    }
    // if (name === 'literal_search') {
    //   try { result = await literal_search(args, config); } catch(e){ result = { error: String(e.message || e) }; }
    // }
    outputs.push({ tool_call_id: call.id, output: JSON.stringify(result) });
  }

  const client = getOpenAIClient(config);
  const next = await client.responses.submitToolOutputs({
    response_id: resp.id,
    tool_outputs: outputs
  });

  // Recurse if more actions needed
  return await executeToolCalls(next, config);
}


/**
 * Builds a small policy header to steer citations/domains when web search is enabled.
 */
function buildPolicyPrefix(config = {}) {
  const wantsCitations = config.enforce_citations_when_web === true;
  const domains = Array.isArray(config.web_search_allow_domains) ? config.web_search_allow_domains : [];
  const hasDomains = domains.length > 0;

  if (!wantsCitations && !hasDomains) return '';

  const lines = [];
  if (hasDomains) {
    lines.push(`When using web_search, prefer sources from this allowlist (if relevant): ${domains.join(', ')}.`);
  }
  if (wantsCitations) {
    lines.push('If any web_search results are used, include explicit sources with site name and publication date in the answer.');
  }
  // Keep short to avoid changing behavior too much
  return `[POLICY]\n${lines.join(' ')}\n[/POLICY]\n`;
}

/**
 * Derive tools from config flags (web_search, file_search).
 */
function deriveToolsFromConfig(config = {}) {
  const tools = [];
  if (config.enable_web_search) { 
    tools.push({ type: 'web_search' }); 
    console.log('[deriveToolsFromConfig] ✅ web_search HABILITADO (NO preview)');
  }
  if (config.enable_file_search) {
    const vs = Array.isArray(config.vector_store_ids) ? config.vector_store_ids : [];
    if (vs.length > 0) tools.push({ type: 'file_search', vector_store_ids: vs });
    else tools.push({ type: 'file_search' });
  }
  if (config.web_navigation && config.web_navigation.enabled) {
    tools.push({
      type: 'function',
      name: 'navigate_web',
      description: 'Crawlea páginas dentro de dominios permitidos y devuelve resúmenes (URL, título, extracto).',
      parameters: {
        type: 'object',
        properties: { url: { type: 'string' } },
        required: ['url']
      }
    });
  }
  // DESACTIVADO: literal_search no es compatible con Responses API
  // if (config.enable_literal_search) {
  //   tools.push({ ... });
  // }
  return tools;
}

/**
 * askWithResponses (ORIGINAL - SIN STREAMING)
 * ACTUALIZADO: Ahora incluye file_search_call.results y validación de URLs
 * @param {object} params
 *   - inputText {string} Texto ya construido (system + contexto + pregunta)
 *   - config {object} Config global (modelo, flags, etc.)
 *   - tools {Array} Lista de tools adicionales (se fusiona con las derivadas por flags)
 * @returns {Promise<{ text: string, raw: any, meta: object }>}
 */
async function askWithResponses({ inputText = '', config = {}, tools = [] }) {
  // 1) Policy prefix (citations / allowlist) — only if web_search enabled
  let finalInput = inputText;
  if (config && (config.enable_web_search || config.enable_file_search)) {
    const policy = buildPolicyPrefix(config);
    if (policy) finalInput = policy + inputText;
  }

  // 2) Tools (flags -> derive) + extras
  const derived = deriveToolsFromConfig(config);
  const enabledTools = [...derived, ...((Array.isArray(tools) ? tools : []))];

  // 3) Build payload
  // NUEVO: Agregar include para obtener resultados de file_search
  const payload = {
    model: (config && config.model) || 'gpt-4.1',
    input: finalInput,
  };
  
  if (enabledTools.length > 0) {
    payload.tools = enabledTools;
    // Log detallado de las herramientas que se envían a la API
    console.log('[Responses API] Tools enviadas a OpenAI:', JSON.stringify(enabledTools.map(t => t.type || t.name)));
    // By default let the model choose; callers can override by adding tool_choice in future steps
    // payload.tool_choice = 'auto';
  }
  
  // NUEVO: Incluir resultados de file_search para validación de URLs
  // Solo si file_search está habilitado y la validación de URLs está activa
  const enableUrlValidation = config.enable_url_validation !== false; // Por defecto activo
  if (config.enable_file_search && enableUrlValidation) {
    payload.include = ['file_search_call.results'];
    console.log('[Responses API] URL validation enabled - including file_search_call.results');
  }

  // 4) Call Responses API
  const client = getOpenAIClient(config);
  let resp = await client.responses.create(payload);
  resp = await executeToolCalls(resp, config);

  // 5) Extract usage information (Responses API structure)
  const usage = resp.usage || null;
  
  // Log para debugging
  if (usage) {
    console.log('[Responses API] Token usage:', JSON.stringify(usage));
  } else {
    console.warn('[Responses API] No usage data returned');
  }

  // 6) Obtener texto raw
  const rawText = resp.output_text || '';
  
  // 7) NUEVO: Validar y corregir URLs si está habilitado
  let finalText = rawText;
  let urlValidationResult = null;
  
  if (config.enable_file_search && enableUrlValidation) {
    try {
      urlValidationResult = processResponseWithUrlValidation(resp, rawText);
      finalText = urlValidationResult.text;
      
      if (urlValidationResult.urlValidation.performed) {
        console.log('[Responses API] URL validation stats:', JSON.stringify(urlValidationResult.urlValidation.stats));
      }
    } catch (validationError) {
      console.error('[Responses API] URL validation error (continuing with original text):', validationError);
      // En caso de error, continuar con el texto original
      finalText = rawText;
    }
  }
  
  // 8) Limpiar Markdown antes de enviar al usuario
  const cleanedText = cleanMarkdown(finalText);

  return {
    text: cleanedText,
    raw: resp,
    usage: usage,
    urlValidation: urlValidationResult?.urlValidation || null,
    meta: { 
      provider: 'responses', 
      tools: enabledTools, 
      markdown_cleaned: true,
      url_validation_enabled: enableUrlValidation && config.enable_file_search
    }
  };
}

/**
 * askWithResponsesStream (NUEVO - CON STREAMING)
 * ACTUALIZADO: Incluye validación de URLs al final del stream
 * Genera respuestas en streaming usando Server-Sent Events
 * @param {object} params
 *   - inputText {string} Texto ya construido (system + contexto + pregunta)
 *   - config {object} Config global (modelo, flags, etc.)
 *   - tools {Array} Lista de tools adicionales
 *   - onDelta {function} Callback llamado con cada fragmento de texto
 *   - onComplete {function} Callback llamado al completar con el resultado final
 *   - onError {function} Callback llamado en caso de error
 * @returns {Promise<{ text: string, usage: object }>}
 */
async function askWithResponsesStream({ 
  inputText = '', 
  config = {}, 
  tools = [],
  onDelta = () => {},
  onComplete = () => {},
  onError = () => {}
}) {
  // 1) Policy prefix (citations / allowlist) — only if web_search enabled
  let finalInput = inputText;
  if (config && (config.enable_web_search || config.enable_file_search)) {
    const policy = buildPolicyPrefix(config);
    if (policy) finalInput = policy + inputText;
  }

  // 2) Tools (flags -> derive) + extras
  const derived = deriveToolsFromConfig(config);
  const enabledTools = [...derived, ...((Array.isArray(tools) ? tools : []))];

  // 3) Build payload con stream: true
  // NUEVO: Agregar include para obtener resultados de file_search
  const enableUrlValidation = config.enable_url_validation !== false;
  
  const payload = {
    model: (config && config.model) || 'gpt-4.1',
    input: finalInput,
    stream: true, // ← HABILITAR STREAMING
  };
  
  if (enabledTools.length > 0) {
    payload.tools = enabledTools;
    // Log detallado de las herramientas que se envían a la API (streaming)
    console.log('[Responses API Stream] Tools enviadas a OpenAI:', JSON.stringify(enabledTools.map(t => t.type || t.name)));
  }
  
  // NUEVO: Incluir resultados de file_search para validación de URLs
  if (config.enable_file_search && enableUrlValidation) {
    payload.include = ['file_search_call.results'];
    console.log('[Responses API Stream] URL validation enabled - including file_search_call.results');
  }

  const client = getOpenAIClient(config);
  
  let fullText = '';
  let usage = null;
  let responseId = null;
  let fileSearchResults = []; // NUEVO: Almacenar resultados de file_search

  try {
    console.log('[Responses API Stream] Iniciando streaming...');
    
    // 4) Crear stream
    const stream = await client.responses.create(payload);

    // 5) Procesar eventos del stream
    for await (const event of stream) {
      // Guardar el ID de la respuesta
      if (event.response?.id) {
        responseId = event.response.id;
      }

      // Evento: fragmento de texto (delta)
      if (event.type === 'response.output_text.delta') {
        const delta = event.delta || '';
        fullText += delta;
        onDelta(delta);
      }

      // Evento: respuesta completada
      if (event.type === 'response.completed') {
        usage = event.response?.usage || null;
        if (usage) {
          console.log('[Responses API Stream] Token usage:', JSON.stringify(usage));
        }
        
        // NUEVO: Extraer resultados de file_search del evento completed
        if (event.response?.output && Array.isArray(event.response.output)) {
          for (const item of event.response.output) {
            if (item.type === 'file_search_call' && item.search_results) {
              fileSearchResults = fileSearchResults.concat(item.search_results);
            }
          }
        }
      }
      
      // NUEVO: Capturar resultados de file_search cuando llegan
      if (event.type === 'response.file_search_call.results') {
        if (event.results && Array.isArray(event.results)) {
          fileSearchResults = fileSearchResults.concat(event.results);
        }
      }

      // Evento: error
      if (event.type === 'error') {
        console.error('[Responses API Stream] Error event:', event);
        onError(event);
      }

      // Eventos de herramientas (file_search, web_search) - informativo
      if (event.type === 'response.file_search_call.searching') {
        onDelta('\n🔍 Buscando en documentos...\n');
      }
      if (event.type === 'response.web_search_call.searching') {
        onDelta('\n🌐 Buscando en la web...\n');
      }
    }

    // 6) NUEVO: Validar URLs antes de limpiar Markdown
    let finalText = fullText;
    let urlValidationResult = null;
    
    if (config.enable_file_search && enableUrlValidation && fileSearchResults.length > 0) {
      try {
        // Construir objeto similar a la respuesta para el validador
        const mockResponse = {
          output: [{
            type: 'file_search_call',
            search_results: fileSearchResults
          }]
        };
        
        urlValidationResult = processResponseWithUrlValidation(mockResponse, fullText);
        finalText = urlValidationResult.text;
        
        if (urlValidationResult.urlValidation.performed) {
          console.log('[Responses API Stream] URL validation stats:', JSON.stringify(urlValidationResult.urlValidation.stats));
        }
      } catch (validationError) {
        console.error('[Responses API Stream] URL validation error (continuing with original text):', validationError);
        finalText = fullText;
      }
    }

    // 7) Limpiar Markdown del texto final
    const cleanedText = cleanMarkdown(finalText);

    // 8) Llamar callback de completado
    onComplete({
      text: cleanedText,
      usage: usage,
      responseId: responseId,
      urlValidation: urlValidationResult?.urlValidation || null
    });

    return {
      text: cleanedText,
      usage: usage,
      responseId: responseId,
      urlValidation: urlValidationResult?.urlValidation || null,
      meta: { 
        provider: 'responses-stream', 
        tools: enabledTools,
        url_validation_enabled: enableUrlValidation && config.enable_file_search
      }
    };

  } catch (error) {
    console.error('[Responses API Stream] Error:', error);
    onError(error);
    throw error;
  }
}

/**
 * Función auxiliar para crear un generador de streaming
 * Útil para usar con Express SSE
 * ACTUALIZADO: Incluye validación de URLs al final
 */
async function* createResponseStream({ inputText = '', config = {}, tools = [] }) {
  let finalInput = inputText;
  if (config && (config.enable_web_search || config.enable_file_search)) {
    const policy = buildPolicyPrefix(config);
    if (policy) finalInput = policy + inputText;
  }

  const derived = deriveToolsFromConfig(config);
  const enabledTools = [...derived, ...((Array.isArray(tools) ? tools : []))];
  const enableUrlValidation = config.enable_url_validation !== false;

  const payload = {
    model: (config && config.model) || 'gpt-4.1',
    input: finalInput,
    stream: true,
  };
  if (enabledTools.length > 0) {
    payload.tools = enabledTools;
  }
  
  // NUEVO: Incluir resultados de file_search
  if (config.enable_file_search && enableUrlValidation) {
    payload.include = ['file_search_call.results'];
  }

  const client = getOpenAIClient(config);
  const stream = await client.responses.create(payload);

  let fullText = '';
  let usage = null;
  let fileSearchResults = [];

  for await (const event of stream) {
    if (event.type === 'response.output_text.delta') {
      const delta = event.delta || '';
      fullText += delta;
      yield { type: 'delta', delta: delta };
    }

    if (event.type === 'response.completed') {
      usage = event.response?.usage || null;
      
      // Extraer resultados de file_search
      if (event.response?.output && Array.isArray(event.response.output)) {
        for (const item of event.response.output) {
          if (item.type === 'file_search_call' && item.search_results) {
            fileSearchResults = fileSearchResults.concat(item.search_results);
          }
        }
      }
    }
    
    if (event.type === 'response.file_search_call.results') {
      if (event.results && Array.isArray(event.results)) {
        fileSearchResults = fileSearchResults.concat(event.results);
      }
    }

    if (event.type === 'response.file_search_call.searching') {
      yield { type: 'status', message: 'Buscando en documentos...' };
    }

    if (event.type === 'response.web_search_call.searching') {
      yield { type: 'status', message: 'Buscando en la web...' };
    }

    if (event.type === 'error') {
      yield { type: 'error', error: event };
    }
  }

  // NUEVO: Validar URLs antes de emitir resultado final
  let finalText = fullText;
  let urlValidationResult = null;
  
  if (config.enable_file_search && enableUrlValidation && fileSearchResults.length > 0) {
    try {
      const mockResponse = {
        output: [{
          type: 'file_search_call',
          search_results: fileSearchResults
        }]
      };
      
      urlValidationResult = processResponseWithUrlValidation(mockResponse, fullText);
      finalText = urlValidationResult.text;
    } catch (e) {
      console.error('[createResponseStream] URL validation error:', e);
    }
  }

  // Emitir evento final con el texto completo y usage
  const cleanedText = cleanMarkdown(finalText);
  yield { 
    type: 'done', 
    text: cleanedText, 
    usage: usage,
    urlValidation: urlValidationResult?.urlValidation || null
  };
}

module.exports = { 
  askWithResponses, 
  askWithResponsesStream,
  createResponseStream,
  deriveToolsFromConfig, 
  buildPolicyPrefix 
};
