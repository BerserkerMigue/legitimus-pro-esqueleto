const OpenAI = require('openai');
const crypto = require('crypto');
const { classifyIntentLocal, generateSimpleResponseLocal } = require('./local_llm');

// Inicializar cliente de OpenAI con configuración optimizada
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  maxRetries: 2,
  timeout: 60000,
});

// Modelos por defecto (fallback si no están en config.json)
const COMPLEX_MODEL_FALLBACK = "gpt-4.1"; 
const SIMPLE_MODEL_FALLBACK = "gpt-4o-mini";

// Sistema de caché en memoria para clasificaciones
// Estructura: { hash: { classification: 'SIMPLE'|'COMPLEX', timestamp: number } }
const classificationCache = new Map();
const CACHE_TTL_MS = 3600000; // 1 hora por defecto
const MAX_CACHE_SIZE = 1000; // Límite de entradas en caché

/**
 * Genera un hash de la pregunta normalizada para usar como clave de caché.
 */
function hashQuestion(question) {
  const normalized = question.toLowerCase().trim().replace(/\s+/g, ' ');
  return crypto.createHash('md5').update(normalized).digest('hex');
}

/**
 * Limpia entradas expiradas del caché.
 */
function cleanExpiredCache() {
  const now = Date.now();
  for (const [key, value] of classificationCache.entries()) {
    if (now - value.timestamp > CACHE_TTL_MS) {
      classificationCache.delete(key);
    }
  }
}

/**
 * Obtiene una clasificación del caché si existe y no ha expirado.
 */
function getCachedClassification(question) {
  cleanExpiredCache();
  const hash = hashQuestion(question);
  const cached = classificationCache.get(hash);
  
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    console.log(`[Router Cache] ✓ Hit para pregunta (hash: ${hash.slice(0, 8)})`);
    return cached.classification;
  }
  
  return null;
}

/**
 * Guarda una clasificación en el caché.
 */
function setCachedClassification(question, classification) {
  // Limitar tamaño del caché
  if (classificationCache.size >= MAX_CACHE_SIZE) {
    // Eliminar la entrada más antigua
    const firstKey = classificationCache.keys().next().value;
    classificationCache.delete(firstKey);
  }
  
  const hash = hashQuestion(question);
  classificationCache.set(hash, {
    classification,
    timestamp: Date.now()
  });
}

/**
 * Función interna para llamar a la API de Chat Completions de OpenAI.
 * Utiliza el cliente oficial para mejor gestión de errores.
 */
async function _callOpenAI(config, messages, modelOverride = null, options = {}) {
  const model = modelOverride || config.modelo || COMPLEX_MODEL_FALLBACK;
  const maxTokens = options.maxTokens || config.max_tokens || 3000;
  const temperature = options.temperature !== undefined ? options.temperature : (config.temperatura || 0.2);
  
  try {
    const startTime = Date.now();
    
    const response = await openai.chat.completions.create({
      model: model,
      messages: messages,
      max_tokens: maxTokens,
      temperature: temperature,
    });

    const latency = Date.now() - startTime;
    
    // Log estructurado para auditoría
    console.log(`[OpenAI] Modelo: ${model}, Tokens: ${response.usage.total_tokens}, Latencia: ${latency}ms`);

    return {
      content: response.choices[0].message.content,
      usage: response.usage,
      model: model,
      latency: latency
    };
  } catch (err) {
    console.error(`[OpenAI Error] Modelo: ${model}, Error:`, err.message);
    
    // Manejo de errores específicos
    if (err.status === 429) {
      return { 
        content: "[Error: Límite de tasa excedido. Por favor, intenta nuevamente en unos momentos.]", 
        usage: null, 
        model: model,
        error: 'rate_limit'
      };
    } else if (err.status === 401) {
      return { 
        content: "[Error: Credenciales de API inválidas.]", 
        usage: null, 
        model: model,
        error: 'auth_error'
      };
    } else if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
      return { 
        content: "[Error: La solicitud excedió el tiempo de espera.]", 
        usage: null, 
        model: model,
        error: 'timeout'
      };
    }
    
    return { 
      content: "[Error al comunicarse con el modelo]", 
      usage: null, 
      model: model,
      error: 'unknown'
    };
  }
}

/**
 * Clasifica la intención del usuario en SIMPLE o COMPLEX.
 * Primero intenta usar el modelo local (sin costo).
 * Si falla o no está disponible, usa OpenAI como fallback.
 * Implementa caché para preguntas repetidas.
 */
