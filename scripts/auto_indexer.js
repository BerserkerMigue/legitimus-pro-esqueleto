const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');

// Configurar OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Sistema de Indexación Automática para LexCode
 * Genera índices inteligentes y metadatos para el conocimiento jurídico
 */

class AutoIndexer {
  constructor() {
    this.botBasePath = path.join(__dirname, '..', 'bot_base');
    this.conocimientoPath = path.join(this.botBasePath, 'conocimiento');
    this.ragOnlyPath = path.join(this.botBasePath, 'conocimiento_rag_only');
    this.indexPath = path.join(this.botBasePath, 'conocimiento_index');
  }

  /**
   * Ejecuta el proceso completo de indexación automática
   */
  async runFullIndexing() {
    console.log('🤖 Iniciando indexación automática de conocimiento jurídico...');
    
    try {
      // 1. Analizar contenido existente
      const knowledgeAnalysis = await this.analyzeKnowledgeContent();
      
      // 2. Generar índice temático
      await this.generateTopicIndex(knowledgeAnalysis);
      
      // 3. Crear mapa de navegación
      await this.generateNavigationMap(knowledgeAnalysis);
      
      // 4. Generar taxonomía jurídica
      await this.generateLegalTaxonomy(knowledgeAnalysis);
      
      // 5. Crear guía de casos frecuentes
      await this.generateFrequentCasesGuide(knowledgeAnalysis);
      
      console.log('✅ Indexación automática completada exitosamente');
      
    } catch (error) {
      console.error('❌ Error en indexación automática:', error.message);
      throw error;
    }
  }

