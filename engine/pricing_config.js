/**
 * CONFIGURACIÓN DE PRECIOS Y CRÉDITOS
 * ====================================
 * 
 * Este archivo centraliza toda la lógica de cálculo de costos y créditos.
 * Modifica los valores aquí para ajustar precios sin tocar el código principal.
 */

// ============================================================================
// PRECIOS DE MODELOS DE IA (en USD por 1 millón de tokens)
// ============================================================================

const MODEL_PRICING = {
  // GPT-4.1 (modelo actual de LexCode)
  "gpt-4.1": {
    input: 2.50,    // $2.50 por 1M tokens de entrada
    output: 10.00   // $10.00 por 1M tokens de salida
  },
  
  // GPT-4o-mini (para resúmenes)
  "gpt-4o-mini": {
    input: 0.15,    // $0.15 por 1M tokens de entrada
    output: 0.60    // $0.60 por 1M tokens de salida
  },
  
  // GPT-4o
  "gpt-4o": {
    input: 2.50,
    output: 10.00
  },
  
  // Otros modelos (agregar según necesidad)
  "gpt-3.5-turbo": {
    input: 0.50,
    output: 1.50
  }
};

// ============================================================================
// CONFIGURACIÓN DE CRÉDITOS
// ============================================================================

const CREDIT_CONFIG = {
  // Cuántos tokens equivale 1 crédito
  // Ejemplo: 1000 significa que 1 crédito = 1000 tokens equivalentes
  tokensPerCredit: 1000,
  
  // Precio en USD de 1 crédito (para calcular valor monetario)
  // Ejemplo: 0.001 significa que 1 crédito = $0.001 USD
  pricePerCredit: 0.001,
  
  // Margen de ganancia sobre el costo real
  // Ejemplo: 1.30 significa 30% de margen
  profitMargin: 1.30,
  
  // Redondeo de créditos
  // "up" = siempre redondear hacia arriba (favorece al negocio)
  // "nearest" = redondear al más cercano (más justo)
  // "down" = redondear hacia abajo (favorece al usuario)
  rounding: "up"
};

// ============================================================================
// PLANES DE CRÉDITOS (para venta)
// ============================================================================

const CREDIT_PLANS = [
  {
    id: "basic",
    name: "Plan Básico",
    price: 5.00,          // USD
    credits: 5000,        // Créditos que recibe
    bonus: 0,             // % de bonus (0 = sin bonus)
    description: "Ideal para usuarios ocasionales"
  },
  {
    id: "standard",
    name: "Plan Estándar",
    price: 15.00,
    credits: 15000,
    bonus: 13,            // 13% de bonus
    description: "Para usuarios regulares",
    popular: true         // Marcar como "más popular"
  },
  {
    id: "professional",
    name: "Plan Profesional",
    price: 40.00,
    credits: 40000,
    bonus: 25,            // 25% de bonus
    description: "Para abogados y estudios"
  },
  {
    id: "enterprise",
    name: "Plan Enterprise",
    price: 100.00,
    credits: 100000,
    bonus: 50,            // 50% de bonus
    description: "Para estudios grandes y corporativos"
  }
];

// ============================================================================
// FUNCIONES DE CÁLCULO
// ============================================================================

/**
 * Calcula el costo real en USD de una consulta
 * @param {string} model - Nombre del modelo (ej: "gpt-4.1")
 * @param {number} inputTokens - Tokens de entrada
 * @param {number} outputTokens - Tokens de salida
 * @returns {number} Costo en USD
 */
function calculateRealCost(model, inputTokens, outputTokens) {
  const pricing = MODEL_PRICING[model];
  
  if (!pricing) {
    throw new Error(`Modelo desconocido: ${model}. Agrega el precio en pricing_config.js`);
  }
  
  const inputCost = (inputTokens / 1_000_000) * pricing.input;
  const outputCost = (outputTokens / 1_000_000) * pricing.output;
  
  return inputCost + outputCost;
}

