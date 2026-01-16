#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const INSTANCES_DIR = path.join(__dirname, '../lexcode_instances');

// Plantilla de config.json
function generateConfigTemplate(instanceId, instanceName) {
  return {
    "_comentario": `Configuración de instancia ${instanceName}`,
    "identity": instanceId,
    "modelo": "gpt-4.1",
    "temperatura": 0.3,
    "max_tokens": 2000,
    "memory": {
      "path": `bot_base/historial/${instanceId}`,
      "max_history": 40,
      "rolling_max_turns": 8,
      "semantic_top_k": 4,
      "summary_every_n_turns": 5
    },
    "knowledge": {
      "paths": [`lexcode_instances/${instanceId}/conocimiento`],
      "include_in_context": false,
      "index_in_rag": true,
      "priority": "critical",
      "maxCharsPerFile": 800000
    },
    "knowledge_rag_only": {
      "paths": [`lexcode_instances/${instanceId}/conocimiento_rag_only`],
      "include_in_context": false,
      "index_in_rag": true,
      "priority": "critical",
      "maxCharsPerFile": 1200000
    },
    "api_mode": "responses",
    "enable_web_search": true,
    "enable_file_search": true,
    "enable_functions": true,
    "enable_mcp": false,
    "vector_store_ids": [],
    "knowledge_store_id": "",
    "rag_only_store_id": "",
    "memory_store_id": "",
    "_nota_vector_stores": "Los IDs se actualizan después de crear los Vector Stores con: node scripts/create-vector-stores.js " + instanceId,
    "web_search_allow_domains": [
      "bcn.cl",
      "leychile.cl",
      "diariooficial.interior.gob.cl",
      "pjud.cl",
      "tribunalconstitucional.cl"
    ],
    "web_search_deny_domains": [
      "facebook.com",
      "x.com",
      "tiktok.com",
      "instagram.com",
      "youtube.com"
    ],
    "web_search_mode": "allowlist",
    "enforce_citations_when_web": true,
    "web_navigation": {
      "enabled": true,
      "max_depth": 3,
      "max_pages": 6,
      "same_domain_only": true,
      "timeout_ms": 20000
    },
    "user_documents": {
      "enabled": true,
      "allow_temporary": true,
      "allow_persistent": true,
      "default_mode": "ask_user",
      "user_can_choose": true,
      "storage_limit_mb": 300,
      "retention_days": 90,
      "auto_cleanup": true,
      "easy_migration": true
    },
    "enable_longterm_memory": true,
    "max_sources": 11,
    "anchored_mode": false,
    "product_mode": true,
    "dev_mode": false
  };
}

// Plantilla de builder.json
function generateBuilderTemplate(instanceId, instanceName, area) {
  return {
    "schema": "v2-structured",
    "name": `LexCode ${instanceName}`,
    "initial_configuration": {
      "type": "instructions",
      "binding": "mandatory",
      "description": `Eres LexCode ${instanceName}, sistema de inteligencia jurídica especializado en ${area} del derecho chileno.`
    },
    "configuration_base": {
      "type": "base",
      "binding": "mandatory",
      "description": "Configuración base: identidad, capacidades, estilo, principios operativos.",
      "path": `./lexcode_instances/${instanceId}/prompts/${instanceId}_base.txt`
    },
    "configuration_functional": {
      "type": "functional",
      "binding": "mandatory",
      "description": "Lógica operativa: estructura de conocimiento, fuentes válidas, jerarquía normativa.",
      "path": `./lexcode_instances/${instanceId}/prompts/${instanceId}_funcional.txt`
    }
  };
}

