// interaction_status_endpoint.js
const { getInteractionStatus } = require('./engine/interaction_manager');

/**
 * Agregar endpoint para obtener el estado de interacciones de un chat específico
 */
function addInteractionStatusEndpoint(app, authRequired) {
  
  // Obtener estado de interacciones de un chat específico
  app.get('/api/chats/:chatId/interaction-status', authRequired, async (req, res) => {
    try {
      const { chatId } = req.params;
      const userId = req.userId;
      
      // Obtener el estado de interacciones del chat
      const interactionStatus = getInteractionStatus(userId, chatId);
      
      res.json({ 
        ok: true, 
        chatId,
        interactionStatus
      });
    } catch (e) {
      console.error('Error obteniendo estado de interacciones:', e);
      res.status(500).json({ ok: false, error: 'get_interaction_status_failed' });
    }
  });
}

module.exports = { addInteractionStatusEndpoint };

