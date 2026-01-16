const { summarizeText } = require("./prompt");
const fs = require('fs');
const path = require('path');
const { buildMemoryStore } = require("./memory_store");
let memoryStore = null;
function initSemanticStore(cfg){
  if (!memoryStore){ memoryStore = buildMemoryStore(cfg); }
  return memoryStore;
}

function sessionFile(config, userId = 'anon', chatId = 'default') {
  try {
    const base = (config?.memory?.path)
      ? path.join(process.cwd(), config.memory.path)
      : path.join(process.cwd(), 'lexcode_instances', 'general', 'historial');

    // Crear directorio base y directorio del usuario
    const userDir = path.join(base, userId);
    fs.mkdirSync(userDir, { recursive: true });
    
    return path.join(userDir, `${chatId}.json`);
  } catch (err) {
    console.error("Error creando directorio de sesión:", err.message);
    // fallback a carpeta que coincida con chat_management.js
    const fallbackDir = path.join(process.cwd(), 'lexcode_instances', 'general', 'historial', userId);
    fs.mkdirSync(fallbackDir, { recursive: true });
    return path.join(fallbackDir, `${chatId}.json`);
  }
}

function loadContext(config, userId = 'anon', chatId = 'default') {
  try {
    const f = sessionFile(config, userId, chatId);
    if (!fs.existsSync(f)) return [];
    const raw = fs.readFileSync(f, 'utf-8');
    const mem = JSON.parse(raw || '[]');
    return Array.isArray(mem) ? mem : [];
  } catch (err) {
    console.error(`Error cargando contexto para ${userId}, chat ${chatId}:`, err.message);
    return [];
  }
}

function saveTurn(config, userId = 'anon', chatId = 'default', question, output, tokenUsage = null, normativeAnnex = null) {
  try {
    const f = sessionFile(config, userId, chatId);
    let mem = loadContext(config, userId, chatId);
    mem.push({ role: 'user', content: question });
    mem.push({ role: 'assistant', content: output, usage: tokenUsage });
    
    // Guardar el anexo normativo como un mensaje de sistema si existe
    if (normativeAnnex && Array.isArray(normativeAnnex) && normativeAnnex.length > 0) {
      mem.push({ 
        role: 'system-annex', 
        content: `Anexo Normativo Documental: ${JSON.stringify(normativeAnnex)}`,
        annexData: normativeAnnex,
        timestamp: new Date().toISOString()
      });
    }

    const max = (config.memory && config.memory.max_history) || 20;
    if (mem.length > max * 2) {
      mem = mem.slice(mem.length - max * 2);
    }

    fs.writeFileSync(f, JSON.stringify(mem, null, 2), 'utf-8');
    // Incrementar y guardar el contador de turnos
    let currentTurnCount = loadTurnCount(config, userId, chatId);
    saveTurnCount(config, userId, chatId, currentTurnCount + 1);
  } catch (err) {
    console.error(`Error guardando turno para ${userId}, chat ${chatId}:`, err.message);
  }
}

async function maybeSummarizeAndEmbed({ cfg, userId, sessionId, state }){
  try{
    const rollingMax = (cfg && cfg.memory && cfg.memory.rolling_max_turns) ?? 30;
    const summarizeEvery = (cfg && cfg.memory && cfg.memory.summary_every_n_turns) ?? 12;
    const enableLTM = !!(cfg && cfg.enable_longterm_memory);
    if (state.total_turns > 0 && state.total_turns % summarizeEvery === 0) {
      const lastSlice = state.turns.slice(-summarizeEvery);
      const text = lastSlice.map(t => `[${t.role}] ${t.text}`).join("\n");
      const summary = await summarizeText(text);
      state.summaries = Array.isArray(state.summaries) ? state.summaries : [];
      state.summaries.push({ ts: Date.now(), sessionId, text: summary });
      save(userId, state);
      if (enableLTM && memoryStore && memoryStore.isEnabled && memoryStore.isEnabled()){
        await memoryStore.upsert({
          userId, sessionId,
          text: summary,
          metadata: { kind:"session_summary", ts: Date.now() }
        });
      }
    }
    const rollingSlice = state.turns.slice(-rollingMax);
    state.turns = rollingSlice;
    save(userId, state);
  }catch(e){
    // non-fatal
  }
}

