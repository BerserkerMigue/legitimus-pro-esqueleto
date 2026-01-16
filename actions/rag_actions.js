// actions/rag_actions.js - Acciones específicas para RAG y búsqueda inteligente

const { intelligentKnowledgeSearch } = require('../engine/enhanced_knowledge_readers');
const { addToMemoryStore } = require('../engine/vector_store_manager');

module.exports = [
  {
    name: 'search_knowledge_rag',
    description: 'Búsqueda inteligente en el conocimiento usando RAG y embeddings.',
    parametersSchema: {
      type: 'object',
      properties: {
        query: { 
          type: 'string', 
          description: 'Consulta o pregunta para buscar en el conocimiento jurídico' 
        },
        max_results: { 
          type: 'number', 
          description: 'Número máximo de resultados (default: 5)',
          default: 5
        },
        use_embeddings: { 
          type: 'boolean', 
          description: 'Usar búsqueda semántica con embeddings (default: true)',
          default: true
        },
        use_traditional: { 
          type: 'boolean', 
          description: 'Usar búsqueda tradicional por palabras clave (default: true)',
          default: true
        }
      },
      required: ['query']
    },
    handler: async ({ query, max_results = 5, use_embeddings = true, use_traditional = true }) => {
      try {
        console.log(`🔍 Búsqueda RAG para: "${query}"`);
        
        const searchResult = await intelligentKnowledgeSearch(query, {
          maxResults: max_results,
          useEmbeddings: use_embeddings,
          useTraditional: use_traditional
        });

        // Formatear resultados para el bot
        const formattedResults = searchResult.results.map((result, index) => ({
          rank: index + 1,
          file: result.file,
          method: result.method,
          relevance_score: Math.round((result.score || 0) * 100),
          preview: result.preview,
          metadata: result.metadata
        }));

        return {
          query: searchResult.query,
          total_found: searchResult.total_found,
          summary: searchResult.summary,
          results: formattedResults,
          methods_used: searchResult.methods_used,
          success: true
        };

      } catch (error) {
        console.error('Error en search_knowledge_rag:', error);
        return {
          query,
          error: error.message,
          success: false,
          fallback_message: 'Error en búsqueda RAG. Usar búsqueda tradicional como alternativa.'
        };
      }
    }
  },

  {
    name: 'save_to_memory',
    description: 'Guarda información importante en la memoria vectorial a largo plazo.',
    parametersSchema: {
      type: 'object',
      properties: {
        content: { 
          type: 'string', 
          description: 'Contenido a guardar en la memoria (conversación, análisis, etc.)' 
        },
        context: { 
          type: 'string', 
          description: 'Contexto o categoría del contenido (ej: "consulta_laboral", "análisis_contrato")'
        },
        user: { 
          type: 'string', 
          description: 'Identificador del usuario (default: "anon")',
          default: 'anon'
        },
        importance: { 
          type: 'string', 
          description: 'Nivel de importancia: low, medium, high (default: medium)',
          enum: ['low', 'medium', 'high'],
          default: 'medium'
        }
      },
      required: ['content']
    },
    handler: async ({ content, context = 'general', user = 'anon', importance = 'medium' }) => {
      try {
        // Obtener memory store ID de la configuración
        const config = require('../lexcode_instances/general/config.json');
        const memoryStoreId = config.memory_store_id;

        if (!memoryStoreId || memoryStoreId === 'vs_MEMORIA_BOT_CONFIGURABLE') {
          return {
            success: false,
            error: 'Memory store no configurado. Ejecutar setup_vector_stores.js primero.'
          };
        }

        console.log(`💾 Guardando en memoria: contexto="${context}", importancia="${importance}"`);

        const metadata = {
          context,
          user,
          importance,
          timestamp: new Date().toISOString()
        };

        const fileId = await addToMemoryStore(memoryStoreId, content, metadata);

        return {
          success: true,
          file_id: fileId,
          message: `Información guardada en memoria vectorial con contexto: ${context}`,
          metadata
        };

      } catch (error) {
        console.error('Error en save_to_memory:', error);
        return {
          success: false,
          error: error.message,
          message: 'No se pudo guardar en la memoria vectorial'
        };
      }
    }
  },

  {
    name: 'analyze_document_rag',
    description: 'Analiza un documento específico usando RAG para encontrar información relacionada.',
    parametersSchema: {
      type: 'object',
      properties: {
        document_name: { 
          type: 'string', 
          description: 'Nombre del documento a analizar' 
        },
        analysis_focus: { 
          type: 'string', 
          description: 'Enfoque del análisis (ej: "riesgos legales", "cláusulas problemáticas")' 
        },
        cross_reference: { 
          type: 'boolean', 
          description: 'Buscar referencias cruzadas en otros documentos (default: true)',
          default: true
        }
      },
      required: ['document_name', 'analysis_focus']
    },
    handler: async ({ document_name, analysis_focus, cross_reference = true }) => {
      try {
        console.log(`📄 Analizando documento: ${document_name} con enfoque: ${analysis_focus}`);

        // Buscar el documento específico
        const documentSearch = await intelligentKnowledgeSearch(document_name, {
          maxResults: 3,
          useEmbeddings: true,
          useTraditional: true
        });

        let analysis = {
          document: document_name,
          focus: analysis_focus,
          found: documentSearch.total_found > 0,
          content: null,
          cross_references: []
        };

        if (documentSearch.total_found > 0) {
          // Obtener contenido del documento
          const mainContent = documentSearch.results[0];
          analysis.content = {
            preview: mainContent.preview,
            relevance: mainContent.score,
            method: mainContent.method
          };

          // Si se solicita, buscar referencias cruzadas
          if (cross_reference) {
            const crossRefSearch = await intelligentKnowledgeSearch(analysis_focus, {
              maxResults: 5,
              useEmbeddings: true,
              useTraditional: false
            });

            analysis.cross_references = crossRefSearch.results
              .filter(result => result.file !== document_name)
              .map(result => ({
                file: result.file,
                relevance: Math.round((result.score || 0) * 100),
                preview: result.preview
              }));
          }
        }

        return {
          success: true,
          analysis,
          recommendations: analysis.found ? 
            `Documento encontrado. ${analysis.cross_references.length} referencias cruzadas identificadas.` :
            'Documento no encontrado en el conocimiento cargado.'
        };

      } catch (error) {
        console.error('Error en analyze_document_rag:', error);
        return {
          success: false,
          error: error.message,
          document: document_name,
          focus: analysis_focus
        };
      }
    }
  }
];

