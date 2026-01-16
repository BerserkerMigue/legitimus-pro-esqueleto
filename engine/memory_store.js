const axios = require("axios");

function ok(v){ return v !== undefined && v !== null; }

class MemoryStore {
  constructor({ apiKey, baseUrl, storeId }) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl || "https://api.openai.com/v1";
    this.storeId = storeId; // vs_...
    this.enabled = ok(apiKey) && ok(this.storeId);
  }

  isEnabled(){ return !!this.enabled; }

  headers() {
    return { "Authorization": `Bearer ${this.apiKey}`, "Content-Type": "application/json" };
  }

  async upsert({ userId, sessionId, text, metadata }) {
    if (!this.isEnabled()) return { ok:false, reason:"disabled" };
    const doc = {
      content: text,
      metadata: { userId, sessionId, ...metadata }
    };
    await axios.post(`${this.baseUrl}/vector_stores/${this.storeId}/documents`, { documents: [doc] }, { headers: this.headers() });
    return { ok:true };
  }

  async search({ userId, sessionId, query, topK=6, filter="user" }) {
    if (!this.isEnabled()) return { ok:false, reason:"disabled", items: [] };
    const body = {
      query,
      top_k: topK,
      filter: (filter === "session")
        ? { userId, sessionId }
        : { userId }
    };
    const { data } = await axios.post(`${this.baseUrl}/vector_stores/${this.storeId}/search`, body, { headers: this.headers() });
    const items = (data?.results || []).map(r => ({
      text: r.content || r.text || "",
      score: r.score,
      metadata: r.metadata || {}
    }));
    return { ok:true, items };
  }
}

function buildMemoryStore(cfg){
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || cfg.api_base || "https://api.openai.com/v1";
  const storeId = process.env.MEMORY_STORE_ID || (cfg.memory_store_id || (cfg.memory && cfg.memory.store_id));
  return new MemoryStore({ apiKey, baseUrl, storeId });
}

module.exports = { MemoryStore, buildMemoryStore };