async function semanticRemember({ cfg, userId, sessionId, text, metadata={} }){
  try{
    if (!cfg || !cfg.enable_longterm_memory) return;
    if (!memoryStore || !memoryStore.isEnabled || !memoryStore.isEnabled()) return;
    await memoryStore.upsert({ userId, sessionId, text, metadata: { kind:"memory", ...metadata, ts: Date.now() } });
  }catch(e){}
}

async function semanticRecall({ cfg, userId, sessionId, query, filter="user" }){
  try{
    if (!cfg || !cfg.enable_longterm_memory) return [];
    if (!memoryStore || !memoryStore.isEnabled || !memoryStore.isEnabled()) return [];
    const topK = (cfg && cfg.memory && cfg.memory.semantic_top_k) ?? 6;
    const res = await memoryStore.search({ userId, sessionId, query, topK, filter });
    return (res && res.items) ? res.items : [];
  }catch(e){ return []; }
}

module.exports = {
 loadContext, saveTurn ,
  maybeSummarizeAndEmbed,
  semanticRemember,
  semanticRecall

};

function turnCountFile(config, userId = 'anon', chatId = 'default') {
  try {
    const base = (config?.memory?.path)
      ? path.join(process.cwd(), config.memory.path)
      : path.join(process.cwd(), 'lexcode_instances', 'general', 'historial');

    const userDir = path.join(base, userId);
    fs.mkdirSync(userDir, { recursive: true });
    
    return path.join(userDir, `${chatId}_turns.json`);
  } catch (err) {
    console.error("Error creando directorio de sesión para turnos:", err.message);
    const fallbackDir = path.join(process.cwd(), 'lexcode_instances', 'general', 'historial', userId);
    fs.mkdirSync(fallbackDir, { recursive: true });
    return path.join(fallbackDir, `${chatId}_turns.json`);
  }
}

function loadTurnCount(config, userId = 'anon', chatId = 'default') {
  try {
    const f = turnCountFile(config, userId, chatId);
    if (!fs.existsSync(f)) return 0;
    const raw = fs.readFileSync(f, 'utf-8');
    return parseInt(raw || '0', 10);
  } catch (err) {
    console.error(`Error cargando contador de turnos para ${userId}, chat ${chatId}:`, err.message);
    return 0;
  }
}

function saveTurnCount(config, userId = 'anon', chatId = 'default', count) {
  try {
    const f = turnCountFile(config, userId, chatId);
    fs.writeFileSync(f, count.toString(), 'utf-8');
  } catch (err) {
    console.error(`Error guardando contador de turnos para ${userId}, chat ${chatId}:`, err.message);
  }
}

module.exports.loadTurnCount = loadTurnCount;
module.exports.saveTurnCount = saveTurnCount;



function turnCountFile(config, userId = 'anon', chatId = 'default') {
  try {
    const base = (config?.memory?.path)
      ? path.join(process.cwd(), config.memory.path)
      : path.join(process.cwd(), 'lexcode_instances', 'general', 'historial');

    const userDir = path.join(base, userId);
    fs.mkdirSync(userDir, { recursive: true });
    
    return path.join(userDir, `${chatId}_turns.json`);
  } catch (err) {
    console.error("Error creando directorio de sesión para turnos:", err.message);
    const fallbackDir = path.join(process.cwd(), 'lexcode_instances', 'general', 'historial', userId);
    fs.mkdirSync(fallbackDir, { recursive: true });
    return path.join(fallbackDir, `${chatId}_turns.json`);
  }
}

function loadTurnCount(config, userId = 'anon', chatId = 'default') {
  try {
    const f = turnCountFile(config, userId, chatId);
    if (!fs.existsSync(f)) return 0;
    const raw = fs.readFileSync(f, 'utf-8');
    return parseInt(raw || '0', 10);
  } catch (err) {
    console.error(`Error cargando contador de turnos para ${userId}, chat ${chatId}:`, err.message);
    return 0;
  }
}

function saveTurnCount(config, userId = 'anon', chatId = 'default', count) {
  try {
    const f = turnCountFile(config, userId, chatId);
    fs.writeFileSync(f, count.toString(), 'utf-8');
  } catch (err) {
    console.error(`Error guardando contador de turnos para ${userId}, chat ${chatId}:`, err.message);
  }
}

module.exports.loadTurnCount = loadTurnCount;
module.exports.saveTurnCount = saveTurnCount;

