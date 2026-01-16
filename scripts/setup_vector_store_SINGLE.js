const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

// Configurar OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function setupVectorStore() {
  try {
    console.log("🚀 Configurando Vector Store Único para Legitimus...");
    console.log("📊 Usando uploadAndPoll - Máxima confiabilidad");
    console.log("📦 Un solo Vector Store para toda la normativa jurídica");
    console.log("");

    // 1. Crear Vector Store Único
    console.log("🔍 Creando Vector Store Único (RAG-Only)...");
    const ragOnlyStore = await openai.vectorStores.create({
      name: "Legitimus Knowledge Base - RAG Only (Único)",
      expires_after: {
        anchor: "last_active_at",
        days: 30,
      },
    });

    console.log(`✅ Vector Store ID: ${ragOnlyStore.id}`);
    console.log("");

    // 2. Procesar carpeta de conocimiento
    await processKnowledgeFolder(
      "conocimiento_rag_only",
      ragOnlyStore.id,
      "Bloques Jurídicos Completos"
    );

    // 3. Actualizar config.json con el ID real
    const configPath = path.join(
      __dirname,
      "lexcode_instances",
      "general",
      "config.json"
    );

    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

      // Actualizar con un ÚNICO vector store
      config.vector_store_ids = [ragOnlyStore.id];
      config.rag_only_store_id = ragOnlyStore.id;

      // Eliminar referencias a otros stores si existen
      if (config.knowledge_store_id) {
        delete config.knowledge_store_id;
      }
      if (config.memory_store_id) {
        delete config.memory_store_id;
      }

      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

      console.log("📝 config.json actualizado automáticamente");
      console.log(`   Vector Store Único: ${ragOnlyStore.id}`);
      console.log("");
    } else {
      console.error("❌ No se encontró config.json en:", configPath);
      console.error("   Asegúrate de ejecutar este script desde la raíz del proyecto");
      return;
    }

    console.log("✅ Vector Store configurado exitosamente");
    console.log("");
    console.log("🎯 Configuración Final:");
    console.log("   ✓ 1 Vector Store único (máxima simplicidad)");
    console.log("   ✓ uploadAndPoll nativo (100% confiabilidad)");
    console.log("   ✓ Chunking automático de OpenAI (calidad óptima)");
    console.log("   ✓ Búsqueda semántica optimizada para RAG");
    console.log("   ✓ File Search activo en cada consulta");
    console.log("");
    console.log("🚀 Próximos pasos:");
    console.log("   1. Verifica que todos los archivos se indexaron correctamente");
    console.log("   2. Reinicia el bot: npm start");
    console.log("   3. Prueba búsquedas (ej: 'Ley 21.430 artículo 20')");
    console.log("");
    console.log("📋 Información del Vector Store:");
    console.log(`   ID: ${ragOnlyStore.id}`);
    console.log(`   Nombre: ${ragOnlyStore.name}`);
    console.log(`   Creado: ${ragOnlyStore.created_at}`);
    console.log("");
  } catch (error) {
    console.error("❌ Error configurando Vector Store:", error.message);
    console.error("Stack completo:", error.stack);
    process.exit(1);
  }
}

async function processKnowledgeFolder(folderName, storeId, description) {
  const folderPath = path.join(__dirname, "lexcode_instances", "general", folderName);

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
      // Preparar los archivos para uploadAndPoll
      console.log(`📤 Subiendo ${textFiles.length} archivos con uploadAndPoll...`);

      const fileStreams = textFiles.map((fileName) => {
        const filePath = path.join(folderPath, fileName);
        return fs.createReadStream(filePath);
      });

      // Usar uploadAndPoll - El método óptimo
      const batch = await openai.vectorStores.fileBatches.uploadAndPoll(
        storeId,
        { files: fileStreams }
      );

      console.log(`✅ ${description} - Indexación completada`);
      console.log(`   Estado: ${batch.status}`);
      console.log(`   Exitosos: ${batch.file_counts.completed}`);
      console.log(`   Fallidos: ${batch.file_counts.failed}`);

      if (batch.file_counts.failed > 0) {
        console.warn(
          `   ⚠️ ADVERTENCIA: ${batch.file_counts.failed} archivo(s) fallaron`
        );
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
    console.warn(`   Asegúrate de que exista: ${folderName}`);
    console.log("");
  }
}

// Verificar API key antes de ejecutar
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ OPENAI_API_KEY no está configurada");
  console.error("");
  console.error("Configura tu API key:");
  console.error("   Windows: set OPENAI_API_KEY=sk-proj-tu_api_key");
  console.error("   Linux/Mac: export OPENAI_API_KEY=sk-proj-tu_api_key");
  console.error("");
  console.error("Luego ejecuta: node setup_vector_store_SINGLE.js");
  process.exit(1);
}

// Ejecutar setup
setupVectorStore();