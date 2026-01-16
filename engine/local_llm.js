/**
 * Módulo de Integración con IA Local (Ollama)
 * 
 * Este módulo proporciona integración con modelos de IA locales usando Ollama.
 * Se utiliza principalmente para la clasificación de intención (SIMPLE vs COMPLEX)
 * para eliminar costos de API en esta operación.
 * 
 * Características:
 * - Integración con Ollama API local
 * - Fallback automático a OpenAI si el modelo local falla
 * - Monitoreo de salud del servicio local
 * - Logging detallado para debugging
 */

const axios = require('axios');

// Configuración por defecto de Ollama
const DEFAULT_OLLAMA_HOST = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3.2:3b';
const REQUEST_TIMEOUT = 30000; // 30 segundos

// Estado del servicio local
let localServiceAvailable = null; // null = no verificado, true = disponible, false = no disponible
let lastHealthCheck = 0;
const HEALTH_CHECK_INTERVAL = 60000; // Verificar cada 60 segundos

/**
 * Verifica si el servicio de Ollama está disponible y funcionando.
 */
async function checkLocalServiceHealth(config) {
  const ollamaHost = config.local_llm_host || DEFAULT_OLLAMA_HOST;
  
  try {
    const response = await axios.get(`${ollamaHost}/api/tags`, {
      timeout: 5000
    });
    
    if (response.status === 200) {
      console.log('[Local LLM] ✓ Servicio Ollama disponible');
      localServiceAvailable = true;
      lastHealthCheck = Date.now();
      return true;
    }
  } catch (error) {
    console.warn('[Local LLM] ⚠ Servicio Ollama no disponible:', error.message);
    localServiceAvailable = false;
    lastHealthCheck = Date.now();
    return false;
  }
  
  return false;
}

/**
 * Verifica si es necesario hacer un health check.
 */
function shouldCheckHealth() {
  return localServiceAvailable === null || (Date.now() - lastHealthCheck > HEALTH_CHECK_INTERVAL);
}

/**
 * Llama al modelo local de Ollama para generar una respuesta.
 */
async function callLocalModel(config, prompt, options = {}) {
  const ollamaHost = config.local_llm_host || DEFAULT_OLLAMA_HOST;
  const model = config.local_llm_model || DEFAULT_MODEL;
  const temperature = options.temperature !== undefined ? options.temperature : 0;
  const maxTokens = options.maxTokens || 100;
  
  try {
    const startTime = Date.now();
    
    const response = await axios.post(`${ollamaHost}/api/generate`, {
      model: model,
      prompt: prompt,
      stream: false,
      options: {
        temperature: temperature,
        num_predict: maxTokens,
        stop: ['\n\n', 'Pregunta:', 'Usuario:']
      }
    }, {
      timeout: REQUEST_TIMEOUT
    });
    
    const latency = Date.now() - startTime;
    
    if (response.data && response.data.response) {
      console.log(`[Local LLM] ✓ Modelo: ${model}, Latencia: ${latency}ms, Tokens: ~${response.data.response.length / 4}`);
      
      return {
        content: response.data.response.trim(),
        model: model,
        latency: latency,
        local: true,
        usage: {
          prompt_tokens: Math.ceil(prompt.length / 4),
          completion_tokens: Math.ceil(response.data.response.length / 4),
          total_tokens: Math.ceil((prompt.length + response.data.response.length) / 4)
        }
      };
    }
    
    throw new Error('Respuesta vacía del modelo local');
    
  } catch (error) {
    console.error('[Local LLM] ✗ Error al llamar al modelo local:', error.message);
    
    // Marcar servicio como no disponible
    localServiceAvailable = false;
    lastHealthCheck = Date.now();
    
    return {
      content: null,
      error: error.message,
      local: true,
      failed: true
    };
  }
}

/**
 * Clasifica la intención del usuario usando el modelo local.
 * Si el modelo local no está disponible, retorna null para usar fallback.
 */
