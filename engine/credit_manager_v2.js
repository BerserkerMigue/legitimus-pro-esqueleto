/**
 * CREDIT MANAGER V2 - Sistema de Créditos Basado en Costos Reales
 * ==================================================================
 * 
 * Este módulo calcula créditos basados en el costo real de tokens
 * y se integra con el sistema de autenticación existente (auth/index.js)
 */

const fs = require('fs');
const path = require('path');
const { nanoid } = require('nanoid');
const auth = require('../auth');

const PRICING_CONFIG_PATH = path.join(__dirname, '../pricing_config.json');
const TRANSACTIONS_STORE_PATH = path.join(__dirname, '../auth/transactions.store.json');

// ============================================================================
// CONFIGURACIÓN DE PRECIOS
// ============================================================================

function loadPricingConfig() {
  try {
    return JSON.parse(fs.readFileSync(PRICING_CONFIG_PATH, 'utf8'));
  } catch (e) {
    console.error('[CreditManager] Error loading pricing_config.json:', e.message);
    // Valores por defecto si no existe el archivo
    return {
      credit_system: {
        mode: 'cost_based',
        usd_per_credit: 0.01,
        rounding_mode: 'up',
        show_cost_to_admin: true,
        show_cost_to_user: false,
        show_tokens_to_admin: true,
        show_tokens_to_user: false,
        admin_emails: []
      }
    };
  }
}

// ============================================================================
// FUNCIONES DE CÁLCULO DE COSTOS
// ============================================================================

/**
 * Calcula el costo en USD basado en tokens
 * Usa precios aproximados de OpenAI GPT-4.1
 */
function calculateCostFromTokens(tokenUsage) {
  const inputTokens = tokenUsage.input_tokens || 0;
  const outputTokens = tokenUsage.output_tokens || 0;
  
  // Precios aproximados (ajustar según modelo real)
  const INPUT_PRICE_PER_1M = 2.00;   // $2.00 por 1M tokens de entrada
  const OUTPUT_PRICE_PER_1M = 8.00;  // $8.00 por 1M tokens de salida
  
  const inputCost = (inputTokens / 1000000) * INPUT_PRICE_PER_1M;
  const outputCost = (outputTokens / 1000000) * OUTPUT_PRICE_PER_1M;
  const totalCost = inputCost + outputCost;
  
  return {
    inputCost,
    outputCost,
    totalCost,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens
  };
}

/**
 * Calcula cuántos créditos descontar basado en el costo real
 */
function calculateCreditsFromCost(costUSD) {
  const config = loadPricingConfig();
  const usdPerCredit = config.credit_system.usd_per_credit || 0.01;
  const roundingMode = config.credit_system.rounding_mode || 'up';
  
  const rawCredits = costUSD / usdPerCredit;
  
  let credits;
  switch (roundingMode) {
    case 'down':
      credits = Math.floor(rawCredits);
      break;
    case 'nearest':
      credits = Math.round(rawCredits);
      break;
    case 'up':
    default:
      credits = Math.ceil(rawCredits);
      break;
  }
  
  // Mínimo 1 crédito por consulta
  return Math.max(1, credits);
}

// ============================================================================
// FUNCIONES DE TRANSACCIONES
// ============================================================================

function readTransactionsStore() {
  try {
    if (!fs.existsSync(TRANSACTIONS_STORE_PATH)) {
      return { transactions: [] };
    }
    return JSON.parse(fs.readFileSync(TRANSACTIONS_STORE_PATH, 'utf8'));
  } catch (e) {
    console.error('[CreditManager] Error reading transactions store:', e.message);
    return { transactions: [] };
  }
}

function writeTransactionsStore(store) {
  try {
    fs.writeFileSync(TRANSACTIONS_STORE_PATH, JSON.stringify(store, null, 2));
  } catch (e) {
    console.error('[CreditManager] Error writing transactions store:', e.message);
  }
}

