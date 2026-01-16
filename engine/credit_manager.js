
const fs = require('fs');
const path = require('path');
const { nanoid } = require('nanoid');

const USERS_STORE_PATH = path.join(__dirname, '../auth/users.store.json');
const TRANSACTIONS_STORE_PATH = path.join(__dirname, '../auth/transactions.store.json');

function readUsersStore() {
  try {
    return JSON.parse(fs.readFileSync(USERS_STORE_PATH, 'utf8'));
  } catch (e) {
    console.error('Error reading users store:', e.message);
    return { users: [] };
  }
}

function writeUsersStore(store) {
  try {
    fs.writeFileSync(USERS_STORE_PATH, JSON.stringify(store, null, 2));
  } catch (e) {
    console.error('Error writing users store:', e.message);
  }
}

function readTransactionsStore() {
  try {
    if (!fs.existsSync(TRANSACTIONS_STORE_PATH)) {
      return { transactions: [] };
    }
    return JSON.parse(fs.readFileSync(TRANSACTIONS_STORE_PATH, 'utf8'));
  } catch (e) {
    console.error('Error reading transactions store:', e.message);
    return { transactions: [] };
  }
}

function writeTransactionsStore(store) {
  try {
    fs.writeFileSync(TRANSACTIONS_STORE_PATH, JSON.stringify(store, null, 2));
  } catch (e) {
    console.error('Error writing transactions store:', e.message);
  }
}

function recordTransaction(userId, type, amount, description, relatedChatId = null, tokenUsage = null, operationType = 'chat') {
  const transactionsStore = readTransactionsStore();
  const transaction = {
    transaction_id: nanoid(),
    user_id: userId,
    type: type,
    amount: amount,
    description: description,
    timestamp: new Date().toISOString(),
    related_chat_id: relatedChatId,
    operation_type: operationType, // 'chat', 'audio_transcription', 'audio_synthesis', etc.
    token_usage: tokenUsage ? {
      prompt_tokens: tokenUsage.prompt_tokens || 0,
      completion_tokens: tokenUsage.completion_tokens || 0,
      total_tokens: tokenUsage.total_tokens || 0
    } : null
  };
  transactionsStore.transactions.push(transaction);
  writeTransactionsStore(transactionsStore);
}

async function checkAndDecrementCredits(userId, cost, relatedChatId = null, tokenUsage = null, operationType = 'chat') {
  const usersStore = readUsersStore();
  const user = usersStore.users.find(u => u.id === userId);

  if (!user) {
    throw new Error('User not found');
  }

  if ((user.credits || 0) < cost) {
    throw new Error('Insufficient credits');
  }

  user.credits -= cost;
  user.last_credit_update = new Date().toISOString();
  writeUsersStore(usersStore);

  // Descripción mejorada según el tipo de operación
  let description = `Consumo por consulta de IA (costo: ${cost})`;
  if (operationType === 'audio_transcription') {
    description = `Transcripción de audio (costo: ${cost})`;
  } else if (operationType === 'audio_synthesis') {
    description = `Síntesis de voz (costo: ${cost})`;
  }

  recordTransaction(userId, 'consumption', -cost, description, relatedChatId, tokenUsage, operationType);
  return true;
}

async function addCredits(userId, amount, description = 'Asignación manual de créditos') {
  const usersStore = readUsersStore();
  const user = usersStore.users.find(u => u.id === userId);

  if (!user) {
    throw new Error('User not found');
  }

  user.credits = (user.credits || 0) + amount;
  user.credits_total_assigned = (user.credits_total_assigned || 0) + amount;
  user.last_credit_update = new Date().toISOString();
  writeUsersStore(usersStore);

  recordTransaction(userId, 'assignment', amount, description);
  return true;
}

function getAvailableCredits(userId) {
  const usersStore = readUsersStore();
  const user = usersStore.users.find(u => u.id === userId);
  return user ? (user.credits || 0) : 0;
}

module.exports = {
  checkAndDecrementCredits,
  addCredits,
  getAvailableCredits,
  recordTransaction
};