// Plantilla de prompt base
function generateBasePromptTemplate(instanceName, area) {
  return `# IDENTIDAD

Eres LexCode ${instanceName}, un sistema de inteligencia jurídica especializado en ${area} del derecho chileno.

[NOTA IMPORTANTE: Este es un prompt base mínimo funcional. 
Debe ser expandido con capacidades específicas del área, estilo apropiado, 
principios operativos especializados y prohibiciones de formato.]

# CAPACIDADES BÁSICAS

- Análisis jurídico especializado en ${area}
- Búsqueda en base de conocimiento especializada
- Generación de respuestas fundamentadas en normativa chilena
- Trazabilidad de fuentes y citaciones precisas

# ESTILO Y FORMATO

Profesional, técnico, preciso. 

PROHIBIDO:
- Uso de markdown informal (**, ##, etc.)
- Emojis o símbolos informales
- Formato de chat casual

OBLIGATORIO:
- Numeración jurídica formal (I., II., 1., 2., a), b))
- Estructura profesional de documentos jurídicos
- Citaciones precisas de fuentes

# PRINCIPIOS OPERATIVOS

1. Legalidad chilena como marco exclusivo
2. Base normativa concreta y verificable
3. Trazabilidad completa de fuentes
4. Protección del interés legítimo del usuario
5. Rigor técnico en el análisis jurídico

# INSTRUCCIONES DE EXPANSIÓN

Para completar este prompt base, agregar:

1. CAPACIDADES ESPECÍFICAS del área (ej: cálculo de pensiones alimenticias, análisis de contratos, etc.)
2. ESTILO DETALLADO apropiado para el área (ej: empático en familia, técnico en tributario)
3. PRINCIPIOS ESPECIALIZADOS del área jurídica
4. MARCO CONCEPTUAL específico del área
5. TIPOS DE ANÁLISIS que puede realizar en esta especialidad
`;
}

// Plantilla de prompt funcional
function generateFunctionalPromptTemplate(instanceName, area) {
  return `# ESQUEMA DE CONOCIMIENTO INTERNO

## Jerarquía Superior Interna Principal

### 1. RAG Estructural (Guía Jurídica ${instanceName})
- Columna vertebral del pensamiento jurídico en ${area}
- Principios, contextos, relaciones normativas
- Prioridad máxima en análisis doctrinales

### 2. RAG Normativo (Bloques Jurídicos ${instanceName})
- Texto legal literal con metadatos enriquecidos
- Normativa específica de ${area}
- Auditabilidad normativa real

## Jerarquía Superior Externa Secundaria

### 3. Investigación Web (Fuentes Oficiales)
- Jurisprudencia actualizada
- Vigencia de normas
- Citación explícita OBLIGATORIA

## Jerarquía Media (Solo Prediagnóstico)

### 4. Entrenamiento GPT
- Uso heurístico y de prediagnóstico únicamente
- PROHIBIDO responder solo con entrenamiento
- OBLIGACIÓN de respaldar con conocimiento interno o web

[NOTA IMPORTANTE: Este es un prompt funcional mínimo.
Debe ser expandido con el índice maestro completo de normativa disponible,
protocolos específicos del área y metodología de análisis especializada.]

# ÍNDICE MAESTRO DE NORMATIVA

[Aquí debe ir el índice completo de toda la normativa disponible en los bloques jurídicos de ${area}]

Ejemplo de estructura:

## Normativa Principal de ${area}

### Constitución Política
- Artículos relevantes para ${area}

### Códigos
- Código Civil (artículos específicos)
- Otras codificaciones relevantes

### Leyes Especiales
- Lista de leyes específicas del área

### Jurisprudencia Relevante
- Sentencias clave del área

# PROTOCOLOS DE RESPUESTA

[Aquí deben ir los protocolos específicos de cómo estructurar respuestas en ${area}]

Ejemplo de protocolo:

## Protocolo de Análisis en ${area}

1. Identificación del problema jurídico
2. Marco normativo aplicable
3. Análisis de la situación específica
4. Conclusiones y recomendaciones
5. Fundamentos legales citados

# INSTRUCCIONES DE EXPANSIÓN

Para completar este prompt funcional, agregar:

1. ÍNDICE MAESTRO completo de normativa de ${area}
2. PROTOCOLOS ESPECÍFICOS de análisis para casos típicos del área
3. METODOLOGÍA DE ANÁLISIS especializada
4. ESTRUCTURA DE RESPUESTAS apropiada para el área
5. CRITERIOS DE BÚSQUEDA en RAG para optimizar resultados
`;
}

