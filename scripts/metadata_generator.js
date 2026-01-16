const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Generador de Metadatos Automático para LexCode
 * Crea metadatos estructurados para cada archivo de conocimiento
 */

class MetadataGenerator {
  constructor() {
    this.botBasePath = path.join(__dirname, '..', 'bot_base');
    this.metadataPath = path.join(this.botBasePath, 'conocimiento_index', 'metadata');
    
    // Crear directorio de metadatos si no existe
    if (!fs.existsSync(this.metadataPath)) {
      fs.mkdirSync(this.metadataPath, { recursive: true });
    }
  }

  /**
   * Genera metadatos para todos los archivos de conocimiento
   */
  async generateAllMetadata() {
    console.log('📊 Generando metadatos automáticos...');

    const folders = [
      { name: 'conocimiento', type: 'essential' },
      { name: 'conocimiento_rag_only', type: 'extensive' },
      { name: 'conocimiento_index', type: 'index' }
    ];

    const allMetadata = [];

    for (const folder of folders) {
      const folderPath = path.join(this.botBasePath, folder.name);
      if (fs.existsSync(folderPath)) {
        const files = fs.readdirSync(folderPath)
          .filter(file => file.endsWith('.txt') || file.endsWith('.md'))
          .filter(file => !file.startsWith('README') && !file.includes('metadata'));

        for (const file of files) {
          const filePath = path.join(folderPath, file);
          const metadata = await this.generateFileMetadata(filePath, folder.type);
          allMetadata.push(metadata);
          
          // Guardar metadatos individuales
          const metadataFile = path.join(this.metadataPath, `${file}.metadata.json`);
          fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
        }
      }
    }

    // Generar índice maestro de metadatos
    await this.generateMasterIndex(allMetadata);
    
    // Generar estadísticas del conocimiento
    await this.generateKnowledgeStats(allMetadata);

    console.log(`✅ Metadatos generados para ${allMetadata.length} archivos`);
    return allMetadata;
  }

  /**
   * Genera metadatos para un archivo específico
   */
  async generateFileMetadata(filePath, type) {
    const fileName = path.basename(filePath);
    const content = fs.readFileSync(filePath, 'utf-8');
    const stats = fs.statSync(filePath);

    console.log(`📄 Generando metadatos para: ${fileName}`);

    // Análisis básico del contenido
    const analysis = this.analyzeContent(content);
    
    // Generar hash del contenido para detectar cambios
    const contentHash = crypto.createHash('md5').update(content).digest('hex');

    const metadata = {
      // Información básica del archivo
      file: {
        name: fileName,
        path: filePath,
        type: type,
        size: stats.size,
        created: stats.birthtime,
        modified: stats.mtime,
        contentHash: contentHash
      },
      
      // Análisis del contenido
      content: {
        length: content.length,
        lines: content.split('\n').length,
        words: analysis.wordCount,
        paragraphs: analysis.paragraphCount,
        encoding: 'utf-8'
      },
      
      // Análisis jurídico automático
      legal: {
        estimatedTopics: analysis.topics,
        legalTerms: analysis.legalTerms,
        complexity: analysis.complexity,
        contentType: analysis.contentType,
        language: 'es-CL'
      },
      
      // Configuración de uso
      usage: {
        includeInContext: type === 'essential' || type === 'index',
        indexInRAG: true,
        priority: type === 'index' ? 'high' : 'normal',
        maxChars: this.getMaxCharsForType(type)
      },
      
      // Metadatos de indexación
      indexing: {
        lastIndexed: null,
        vectorStoreId: null,
        searchable: true,
        tags: this.generateTags(fileName, content, type)
      },
      
      // Información de generación
      metadata: {
        generatedAt: new Date().toISOString(),
        version: '1.0',
        generator: 'LexCode MetadataGenerator'
      }
    };

    return metadata;
  }

  /**
   * Analiza el contenido de un archivo
   */
  analyzeContent(content) {
    const lines = content.split('\n');
    const words = content.split(/\s+/).filter(word => word.length > 0);
    const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0);

    // Detectar temas jurídicos comunes
    const legalKeywords = [
      'contrato', 'obligación', 'derecho', 'ley', 'código', 'artículo',
      'responsabilidad', 'civil', 'penal', 'laboral', 'tributario',
      'procedimiento', 'jurisprudencia', 'tribunal', 'demanda', 'sentencia'
    ];

    const topics = [];
    const legalTerms = [];
    
    legalKeywords.forEach(keyword => {
      const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
      const matches = content.match(regex);
      if (matches && matches.length > 2) {
        topics.push(keyword);
        legalTerms.push({
          term: keyword,
          frequency: matches.length
        });
      }
    });

