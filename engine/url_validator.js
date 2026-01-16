const fs = require('fs');
const path = require('path');

// VERSIÓN 2.1: Soporta ambos formatos de bloques (antiguo y nuevo)
// Este módulo extrae URLs de los chunks del file_search y valida/corrige las URLs citadas por el modelo
// Reconoce:
// - Formato antiguo: **ulr parte norma especifica pdf**: URL
// - Formato nuevo: >>>ulr_start<<< URL >>>ulr_end<<<

/**
 * Regex para detectar URLs de BCN LeyChile con idnorma e idparte
 * Formato esperado: https://www.bcn.cl/leychile/navegar?idnorma=XXXXX&idparte=XXXXXXX
 */
const BCN_URL_REGEX = /https?:\/\/(?:www\.)?bcn\.cl\/leychile\/navegar\?[^\s\]\)\"\'<>]+/gi;

/**
 * Regex más estricto para URLs completas con idparte
 */
const BCN_URL_COMPLETE_REGEX = /https?:\/\/(?:www\.)?bcn\.cl\/leychile\/navegar\?idnorma=\d+&idparte=\d+/gi;

/**
 * Regex para formato antiguo: **ulr parte norma especifica pdf**: URL
 */
const METADATA_URL_REGEX = /\*\*ulr\s+parte\s+norma\s+especifica\s+pdf\*\*:\s*(https?:\/\/[^\s\n]+)/gi;

/**
 * Regex para formato nuevo: >>>ulr_start<<< URL >>>ulr_end<<<
 */
const BLOCK_URL_REGEX = />>>ulr_start<<<\s*(https?:\/\/[^\n]+?)\s*>>>ulr_end<<</gi;

/**
 * Patrones para identificar encabezados de artículos en los chunks
 * Ejemplos:
 * - "## codigo civil - dfl 1 2000 articulo 2 con doble articulado articulo 12"
 * - "## codigo penal - codigo penal 1.874 articulo 1"
 */
const CHUNK_HEADER_REGEX = /^##\s+(.+?)(?:\s+articulo\s+(\d+))?(?:\s+con\s+doble\s+articulado\s+articulo\s+(\d+))?$/im;

/**
 * Patrones para detectar citas de artículos en la respuesta del modelo
 */
const ARTICLE_CITATION_PATTERNS = [
  // "artículo 12 del Código Civil"
  /art[ií]culo\s+(\d+)\s+(?:del\s+)?(?:c[oó]digo\s+)?(civil|penal|comercio|trabajo|procesal|aguas|miner[ií]a|tributario|sanitario)/gi,
  // "Art. 12 CC" o "Art. 12 CP"
  /art\.?\s*(\d+)\s+(cc|cp|ct|cpc|cpp|ccom)/gi,
  // "artículo 12 de la Ley 19.300"
  /art[ií]culo\s+(\d+)\s+(?:de\s+la\s+)?ley\s+(?:n[°º]?\s*)?(\d+[\.\d]*)/gi,
  // "artículo 12 del DFL 1"
  /art[ií]culo\s+(\d+)\s+(?:del\s+)?dfl\s+(\d+)/gi,
  // "artículo 12 del DL 3.500"
  /art[ií]culo\s+(\d+)\s+(?:del\s+)?d\.?l\.?\s+(\d+[\.\d]*)/gi,
  // Referencias simples: "el artículo 12" cerca de una URL
  /(?:el\s+)?art[ií]culo\s+(\d+)/gi
];

/**
 * Mapeo de abreviaturas a nombres de códigos
 */
const CODE_ABBREVIATIONS = {
  'cc': 'codigo civil',
  'cp': 'codigo penal',
  'ct': 'codigo del trabajo',
  'cpc': 'codigo de procedimiento civil',
  'cpp': 'codigo procesal penal',
  'ccom': 'codigo de comercio',
  'civil': 'codigo civil',
  'penal': 'codigo penal',
  'trabajo': 'codigo del trabajo',
  'comercio': 'codigo de comercio',
  'procesal': 'codigo procesal',
  'aguas': 'codigo de aguas',
  'mineria': 'codigo de mineria',
  'tributario': 'codigo tributario',
  'sanitario': 'codigo sanitario'
};

/**
 * Extrae todas las URLs BCN de un texto
 * @param {string} text - Texto donde buscar URLs
 * @returns {string[]} - Array de URLs encontradas
 */
function extractBcnUrls(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = text.match(BCN_URL_REGEX) || [];
  // Limpiar URLs (quitar caracteres finales no deseados)
  return matches.map(url => url.replace(/[,;:\]\)\}\>\"\']+$/, ''));
}

/**
 * Extrae URLs del formato antiguo: **ulr parte norma especifica pdf**: URL
 * @param {string} text - Texto donde buscar
 * @returns {string[]} - Array de URLs encontradas
 */
function extractMetadataUrls(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = text.match(METADATA_URL_REGEX) || [];
  return matches.map(url => url.replace(/[,;:\]\)\}\>\"\']+$/, ''));
}

/**
 * Extrae URLs del formato nuevo: >>>ulr_start<<< URL >>>ulr_end<<<
 * @param {string} text - Texto donde buscar
 * @returns {string[]} - Array de URLs encontradas
 */
