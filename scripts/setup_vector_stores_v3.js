const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

// Configurar OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function setupVectorStores() {
  try {
    console.log("🚀 Configurando Vector Stores para LexCode...");

    // 1. Crear Knowledge Vector Store (para conocimiento esencial + índices)
    console.log("📚 Creando Knowledge Store (esencial + índices)...");
    const knowledgeStore = await openai.vectorStores.create({
      name: "LexCode Knowledge Base - Essential",
      expires_after: {
        anchor: "last_active_at",
        days: 30,
      },
    });

    console.log(`📚 Knowledge Store ID: ${knowledgeStore.id}`);

    // 2. Crear RAG-Only Vector Store (para conocimiento extenso)
    console.log("🔍 Creando RAG-Only Store (conocimiento extenso)...");
    const ragOnlyStore = await openai.vectorStores.create({
      name: "LexCode Knowledge Base - RAG Only",
      expires_after: {
        anchor: "last_active_at",
        days: 30,
      },
    });

    console.log(`🔍 RAG-Only Store ID: ${ragOnlyStore.id}`);

    // 3. Procesar carpetas de conocimiento
    await processKnowledgeFolder(
      "conocimiento",
      knowledgeStore.id,
      "Conocimiento Esencial"
    );
    await processKnowledgeFolder(
      "conocimiento_index",
      knowledgeStore.id,
      "Índices de Conocimiento"
    );
    await processKnowledgeFolder(
      "conocimiento_rag_only",
      ragOnlyStore.id,
      "Conocimiento Extenso (RAG Only)"
    );

    // 4. Actualizar config.json con los IDs reales
    const configPath = path.join(__dirname, "..", "bot_base", "config.json");

    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

      config.vector_store_ids = [knowledgeStore.id, ragOnlyStore.id];
      config.knowledge_store_id = knowledgeStore.id;
      config.rag_only_store_id = ragOnlyStore.id;
      // Se elimina la referencia al memory_store_id
      if (config.memory_store_id) {
        delete config.memory_store_id;
      }

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      console.log("📝 Config.json actualizado con IDs reales");
      console.log(`   Knowledge Store (esencial): ${knowledgeStore.id}`);
      console.log(`   RAG-Only Store (extenso): ${ragOnlyStore.id}`);
    } else {
      console.error("❌ No se encontró config.json en:", configPath);
      return;
    }

    console.log("✅ Vector Stores configurados exitosamente");
  } catch (error) {
    console.error("❌ Error configurando Vector Stores:", error.message);
    console.error("Stack completo:", error.stack);
    process.exit(1);
  }
}

async function processKnowledgeFolder(folderName, storeId, description) {
  const folderPath = path.join(__dirname, "..", "bot_base", folderName);

  if (fs.existsSync(folderPath)) {
    const files = fs.readdirSync(folderPath);
    const textFiles = files.filter(
      (file) =>
        file.endsWith(".txt") || file.endsWith(".md") || file.endsWith(".json")
    );

    console.log(`📄 ${description}: ${textFiles.length} archivos encontrados`);

    if (textFiles.length === 0) {
      console.log(`🤷 No hay archivos para procesar en ${folderName}`);
      return;
    }

    try {
      // Ready the files for upload to OpenAI
      const file_paths = textFiles.map((fileName) =>
        path.join(folderPath, fileName)
      );
      const file_streams = file_paths.map((filePath) =>
        fs.createReadStream(filePath)
      );

      // Use the upload and poll SDK helper
      console.log(
        `📤 Subiendo y esperando la finalización de ${textFiles.length} archivos para ${description}...`
      );
      const file_batch = await openai.vectorStores.file_batches.upload_and_poll({
        vector_store_id: storeId,
        files: file_streams,
      });

      // Print the status and the file counts of the batch
      console.log(
        `✅ Lote para ${description} completado con estado: ${file_batch.status}`
      );
      console.log(`   Archivos exitosos: ${file_batch.file_counts.completed}`);
      console.log(
        `   Archivos en progreso: ${file_batch.file_counts.in_progress}`
      );
      console.log(`   Archivos fallidos: ${file_batch.file_counts.failed}`);
      console.log(`   Archivos cancelados: ${file_batch.file_counts.cancelled}`);
    } catch (batchError) {
      console.error(
        `❌ Error procesando el lote para ${description}:`,
        batchError.message
      );
    }
  } else {
    console.warn(`⚠️ Directorio ${folderName} no encontrado:`, folderPath);
  }
}

// Verificar API key antes de ejecutar
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY no está configurada");
  process.exit(1);
}

// Ejecutar setup
setupVectorStores();
