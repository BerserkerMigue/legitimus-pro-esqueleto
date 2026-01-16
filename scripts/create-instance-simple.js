#!/usr/bin/env node

/**
 * Script simplificado para crear nuevas instancias de LexCode
 * 
 * Uso: node scripts/create-instance-simple.js <instance_id> [nombre_display] [area_especialidad]
 * 
 * Ejemplos:
 *   node scripts/create-instance-simple.js inst1
 *   node scripts/create-instance-simple.js civil "Civil" "derecho civil chileno"
 *   node scripts/create-instance-simple.js laboral "Laboral" "derecho laboral chileno"
 */

const fs = require('fs');
const path = require('path');

const INSTANCES_DIR = path.join(__dirname, '../lexcode_instances');

// Colores para consola
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Generar config.json mínimo funcional
function generateConfig(instanceId) {
  return {
    "_comentario": `Configuración de instancia ${instanceId}`,
    "_version": "V4 - Multi-Instancia",
    "identity": instanceId,
    "modelo": "gpt-4.1",
    "temperatura": 0.3,
    "max_tokens": 2000,
    "auth": {
      "enabled": true
    },
    "credits": {
      "enabled": true,
      "cost_per_request": 1,
      "initial_credits": 100
    },
    "memory": {
      "path": `lexcode_instances/${instanceId}/historial`,
      "max_history": 30,
      "rolling_max_turns": 8,
      "semantic_top_k": 4,
      "summary_every_n_turns": 5,
      "max_chat_interactions": 30,
      "warning_threshold": 5
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
    "enable_model_router": false,
    "enable_local_llm": false,
    "enable_web_search": true,
    "enable_file_search": true,
    "enable_functions": true,
    "enable_mcp": false,
    "vector_store_ids": [],
    "knowledge_store_id": "",
    "rag_only_store_id": "",
    "memory_store_id": "",
    "_nota_vector_stores": "Los IDs de Vector Stores deben configurarse después de crearlos en OpenAI",
    "web_search_allow_domains": [
      "bcn.cl",
      "leychile.cl",
      "diariooficial.interior.gob.cl",
      "pjud.cl",
      "tribunalconstitucional.cl",
      "contraloria.cl",
      "sii.cl",
      "dt.gob.cl"
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
      "max_pages": 3,
      "same_domain_only": true,
      "timeout_ms": 15000
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
    "context_defaults": {
      "timezone": "America/Santiago",
      "country": "Chile",
      "locale": "es-CL",
      "inject_date_time": true,
      "inject_region": true
    },
    "inject_datetime_context": true,
    "ui": {
      "forceKnowledgeButtons": true
    },
    "enable_longterm_memory": true,
    "max_sources": 11,
    "anchored_mode": false,
    "product_mode": true,
    "dev_mode": false,
    "cors": {
      "enabled": true,
      "origins": ["*"]
    },
    "rate_limit": {
      "windowMs": 60000,
      "max": 80
    },
    "uploads": {
      "max_mb": 50,
      "mime_allow": [
        "text/plain",
        "text/markdown",
        "application/xml",
        "application/pdf",
        "application/json",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "application/rtf"
      ]
    }
  };
}

// Generar builder.json
function generateBuilder(instanceId, displayName, area) {
  return {
    "schema": "v2-structured",
    "name": `LexCode ${displayName}`,
    "initial_configuration": {
      "type": "instructions",
      "binding": "mandatory",
      "description": `Soy LexCode ${displayName}, sistema de inteligencia jurídica especializado en ${area}.`
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

// Generar prompt base
function generateBasePrompt(displayName, area) {
  return `# IDENTIDAD

Eres LexCode ${displayName}, un sistema de inteligencia jurídica especializado en ${area}.

## MISIÓN

Proporcionar asesoría jurídica precisa, fundamentada y profesional en ${area}, basada en la normativa chilena vigente.

## CAPACIDADES PRINCIPALES

- Análisis jurídico especializado en ${area}
- Búsqueda en base de conocimiento especializada
- Generación de respuestas fundamentadas en normativa chilena
- Trazabilidad de fuentes y citaciones precisas
- Interpretación de casos concretos aplicando la legislación vigente

## ESTILO Y FORMATO

### Estilo Profesional

Profesional, técnico, preciso, claro y accesible.

### Formato de Respuestas

PROHIBIDO:
- Uso de markdown informal (**, ##, etc.)
- Emojis o símbolos informales
- Formato de chat casual
- Lenguaje coloquial o impreciso

OBLIGATORIO:
- Numeración jurídica formal (I., II., 1., 2., a), b))
- Estructura profesional de documentos jurídicos
- Citaciones precisas de fuentes (leyes, artículos, jurisprudencia)
- Lenguaje técnico-jurídico apropiado

## PRINCIPIOS OPERATIVOS

1. **Legalidad chilena como marco exclusivo**: Solo normativa y jurisprudencia chilena
2. **Base normativa concreta y verificable**: Toda afirmación debe estar respaldada
3. **Trazabilidad completa de fuentes**: Citar siempre las fuentes utilizadas
4. **Protección del interés legítimo del usuario**: Orientar hacia soluciones legales
5. **Rigor técnico en el análisis jurídico**: Precisión y exactitud en el análisis

## LIMITACIONES

- NO puedo dar asesoría sobre temas fuera de ${area}
- NO puedo inventar o suponer normativa que no existe
- NO puedo dar opiniones personales, solo análisis técnico-jurídico
- NO puedo garantizar resultados en procesos judiciales
- NO reemplazo la asesoría de un abogado en casos complejos

## MARCO DE CONOCIMIENTO

Mi conocimiento se basa en:
- Constitución Política de la República de Chile
- Códigos y leyes especiales chilenas
- Jurisprudencia de tribunales superiores chilenos
- Doctrina jurídica nacional
- Conocimiento especializado en ${area}

---

**NOTA DE CONFIGURACIÓN**: Este prompt base es funcional pero genérico. 
Para optimizar esta instancia, se recomienda expandir con:
- Capacidades específicas del área
- Estilo detallado apropiado para el área
- Principios especializados
- Marco conceptual específico
- Tipos de análisis especializados
`;
}

// Generar prompt funcional
function generateFunctionalPrompt(displayName, area) {
  return `# ESQUEMA DE CONOCIMIENTO INTERNO

## Jerarquía de Fuentes de Conocimiento

### 1. RAG Estructural (Guía Jurídica ${displayName})
- **Prioridad**: Máxima
- **Contenido**: Principios, contextos, relaciones normativas, metodología de análisis
- **Uso**: Columna vertebral del pensamiento jurídico en ${area}

### 2. RAG Normativo (Bloques Jurídicos ${displayName})
- **Prioridad**: Máxima
- **Contenido**: Texto legal literal con metadatos enriquecidos
- **Uso**: Normativa específica de ${area}, auditabilidad normativa real

### 3. Investigación Web (Fuentes Oficiales)
- **Prioridad**: Alta
- **Contenido**: Jurisprudencia actualizada, vigencia de normas
- **Uso**: Complementar conocimiento interno, verificar vigencia
- **Obligación**: Citación explícita OBLIGATORIA

### 4. Entrenamiento GPT
- **Prioridad**: Baja (solo prediagnóstico)
- **Uso**: Heurístico y de prediagnóstico únicamente
- **Prohibición**: PROHIBIDO responder solo con entrenamiento
- **Obligación**: OBLIGACIÓN de respaldar con conocimiento interno o web

## PROTOCOLOS DE RESPUESTA

### Protocolo General de Análisis

1. **Identificación del problema jurídico**
   - Determinar el área específica de ${area}
   - Identificar las normas potencialmente aplicables

2. **Marco normativo aplicable**
   - Buscar en RAG Normativo
   - Consultar fuentes web oficiales si es necesario
   - Citar artículos y leyes específicas

3. **Análisis de la situación específica**
   - Aplicar normativa al caso concreto
   - Considerar jurisprudencia relevante
   - Evaluar diferentes interpretaciones si existen

4. **Conclusiones y recomendaciones**
   - Presentar conclusión fundamentada
   - Sugerir pasos a seguir si corresponde
   - Advertir sobre limitaciones o complejidades

5. **Fundamentos legales citados**
   - Listar todas las fuentes utilizadas
   - Formato: "Código Civil, artículo 1545"
   - Formato jurisprudencia: "Corte Suprema, Rol N° XXXX-XXXX"

### Estructura de Respuesta Estándar

I. RESUMEN EJECUTIVO
   Síntesis del análisis en 2-3 líneas

II. MARCO NORMATIVO
   1. Normativa aplicable
   2. Artículos relevantes
   3. Jurisprudencia (si aplica)

III. ANÁLISIS JURÍDICO
   1. Aplicación de normativa al caso
   2. Interpretación de artículos
   3. Consideraciones especiales

IV. CONCLUSIONES
   1. Respuesta fundamentada
   2. Recomendaciones (si aplica)
   3. Advertencias o limitaciones

V. FUENTES CONSULTADAS
   Lista completa de fuentes citadas

## ÍNDICE MAESTRO DE NORMATIVA

**NOTA DE CONFIGURACIÓN**: Este índice debe ser completado con la normativa específica 
disponible en los bloques jurídicos de ${area}.

Estructura sugerida:

### Constitución Política
- Artículos relevantes para ${area}

### Códigos
- Código Civil (artículos específicos)
- Otros códigos relevantes

### Leyes Especiales
- Lista de leyes específicas del área

### Jurisprudencia Relevante
- Sentencias clave del área

## CRITERIOS DE BÚSQUEDA EN RAG

Para optimizar la búsqueda en Vector Stores:

1. **Identificar palabras clave** del área específica
2. **Priorizar términos técnicos** jurídicos
3. **Incluir números de artículos** si el usuario los menciona
4. **Buscar conceptos relacionados** si la búsqueda directa no da resultados
5. **Combinar búsquedas** en RAG Estructural y RAG Normativo

## MANEJO DE CASOS FUERA DEL ÁREA

Si la consulta está fuera de ${area}:

1. Identificar claramente que está fuera del área de especialización
2. Sugerir la instancia apropiada de LexCode si existe
3. Proporcionar orientación general solo si es absolutamente necesario
4. Advertir que la respuesta puede no ser completa

---

**NOTA DE CONFIGURACIÓN**: Este prompt funcional es genérico y funcional.
Para optimizar esta instancia, se recomienda:
- Completar el índice maestro de normativa
- Agregar protocolos específicos para casos típicos del área
- Definir metodología de análisis especializada
- Establecer criterios de búsqueda optimizados
`;
}

// Generar instance_description.txt
function generateDescription(displayName, area) {
  return `Especialista en ${area}, proporcionando asesoría jurídica precisa y fundamentada en normativa chilena vigente.`;
}

// Generar initial_greeting.txt
function generateGreeting(displayName, area) {
  return `Bienvenido a LexCode ${displayName}

Soy tu especialista en ${area}. Puedo ayudarte con:

- Análisis jurídico especializado
- Interpretación de normativa chilena
- Búsqueda de jurisprudencia relevante
- Orientación en casos concretos

¿En qué puedo asistirte hoy?`;
}

// Generar README.md
function generateReadme(instanceId, displayName, area) {
  return `# LexCode ${displayName}

Instancia especializada en ${area}.

## Información General

- **ID**: \`${instanceId}\`
- **Nombre**: LexCode ${displayName}
- **Área**: ${area}
- **Estado**: Funcional (configuración básica)

## Estructura de Archivos

\`\`\`
${instanceId}/
├── config.json                    # Configuración técnica
├── builder.json                   # Configuración de prompts
├── instance_description.txt       # Descripción para UI
├── initial_greeting.txt           # Mensaje de bienvenida
├── README.md                      # Este archivo
├── prompts/
│   ├── ${instanceId}_base.txt            # Prompt de identidad
│   └── ${instanceId}_funcional.txt       # Prompt de instrucciones
├── conocimiento/                  # Guías jurídicas (RAG Estructural)
│   └── .gitkeep
├── conocimiento_rag_only/         # Bloques jurídicos (RAG Normativo)
│   └── .gitkeep
└── historial/                     # Historial de chats (auto-generado)
\`\`\`

## Estado Actual

✅ **Estructura creada**: Todos los archivos y carpetas necesarios
✅ **Configuración funcional**: Configuración básica lista para usar
✅ **Prompts genéricos**: Prompts funcionales pero genéricos
⏳ **Conocimiento especializado**: Pendiente de agregar
⏳ **Vector Stores**: Pendiente de crear y configurar

## Próximos Pasos para Personalización

### 1. Expandir Prompts

Editar los prompts para hacerlos más específicos:

- \`prompts/${instanceId}_base.txt\`: Agregar capacidades específicas del área
- \`prompts/${instanceId}_funcional.txt\`: Completar índice de normativa y protocolos

### 2. Agregar Conocimiento

Agregar documentos especializados:

- \`conocimiento/\`: Guías jurídicas, procedimientos, conceptos
- \`conocimiento_rag_only/\`: Bloques jurídicos completos (leyes, códigos, jurisprudencia)

### 3. Crear Vector Stores

Crear Vector Stores en OpenAI para RAG:

\`\`\`bash
# Crear Vector Stores manualmente en OpenAI Platform
# Luego actualizar config.json con los IDs
\`\`\`

### 4. Actualizar Configuración

Editar \`config.json\` para agregar:

- \`knowledge_store_id\`: ID del Vector Store de conocimiento
- \`rag_only_store_id\`: ID del Vector Store de bloques jurídicos
- \`memory_store_id\`: ID del Vector Store de memoria a largo plazo

### 5. Personalizar Descripción y Greeting

Editar archivos de texto:

- \`instance_description.txt\`: Descripción breve para el selector
- \`initial_greeting.txt\`: Mensaje de bienvenida personalizado

## Uso

Esta instancia está lista para usar con configuración básica. El backend la detectará automáticamente y el frontend la mostrará en el selector de instancias.

Para crear un chat con esta instancia:

1. Iniciar sesión en LexCode
2. Seleccionar "${displayName}" en el selector de especialidades
3. Crear nuevo chat
4. Comenzar a consultar

## Renombrar Instancia

Si deseas cambiar el nombre de esta instancia:

\`\`\`bash
node scripts/rename-instance.js ${instanceId} "NuevoNombre" "nueva área de especialización"
\`\`\`

## Notas

- Esta instancia fue creada con \`create-instance-simple.js\`
- Los prompts son genéricos y funcionales
- Se recomienda personalizar antes de uso en producción
- El conocimiento especializado debe agregarse manualmente
`;
}

// Función principal
function createInstance(instanceId, displayName = null, area = null) {
  // Validar instanceId
  if (!instanceId || !/^[a-z0-9_-]+$/i.test(instanceId)) {
    log('❌ Error: El ID de instancia debe contener solo letras, números, guiones y guiones bajos', 'red');
    process.exit(1);
  }

  // Valores por defecto
  if (!displayName) {
    displayName = instanceId.charAt(0).toUpperCase() + instanceId.slice(1);
  }
  if (!area) {
    area = `${displayName.toLowerCase()}`;
  }

  const instancePath = path.join(INSTANCES_DIR, instanceId);

  // Verificar si ya existe
  if (fs.existsSync(instancePath)) {
    log(`❌ Error: La instancia '${instanceId}' ya existe`, 'red');
    log(`   Ubicación: ${instancePath}`, 'yellow');
    process.exit(1);
  }

  log(`\n🚀 Creando instancia '${instanceId}'...`, 'cyan');
  log(`   Nombre: LexCode ${displayName}`, 'blue');
  log(`   Área: ${area}`, 'blue');
  log('', 'reset');

  try {
    // Crear estructura de carpetas
    log('📁 Creando estructura de carpetas...', 'yellow');
    fs.mkdirSync(instancePath, { recursive: true });
    fs.mkdirSync(path.join(instancePath, 'prompts'), { recursive: true });
    fs.mkdirSync(path.join(instancePath, 'conocimiento'), { recursive: true });
    fs.mkdirSync(path.join(instancePath, 'conocimiento_rag_only'), { recursive: true });
    fs.mkdirSync(path.join(instancePath, 'historial'), { recursive: true });
    log('   ✅ Carpetas creadas', 'green');

    // Crear archivos de configuración
    log('📝 Generando archivos de configuración...', 'yellow');
    
    const configPath = path.join(instancePath, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(generateConfig(instanceId), null, 2));
    log('   ✅ config.json', 'green');

    const builderPath = path.join(instancePath, 'builder.json');
    fs.writeFileSync(builderPath, JSON.stringify(generateBuilder(instanceId, displayName, area), null, 2));
    log('   ✅ builder.json', 'green');

    // Crear prompts
    log('📝 Generando prompts...', 'yellow');
    
    const basePromptPath = path.join(instancePath, 'prompts', `${instanceId}_base.txt`);
    fs.writeFileSync(basePromptPath, generateBasePrompt(displayName, area));
    log('   ✅ prompt base', 'green');

    const funcPromptPath = path.join(instancePath, 'prompts', `${instanceId}_funcional.txt`);
    fs.writeFileSync(funcPromptPath, generateFunctionalPrompt(displayName, area));
    log('   ✅ prompt funcional', 'green');

    // Crear archivos de texto
    log('📝 Generando archivos de texto...', 'yellow');
    
    const descPath = path.join(instancePath, 'instance_description.txt');
    fs.writeFileSync(descPath, generateDescription(displayName, area));
    log('   ✅ instance_description.txt', 'green');

    const greetPath = path.join(instancePath, 'initial_greeting.txt');
    fs.writeFileSync(greetPath, generateGreeting(displayName, area));
    log('   ✅ initial_greeting.txt', 'green');

    // Crear README
    const readmePath = path.join(instancePath, 'README.md');
    fs.writeFileSync(readmePath, generateReadme(instanceId, displayName, area));
    log('   ✅ README.md', 'green');

    // Crear .gitkeep en carpetas vacías
    fs.writeFileSync(
      path.join(instancePath, 'conocimiento', '.gitkeep'),
      '# Carpeta para guías jurídicas especializadas (RAG Estructural)\n'
    );
    fs.writeFileSync(
      path.join(instancePath, 'conocimiento_rag_only', '.gitkeep'),
      '# Carpeta para bloques jurídicos extendidos (RAG Normativo)\n'
    );
    fs.writeFileSync(
      path.join(instancePath, 'historial', '.gitkeep'),
      '# Carpeta para historial de chats (auto-generado)\n'
    );

    log('', 'reset');
    log('✅ ¡Instancia creada exitosamente!', 'green');
    log('', 'reset');
    log('📊 Resumen:', 'cyan');
    log(`   ID: ${instanceId}`, 'blue');
    log(`   Nombre: LexCode ${displayName}`, 'blue');
    log(`   Ubicación: ${instancePath}`, 'blue');
    log('', 'reset');
    log('🎯 Próximos pasos:', 'cyan');
    log('   1. La instancia ya es funcional y será detectada automáticamente', 'blue');
    log('   2. Personaliza los prompts en prompts/', 'blue');
    log('   3. Agrega conocimiento en conocimiento/ y conocimiento_rag_only/', 'blue');
    log('   4. Crea Vector Stores en OpenAI y actualiza config.json', 'blue');
    log('', 'reset');
    log(`📖 Para más información: cat ${instancePath}/README.md`, 'yellow');
    log('', 'reset');

  } catch (error) {
    log(`\n❌ Error creando instancia: ${error.message}`, 'red');
    log(`   Stack: ${error.stack}`, 'red');
    process.exit(1);
  }
}

// Ejecutar
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
${colors.cyan}╔════════════════════════════════════════════════════════════════╗
║  LexCode - Creador Simplificado de Instancias                 ║
╚════════════════════════════════════════════════════════════════╝${colors.reset}

${colors.yellow}Uso:${colors.reset}
  node scripts/create-instance-simple.js <instance_id> [nombre] [area]

${colors.yellow}Parámetros:${colors.reset}
  instance_id    ID único de la instancia (solo letras, números, -, _)
  nombre         Nombre para mostrar (opcional, default: ID capitalizado)
  area           Área de especialización (opcional, default: nombre)

${colors.yellow}Ejemplos:${colors.reset}
  ${colors.green}# Crear con ID genérico${colors.reset}
  node scripts/create-instance-simple.js inst1

  ${colors.green}# Crear con nombre personalizado${colors.reset}
  node scripts/create-instance-simple.js civil "Civil" "derecho civil chileno"

  ${colors.green}# Crear instancia de laboral${colors.reset}
  node scripts/create-instance-simple.js laboral "Laboral" "derecho laboral chileno"

${colors.yellow}Características:${colors.reset}
  ✅ Crea estructura completa de carpetas y archivos
  ✅ Genera configuración funcional mínima
  ✅ Prompts genéricos listos para personalizar
  ✅ Detección automática por backend
  ✅ Integración automática en frontend
  ✅ README con instrucciones de personalización
`);
    process.exit(0);
  }

  const [instanceId, displayName, area] = args;
  createInstance(instanceId, displayName, area);
}

module.exports = { createInstance };

