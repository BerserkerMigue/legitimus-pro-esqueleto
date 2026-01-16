// actions/definitions.js
const ragActions = require('./rag_actions');
const userDocumentsActions = require('./user_documents_actions');

const baseActions = [
  {
    name: 'generate_draft',
    description: 'Genera un borrador de documento legal a partir de título y cláusulas.',
    parametersSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Título del documento' },
        clauses: { type: 'array', items: { type: 'string' }, description: 'Cláusulas en texto plano' }
      },
      required: ['title']
    },
    handler: async ({ title, clauses = [] }) => {
      const doc = [`# ${title}`, ...clauses.map((c,i)=>`Cláusula ${i+1}:\n${c}`)].join('\n\n');
      return { title, preview: doc.slice(0, 2000), length: doc.length };
    }
  },
  {
    name: 'analyze_contract',
    description: 'Análisis estático de un contrato: detecta posibles riesgos y vacíos.',
    parametersSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Contenido completo del contrato' },
        focus: { type: 'array', items: { type: 'string' }, description: 'Áreas de interés' }
      },
      required: ['text']
    },
    handler: async ({ text, focus = [] }) => {
      const issues = [];
      if (!/jurisdicc/i.test(text)) issues.push('No se detecta cláusula de jurisdicción.');
      if (!/confidencial/i.test(text)) issues.push('No se detecta cláusula de confidencialidad.');
      if (/perpetu/i.test(text)) issues.push('Duraciones "perpetuas" podrían ser impugnables.');
      if (focus.includes('responsabilidad') && !/responsabil/i.test(text)) issues.push('Falta cláusula de limitación de responsabilidad.');
      return { issues, score: Math.max(0, 100 - issues.length * 15) };
    }
  },
  {
    name: 'lookup_norms',
    description: 'Simula búsqueda de norma aplicable por palabra clave o referencia.',
    parametersSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Búsqueda (ej: "protección de datos", "ley 19.628")' },
        jurisdiction: { type: 'string', description: 'País o jurisdicción' }
      },
      required: ['query']
    },
    handler: async ({ query, jurisdiction = 'CL' }) => {
      const hits = [
        { id: 'art-1', ref: 'Base normativa - Protección de datos', jurisdiction },
        { id: 'art-2', ref: 'Deber de informar y consentimiento', jurisdiction }
      ];
      return { query, jurisdiction, hits, note: 'Resultados simulados; integrar fuente real en siguiente iteración.' };
    }
  }
];

// Combinar acciones base con acciones RAG y documentos de usuario
module.exports = [...baseActions, ...ragActions, ...userDocumentsActions];