// Comando: crear instancia
function createInstance(instanceId, instanceName, area) {
  const instancePath = path.join(INSTANCES_DIR, instanceId);
  
  if (fs.existsSync(instancePath)) {
    console.error(`❌ Error: La instancia '${instanceId}' ya existe`);
    process.exit(1);
  }
  
  console.log(`\n📁 Creando instancia '${instanceId}'...\n`);
  
  try {
    // Crear estructura de carpetas
    fs.mkdirSync(instancePath, { recursive: true });
    fs.mkdirSync(path.join(instancePath, 'prompts'), { recursive: true });
    fs.mkdirSync(path.join(instancePath, 'conocimiento'), { recursive: true });
    fs.mkdirSync(path.join(instancePath, 'conocimiento_rag_only'), { recursive: true });
    
    // Crear archivos de configuración
    const configPath = path.join(instancePath, 'config.json');
    const builderPath = path.join(instancePath, 'builder.json');
    const basePromptPath = path.join(instancePath, 'prompts', `${instanceId}_base.txt`);
    const funcPromptPath = path.join(instancePath, 'prompts', `${instanceId}_funcional.txt`);
    
    fs.writeFileSync(configPath, JSON.stringify(generateConfigTemplate(instanceId, instanceName), null, 2));
    fs.writeFileSync(builderPath, JSON.stringify(generateBuilderTemplate(instanceId, instanceName, area), null, 2));
    fs.writeFileSync(basePromptPath, generateBasePromptTemplate(instanceName, area));
    fs.writeFileSync(funcPromptPath, generateFunctionalPromptTemplate(instanceName, area));
    
    // Crear .gitkeep en carpetas vacías
    fs.writeFileSync(path.join(instancePath, 'conocimiento', '.gitkeep'), '# Carpeta para guías jurídicas especializadas\n');
    fs.writeFileSync(path.join(instancePath, 'conocimiento_rag_only', '.gitkeep'), '# Carpeta para bloques jurídicos extendidos\n');
    
    // Crear README de la instancia
    const readmePath = path.join(instancePath, 'README.md');
    const readmeContent = `# LexCode ${instanceName}

Instancia especializada en ${area} del derecho chileno.

## Estructura

- \`config.json\`: Configuración técnica de la instancia
- \`builder.json\`: Configuración de prompts
- \`prompts/\`: System prompts (base y funcional)
- \`conocimiento/\`: Guías jurídicas especializadas (RAG Estructural)
- \`conocimiento_rag_only/\`: Bloques jurídicos extendidos (RAG Normativo)

## Próximos Pasos

1. **Expandir prompts**:
   - Editar \`prompts/${instanceId}_base.txt\`
   - Editar \`prompts/${instanceId}_funcional.txt\`

2. **Agregar conocimiento**:
   - Agregar guías jurídicas en \`conocimiento/\`
   - Agregar bloques jurídicos en \`conocimiento_rag_only/\`

3. **Crear Vector Stores**:
   \`\`\`bash
   node scripts/create-vector-stores.js ${instanceId}
   \`\`\`

4. **Actualizar config.json** con los IDs de Vector Stores generados

5. **Probar la instancia**:
   \`\`\`bash
   node scripts/manage-instances.js validate ${instanceId}
   \`\`\`

## Estado Actual

- ✅ Estructura de carpetas creada
- ✅ Configuraciones base generadas
- ✅ Prompts mínimos funcionales creados
- ⏳ Pendiente: Expandir prompts con contenido especializado
- ⏳ Pendiente: Agregar conocimiento jurídico
- ⏳ Pendiente: Crear y poblar Vector Stores
`;
    fs.writeFileSync(readmePath, readmeContent);
    
    console.log(`✅ Instancia '${instanceId}' creada exitosamente\n`);
    console.log(`📂 Ubicación: ${instancePath}\n`);
    console.log(`📝 Archivos creados:`);
    console.log(`   ✅ config.json`);
    console.log(`   ✅ builder.json`);
    console.log(`   ✅ prompts/${instanceId}_base.txt`);
    console.log(`   ✅ prompts/${instanceId}_funcional.txt`);
    console.log(`   ✅ conocimiento/ (vacía, lista para poblar)`);
    console.log(`   ✅ conocimiento_rag_only/ (vacía, lista para poblar)`);
    console.log(`   ✅ README.md\n`);
    console.log(`📋 Próximos pasos:`);
    console.log(`   1. Expandir prompts en: prompts/${instanceId}_base.txt y ${instanceId}_funcional.txt`);
    console.log(`   2. Agregar conocimiento en: conocimiento/ y conocimiento_rag_only/`);
    console.log(`   3. Crear Vector Stores con: node scripts/create-vector-stores.js ${instanceId}`);
    console.log(`   4. Actualizar config.json con los IDs de Vector Stores`);
    console.log(`   5. Validar con: node scripts/manage-instances.js validate ${instanceId}\n`);
    
  } catch (err) {
    console.error(`❌ Error creando instancia: ${err.message}`);
    process.exit(1);
  }
}

