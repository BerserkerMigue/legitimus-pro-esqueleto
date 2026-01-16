const { default: OpenAI } = require("openai");
const fs = require("fs");
const path = require("path");

let client = null;

function getClient() {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

class ChatDocumentManager {
  constructor() {
    this.chatVectorStores = new Map();
    this.chatDocuments = new Map();
  }

  async getOrCreateChatVectorStore(chatId, userId, expirationDays = 30) {
    if (this.chatVectorStores.has(chatId)) {
      const storeId = this.chatVectorStores.get(chatId);
      console.log(`📚 Usando vector store existente para chat ${chatId}: ${storeId}`);
      return storeId;
    }

    console.log(`📚 Creando vector store temporal para chat ${chatId}...`);
    const vectorStore = await getClient().beta.vectorStores.create({
      name: `chat_docs_${chatId}_${userId}`,
      expires_after: {
        anchor: "last_active_at",
        days: expirationDays,
      },
      metadata: {
        chatId,
        userId,
        type: "chat_documents",
      },
    });

    this.chatVectorStores.set(chatId, vectorStore.id);
    console.log(`✅ Vector store creado: ${vectorStore.id} (expira en ${expirationDays} días)`);
    return vectorStore.id;
  }

  async storeDocumentSummary(chatId, userId, summary, metadata = {}) {
    const vectorStoreId = await this.getOrCreateChatVectorStore(chatId, userId);
    const tempDir = path.join(process.cwd(), "temp_summaries");
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const tempFilePath = path.join(tempDir, `summary_${Date.now()}.txt`);
    fs.writeFileSync(tempFilePath, summary, "utf-8");

    const fileStream = fs.createReadStream(tempFilePath);
    const uploadedFile = await getClient().files.create({
      file: fileStream,
      purpose: "assistants",
    });

    await getClient().beta.vectorStores.files.create(vectorStoreId, {
      file_id: uploadedFile.id,
    });

    fs.unlinkSync(tempFilePath);

    if (!this.chatDocuments.has(chatId)) {
      this.chatDocuments.set(chatId, []);
    }
    this.chatDocuments.get(chatId).push({
      fileId: uploadedFile.id,
      filename: metadata.filename,
      ...metadata,
    });

    console.log(`✅ Resumen almacenado en vector store del chat ${chatId}`);
    return { vectorStoreId, fileId: uploadedFile.id };
  }

  async uploadFullDocumentToVectorStore(vectorStoreId, filePath) {
    const fileStream = fs.createReadStream(filePath);
    const uploadedFile = await getClient().files.create({
        file: fileStream,
        purpose: "assistants",
    });

    await getClient().beta.vectorStores.files.create(vectorStoreId, {
        file_id: uploadedFile.id,
    });

    console.log(`✅ Documento completo subido a vector store ${vectorStoreId}`);
    return uploadedFile.id;
  }

  getChatVectorStore(chatId) {
    return this.chatVectorStores.get(chatId) || null;
  }
}

const chatDocManager = new ChatDocumentManager();
module.exports = chatDocManager;

