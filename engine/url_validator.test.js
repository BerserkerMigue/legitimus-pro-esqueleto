// engine/url_validator.test.js — Pruebas unitarias para el validador de URLs BCN v2
// Ejecutar con: node engine/url_validator.test.js

const {
  extractBcnUrls,
  isCompleteUrl,
  extractIdNorma,
  extractIdParte,
  extractArticleInfoFromChunk,
  extractUrlsFromFileSearchResults,
  extractUrlsFromResponse,
  extractArticleCitationsFromResponse,
  validateSemanticUrlArticleMatch,
  validateAndCorrectUrls,
  processResponseWithUrlValidation,
  findNearestUrl
} = require('./url_validator');

// Colores para output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';
const YELLOW = '\x1b[33m';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`${GREEN}✓${RESET} ${name}`);
    passed++;
  } catch (e) {
    console.log(`${RED}✗${RESET} ${name}`);
    console.log(`  ${RED}Error: ${e.message}${RESET}`);
    failed++;
  }
}

function assertEqual(actual, expected, message = '') {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}\n  Esperado: ${JSON.stringify(expected)}\n  Obtenido: ${JSON.stringify(actual)}`);
  }
}

function assertTrue(value, message = '') {
  if (!value) {
    throw new Error(message || 'Se esperaba true');
  }
}

function assertFalse(value, message = '') {
  if (value) {
    throw new Error(message || 'Se esperaba false');
  }
}

console.log('\n📋 Ejecutando pruebas del validador de URLs BCN v2...\n');

// ============ Tests para extractBcnUrls ============
console.log(`${YELLOW}--- extractBcnUrls ---${RESET}`);

test('extractBcnUrls: extrae URL completa de texto', () => {
  const text = 'Ver artículo en https://www.bcn.cl/leychile/navegar?idnorma=172986&idparte=8717793 para más info';
  const urls = extractBcnUrls(text);
  assertEqual(urls.length, 1);
  assertEqual(urls[0], 'https://www.bcn.cl/leychile/navegar?idnorma=172986&idparte=8717793');
});

test('extractBcnUrls: extrae múltiples URLs', () => {
  const text = `
    Art. 12: https://www.bcn.cl/leychile/navegar?idnorma=172986&idparte=8717793
    Art. 13: https://www.bcn.cl/leychile/navegar?idnorma=172986&idparte=8717794
  `;
  const urls = extractBcnUrls(text);
  assertEqual(urls.length, 2);
});

test('extractBcnUrls: maneja texto sin URLs', () => {
  const text = 'Este texto no tiene URLs de BCN';
  const urls = extractBcnUrls(text);
  assertEqual(urls.length, 0);
});

test('extractBcnUrls: maneja entrada null/undefined', () => {
  assertEqual(extractBcnUrls(null), []);
  assertEqual(extractBcnUrls(undefined), []);
  assertEqual(extractBcnUrls(''), []);
});

// ============ Tests para isCompleteUrl ============
console.log(`\n${YELLOW}--- isCompleteUrl ---${RESET}`);

test('isCompleteUrl: URL completa con idnorma e idparte', () => {
  assertTrue(isCompleteUrl('https://www.bcn.cl/leychile/navegar?idnorma=172986&idparte=8717793'));
});

test('isCompleteUrl: URL incompleta sin idparte', () => {
  assertFalse(isCompleteUrl('https://www.bcn.cl/leychile/navegar?idnorma=172986'));
});

test('isCompleteUrl: URL incompleta sin idnorma', () => {
  assertFalse(isCompleteUrl('https://www.bcn.cl/leychile/navegar?idparte=8717793'));
});

test('isCompleteUrl: maneja null', () => {
  assertFalse(isCompleteUrl(null));
});

// ============ Tests para extractIdNorma/extractIdParte ============
console.log(`\n${YELLOW}--- extractIdNorma / extractIdParte ---${RESET}`);

test('extractIdNorma: extrae correctamente', () => {
  assertEqual(extractIdNorma('https://www.bcn.cl/leychile/navegar?idnorma=172986&idparte=8717793'), '172986');
});

test('extractIdParte: extrae correctamente', () => {
  assertEqual(extractIdParte('https://www.bcn.cl/leychile/navegar?idnorma=172986&idparte=8717793'), '8717793');
});

test('extractIdNorma: retorna null si no existe', () => {
  assertEqual(extractIdNorma('https://www.bcn.cl/leychile/navegar?idparte=8717793'), null);
});

// ============ Tests para extractArticleInfoFromChunk (NUEVO) ============
console.log(`\n${YELLOW}--- extractArticleInfoFromChunk (NUEVO) ---${RESET}`);

test('extractArticleInfoFromChunk: extrae info de chunk código civil', () => {
  const chunk = `## codigo civil - dfl 1 2000 articulo 2 con doble articulado articulo 12