  /**
   * Analiza todo el contenido de conocimiento disponible
   */
  async analyzeKnowledgeContent() {
    console.log('📊 Analizando contenido de conocimiento...');
    
    const analysis = {
      essential: [],
      extensive: [],
      topics: new Set(),
      legalAreas: new Set(),
      keywords: new Map()
    };

    // Analizar conocimiento esencial
    if (fs.existsSync(this.conocimientoPath)) {
      const files = fs.readdirSync(this.conocimientoPath);
      for (const file of files) {
        if (file.endsWith('.txt') || file.endsWith('.md')) {
          const filePath = path.join(this.conocimientoPath, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const fileAnalysis = await this.analyzeFileContent(file, content, 'essential');
          analysis.essential.push(fileAnalysis);
          
          // Agregar temas y palabras clave
          fileAnalysis.topics.forEach(topic => analysis.topics.add(topic));
          fileAnalysis.legalAreas.forEach(area => analysis.legalAreas.add(area));
          fileAnalysis.keywords.forEach((count, keyword) => {
            analysis.keywords.set(keyword, (analysis.keywords.get(keyword) || 0) + count);
          });
        }
      }
    }

    // Analizar conocimiento extenso
    if (fs.existsSync(this.ragOnlyPath)) {
      const files = fs.readdirSync(this.ragOnlyPath);
      for (const file of files) {
        if (file.endsWith('.txt') || file.endsWith('.md')) {
          const filePath = path.join(this.ragOnlyPath, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const fileAnalysis = await this.analyzeFileContent(file, content, 'extensive');
          analysis.extensive.push(fileAnalysis);
          
          // Agregar temas y palabras clave
          fileAnalysis.topics.forEach(topic => analysis.topics.add(topic));
          fileAnalysis.legalAreas.forEach(area => analysis.legalAreas.add(area));
          fileAnalysis.keywords.forEach((count, keyword) => {
            analysis.keywords.set(keyword, (analysis.keywords.get(keyword) || 0) + count);
          });
        }
      }
    }

    // Convertir Sets a Arrays para facilitar el procesamiento
    analysis.topics = Array.from(analysis.topics);
    analysis.legalAreas = Array.from(analysis.legalAreas);

    console.log(`📊 Análisis completado: ${analysis.essential.length} archivos esenciales, ${analysis.extensive.length} archivos extensos`);
    console.log(`📊 Encontrados ${analysis.topics.length} temas y ${analysis.legalAreas.length} áreas jurídicas`);

    return analysis;
  }

  /**
   * Analiza el contenido de un archivo específico usando IA
   */
  async analyzeFileContent(fileName, content, type) {
    console.log(`🔍 Analizando: ${fileName}`);

    const prompt = `
Analiza el siguiente contenido jurídico y extrae:
1. Temas principales (máximo 5)
2. Áreas jurídicas (ej: derecho civil, laboral, tributario)
3. Palabras clave importantes (máximo 10)
4. Tipo de contenido (ej: código, jurisprudencia, guía, procedimiento)
5. Nivel de complejidad (básico, intermedio, avanzado)

Contenido:
${content.substring(0, 2000)}...

Responde en formato JSON:
{
  "topics": ["tema1", "tema2"],
  "legalAreas": ["area1", "area2"],
  "keywords": ["palabra1", "palabra2"],
  "contentType": "tipo",
  "complexity": "nivel",
  "summary": "resumen breve"
}
`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      });

      const analysis = JSON.parse(response.choices[0].message.content);
      
      // Convertir keywords array a Map con conteos
      const keywordMap = new Map();
      analysis.keywords.forEach(keyword => keywordMap.set(keyword, 1));

      return {
        fileName,
        type,
        topics: analysis.topics || [],
        legalAreas: analysis.legalAreas || [],
        keywords: keywordMap,
        contentType: analysis.contentType || 'unknown',
        complexity: analysis.complexity || 'intermedio',
        summary: analysis.summary || '',
        size: content.length
      };

    } catch (error) {
      console.warn(`⚠️ Error analizando ${fileName}:`, error.message);
      return {
        fileName,
        type,
        topics: [],
        legalAreas: [],
        keywords: new Map(),
        contentType: 'unknown',
        complexity: 'intermedio',
        summary: 'Análisis no disponible',
        size: content.length
      };
    }
  }

  /**
   * Genera un índice temático automático
   */
  async generateTopicIndex(analysis) {
    console.log('📚 Generando índice temático...');

    const topicIndex = `# ÍNDICE TEMÁTICO AUTOMÁTICO - LEXCODE
## Generado automáticamente el ${new Date().toLocaleDateString('es-CL')}

### 🎯 TEMAS PRINCIPALES IDENTIFICADOS

${analysis.topics.map((topic, index) => {
  const relatedFiles = [...analysis.essential, ...analysis.extensive]
    .filter(file => file.topics.includes(topic))
    .map(file => `- ${file.fileName} (${file.type === 'essential' ? 'contexto+RAG' : 'solo RAG'})`);
  
  return `#### ${index + 1}. ${topic.toUpperCase()}
${relatedFiles.join('\n')}
`;
}).join('\n')}

### 🏛️ ÁREAS JURÍDICAS DETECTADAS

${analysis.legalAreas.map((area, index) => {
  const relatedFiles = [...analysis.essential, ...analysis.extensive]
    .filter(file => file.legalAreas.includes(area))
    .map(file => `- ${file.fileName} (${file.contentType})`);
  
  return `#### ${index + 1}. ${area.toUpperCase()}
${relatedFiles.join('\n')}
`;
}).join('\n')}

### 🔍 PALABRAS CLAVE MÁS FRECUENTES

${Array.from(analysis.keywords.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 20)
  .map(([keyword, count], index) => `${index + 1}. **${keyword}** (${count} referencias)`)
  .join('\n')}

### 📊 ESTADÍSTICAS DEL CONOCIMIENTO

- **Archivos esenciales (contexto + RAG):** ${analysis.essential.length}
- **Archivos extensos (solo RAG):** ${analysis.extensive.length}
- **Total de temas identificados:** ${analysis.topics.length}
- **Áreas jurídicas cubiertas:** ${analysis.legalAreas.length}
- **Palabras clave únicas:** ${analysis.keywords.size}

### 🎯 RECOMENDACIONES DE USO

#### Para consultas básicas:
Usar archivos esenciales que están siempre en contexto:
${analysis.essential.map(file => `- ${file.fileName}: ${file.summary}`).join('\n')}

#### Para consultas especializadas:
Usar búsqueda RAG en archivos extensos:
${analysis.extensive.map(file => `- ${file.fileName}: ${file.summary}`).join('\n')}

---
*Índice generado automáticamente por el Sistema de Indexación Inteligente de LexCode*
`;

    fs.writeFileSync(
      path.join(this.indexPath, 'indice_tematico_automatico.txt'),
      topicIndex
    );

    console.log('✅ Índice temático generado');
  }

  /**
   * Genera un mapa de navegación inteligente
   */
  async generateNavigationMap(analysis) {
    console.log('🗺️ Generando mapa de navegación...');

    const navigationMap = `# MAPA DE NAVEGACIÓN INTELIGENTE - LEXCODE
## Sistema de navegación automática del conocimiento jurídico

### 🧭 GUÍA DE NAVEGACIÓN POR TIPO DE CONSULTA

#### 1. CONSULTAS RÁPIDAS (Acceso inmediato)
**¿Cuándo usar?** Para definiciones básicas, conceptos fundamentales, procedimientos comunes.
**Fuente:** Conocimiento esencial (siempre en contexto)

${analysis.essential.map(file => 
  `**${file.fileName}**
- Temas: ${file.topics.join(', ')}
- Complejidad: ${file.complexity}
- Mejor para: ${file.summary}
`).join('\n')}

#### 2. CONSULTAS ESPECIALIZADAS (Búsqueda RAG)
**¿Cuándo usar?** Para artículos específicos, jurisprudencia detallada, casos complejos.
**Fuente:** Conocimiento extenso (búsqueda bajo demanda)

${analysis.extensive.map(file => 
  `**${file.fileName}**
- Temas: ${file.topics.join(', ')}
- Tipo: ${file.contentType}
- Complejidad: ${file.complexity}
- Mejor para: ${file.summary}
`).join('\n')}

### 🎯 RUTAS DE NAVEGACIÓN RECOMENDADAS

#### RUTA 1: Consulta General → Específica
1. Buscar concepto básico en conocimiento esencial
2. Si necesita más detalle, usar RAG en conocimiento extenso
3. Consultar índices para referencias cruzadas

#### RUTA 2: Búsqueda Temática
1. Consultar índice temático para ubicar tema
2. Identificar archivos relevantes por área jurídica
3. Priorizar según complejidad requerida

#### RUTA 3: Navegación por Casos
1. Identificar tipo de caso en guía de casos frecuentes
2. Localizar documentos aplicables
3. Combinar conocimiento esencial y extenso según necesidad

### 🔄 FLUJO DE DECISIÓN AUTOMÁTICA

\`\`\`
Consulta del usuario
    ↓
¿Es una definición básica?
    ↓ SÍ
Buscar en conocimiento esencial
    ↓ NO
¿Requiere artículos específicos?
    ↓ SÍ
Usar RAG en conocimiento extenso
    ↓ NO
¿Necesita navegación temática?
    ↓ SÍ
Consultar índices de navegación
\`\`\`

### 📍 PUNTOS DE ACCESO RÁPIDO

${analysis.legalAreas.map(area => {
  const essentialFiles = analysis.essential.filter(f => f.legalAreas.includes(area));
  const extensiveFiles = analysis.extensive.filter(f => f.legalAreas.includes(area));
  
  return `**${area.toUpperCase()}**
- Acceso rápido: ${essentialFiles.map(f => f.fileName).join(', ') || 'No disponible'}
- Búsqueda especializada: ${extensiveFiles.map(f => f.fileName).join(', ') || 'No disponible'}`;
}).join('\n\n')}

---
*Mapa generado automáticamente basado en análisis de contenido*
`;

    fs.writeFileSync(
      path.join(this.indexPath, 'mapa_navegacion_automatico.txt'),
      navigationMap
    );

    console.log('✅ Mapa de navegación generado');
  }

  /**
   * Genera taxonomía jurídica automática
   */
  async generateLegalTaxonomy(analysis) {
    console.log('🏛️ Generando taxonomía jurídica...');

    const taxonomy = `# TAXONOMÍA JURÍDICA AUTOMÁTICA - LEXCODE
## Clasificación inteligente del conocimiento legal

### 📊 CLASIFICACIÓN POR COMPLEJIDAD

#### NIVEL BÁSICO
${analysis.essential.concat(analysis.extensive)
  .filter(f => f.complexity === 'básico')
  .map(f => `- ${f.fileName}: ${f.summary}`)
  .join('\n') || '- No hay contenido clasificado como básico'}

#### NIVEL INTERMEDIO
${analysis.essential.concat(analysis.extensive)
  .filter(f => f.complexity === 'intermedio')
  .map(f => `- ${f.fileName}: ${f.summary}`)
  .join('\n') || '- No hay contenido clasificado como intermedio'}

#### NIVEL AVANZADO
${analysis.essential.concat(analysis.extensive)
  .filter(f => f.complexity === 'avanzado')
  .map(f => `- ${f.fileName}: ${f.summary}`)
  .join('\n') || '- No hay contenido clasificado como avanzado'}

### 📚 CLASIFICACIÓN POR TIPO DE CONTENIDO

${['código', 'jurisprudencia', 'guía', 'procedimiento', 'reglamento', 'manual'].map(type => {
  const files = analysis.essential.concat(analysis.extensive)
    .filter(f => f.contentType.toLowerCase().includes(type));
  
  return `#### ${type.toUpperCase()}
${files.map(f => `- ${f.fileName} (${f.type === 'essential' ? 'esencial' : 'extenso'})`).join('\n') || '- No disponible'}`;
}).join('\n\n')}

### 🎯 MATRIZ DE ACCESO RECOMENDADO

| Área Jurídica | Nivel Básico | Nivel Intermedio | Nivel Avanzado |
|---------------|--------------|------------------|----------------|
${analysis.legalAreas.map(area => {
  const basic = analysis.essential.concat(analysis.extensive)
    .filter(f => f.legalAreas.includes(area) && f.complexity === 'básico')
    .map(f => f.fileName).join(', ') || 'N/A';
  const intermediate = analysis.essential.concat(analysis.extensive)
    .filter(f => f.legalAreas.includes(area) && f.complexity === 'intermedio')
    .map(f => f.fileName).join(', ') || 'N/A';
  const advanced = analysis.essential.concat(analysis.extensive)
    .filter(f => f.legalAreas.includes(area) && f.complexity === 'avanzado')
    .map(f => f.fileName).join(', ') || 'N/A';
  
  return `| ${area} | ${basic} | ${intermediate} | ${advanced} |`;
}).join('\n')}

---
*Taxonomía generada automáticamente mediante análisis de IA*
`;

    fs.writeFileSync(
      path.join(this.indexPath, 'taxonomia_juridica_automatica.txt'),
      taxonomy
    );

    console.log('✅ Taxonomía jurídica generada');
  }

  /**
   * Genera guía de casos frecuentes
   */
  async generateFrequentCasesGuide(analysis) {
    console.log('📋 Generando guía de casos frecuentes...');

    const casesGuide = `# GUÍA DE CASOS FRECUENTES - LEXCODE
## Casos típicos y rutas de resolución automática

### 🎯 CASOS IDENTIFICADOS AUTOMÁTICAMENTE

${analysis.topics.slice(0, 10).map((topic, index) => {
  const relatedFiles = analysis.essential.concat(analysis.extensive)
    .filter(f => f.topics.includes(topic));
  
  return `#### CASO ${index + 1}: ${topic.toUpperCase()}

**Archivos relevantes:**
${relatedFiles.map(f => `- ${f.fileName} (${f.type === 'essential' ? 'acceso inmediato' : 'búsqueda RAG'})`).join('\n')}

**Estrategia de consulta:**
1. ${relatedFiles.find(f => f.type === 'essential') ? 'Consultar definición básica en conocimiento esencial' : 'Iniciar con búsqueda RAG'}
2. ${relatedFiles.find(f => f.type === 'extensive') ? 'Profundizar con búsqueda RAG en conocimiento extenso' : 'Usar solo conocimiento esencial disponible'}
3. Verificar referencias cruzadas en índices

**Complejidad típica:** ${relatedFiles[0]?.complexity || 'Variable'}
`;
}).join('\n')}

### 🔄 PATRONES DE CONSULTA DETECTADOS

#### PATRÓN 1: Definición → Aplicación
**Casos típicos:** Conceptos jurídicos básicos
**Ruta:** Conocimiento esencial → RAG si necesario

#### PATRÓN 2: Búsqueda de Artículos
**Casos típicos:** Referencias específicas a códigos
**Ruta:** RAG directo en conocimiento extenso

#### PATRÓN 3: Análisis de Casos
**Casos típicos:** Jurisprudencia y precedentes
**Ruta:** Combinación de esencial + RAG extenso

### 📊 ESTADÍSTICAS DE CASOS

- **Total de temas identificados:** ${analysis.topics.length}
- **Casos con acceso inmediato:** ${analysis.essential.length}
- **Casos que requieren RAG:** ${analysis.extensive.length}
- **Casos híbridos (esencial + RAG):** ${analysis.topics.filter(topic => 
    analysis.essential.some(f => f.topics.includes(topic)) && 
    analysis.extensive.some(f => f.topics.includes(topic))
  ).length}

### 🎯 RECOMENDACIONES DE OPTIMIZACIÓN

1. **Para casos frecuentes:** Mantener en conocimiento esencial
2. **Para casos especializados:** Optimizar indexación RAG
3. **Para casos híbridos:** Asegurar referencias cruzadas

---
*Guía generada automáticamente basada en análisis de patrones*
`;

    fs.writeFileSync(
      path.join(this.indexPath, 'guia_casos_frecuentes_automatica.txt'),
      casesGuide
    );

    console.log('✅ Guía de casos frecuentes generada');
  }
}