async function classifyIntent(config, userQuestion) {
  // Validación de longitud de pregunta
  const maxQuestionLength = config.router_max_question_length || 1000;
  let questionToClassify = userQuestion;
  
  if (userQuestion.length > maxQuestionLength) {
    console.log(`[Router] Pregunta truncada de ${userQuestion.length} a ${maxQuestionLength} caracteres`);
    questionToClassify = userQuestion.slice(0, maxQuestionLength);
  }
  
  // Verificar caché si está habilitado
  if (config.router_cache_enabled !== false) {
    const cached = getCachedClassification(questionToClassify);
    if (cached) {
      return cached;
    }
  }
  
  // PASO 1: Intentar clasificación con modelo local (sin costo)
  if (config.enable_local_llm === true) {
    try {
      const localClassification = await classifyIntentLocal(config, questionToClassify);
      
      if (localClassification) {
        // Guardar en caché
        if (config.router_cache_enabled !== false) {
          setCachedClassification(questionToClassify, localClassification);
        }
        return localClassification;
      }
      
      // Si retorna null, continuar con fallback a OpenAI
      console.log('[Router] Usando fallback a OpenAI para clasificación');
      
    } catch (error) {
      console.error('[Router] Error en clasificación local, usando fallback:', error.message);
    }
  }
  
  // PASO 2: Fallback a OpenAI (método original)
  const simpleModel = config.router_simple_model || SIMPLE_MODEL_FALLBACK;
  
  // Prompt optimizado con ejemplos específicos del dominio jurídico
  const classificationPrompt = `Clasifica la siguiente pregunta como SIMPLE o COMPLEX.

SIMPLE: Saludos, agradecimientos, despedidas, preguntas sobre el clima, conversación casual, preguntas sobre el bot mismo.
Ejemplos SIMPLE:
- "Hola, ¿cómo estás?"
- "Gracias por tu ayuda"
- "¿Qué puedes hacer?"
- "Adiós"

COMPLEX: Cualquier pregunta que requiera conocimiento jurídico, análisis legal, citación de normas, interpretación de leyes, o consulta sobre documentos legales.
Ejemplos COMPLEX:
- "¿Qué dice el artículo 1545 del Código Civil?"
- "¿Cuáles son los requisitos para un contrato válido?"
- "Explícame la prescripción adquisitiva"
- "¿Cómo se calcula la indemnización por despido?"

Pregunta: "${questionToClassify}"

Responde ÚNICAMENTE con: SIMPLE o COMPLEX`;

  const messages = [{ role: "user", content: classificationPrompt }];
  
  try {
    // Usar max_tokens muy bajo para clasificación (solo necesitamos una palabra)
    const classificationMaxTokens = config.router_classification_max_tokens || 10;
    
    const result = await _callOpenAI(config, messages, simpleModel, {
      maxTokens: classificationMaxTokens,
      temperature: 0 // Temperatura 0 para clasificación determinística
    });
    
    const classification = (result.content || '').trim().toUpperCase();
    
    // Validación robusta de la respuesta
    if (classification.includes('SIMPLE')) {
      console.log(`[Router] ✓ Clasificación: SIMPLE (Modelo: ${simpleModel}, Tokens: ${result.usage?.total_tokens || 'N/A'})`);
      
      // Guardar en caché
      if (config.router_cache_enabled !== false) {
        setCachedClassification(questionToClassify, 'SIMPLE');
      }
      
      return 'SIMPLE';
    } else if (classification.includes('COMPLEX')) {
      console.log(`[Router] ✓ Clasificación: COMPLEX (Modelo: ${simpleModel}, Tokens: ${result.usage?.total_tokens || 'N/A'})`);
      
      // Guardar en caché
      if (config.router_cache_enabled !== false) {
        setCachedClassification(questionToClassify, 'COMPLEX');
      }
      
      return 'COMPLEX';
    }
    
    // Fallback: si la respuesta no es clara, asumir COMPLEX por seguridad
    console.warn(`[Router] ⚠ Clasificación ambigua: "${classification}", usando COMPLEX por defecto`);
    return 'COMPLEX';
    
  } catch (e) {
    console.error("[Router] ✗ Error en clasificación, usando COMPLEX por defecto:", e.message);
    return 'COMPLEX'; // Siempre fallar hacia COMPLEX para mantener calidad
  }
}

/**
 * Función principal de chat - SIMPLIFICADA para usar solo GPT-4.1
 * Router multi-modelo eliminado según requerimientos del usuario
 */
async function chat(config, messages) {
  // Usar siempre GPT-4.1 (sin router)
  const finalModel = config.modelo || COMPLEX_MODEL_FALLBACK;
  
  console.log(`[LLM] Usando modelo único: ${finalModel}`);

  // Llamada directa al modelo
  const result = await _callOpenAI(config, messages, finalModel);
  
  // Añadir información del modelo usado
  result.router_enabled = false;
  result.router_model_used = finalModel;
  
  // Log de auditoría de costos
  if (result.usage) {
    const estimatedCost = estimateAPICost(finalModel, result.usage);
    console.log(`[LLM Auditoría] Modelo: ${finalModel}, ` +
                `Tokens: ${result.usage.total_tokens}, Costo estimado: $${estimatedCost.toFixed(6)}`);
  }
  
  return result;
}

/**
 * Estima el costo de una llamada a la API basándose en el modelo y uso de tokens.
 * Precios aproximados (pueden variar).
 */
function estimateAPICost(model, usage) {
  // Precios aproximados por 1M tokens (actualizar según precios reales)
  const pricing = {
    'gpt-4.1': { input: 2.50, output: 10.00 },
    'gpt-4o-mini': { input: 0.15, output: 0.60 },
    'gpt-4o': { input: 2.50, output: 10.00 },
  };
  
  const modelPricing = pricing[model] || pricing['gpt-4.1'];
  const inputCost = (usage.prompt_tokens / 1000000) * modelPricing.input;
  const outputCost = (usage.completion_tokens / 1000000) * modelPricing.output;
  
  return inputCost + outputCost;
}

/**
 * Función de utilidad para limpiar el caché manualmente (útil para testing).
 */
function clearClassificationCache() {
  classificationCache.clear();
  console.log('[Router Cache] Caché limpiado');
}

/**
 * Función de utilidad para obtener estadísticas del caché.
 */
function getCacheStats() {
  cleanExpiredCache();
  return {
    size: classificationCache.size,
    maxSize: MAX_CACHE_SIZE,
    ttl: CACHE_TTL_MS
  };
}

module.exports = { 
  chat, 
  _callOpenAI, 
  classifyIntent,
  clearClassificationCache,
  getCacheStats
};