**Metadatos:**
- **ulr parte norma especifica pdf**: https://www.bcn.cl/leychile/navegar?idnorma=172986&idparte=8717793

>>>text_start<<<
art. 12. podran renunciarse los derechos conferidos por las leyes...
>>>text_end<<<`;

  const info = extractArticleInfoFromChunk(chunk);
  assertTrue(info !== null);
  assertEqual(info.articleNumber, '12');
  assertTrue(info.normName.includes('codigo civil'));
});

test('extractArticleInfoFromChunk: extrae info de chunk código penal', () => {
  const chunk = `## codigo penal - codigo penal 1.874 articulo 1

**Metadatos:**
- **ulr parte norma especifica pdf**: https://www.bcn.cl/leychile/navegar?idnorma=1984&idparte=9672199

>>>text_start<<<
articulo 1. es delito toda accion u omision voluntaria penada por la ley.
>>>text_end<<<`;

  const info = extractArticleInfoFromChunk(chunk);
  assertTrue(info !== null);
  assertEqual(info.articleNumber, '1');
  assertTrue(info.normName.includes('codigo penal'));
});

test('extractArticleInfoFromChunk: maneja chunk sin encabezado', () => {
  const chunk = 'Texto sin encabezado ##';
  const info = extractArticleInfoFromChunk(chunk);
  assertEqual(info, null);
});

// ============ Tests para extractArticleCitationsFromResponse (NUEVO) ============
console.log(`\n${YELLOW}--- extractArticleCitationsFromResponse (NUEVO) ---${RESET}`);

test('extractArticleCitationsFromResponse: detecta "artículo X del Código Civil"', () => {
  const text = 'Según el artículo 12 del Código Civil, los derechos pueden renunciarse.';
  const citations = extractArticleCitationsFromResponse(text);
  assertTrue(citations.length >= 1);
  assertTrue(citations.some(c => c.articleNumber === '12'));
});

test('extractArticleCitationsFromResponse: detecta "Art. X CC"', () => {
  const text = 'Ver Art. 12 CC para más detalles.';
  const citations = extractArticleCitationsFromResponse(text);
  assertTrue(citations.length >= 1);
  assertTrue(citations.some(c => c.articleNumber === '12'));
});

test('extractArticleCitationsFromResponse: detecta "artículo X del Código Penal"', () => {
  const text = 'El artículo 1 del Código Penal define el delito.';
  const citations = extractArticleCitationsFromResponse(text);
  assertTrue(citations.length >= 1);
  assertTrue(citations.some(c => c.articleNumber === '1'));
});

test('extractArticleCitationsFromResponse: detecta múltiples citas', () => {
  const text = 'El artículo 12 del Código Civil y el artículo 1 del Código Penal son relevantes.';
  const citations = extractArticleCitationsFromResponse(text);
  assertTrue(citations.length >= 2);
});

// ============ Tests para findNearestUrl (NUEVO) ============
console.log(`\n${YELLOW}--- findNearestUrl (NUEVO) ---${RESET}`);

test('findNearestUrl: encuentra URL más cercana', () => {
  const text = 'El artículo 12 establece que... Ver https://www.bcn.cl/leychile/navegar?idnorma=172986&idparte=8717793';
  const nearest = findNearestUrl(text, 0, 500);
  assertTrue(nearest !== null);
  assertTrue(nearest.url.includes('idparte=8717793'));
});

test('findNearestUrl: retorna null si no hay URL cercana', () => {
  const text = 'El artículo 12 establece que los derechos pueden renunciarse.';
  const nearest = findNearestUrl(text, 0, 100);
  assertEqual(nearest, null);
});

// ============ Tests para extractUrlsFromFileSearchResults ============
console.log(`\n${YELLOW}--- extractUrlsFromFileSearchResults ---${RESET}`);

test('extractUrlsFromFileSearchResults: extrae URLs y articleMap', () => {
  const mockResults = [
    {
      file_id: 'file_123',
      filename: 'codigo_civil.md',
      content: [
        {
          type: 'text',
          text: `## codigo civil - dfl 1 2000 articulo 2 con doble articulado articulo 12