async function classifyIntentLocal(config, userQuestion) {
  // Verificar si el modelo local está habilitado
  if (config.enable_local_llm !== true) {
    return null; // Usar fallback a OpenAI
  }
  
  // Verificar salud del servicio si es necesario
  if (shouldCheckHealth()) {
    const isHealthy = await checkLocalServiceHealth(config);
    if (!isHealthy) {
      console.log('[Local LLM] Usando fallback a OpenAI (servicio no disponible)');
      return null;
    }
  }
  
  // Si sabemos que el servicio no está disponible, usar fallback inmediatamente
  if (localServiceAvailable === false) {
    return null;
  }
  
  // Validación de longitud de pregunta
  const maxQuestionLength = config.router_max_question_length || 1000;
  let questionToClassify = userQuestion;
  
  if (userQuestion.length > maxQuestionLength) {
    console.log(`[Local LLM] Pregunta truncada de ${userQuestion.length} a ${maxQuestionLength} caracteres`);
    questionToClassify = userQuestion.slice(0, maxQuestionLength);
  }
  
  // Prompt optimizado para clasificación con modelo local
  const classificationPrompt = `Eres un clasificador de intención. Analiza la siguiente pregunta y clasifícala como SIMPLE o COMPLEX.

SIMPLE: Saludos, agradecimientos, despedidas, preguntas casuales, preguntas sobre el bot.
Ejemplos:
- "Hola, ¿cómo estás?"
- "Gracias"
- "¿Qué puedes hacer?"

COMPLEX: Preguntas que requieren conocimiento jurídico, análisis legal, citación de normas.
Ejemplos:
- "¿Qué dice el artículo 1545 del Código Civil?"
- "¿Cuáles son los requisitos para un contrato válido?"
- "Explícame la prescripción adquisitiva"

Pregunta: "${questionToClassify}"

Clasificación (responde solo SIMPLE o COMPLEX):`;

  try {
    const result = await callLocalModel(config, classificationPrompt, {
      temperature: 0,
      maxTokens: 10
    });
    
    if (result.failed || !result.content) {
      console.log('[Local LLM] Clasificación falló, usando fallback a OpenAI');
      return null;
    }
    
    const classification = result.content.trim().toUpperCase();
    
    // Validación robusta de la respuesta
    if (classification.includes('SIMPLE')) {
      console.log(`[Local LLM] ✓ Clasificación: SIMPLE (Modelo: ${result.model}, Latencia: ${result.latency}ms, Costo: $0)`);
      return 'SIMPLE';
    } else if (classification.includes('COMPLEX')) {
      console.log(`[Local LLM] ✓ Clasificación: COMPLEX (Modelo: ${result.model}, Latencia: ${result.latency}ms, Costo: $0)`);
      return 'COMPLEX';
    }
    
    // Si la respuesta no es clara, usar fallback
    console.warn(`[Local LLM] ⚠ Clasificación ambigua: "${classification}", usando fallback a OpenAI`);
    return null;
    
  } catch (error) {
    console.error('[Local LLM] ✗ Error en clasificación local:', error.message);
    return null; // Usar fallback a OpenAI
  }
}

/**
 * Genera una respuesta simple usando el modelo local.
 * Si el modelo local no está disponible, retorna null para usar fallback.
 */
async function generateSimpleResponseLocal(config, messages) {
  // Verificar si el modelo local está habilitado para respuestas
  if (config.enable_local_llm !== true || config.local_llm_for_responses !== true) {
    return null; // Usar fallback a OpenAI
  }
  
  // Verificar salud del servicio
  if (localServiceAvailable === false) {
    return null;
  }
  
  // Construir prompt desde los mensajes
  let prompt = '';
  for (const msg of messages) {
    if (msg.role === 'system') {
      prompt += `Sistema: ${msg.content}\n\n`;
    } else if (msg.role === 'user') {
      prompt += `Usuario: ${msg.content}\n\n`;
    } else if (msg.role === 'assistant') {
      prompt += `Asistente: ${msg.content}\n\n`;
    }
  }
  prompt += 'Asistente:';
  
  try {
    const result = await callLocalModel(config, prompt, {
      temperature: 0.7,
      maxTokens: 200
    });
    
    if (result.failed || !result.content) {
      console.log('[Local LLM] Generación de respuesta falló, usando fallback a OpenAI');
      return null;
    }
    
    console.log(`[Local LLM] ✓ Respuesta generada (Modelo: ${result.model}, Latencia: ${result.latency}ms, Costo: $0)`);
    
    return {
      content: result.content,
      usage: result.usage,
      model: result.model,
      latency: result.latency,
      local: true
    };
    
  } catch (error) {
    console.error('[Local LLM] ✗ Error al generar respuesta local:', error.message);
    return null; // Usar fallback a OpenAI
  }
}

/**
 * Obtiene información sobre el estado del servicio local.
 */
function getLocalServiceStatus() {
  return {
    available: localServiceAvailable,
    lastCheck: lastHealthCheck,
    timeSinceLastCheck: lastHealthCheck > 0 ? Date.now() - lastHealthCheck : null
  };
}

module.exports = {
  classifyIntentLocal,
  generateSimpleResponseLocal,
  checkLocalServiceHealth,
  getLocalServiceStatus,
  callLocalModel
};