function recordTransaction(userId, amount, description, relatedChatId, tokenUsage, costDetails) {
  const transactionsStore = readTransactionsStore();
  
  const transaction = {
    transaction_id: nanoid(),
    user_id: userId,
    type: amount < 0 ? 'consumption' : 'addition',
    amount: amount,
    description: description,
    timestamp: new Date().toISOString(),
    related_chat_id: relatedChatId,
    operation_type: 'chat',
    token_usage: {
      prompt_tokens: tokenUsage.input_tokens || 0,
      completion_tokens: tokenUsage.output_tokens || 0,
      total_tokens: (tokenUsage.input_tokens || 0) + (tokenUsage.output_tokens || 0)
    },
    cost_details: costDetails
  };
  
  transactionsStore.transactions.push(transaction);
  writeTransactionsStore(transactionsStore);
  
  return transaction;
}

// ============================================================================
// FUNCIÓN PRINCIPAL: DESCONTAR CRÉDITOS
// ============================================================================

/**
 * Descuenta créditos basado en el costo real de tokens
 * @param {string} userId - ID del usuario
 * @param {Object} tokenUsage - {input_tokens, output_tokens}
 * @param {string} chatId - ID del chat
 * @returns {Object} Detalles del descuento
 */
function deductCreditsForQuery(userId, tokenUsage, chatId) {
  // 1. Calcular costo en USD
  const costDetails = calculateCostFromTokens(tokenUsage);
  
  // 2. Calcular créditos a descontar
  const creditsToDeduct = calculateCreditsFromCost(costDetails.totalCost);
  
  // 3. Verificar que el usuario existe
  const user = auth.getUser(userId);
  if (!user) {
    console.warn(`[CreditManager] Usuario ${userId} no encontrado, se omite descuento de créditos`);
    return {
      success: false,
      error: 'user_not_found',
      costDetails,
      creditsToDeduct
    };
  }
  
  // 4. Descontar créditos usando el sistema de auth
  const success = auth.charge(userId, creditsToDeduct);
  
  if (!success) {
    console.error(`[CreditManager] Créditos insuficientes para usuario ${userId}`);
    return {
      success: false,
      error: 'insufficient_credits',
      costDetails,
      creditsToDeduct,
      userCredits: user.credits
    };
  }
  
  // 5. Registrar transacción
  const transaction = recordTransaction(
    userId,
    -creditsToDeduct,
    `Consumo por consulta de IA (costo: ${creditsToDeduct})`,
    chatId,
    tokenUsage,
    costDetails
  );
  
  // 6. Obtener créditos restantes
  const updatedUser = auth.getUser(userId);
  
  // 7. Logs
  console.log(`💰 Créditos descontados: ${creditsToDeduct} (Quedan: ${updatedUser.credits})`);
  console.log(`📊 Tokens: ${costDetails.totalTokens} | Costo real: $${costDetails.totalCost.toFixed(4)}`);
  
  return {
    success: true,
    creditsDeducted: creditsToDeduct,
    remainingCredits: updatedUser.credits,
    costDetails,
    transaction
  };
}

/**
 * Verifica si se debe mostrar información técnica al usuario
 */
function shouldShowTechnicalInfo(userEmail) {
  const config = loadPricingConfig();
  const adminEmails = config.credit_system.admin_emails || [];
  return adminEmails.includes(userEmail);
}

/**
 * Formatea la información de créditos para mostrar al usuario
 */
function formatCreditInfo(creditsDeducted, costDetails, userEmail) {
  const config = loadPricingConfig();
  const isAdmin = shouldShowTechnicalInfo(userEmail);
  
  let info = `⚡ ${creditsDeducted} créditos`;
  
  if (isAdmin) {
    if (config.credit_system.show_tokens_to_admin) {
      info += ` | 📊 ${costDetails.totalTokens.toLocaleString()} tokens`;
    }
    if (config.credit_system.show_cost_to_admin) {
      info += ` | 💰 $${costDetails.totalCost.toFixed(4)} USD`;
    }
  }
  
  return info;
}

// ============================================================================
// EXPORTAR MÓDULO
// ============================================================================

module.exports = {
  deductCreditsForQuery,
  calculateCostFromTokens,
  calculateCreditsFromCost,
  shouldShowTechnicalInfo,
  formatCreditInfo,
  loadPricingConfig
};