/**
 * Calcula cuántos créditos debe consumir una consulta
 * @param {string} model - Nombre del modelo
 * @param {number} inputTokens - Tokens de entrada
 * @param {number} outputTokens - Tokens de salida
 * @returns {Object} Detalles del consumo
 */
function calculateCreditsFromTokens(model, inputTokens, outputTokens) {
  // Calcular costo real
  const realCost = calculateRealCost(model, inputTokens, outputTokens);
  
  // Aplicar margen de ganancia
  const costWithMargin = realCost * CREDIT_CONFIG.profitMargin;
  
  // Convertir a créditos
  let credits = costWithMargin / CREDIT_CONFIG.pricePerCredit;
  
  // Aplicar redondeo
  switch (CREDIT_CONFIG.rounding) {
    case "up":
      credits = Math.ceil(credits);
      break;
    case "down":
      credits = Math.floor(credits);
      break;
    case "nearest":
      credits = Math.round(credits);
      break;
    default:
      credits = Math.ceil(credits);
  }
  
  return {
    credits: credits,
    realCost: realCost,
    costWithMargin: costWithMargin,
    userCost: credits * CREDIT_CONFIG.pricePerCredit,
    inputTokens: inputTokens,
    outputTokens: outputTokens,
    totalTokens: inputTokens + outputTokens,
    model: model,
    margin: CREDIT_CONFIG.profitMargin,
    breakdown: {
      inputCost: (inputTokens / 1_000_000) * MODEL_PRICING[model].input,
      outputCost: (outputTokens / 1_000_000) * MODEL_PRICING[model].output
    }
  };
}

/**
 * Calcula cuántas consultas promedio puede hacer un usuario con X créditos
 * @param {number} credits - Cantidad de créditos
 * @param {number} avgTokens - Promedio de tokens por consulta (default: 26500)
 * @param {string} model - Modelo a usar (default: "gpt-4.1")
 * @returns {Object} Estimación de consultas
 */
function estimateQueriesFromCredits(credits, avgTokens = 26500, model = "gpt-4.1") {
  // Asumimos proporción 90% input, 10% output (basado en logs reales)
  const avgInputTokens = Math.floor(avgTokens * 0.90);
  const avgOutputTokens = Math.floor(avgTokens * 0.10);
  
  const avgCreditPerQuery = calculateCreditsFromTokens(model, avgInputTokens, avgOutputTokens).credits;
  
  return {
    estimatedQueries: Math.floor(credits / avgCreditPerQuery),
    avgCreditsPerQuery: avgCreditPerQuery,
    avgTokensPerQuery: avgTokens
  };
}

/**
 * Calcula el precio efectivo por crédito en un plan (considerando bonus)
 * @param {Object} plan - Plan de créditos
 * @returns {Object} Análisis del plan
 */
function analyzePlan(plan) {
  const totalCredits = plan.credits + Math.floor(plan.credits * (plan.bonus / 100));
  const pricePerCredit = plan.price / totalCredits;
  const discount = plan.bonus > 0 ? ((plan.bonus / (100 + plan.bonus)) * 100).toFixed(1) : 0;
  
  return {
    ...plan,
    totalCredits: totalCredits,
    effectivePricePerCredit: pricePerCredit,
    discountPercentage: parseFloat(discount),
    estimatedQueries: estimateQueriesFromCredits(totalCredits).estimatedQueries
  };
}

/**
 * Obtiene todos los planes con análisis completo
 * @returns {Array} Planes analizados
 */
function getAllPlans() {
  return CREDIT_PLANS.map(analyzePlan);
}

// ============================================================================
// EXPORTAR MÓDULO
// ============================================================================

module.exports = {
  // Configuración
  MODEL_PRICING,
  CREDIT_CONFIG,
  CREDIT_PLANS,
  
  // Funciones
  calculateRealCost,
  calculateCreditsFromTokens,
  estimateQueriesFromCredits,
  analyzePlan,
  getAllPlans
};

