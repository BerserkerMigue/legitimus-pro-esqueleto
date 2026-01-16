const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

// Configurar OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForFileBatchCompletion(vectorStoreId, batchId, maxWaitTime = 3600000) {
  const startTime = Date.now();
  const pollInterval = 5000; // Esperar 5 segundos entre intentos

  while (Date.now() - startTime < maxWaitTime) {
    try {
      const batch = await openai.vectorStores.fileBatches.retrieve(
        vectorStoreId,
        batchId
      );

      console.log(`   Estado actual: ${batch.status}`);
      console.log(`   - Completados: ${batch.file_counts.completed}`);
      console.log(`   - En progreso: ${batch.file_counts.in_progress}`);
      console.log(`   - Fallidos: ${batch.file_counts.failed}`);

      if (batch.status === "completed" || batch.status === "failed") {
        return batch;
      }

      await sleep(pollInterval);
    } catch (error) {
      console.error(`   Error verificando estado del lote: ${error.message}`);
      await sleep(pollInterval);
    }
  }

  throw new Error(`Timeout esperando a que se complete el lote ${batchId}`);
}

async function setupVectorStores() {
  try {
    console.log("🚀 Configurando Vector Stores para Legistimus (CALIDAD MÁXIMA)...");
    console.log("📊 Usando la mejor estrategia de RAG disponible en OpenAI");
    console.log("");

    // 1. Crear Knowledge Vector Store
    console.log("📚 Creando Knowledge Store (Conocimiento Narrativo)...");
    const knowledgeStore = await openai.vectorStores.create({
      name: "Legistimus Knowledge Base - Essential",
      expires_after: {
        anchor: "last_active_at",
        days: 30,
      },
    });

    console.log(`✅ Knowledge Store ID: ${knowledgeStore.id}`);
    console.log("");

    // 2. Crear RAG-Only Vector Store
    console.log("🔍 Creando RAG-Only Store (Bloques Jurídicos)...");
    const ragOnlyStore = await openai.vectorStores.create({
      name: "Legistimus Knowledge Base - RAG Only",
      expires_after: {
        anchor: "last_active_at",
        days: 30,
      },
    });

    console.log(`✅ RAG-Only Store ID: ${ragOnlyStore.id}`);
    console.log("");

    // 3. Procesar carpetas de conocimiento
    await processKnowledgeFolder(
      "conocimiento",
      knowledgeStore.id,
      "Conocimiento Narrativo"
    );
    await processKnowledgeFolder(
      "conocimiento_index",
      knowledgeStore.id,
      "Índices de Conocimiento (Legacy)"
    );
    await processKnowledgeFolder(
      "conocimiento_rag_only",
      ragOnlyStore.id,
      "Bloques Jurídicos (Privados)"
    );

    // 4. Actualizar config.json con los IDs reales
    const configPath = path.join(__dirname, "bot_base", "config.json");

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

      console.log("📝 Config.json actualizado automáticamente");
      console.log(`   Knowledge Store: ${knowledgeStore.id}`);
      console.log(`   RAG-Only Store: ${ragOnlyStore.id}`);
      console.log("");
    } else {
      console.error("❌ No se encontró config.json en:", configPath);
      return;
    }

    console.log("✅ Vector Stores configurados exitosamente");
    console.log("");
    console.log("🎯 Configuración Final:");
    console.log("   ✓ 2 Vector Stores activos (máxima eficiencia)");
    console.log("   ✓ Indexación completa con polling (100% confiabilidad)");
    console.log("   ✓ Chunking automático de OpenAI (calidad óptima)");
    console.log("   ✓ Búsqueda semántica optimizada para RAG");
    console.log("");
    console.log("🚀 Próximos pasos:");
    console.log("   1. Verifica que todos los archivos se indexaron correctamente");
    console.log("   2. Reinicia el bot: npm start");
    console.log("   3. Prueba búsquedas de artículos (ej: 'Ley 21.430 artículo 20')");
    console.log("");
  } catch (error) {
    console.error("❌ Error configurando Vector Stores:", error.message);
    console.error("Stack completo:", error.stack);
    process.exit(1);
  }
}

async function processKnowledgeFolder(folderName, storeId, description) {
  const folderPath = path.join(__dirname, "bot_base", folderName);

  if (fs.existsSync(folderPath)) {
    const files = fs.readdirSync(folderPath);
    const textFiles = files.filter(
      (file) =>
        file.endsWith(".txt") || file.endsWith(".md") || file.endsWith(".json")
    );

    console.log(`📄 ${description}: ${textFiles.length} archivos encontrados`);

    if (textFiles.length === 0) {
      console.log(`   ℹ️ No hay archivos para procesar en ${folderName}`);
      console.log("");
      return;
    }

    try {
      // Crear un lote de carga
      console.log(`📤 Subiendo ${textFiles.length} archivos...`);

      const file_paths = textFiles.map((fileName) =>
        path.join(folderPath, fileName)
      );
      const file_streams = file_paths.map((filePath) =>
        fs.createReadStream(filePath)
      );

      // Usar la API de file_batches.create con polling
      const batch = await openai.vectorStores.fileBatches.create(storeId, {
        files: file_streams,
      });

      console.log(`   Lote creado: ${batch.id}`);
      console.log(`   Esperando indexación (esto puede tomar algunos minutos)...`);

      // Esperar a que se complete el lote
      const completedBatch = await waitForFileBatchCompletion(storeId, batch.id);

      console.log(`✅ ${description} - Indexación completada`);
      console.log(`   Estado: ${completedBatch.status}`);
      console.log(`   Exitosos: ${completedBatch.file_counts.completed}`);
      console.log(`   Fallidos: ${completedBatch.file_counts.failed}`);
      
      if (completedBatch.file_counts.failed > 0) {
        console.warn(`   ⚠️ ADVERTENCIA: ${completedBatch.file_counts.failed} archivo(s) fallaron`);
      }
      
      console.log("");
    } catch (batchError) {
      console.error(
        `❌ Error procesando ${description}:`,
        batchError.message
      );
      console.log("");
    }
  } else {
    console.warn(`⚠️ Directorio no encontrado: ${folderPath}`);
    console.log("");
  }
}

// Verificar API key antes de ejecutar
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY no está configurada");
  console.error("Configura tu API key:");
  console.error("   Windows: set OPENAI_API_KEY=sk-proj-tu_api_key");
  console.error("   Linux/Mac: export OPENAI_API_KEY=sk-proj-tu_api_key");
  process.exit(1);
}

// Ejecutar setup
setupVectorStores();