function extractBlockUrls(text) {
  if (!text || typeof text !== 'string') return [];
  const matches = text.match(BLOCK_URL_REGEX) || [];
  return matches.map(url => url.trim().replace(/[,;:\]\)\}\>\"\']+$/, ''));
}

/**
 * Extrae URLs de AMBOS formatos (antiguo y nuevo)
 * @param {string} text - Texto donde buscar
 * @returns {string[]} - Array de URLs encontradas (sin duplicados)
 */
function extractAllUrls(text) {
  if (!text || typeof text !== 'string') return [];
  
  const metadataUrls = extractMetadataUrls(text);
  const blockUrls = extractBlockUrls(text);
  const bcnUrls = extractBcnUrls(text);
  
  // Combinar y eliminar duplicados
  const allUrls = [...new Set([...metadataUrls, ...blockUrls, ...bcnUrls])];
  return allUrls;
}

/**
 * Verifica si una URL BCN está completa (tiene idnorma e idparte)
 * @param {string} url - URL a verificar
 * @returns {boolean}
 */
function isCompleteUrl(url) {
  if (!url) return false;
  return /idnorma=\d+/.test(url) && /idparte=\d+/.test(url);
}

/**
 * Extrae el idnorma de una URL BCN
 * @param {string} url - URL BCN
 * @returns {string|null}
 */
function extractIdNorma(url) {
  if (!url) return null;
  const match = url.match(/idnorma=(\d+)/);
  return match ? match[1] : null;
}

/**
 * Extrae el idparte de una URL BCN
 * @param {string} url - URL BCN
 * @returns {string|null}
 */
function extractIdParte(url) {
  if (!url) return null;
  const match = url.match(/idparte=(\d+)/);
  return match ? match[1] : null;
}

/**
 * Extrae información del artículo desde el encabezado del chunk
 * @param {string} chunkText - Texto del chunk
 * @returns {object|null} - { normName, articleNumber, fullKey }
 */