// Comando: listar instancias
function listInstances() {
  if (!fs.existsSync(INSTANCES_DIR)) {
    console.log('📂 No hay instancias creadas aún');
    return;
  }
  
  const dirs = fs.readdirSync(INSTANCES_DIR);
  const instances = [];
  
  for (const dir of dirs) {
    const instancePath = path.join(INSTANCES_DIR, dir);
    const configPath = path.join(instancePath, 'config.json');
    const builderPath = path.join(instancePath, 'builder.json');
    
    if (fs.statSync(instancePath).isDirectory() && 
        fs.existsSync(configPath) && 
        fs.existsSync(builderPath)) {
      
      try {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const builder = JSON.parse(fs.readFileSync(builderPath, 'utf-8'));
        
        const hasVectorStores = config.vector_store_ids && config.vector_store_ids.length > 0;
        const hasPrompts = fs.existsSync(path.join(instancePath, 'prompts'));
        
        instances.push({
          ID: dir,
          Nombre: builder.name,
          'Vector Stores': hasVectorStores ? '✅' : '❌',
          'Prompts': hasPrompts ? '✅' : '❌',
          'Estado': (hasVectorStores && hasPrompts) ? '✅ Completa' : '⚠️ Incompleta'
        });
      } catch (err) {
        instances.push({
          ID: dir,
          Nombre: 'Error',
          'Vector Stores': '❌',
          'Prompts': '❌',
          'Estado': '❌ Error'
        });
      }
    }
  }
  
  if (instances.length === 0) {
    console.log('📂 No hay instancias válidas');
    return;
  }
  
  console.log('\n📋 Instancias disponibles:\n');
  console.table(instances);
  console.log();
}