// Función principal para ejecutar desde línea de comandos
async function runAutoIndexing() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY no está configurada');
    console.log('💡 Configura tu API key:');
    console.log('   Windows: set OPENAI_API_KEY=sk-proj-tu_api_key');
    console.log('   Linux/Mac: export OPENAI_API_KEY=sk-proj-tu_api_key');
    process.exit(1);
  }

  try {
    const indexer = new AutoIndexer();
    await indexer.runFullIndexing();
    
    console.log('');
    console.log('🎉 ¡Indexación automática completada exitosamente!');
    console.log('');
    console.log('📁 Archivos generados en conocimiento_index/:');
    console.log('✅ indice_tematico_automatico.txt');
    console.log('✅ mapa_navegacion_automatico.txt');
    console.log('✅ taxonomia_juridica_automatica.txt');
    console.log('✅ guia_casos_frecuentes_automatica.txt');
    console.log('');
    console.log('🚀 Próximos pasos:');
    console.log('1. Revisar los índices generados');
    console.log('2. Ejecutar setup de vector stores: node scripts/setup_vector_stores.js');
    console.log('3. Reiniciar el bot para usar los nuevos índices');
    
  } catch (error) {
    console.error('❌ Error en indexación automática:', error.message);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  runAutoIndexing();
}

module.exports = { AutoIndexer };