function extractArticleInfoFromChunk(chunkText) {
  if (!chunkText || typeof chunkText !== 'string') return null;
  
  // Buscar el encabezado ## al inicio del chunk
  const headerMatch = chunkText.match(/^##\s+([^\n]+)/m);
  if (!headerMatch) return null;
  
  const header = headerMatch[1].toLowerCase().trim();
  
  // Extraer nombre de la norma y número de artículo
  // Patrón: "codigo civil - dfl 1 2000 articulo 2 con doble articulado articulo 12"
  // o: "codigo penal - codigo penal 1.874 articulo 1"
  
  let normName = '';
  let articleNumber = null;
  
  // Buscar "articulo X" al final (puede haber doble articulado)
  const articleMatches = header.match(/articulo\s+(\d+)/g);
  if (articleMatches && articleMatches.length > 0) {
    // Tomar el último artículo mencionado (en caso de doble articulado)
    const lastArticle = articleMatches[articleMatches.length - 1];
    const numMatch = lastArticle.match(/(\d+)/);
    if (numMatch) {
      articleNumber = numMatch[1];
    }
  }
  
  // Extraer nombre de la norma (antes del primer " - " o "articulo")
  const normMatch = header.match(/^([^-]+)/);
  if (normMatch) {
    normName = normMatch[1].trim();
  }
  
  // Normalizar nombre de la norma
  normName = normName
    .replace(/codigo/g, 'codigo')
    .replace(/código/g, 'codigo')
    .trim();
  
  return {
    normName,
    articleNumber,
    fullKey: header,
    normalizedKey: `${normName} articulo ${articleNumber}`.toLowerCase()
  };
}

/**
 * Extrae URLs de los resultados de file_search con información de artículos
 * Reconoce AMBOS formatos: antiguo y nuevo
 * @param {Array} fileSearchResults - Resultados del file_search (search_results)
 * @returns {object} - { urlMap, articleUrlMap }
 */
function extractUrlsFromFileSearchResults(fileSearchResults) {
  const urlMap = new Map();
  const articleUrlMap = new Map(); // Mapa artículo -> URL
  
  if (!Array.isArray(fileSearchResults)) return { urlMap, articleUrlMap };
  
  for (const result of fileSearchResults) {
    if (!result || !result.content) continue;
    
    // Procesar cada chunk de contenido
    for (const chunk of result.content) {
      if (!chunk || !chunk.text) continue;
      
      // Extraer URLs de AMBOS formatos
      const urls = extractAllUrls(chunk.text);
      const articleInfo = extractArticleInfoFromChunk(chunk.text);
      
      for (const url of urls) {
        if (!url) continue;
        
        // Guardar en mapa general
        urlMap.set(url, {
          articleNumber: articleInfo?.articleNumber,
          normName: articleInfo?.normName,
          fullKey: articleInfo?.fullKey,
          chunkId: result.id || 'unknown'
        });
        
        // Guardar en mapa artículo -> URL
        if (articleInfo && articleInfo.articleNumber) {
          const key = `${articleInfo.normName.toLowerCase()} articulo ${articleInfo.articleNumber}`;
          articleUrlMap.set(key, url);
        }
      }
    }
  }
  
  return { urlMap, articleUrlMap };
}

/**
 * Valida y corrige URLs en la respuesta del modelo
 * @param {string} response - Respuesta del modelo
 * @param {object} urlMaps - { urlMap, articleUrlMap } del file_search
 * @returns {object} - { correctedResponse, corrections, warnings }
 */
function validateAndCorrectUrls(response, urlMaps) {
  if (!response || typeof response !== 'string') {
    return { correctedResponse: response, corrections: [], warnings: [] };
  }
  
  const corrections = [];
  const warnings = [];
  let correctedResponse = response;
  
  const { urlMap, articleUrlMap } = urlMaps;
  
  // Encontrar todas las URLs citadas en la respuesta
  const citedUrls = extractAllUrls(response);
  
  for (const citedUrl of citedUrls) {
    if (!citedUrl) continue;
    
    // Verificar si la URL está en nuestro mapa
    const urlInfo = urlMap.get(citedUrl);
    
    if (urlInfo) {
      // URL encontrada, verificar si está completa
      if (!isCompleteUrl(citedUrl)) {
        // URL incompleta, intentar completarla
        const articleKey = `${urlInfo.normName.toLowerCase()} articulo ${urlInfo.articleNumber}`;
        const correctUrl = articleUrlMap.get(articleKey);
        
        if (correctUrl && correctUrl !== citedUrl) {
          correctedResponse = correctedResponse.replace(citedUrl, correctUrl);
          corrections.push({
            original: citedUrl,
            corrected: correctUrl,
            reason: 'URL incompleta (faltaba idparte)',
            articleNumber: urlInfo.articleNumber
          });
        }
      }
    } else {
      // URL no encontrada en el RAG, posible invención
      warnings.push({
        url: citedUrl,
        reason: 'URL no encontrada en los chunks del file_search',
        suggestion: 'Verificar que el artículo citado existe en el RAG'
      });
    }
  }
  
  return { correctedResponse, corrections, warnings };
}

/**
 * Procesa la respuesta del modelo validando URLs
 * @param {object} params - { response, fileSearchResults }
 * @returns {object} - { response, corrections, warnings, stats }
 */
function processResponse(params) {
  const { response, fileSearchResults } = params;
  
  if (!response) {
    return { response, corrections: [], warnings: [], stats: { processed: false } };
  }
  
  // Extraer URLs de los resultados del file_search
  const urlMaps = extractUrlsFromFileSearchResults(fileSearchResults);
  
  // Validar y corregir URLs en la respuesta
  const { correctedResponse, corrections, warnings } = validateAndCorrectUrls(response, urlMaps);
  
  return {
    response: correctedResponse,
    corrections,
    warnings,
    stats: {
      processed: true,
      urlsValidated: corrections.length + warnings.length,
      urlsCorrected: corrections.length,
      urlsWarned: warnings.length,
      totalUrlsInRag: urlMaps.urlMap.size,
      totalArticlesInRag: urlMaps.articleUrlMap.size
    }
  };
}

/**
 * Procesa la respuesta completa del modelo con validación de URLs
 * Compatible con Responses API
 * @param {object} resp - Respuesta del modelo (puede incluir file_search_call)
 * @param {string} outputText - Texto de salida del modelo
 * @returns {object} - { text, urlValidation }
 */
function processResponseWithUrlValidation(resp, outputText) {
  if (!outputText || typeof outputText !== 'string') {
    return { text: outputText, urlValidation: { performed: false } };
  }

  // Extraer resultados de file_search si existen
  let fileSearchResults = [];
  
  if (resp && resp.output && Array.isArray(resp.output)) {
    for (const item of resp.output) {
      if (item.type === 'file_search_call' && item.search_results) {
        fileSearchResults = item.search_results;
        break;
      }
    }
  }

  // Si no hay resultados de file_search, retornar sin validación
  if (fileSearchResults.length === 0) {
    return { text: outputText, urlValidation: { performed: false } };
  }

  // Extraer URLs de los resultados del file_search
  const urlMaps = extractUrlsFromFileSearchResults(fileSearchResults);
  
  // Validar y corregir URLs en la respuesta
  const { correctedResponse, corrections, warnings } = validateAndCorrectUrls(outputText, urlMaps);

  return {
    text: correctedResponse,
    urlValidation: {
      performed: true,
      corrections,
      warnings,
      stats: {
        urlsCorrected: corrections.length,
        urlsWarned: warnings.length,
        totalUrlsInRag: urlMaps.urlMap.size,
        totalArticlesInRag: urlMaps.articleUrlMap.size,
        articlesIndexed: Array.from(urlMaps.articleUrlMap.keys())
      }
    }
  };
}

module.exports = {
  extractBcnUrls,
  extractMetadataUrls,
  extractBlockUrls,
  extractAllUrls,
  isCompleteUrl,
  extractIdNorma,
  extractIdParte,
  extractArticleInfoFromChunk,
  extractUrlsFromFileSearchResults,
  validateAndCorrectUrls,
  processResponse,
  processResponseWithUrlValidation
};
