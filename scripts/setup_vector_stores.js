const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');

// Configurar OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

async function setupVectorStores() {
  try {
    console.log('🚀 Configurando Vector Stores para LexCode con estructura de 3 carpetas...');
    
    // 1. Crear Knowledge Vector Store (para conocimiento esencial + índices)
    console.log('📚 Creando Knowledge Store (esencial + índices)...');
    const knowledgeStore = await openai.vectorStores.create({
      name: 'LexCode Knowledge Base - Essential',
      expires_after: {
        anchor: 'last_active_at',
        days: 30
      }
    });
    
    console.log(`📚 Knowledge Store ID: ${knowledgeStore.id}`);
    
    // 2. Crear RAG-Only Vector Store (para conocimiento extenso)
    console.log('🔍 Creando RAG-Only Store (conocimiento extenso)...');
    const ragOnlyStore = await openai.vectorStores.create({
      name: 'LexCode Knowledge Base - RAG Only',
      expires_after: {
        anchor: 'last_active_at',
        days: 30
      }
    });
    
    console.log(`🔍 RAG-Only Store ID: ${ragOnlyStore.id}`);
    
    // 3. Crear Memory Vector Store
    console.log('🧠 Creando Memory Store...');
    const memoryStore = await openai.vectorStores.create({
      name: 'LexCode Memory Store',
      expires_after: {
        anchor: 'last_active_at',
        days: 30
      }
    });
    
    console.log(`🧠 Memory Store ID: ${memoryStore.id}`);
    
    // 4. Procesar carpeta conocimiento/ (esencial - contexto + RAG)
    await processKnowledgeFolder('conocimiento', knowledgeStore.id, 'Conocimiento Esencial');
    
    // 5. Procesar carpeta conocimiento_index/ (índices - contexto + RAG)
    await processKnowledgeFolder('conocimiento_index', knowledgeStore.id, 'Índices de Conocimiento');
    
    // 6. Procesar carpeta conocimiento_rag_only/ (extenso - solo RAG)
    await processKnowledgeFolder('conocimiento_rag_only', ragOnlyStore.id, 'Conocimiento Extenso (RAG Only)');
    
    // 7. Actualizar config.json con los IDs reales
    const configPath = path.join(__dirname, '..', 'bot_base', 'config.json');
    
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      
      // Actualizar con los IDs reales generados por OpenAI
      config.vector_store_ids = [knowledgeStore.id, ragOnlyStore.id];
      config.knowledge_store_id = knowledgeStore.id;
      config.rag_only_store_id = ragOnlyStore.id;
      config.memory_store_id = memoryStore.id;
      
      // Escribir config actualizado
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      
      console.log('📝 Config.json actualizado con IDs reales');
      console.log(`   Knowledge Store (esencial): ${knowledgeStore.id}`);
      console.log(`   RAG-Only Store (extenso): ${ragOnlyStore.id}`);
      console.log(`   Memory Store: ${memoryStore.id}`);
    } else {
      console.error('❌ No se encontró config.json en:', configPath);
      return;
    }
    
    console.log('✅ Vector Stores configurados exitosamente');
    console.log('');
    console.log('🎯 Estructura de 3 carpetas implementada:');
    console.log('📁 conocimiento/ → Contexto + RAG (esencial)');
    console.log('📁 conocimiento_index/ → Contexto + RAG (navegación)');
    console.log('📁 conocimiento_rag_only/ → Solo RAG (extenso)');
    console.log('');
    console.log('🚀 Funcionalidades habilitadas:');
    console.log('✅ Memoria conversacional (mantiene funcionamiento actual)');
    console.log('✅ RAG optimizado con conocimiento categorizado');
    console.log('✅ Navegación inteligente de conocimiento');
    console.log('✅ Escalabilidad para documentos extensos');
    console.log('');
    console.log('🚀 Próximos pasos:');
    console.log('1. Reiniciar el bot: npm start');
    console.log('2. Probar que la memoria sigue funcionando');
    console.log('3. Probar búsquedas RAG optimizadas');
    console.log('4. Verificar navegación de conocimiento');
    
  } catch (error) {
    console.error('❌ Error configurando Vector Stores:', error.message);
    console.error('Stack completo:', error.stack);
    
    if (error.message.includes('API key')) {
      console.log('💡 Asegúrate de que OPENAI_API_KEY esté configurada correctamente');
    }
    
    process.exit(1);
  }
}

// Función auxiliar para procesar carpetas de conocimiento
async function processKnowledgeFolder(folderName, storeId, description) {
  const folderPath = path.join(__dirname, '..', 'bot_base', folderName);
  
  if (fs.existsSync(folderPath)) {
    const files = fs.readdirSync(folderPath);
    const textFiles = files.filter(file => 
      file.endsWith('.txt') || file.endsWith('.md') || file.endsWith('.json')
    );
    
    console.log(`📄 ${description}: ${textFiles.length} archivos encontrados`);
    
    for (const fileName of textFiles) {
      const filePath = path.join(folderPath, fileName);
      console.log(`📤 Subiendo: ${folderName}/${fileName}`);
      
      try {
        // Crear archivo en OpenAI
        const fileStream = fs.createReadStream(filePath);
        const file = await openai.files.create({
          file: fileStream,
          purpose: 'assistants'
        });
        
        // Agregar archivo al vector store usando la API correcta
        await openai.vectorStores.files.create(storeId, {
          file_id: file.id
        });
        
        console.log(`✅ ${folderName}/${fileName} subido exitosamente`);
      } catch (fileError) {
        console.warn(`⚠️ Error subiendo ${folderName}/${fileName}:`, fileError.message);
      }
    }
  } else {
    console.warn(`⚠️ Directorio ${folderName} no encontrado:`, folderPath);
  }
}

// Verificar API key antes de ejecutar
if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY no está configurada');
  console.log('💡 Configura tu API key:');
  console.log('   Windows: set OPENAI_API_KEY=sk-proj-tu_api_key');
  console.log('   Linux/Mac: export OPENAI_API_KEY=sk-proj-tu_api_key');
  process.exit(1);
}

// Ejecutar setup
setupVectorStores();

