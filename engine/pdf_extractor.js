const fs = require('fs');
const pdf = require('pdf-parse');

/**
 * Extrae texto de un PDF
 * Detecta si el PDF es escaneado (sin texto)
 */
async function extractTextFromPDF(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    
    return data.text || '';
  } catch (error) {
    console.error('Error extrayendo texto de PDF:', error);
    throw error;
  }
}

/**
 * Obtiene información del PDF sin extraer todo el texto
 */
async function getPDFInfo(filePath) {
  try {
    const dataBuffer = fs.readFileSync(filePath);
    const data = await pdf(dataBuffer);
    
    return {
      pages: data.numpages,
      info: data.info,
      metadata: data.metadata,
      version: data.version,
      hasText: (data.text || '').length > 100
    };
  } catch (error) {
    console.error('Error obteniendo info de PDF:', error);
    throw error;
  }
}

module.exports = {
  extractTextFromPDF,
  getPDFInfo
};

