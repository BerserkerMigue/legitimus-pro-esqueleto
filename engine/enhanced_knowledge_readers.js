// engine/enhanced_knowledge_readers.js - Knowledge readers con RAG y embeddings
'use strict';

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
const { listKnowledgeFiles, readTextSync, searchAll } = require('./knowledge_readers');

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Busca en el conocimiento usando embeddings y similitud semántica
 */
async function searchWithEmbeddings(query, options = {}) {
  try {
    const {
      maxResults = 5,
      threshold = 0.7,
      includeMetadata = true
    } = options;

    // Generar embedding para la consulta
    const queryEmbedding = await client.embeddings.create({
      model: 'text-embedding-3-small',
      input: query
    });

    // Obtener archivos de conocimiento
    const knowledgeFiles = listKnowledgeFiles();
    const results = [];

    for (const file of knowledgeFiles) {
      try {
        // Leer contenido del archivo
        let content = '';
        if (file.ext === '.pdf') {
          // Para PDFs, usar el extractor existente
          const { extractPdfText } = require('./knowledge_readers');
          const pdfData = await extractPdfText(file.path);
          content = pdfData.text;
        } else {
          content = readTextSync(file.path);
        }

        // Dividir en chunks para procesar
        const chunks = splitIntoChunks(content, 1000);
        
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          
          // Generar embedding para el chunk
          const chunkEmbedding = await client.embeddings.create({
            model: 'text-embedding-3-small',
            input: chunk
          });

          // Calcular similitud coseno
          const similarity = cosineSimilarity(
            queryEmbedding.data[0].embedding,
            chunkEmbedding.data[0].embedding
          );

          if (similarity >= threshold) {
            results.push({
              file: file.name,
              chunk: i,
              similarity: similarity,
              content: chunk,
              preview: chunk.substring(0, 200) + '...',
              metadata: includeMetadata ? {
                path: file.path,
                ext: file.ext,
                size: content.length
              } : null
            });
          }
        }
      } catch (fileError) {
        console.error(`Error procesando ${file.name}:`, fileError.message);
      }
    }

    // Ordenar por similitud y limitar resultados
    results.sort((a, b) => b.similarity - a.similarity);
    return results.slice(0, maxResults);

  } catch (error) {
    console.error('Error en searchWithEmbeddings:', error);
    // Fallback a búsqueda tradicional
    console.log('Usando búsqueda tradicional como fallback...');
    return await searchAll(query);
  }
}

/**
 * Divide texto en chunks de tamaño específico
 */
function splitIntoChunks(text, chunkSize = 1000, overlap = 100) {
  const chunks = [];
  const words = text.split(/\s+/);
  
  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk.trim()) {
      chunks.push(chunk.trim());
    }
  }
  
  return chunks;
}

/**
 * Calcula similitud coseno entre dos vectores
 */
function cosineSimilarity(vecA, vecB) {
  if (vecA.length !== vecB.length) {
    throw new Error('Los vectores deben tener la misma longitud');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (normA * normB);
}

/**
 * Busca conocimiento relevante combinando métodos tradicionales y embeddings
 */
async function searchKnowledgeHybrid(query, options = {}) {
  try {
    const {
      useEmbeddings = true,
      useTraditional = true,
      maxResults = 10
    } = options;

    const results = [];

    // Búsqueda tradicional (keyword-based)
    if (useTraditional) {
      const traditionalResults = await searchAll(query);
      results.push(...traditionalResults.map(r => ({
        ...r,
        method: 'traditional',
        score: 0.5 // Score base para resultados tradicionales
      })));
    }

    // Búsqueda con embeddings (semantic)
    if (useEmbeddings) {
      const embeddingResults = await searchWithEmbeddings(query, {
        maxResults: Math.ceil(maxResults / 2),
        threshold: 0.6
      });
      results.push(...embeddingResults.map(r => ({
        file: r.file,
        preview: r.preview,
        content: r.content,
        method: 'embeddings',
        score: r.similarity,
        metadata: r.metadata
      })));
    }

    // Combinar y deduplicar resultados
    const uniqueResults = new Map();
    
    for (const result of results) {
      const key = `${result.file}_${result.preview?.substring(0, 50)}`;
      
      if (!uniqueResults.has(key) || uniqueResults.get(key).score < result.score) {
        uniqueResults.set(key, result);
      }
    }

    // Ordenar por score y limitar
    const finalResults = Array.from(uniqueResults.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    return finalResults;

  } catch (error) {
    console.error('Error en searchKnowledgeHybrid:', error);
    // Fallback completo a búsqueda tradicional
    return await searchAll(query);
  }
}

/**
 * Genera resumen inteligente del conocimiento relevante
 */
async function generateKnowledgeSummary(query, searchResults) {
  try {
    if (!searchResults || searchResults.length === 0) {
      return 'No se encontró información relevante en el conocimiento cargado.';
    }

    // Preparar contexto para el resumen
    const context = searchResults.map((result, index) => {
      return `[${index + 1}] Archivo: ${result.file}\nContenido: ${result.preview || result.content?.substring(0, 300)}`;
    }).join('\n\n');

    const prompt = `Basándote en la siguiente información del conocimiento jurídico, genera un resumen conciso y relevante para la consulta: "${query}"

INFORMACIÓN DISPONIBLE:
${context}

Genera un resumen que:
1. Identifique los puntos más relevantes para la consulta
2. Cite las fuentes específicas (nombres de archivos)
3. Mantenga precisión jurídica
4. Sea conciso pero completo

RESUMEN:`;

    const response = await client.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
      temperature: 0.3
    });

    return response.choices[0].message.content;

  } catch (error) {
    console.error('Error generando resumen:', error);
    // Fallback a resumen simple
    const files = [...new Set(searchResults.map(r => r.file))];
    return `Se encontró información relevante en: ${files.join(', ')}. Revisar contenido específico para detalles.`;
  }
}

/**
 * Función principal para búsqueda inteligente de conocimiento
 */
async function intelligentKnowledgeSearch(query, options = {}) {
  try {
    console.log(`Buscando conocimiento para: "${query}"`);
    
    // Realizar búsqueda híbrida
    const searchResults = await searchKnowledgeHybrid(query, options);
    
    // Generar resumen si hay resultados
    let summary = null;
    if (searchResults.length > 0) {
      summary = await generateKnowledgeSummary(query, searchResults);
    }

    return {
      query,
      results: searchResults,
      summary,
      total_found: searchResults.length,
      methods_used: {
        traditional: options.useTraditional !== false,
        embeddings: options.useEmbeddings !== false
      }
    };

  } catch (error) {
    console.error('Error en intelligentKnowledgeSearch:', error);
    
    // Fallback completo
    const fallbackResults = await searchAll(query);
    return {
      query,
      results: fallbackResults.map(r => ({ ...r, method: 'fallback', score: 0.3 })),
      summary: 'Búsqueda realizada con método tradicional (fallback).',
      total_found: fallbackResults.length,
      methods_used: { traditional: true, embeddings: false }
    };
  }
}

module.exports = {
  searchWithEmbeddings,
  searchKnowledgeHybrid,
  generateKnowledgeSummary,
  intelligentKnowledgeSearch,
  splitIntoChunks,
  cosineSimilarity
};