    // Determinar complejidad basada en longitud y términos técnicos
    let complexity = 'intermedio';
    if (content.length < 5000 && legalTerms.length < 5) {
      complexity = 'básico';
    } else if (content.length > 20000 && legalTerms.length > 15) {
      complexity = 'avanzado';
    }

    // Determinar tipo de contenido
    let contentType = 'guía';
    if (content.includes('Artículo') && content.includes('Código')) {
      contentType = 'código';
    } else if (content.includes('sentencia') || content.includes('jurisprudencia')) {
      contentType = 'jurisprudencia';
    } else if (content.includes('procedimiento') || content.includes('trámite')) {
      contentType = 'procedimiento';
    } else if (content.includes('índice') || content.includes('mapa')) {
      contentType = 'índice';
    }

    return {
      wordCount: words.length,
      paragraphCount: paragraphs.length,
      topics: topics.slice(0, 5), // Máximo 5 temas
      legalTerms: legalTerms.slice(0, 10), // Máximo 10 términos
      complexity,
      contentType
    };
  }

  /**
   * Obtiene el límite de caracteres según el tipo de archivo
   */
  getMaxCharsForType(type) {
    switch (type) {
      case 'essential': return 27000;
      case 'index': return 15000;
      case 'extensive': return 100000;
      default: return 27000;
    }
  }

  /**
   * Genera tags automáticos para un archivo
   */
  generateTags(fileName, content, type) {
    const tags = [type];
    
    // Tags basados en el nombre del archivo
    if (fileName.includes('guia')) tags.push('guía');
    if (fileName.includes('codigo')) tags.push('código');
    if (fileName.includes('indice')) tags.push('índice');
    if (fileName.includes('mapa')) tags.push('navegación');
    
    // Tags basados en el contenido
    if (content.includes('civil')) tags.push('derecho-civil');
    if (content.includes('laboral')) tags.push('derecho-laboral');
    if (content.includes('tributario')) tags.push('derecho-tributario');
    if (content.includes('penal')) tags.push('derecho-penal');
    if (content.includes('procedimiento')) tags.push('procedimiento');
    if (content.includes('contrato')) tags.push('contratos');
    
    return [...new Set(tags)]; // Eliminar duplicados
  }

  /**
   * Genera índice maestro de todos los metadatos
   */
  async generateMasterIndex(allMetadata) {
    console.log('📚 Generando índice maestro de metadatos...');

    const masterIndex = {
      generated: new Date().toISOString(),
      totalFiles: allMetadata.length,
      summary: {
        byType: {},
        byComplexity: {},
        byContentType: {},
        totalSize: 0,
        totalWords: 0
      },
      files: allMetadata.map(meta => ({
        name: meta.file.name,
        type: meta.file.type,
        size: meta.file.size,
        complexity: meta.legal.complexity,
        contentType: meta.legal.contentType,
        topics: meta.legal.estimatedTopics,
        tags: meta.indexing.tags,
        includeInContext: meta.usage.includeInContext,
        priority: meta.usage.priority
      }))
    };

    // Calcular estadísticas
    allMetadata.forEach(meta => {
      const type = meta.file.type;
      const complexity = meta.legal.complexity;
      const contentType = meta.legal.contentType;

      masterIndex.summary.byType[type] = (masterIndex.summary.byType[type] || 0) + 1;
      masterIndex.summary.byComplexity[complexity] = (masterIndex.summary.byComplexity[complexity] || 0) + 1;
      masterIndex.summary.byContentType[contentType] = (masterIndex.summary.byContentType[contentType] || 0) + 1;
      masterIndex.summary.totalSize += meta.file.size;
      masterIndex.summary.totalWords += meta.content.words;
    });

    fs.writeFileSync(
      path.join(this.metadataPath, 'master_index.json'),
      JSON.stringify(masterIndex, null, 2)
    );

    console.log('✅ Índice maestro generado');
  }

  /**
   * Genera estadísticas del conocimiento
   */
  async generateKnowledgeStats(allMetadata) {
    console.log('📊 Generando estadísticas del conocimiento...');

    const stats = `# ESTADÍSTICAS DEL CONOCIMIENTO - LEXCODE
## Análisis automático del contenido jurídico

### 📊 RESUMEN GENERAL

- **Total de archivos:** ${allMetadata.length}
- **Tamaño total:** ${Math.round(allMetadata.reduce((sum, meta) => sum + meta.file.size, 0) / 1024)} KB
- **Total de palabras:** ${allMetadata.reduce((sum, meta) => sum + meta.content.words, 0).toLocaleString()}
- **Generado:** ${new Date().toLocaleDateString('es-CL')}

### 📁 DISTRIBUCIÓN POR TIPO

${Object.entries(allMetadata.reduce((acc, meta) => {
  acc[meta.file.type] = (acc[meta.file.type] || 0) + 1;
  return acc;
}, {})).map(([type, count]) => `- **${type}:** ${count} archivos`).join('\n')}

### 🎯 DISTRIBUCIÓN POR COMPLEJIDAD

${Object.entries(allMetadata.reduce((acc, meta) => {
  acc[meta.legal.complexity] = (acc[meta.legal.complexity] || 0) + 1;
  return acc;
}, {})).map(([complexity, count]) => `- **${complexity}:** ${count} archivos`).join('\n')}

### 📚 DISTRIBUCIÓN POR TIPO DE CONTENIDO

${Object.entries(allMetadata.reduce((acc, meta) => {
  acc[meta.legal.contentType] = (acc[meta.legal.contentType] || 0) + 1;
  return acc;
}, {})).map(([contentType, count]) => `- **${contentType}:** ${count} archivos`).join('\n')}

### 🏷️ TAGS MÁS FRECUENTES

${Object.entries(allMetadata.reduce((acc, meta) => {
  meta.indexing.tags.forEach(tag => {
    acc[tag] = (acc[tag] || 0) + 1;
  });
  return acc;
}, {}))
.sort((a, b) => b[1] - a[1])
.slice(0, 10)
.map(([tag, count]) => `- **${tag}:** ${count} archivos`)
.join('\n')}

### 📈 ANÁLISIS DE EFICIENCIA

#### Archivos en Contexto (acceso inmediato)
${allMetadata.filter(meta => meta.usage.includeInContext).length} archivos

#### Archivos solo RAG (búsqueda bajo demanda)
${allMetadata.filter(meta => !meta.usage.includeInContext).length} archivos

#### Archivos de alta prioridad
${allMetadata.filter(meta => meta.usage.priority === 'high').length} archivos

### 🔍 TÉRMINOS JURÍDICOS MÁS FRECUENTES

${Object.entries(allMetadata
.flatMap(meta => meta.legal.legalTerms)
.reduce((acc, term) => {
  acc[term.term] = (acc[term.term] || 0) + term.frequency;
  return acc;
}, {}))
.sort((a, b) => b[1] - a[1])
.slice(0, 15)
.map(([term, freq]) => `- **${term}:** ${freq} menciones`)
.join('\n')}

### 📋 RECOMENDACIONES DE OPTIMIZACIÓN

1. **Balanceo de carga:** ${allMetadata.filter(meta => meta.usage.includeInContext).length > 5 ? 'Considerar mover algunos archivos esenciales a RAG-only' : 'Distribución adecuada'}

2. **Cobertura temática:** ${Object.keys(allMetadata.reduce((acc, meta) => {
  meta.legal.estimatedTopics.forEach(topic => acc[topic] = true);
  return acc;
}, {})).length} temas únicos identificados

3. **Complejidad:** ${allMetadata.filter(meta => meta.legal.complexity === 'básico').length < 3 ? 'Considerar agregar más contenido básico' : 'Buena distribución de complejidad'}

---
*Estadísticas generadas automáticamente por el Sistema de Metadatos de LexCode*
`;

    fs.writeFileSync(
      path.join(this.botBasePath, 'conocimiento_index', 'estadisticas_conocimiento.txt'),
      stats
    );

    console.log('✅ Estadísticas del conocimiento generadas');
  }
}

// Función principal para ejecutar desde línea de comandos
async function runMetadataGeneration() {
  try {
    const generator = new MetadataGenerator();
    await generator.generateAllMetadata();
    
    console.log('');
    console.log('🎉 ¡Generación de metadatos completada exitosamente!');
    console.log('');
    console.log('📁 Archivos generados:');
    console.log('✅ Metadatos individuales en conocimiento_index/metadata/');
    console.log('✅ Índice maestro: master_index.json');
    console.log('✅ Estadísticas: estadisticas_conocimiento.txt');
    console.log('');
    console.log('🚀 Próximos pasos:');
    console.log('1. Revisar metadatos generados');
    console.log('2. Ejecutar indexación automática: node scripts/auto_indexer.js');
    console.log('3. Configurar vector stores: node scripts/setup_vector_stores.js');
    
  } catch (error) {
    console.error('❌ Error en generación de metadatos:', error.message);
    process.exit(1);
  }
}

// Ejecutar si se llama directamente
if (require.main === module) {
  runMetadataGeneration();
}

module.exports = { MetadataGenerator };