**ulr parte norma especifica pdf**: https://www.bcn.cl/leychile/navegar?idnorma=172986&idparte=8717793
art. 12...`
        }
      ]
    }
  ];
  
  const { urlMap, articleUrlMap } = extractUrlsFromFileSearchResults(mockResults);
  assertTrue(urlMap.size === 1);
  assertTrue(urlMap.has('https://www.bcn.cl/leychile/navegar?idnorma=172986&idparte=8717793'));
  assertTrue(articleUrlMap.size >= 1);
});

test('extractUrlsFromFileSearchResults: maneja array vacío', () => {
  const { urlMap, articleUrlMap } = extractUrlsFromFileSearchResults([]);
  assertEqual(urlMap.size, 0);
  assertEqual(articleUrlMap.size, 0);
});

// ============ Tests para validateAndCorrectUrls ============
console.log(`\n${YELLOW}--- validateAndCorrectUrls ---${RESET}`);

test('validateAndCorrectUrls: no modifica URLs válidas', () => {
  const validUrls = new Map();
  validUrls.set('https://www.bcn.cl/leychile/navegar?idnorma=172986&idparte=8717793', {
    url: 'https://www.bcn.cl/leychile/navegar?idnorma=172986&idparte=8717793',
    isComplete: true,
    idNorma: '172986',
    idParte: '8717793'
  });
  
  const responseText = 'Ver artículo en https://www.bcn.cl/leychile/navegar?idnorma=172986&idparte=8717793';
  const result = validateAndCorrectUrls(responseText, validUrls);
  
  assertEqual(result.corrections.length, 0);
});

test('validateAndCorrectUrls: corrige URL incompleta', () => {
  const validUrls = new Map();
  validUrls.set('https://www.bcn.cl/leychile/navegar?idnorma=172986&idparte=8717793', {
    url: 'https://www.bcn.cl/leychile/navegar?idnorma=172986&idparte=8717793',
    isComplete: true,
    idNorma: '172986',
    idParte: '8717793'
  });
  
  const responseText = 'Ver artículo en https://www.bcn.cl/leychile/navegar?idnorma=172986';
  const result = validateAndCorrectUrls(responseText, validUrls);
  
  assertEqual(result.corrections.length, 1);
  assertTrue(result.correctedText.includes('idparte=8717793'));
});

// ============ Tests para validación semántica (NUEVO) ============
console.log(`\n${YELLOW}--- Validación Semántica (NUEVO) ---${RESET}`);

test('validateSemanticUrlArticleMatch: detecta discordancia artículo-URL', () => {
  const urlMap = new Map();
  urlMap.set('https://www.bcn.cl/leychile/navegar?idnorma=172986&idparte=8717794', {
    url: 'https://www.bcn.cl/leychile/navegar?idnorma=172986&idparte=8717794',
    articleInfo: { normName: 'codigo civil', articleNumber: '13', normalizedKey: 'codigo civil articulo 13' }
  });
  
  const articleUrlMap = new Map();
  articleUrlMap.set('codigo civil articulo 12', {
    url: 'https://www.bcn.cl/leychile/navegar?idnorma=172986&idparte=8717793',
    articleInfo: { normName: 'codigo civil', articleNumber: '12' }
  });
  
  // El modelo cita artículo 12 pero pone URL del artículo 13
  const responseText = 'El artículo 12 del Código Civil establece... Ver https://www.bcn.cl/leychile/navegar?idnorma=172986&idparte=8717794';
  
  const result = validateSemanticUrlArticleMatch(responseText, urlMap, articleUrlMap);
  
  assertTrue(result.semanticIssues.length > 0 || result.semanticCorrections.length > 0);
});

// ============ Tests para processResponseWithUrlValidation ============
console.log(`\n${YELLOW}--- processResponseWithUrlValidation ---${RESET}`);

test('processResponseWithUrlValidation: procesa respuesta completa', () => {
  const mockResponse = {
    output: [
      {
        type: 'file_search_call',
        search_results: [
          {
            file_id: 'file_123',
            filename: 'codigo_civil.md',
            content: [
              {
                type: 'text',
                text: `## codigo civil - dfl 1 2000 articulo 2 con doble articulado articulo 12
**ulr parte norma especifica pdf**: https://www.bcn.cl/leychile/navegar?idnorma=172986&idparte=8717793`
              }
            ]
          }
        ]
      }
    ]
  };
  
  const outputText = 'El artículo 12 está en https://www.bcn.cl/leychile/navegar?idnorma=172986&idparte=8717793';
  const result = processResponseWithUrlValidation(mockResponse, outputText);
  
  assertTrue(result.urlValidation.performed);
  assertTrue(result.urlValidation.articlesIndexed.length > 0);
});

test('processResponseWithUrlValidation: maneja respuesta sin file_search', () => {
  const mockResponse = {
    output: [
      {
        type: 'message',
        content: 'Respuesta sin file_search'
      }
    ]
  };
  
  const result = processResponseWithUrlValidation(mockResponse, 'Texto de prueba');
  
  assertFalse(result.urlValidation.performed);
});

// ============ Resumen ============
console.log('\n' + '='.repeat(50));
console.log(`${GREEN}Pasadas: ${passed}${RESET}`);
console.log(`${RED}Fallidas: ${failed}${RESET}`);
console.log('='.repeat(50));

if (failed > 0) {
  process.exit(1);
}
