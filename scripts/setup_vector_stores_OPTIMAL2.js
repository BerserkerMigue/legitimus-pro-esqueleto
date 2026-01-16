const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

// ================== CONFIG ==================
const BATCH_SIZE = 1; // 🔥 HOY: 1–2 ultra seguro, 3 si estás valiente
const RETRY_DELAY_MS = 20_000; // 15s entre batches
// ============================================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function setupVectorStores() {
  try {
    console.log("🚀 Configurando Vector Stores (OPTIMAL2 – ESTABLE)");
    console.log(`📦 Batch size: ${BATCH_SIZE}`);
    console.log("");

    // 1. Knowledge Store
    const knowledgeStore = await openai.vectorStores.create({
      name: "Legistimus Knowledge Base - Essential",
      expires_after: { anchor: "last_active_at", days: 30 },
    });
    console.log(`📚 Knowledge Store: ${knowledgeStore.id}`);

    // 2. RAG Only Store
    const ragOnlyStore = await openai.vectorStores.create({
      name: "Legistimus Knowledge Base - RAG Only",
      expires_after: { anchor: "last_active_at", days: 30 },
    });
    console.log(`🔍 RAG Store: ${ragOnlyStore.id}`);
    console.log("");

    // 3. Procesar carpetas
    await processKnowledgeFolder(
      "conocimiento",
      knowledgeStore.id,
      "Conocimiento Narrativo"
    );

    await processKnowledgeFolder(
      "conocimiento_index",
      knowledgeStore.id,
      "Índices de Conocimiento"
    );

    await processKnowledgeFolder(
      "conocimiento_rag_only",
      ragOnlyStore.id,
      "Bloques Jurídicos"
    );

    // 4. Actualizar config.json
    const configPath = path.join(__dirname, "bot_base", "config.json");
    if (!fs.existsSync(configPath)) {
      console.error("❌ config.json no encontrado");
      return;
    }

    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    config.vector_store_ids = [knowledgeStore.id, ragOnlyStore.id];
    config.knowledge_store_id = knowledgeStore.id;
    config.rag_only_store_id = ragOnlyStore.id;
    delete config.memory_store_id;

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    console.log("📝 config.json actualizado");
    console.log("");

    console.log("✅ OPTIMAL2 terminado SIN colgarse");
    console.log("👉 Espera unos minutos antes de usar RAG si OpenAI está lento");
  } catch (err) {
    console.error("❌ Error general:", err.message);
    process.exit(1);
  }
}

async function processKnowledgeFolder(folderName, storeId, description) {
  const folderPath = path.join(__dirname, "bot_base", folderName);
  if (!fs.existsSync(folderPath)) {
    console.warn(`⚠️ Carpeta no encontrada: ${folderName}`);
    return;
  }

  const files = fs
    .readdirSync(folderPath)
    .filter((f) => f.endsWith(".txt") || f.endsWith(".md") || f.endsWith(".json"));

  console.log(`📄 ${description}: ${files.length} archivos`);

  for (let i = 0; i < files.length; i += BATCH_SIZE) {
    const batchFiles = files.slice(i, i + BATCH_SIZE);

    console.log(
      `📤 ${description} → Batch ${i / BATCH_SIZE + 1} (${batchFiles.length} archivos)`
    );

    const streams = batchFiles.map((file) =>
      fs.createReadStream(path.join(folderPath, file))
    );

    try {
      const batch = await openai.vectorStores.fileBatches.uploadAndPoll(
        storeId,
        { files: streams }
      );

      console.log(
        `✅ Batch OK | completed: ${batch.file_counts.completed} | failed: ${batch.file_counts.failed}`
      );
    } catch (err) {
      console.error("❌ Error en batch:", err.message);
      console.log("⏸️ Esperando y continuando con el siguiente batch...");
    }

    // Pausa para no saturar backend
    await sleep(RETRY_DELAY_MS);
  }

  console.log(`🏁 ${description} completado`);
  console.log("");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Verificar API key
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY no configurada");
  process.exit(1);
}

setupVectorStores();