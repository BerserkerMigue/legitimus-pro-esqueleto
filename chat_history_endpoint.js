// chat_history_endpoint.js
const { loadContext } = require('./engine/memory');

/**
 * Agregar endpoint para obtener el historial de un chat específico
 */
function addChatHistoryEndpoint(app, authRequired) {
  
  // Obtener historial de un chat específico
  app.get('/api/chats/:chatId/history', authRequired, async (req, res) => {
    try {
      const { chatId } = req.params;
      const userId = req.userId;
      
      // Cargar el contexto/historial del chat
      const context = loadContext(global.bot_config, userId, chatId);
      
      // Convertir el contexto a formato de mensajes para el frontend
      // Filtrar mensajes de inicialización (system-init) pero mantener anexos (system-annex)
      const messages = context
        .filter(msg => msg.role !== 'system-init') // Ocultar mensajes de inicialización
        .map((msg, index) => {
          const baseMsg = {
            id: `${msg.role}_${Date.now()}_${index}`,
            role: msg.role,
            content: msg.content,
            timestamp: msg.timestamp || new Date().toISOString(),
            sources: [], // No tenemos sources en el historial
            usage: msg.usage || null,
            error: null
          };
          
          // Preservar datos de anexo normativo si existen
          if (msg.role === 'system-annex' && msg.annexData) {
            baseMsg.isNormativeAnnex = true;
            baseMsg.annexData = msg.annexData;
          }
          
          return baseMsg;
        });
      
      res.json({ 
        ok: true, 
        chatId,
        messages,
        messageCount: messages.length
      });
    } catch (e) {
      console.error('Error obteniendo historial del chat:', e);
      res.status(500).json({ ok: false, error: 'get_chat_history_failed' });
    }
  });
}

module.exports = { addChatHistoryEndpoint };