// Comando: validar instancia
function validateInstance(instanceId) {
  const instancePath = path.join(INSTANCES_DIR, instanceId);
  
  if (!fs.existsSync(instancePath)) {
    console.error(`❌ La instancia '${instanceId}' no existe`);
    process.exit(1);
  }
  
  console.log(`\n🔍 Validando instancia '${instanceId}'...\n`);
  
  const checks = [
    { name: 'config.json', path: path.join(instancePath, 'config.json'), required: true },
    { name: 'builder.json', path: path.join(instancePath, 'builder.json'), required: true },
    { name: 'prompts/', path: path.join(instancePath, 'prompts'), required: true },
    { name: 'conocimiento/', path: path.join(instancePath, 'conocimiento'), required: true },
    { name: 'conocimiento_rag_only/', path: path.join(instancePath, 'conocimiento_rag_only'), required: true }
  ];
  
  let allValid = true;
  
  for (const check of checks) {
    const exists = fs.existsSync(check.path);
    const status = exists ? '✅' : (check.required ? '❌' : '⚠️');
    console.log(`${status} ${check.name}`);
    if (!exists && check.required) allValid = false;
  }
  
  // Validar que los prompts existan
  const basePrompt = path.join(instancePath, 'prompts', `${instanceId}_base.txt`);
  const funcPrompt = path.join(instancePath, 'prompts', `${instanceId}_funcional.txt`);
  
  console.log(`${fs.existsSync(basePrompt) ? '✅' : '❌'} ${instanceId}_base.txt`);
  console.log(`${fs.existsSync(funcPrompt) ? '✅' : '❌'} ${instanceId}_funcional.txt`);
  
  if (!fs.existsSync(basePrompt) || !fs.existsSync(funcPrompt)) allValid = false;
  
  // Validar Vector Stores
  try {
    const config = JSON.parse(fs.readFileSync(path.join(instancePath, 'config.json'), 'utf-8'));
    const hasVectorStores = config.vector_store_ids && config.vector_store_ids.length > 0;
    
    console.log(`${hasVectorStores ? '✅' : '⚠️'} Vector Stores configurados${hasVectorStores ? '' : ' (opcional hasta poblar conocimiento)'}`);
    
    // Validar contenido de conocimiento
    const conocimientoFiles = fs.readdirSync(path.join(instancePath, 'conocimiento')).filter(f => f !== '.gitkeep');
    const ragOnlyFiles = fs.readdirSync(path.join(instancePath, 'conocimiento_rag_only')).filter(f => f !== '.gitkeep');
    
    console.log(`${conocimientoFiles.length > 0 ? '✅' : '⚠️'} Archivos en conocimiento/ (${conocimientoFiles.length})`);
    console.log(`${ragOnlyFiles.length > 0 ? '✅' : '⚠️'} Archivos en conocimiento_rag_only/ (${ragOnlyFiles.length})`);
    
  } catch (err) {
    console.log(`❌ Error leyendo configuración: ${err.message}`);
    allValid = false;
  }
  
  console.log(`\n${allValid ? '✅ Instancia válida y lista para usar' : '⚠️ Instancia funcional pero incompleta'}`);
  
  if (!allValid) {
    console.log('\n💡 Recomendaciones:');
    console.log('   - Expandir los prompts con contenido especializado');
    console.log('   - Agregar archivos de conocimiento en las carpetas correspondientes');
    console.log('   - Crear Vector Stores cuando tengas contenido listo');
  }
  
  console.log();
}

// CLI
const args = process.argv.slice(2);
const command = args[0];

if (!command) {
  console.log('\n📚 Gestor de Instancias Multi-LexCode\n');
  console.log('Comandos disponibles:\n');
  console.log('  create <id> [nombre] [área]  - Crear nueva instancia');
  console.log('  list                          - Listar instancias');
  console.log('  validate <id>                 - Validar instancia\n');
  console.log('Ejemplos:\n');
  console.log('  node scripts/manage-instances.js create civil Civil "derecho civil"');
  console.log('  node scripts/manage-instances.js list');
  console.log('  node scripts/manage-instances.js validate familia\n');
  process.exit(0);
}

switch (command) {
  case 'create':
    const instanceId = args[1];
    const instanceName = args[2] || instanceId.charAt(0).toUpperCase() + instanceId.slice(1);
    const area = args[3] || 'derecho';
    
    if (!instanceId) {
      console.error('\n❌ Error: Debes especificar un ID para la instancia\n');
      console.error('Uso: node scripts/manage-instances.js create <id> [nombre] [área]');
      console.error('Ejemplo: node scripts/manage-instances.js create civil Civil "derecho civil"\n');
      process.exit(1);
    }
    
    createInstance(instanceId, instanceName, area);
    break;
    
  case 'list':
    listInstances();
    break;
    
  case 'validate':
    const validateId = args[1];
    if (!validateId) {
      console.error('\n❌ Error: Debes especificar el ID de la instancia\n');
      console.error('Uso: node scripts/manage-instances.js validate <id>\n');
      process.exit(1);
    }
    validateInstance(validateId);
    break;
    
  default:
    console.error(`\n❌ Comando desconocido: ${command}\n`);
    console.log('Comandos disponibles: create, list, validate\n');
    process.exit(1);
}

