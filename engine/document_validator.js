const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const { extractTextFromPDF } = require('./pdf_extractor');

const ValidationResult = {
  VALID: 'valid',
  SCANNED_PDF: 'scanned_pdf',
  PROTECTED: 'protected',
  CORRUPTED: 'corrupted',
  UNSUPPORTED: 'unsupported',
  TOO_LARGE: 'too_large',
  EMPTY: 'empty'
};

async function validateDocument(filePath, options = {}) {
  const {
    maxSizeMB = 25,
    maxPages = 100,
    minTextLength = 100,
    allowedExtensions = ['.pdf', '.txt', '.md']
  } = options;

  const result = {
    valid: false,
    type: null,
    reason: null,
    suggestions: [],
    metadata: {}
  };

  try {
    if (!fs.existsSync(filePath)) {
      result.type = ValidationResult.CORRUPTED;
      result.reason = 'El archivo no existe o no se pudo leer.';
      result.suggestions = ['Intenta subir el archivo nuevamente.'];
      return result;
    }

    const filename = path.basename(filePath);
    const ext = path.extname(filePath).toLowerCase();
    const stats = fs.statSync(filePath);
    const sizeMB = stats.size / (1024 * 1024);

    result.metadata = {
      filename,
      extension: ext,
      sizeMB: sizeMB.toFixed(2),
      sizeBytes: stats.size
    };

    if (!allowedExtensions.includes(ext)) {
        result.type = ValidationResult.UNSUPPORTED;
        result.reason = `El formato de archivo "${ext}" no está soportado.`;
        result.suggestions = [`Formatos soportados: ${allowedExtensions.join(', ')}`,
        'Convierte tu documento a uno de estos formatos.'];
        return result;
    }

    if (sizeMB > maxSizeMB) {
      result.type = ValidationResult.TOO_LARGE;
      result.reason = `El archivo es demasiado grande (${sizeMB.toFixed(1)} MB). El límite es ${maxSizeMB} MB.`;
      result.suggestions = [
        'Divide el documento en partes más pequeñas.',
        'Comprime el PDF si contiene muchas imágenes.',
        'Extrae solo las páginas relevantes.'
      ];
      return result;
    }

    if (ext === '.pdf') {
      return await validatePDF(filePath, { maxPages, minTextLength });
    } else if (ext === '.txt' || ext === '.md') {
      return validateTextFile(filePath, { minTextLength });
    }

    return result;

  } catch (error) {
    console.error('Error validando documento:', error);
    result.type = ValidationResult.CORRUPTED;
    result.reason = 'No se pudo leer el archivo. Puede estar corrupto.';
    result.suggestions = [
      'Intenta abrir el archivo en tu computador para verificar que funciona.',
      'Vuelve a generar o descargar el documento.'
    ];
    return result;
  }
}

async function validatePDF(filePath, options = {}) {
  const { maxPages, minTextLength } = options;
  const result = { valid: false, type: null, reason: null, suggestions: [], metadata: {} };

  try {
    const pdfBytes = fs.readFileSync(filePath);
    let pdfDoc;
    try {
      pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: false });
    } catch (error) {
      if (error.message.includes('encrypted') || error.message.includes('password')) {
        result.type = ValidationResult.PROTECTED;
        result.reason = 'El PDF está protegido con contraseña.';
        result.suggestions = [
          'Desbloquea el PDF usando la contraseña.',
          'Pide al emisor del documento una versión sin protección.'
        ];
        return result;
      }
      throw error;
    }

    const pageCount = pdfDoc.getPageCount();
    result.metadata.pages = pageCount;

    if (pageCount > maxPages) {
      result.type = ValidationResult.TOO_LARGE;
      result.reason = `El PDF tiene ${pageCount} páginas. El límite es ${maxPages} páginas.`;
      result.suggestions = [
        'Extrae solo las páginas relevantes del documento.',
        'Divide el documento en secciones más pequeñas.'
      ];
      return result;
    }

    const extractedText = await extractTextFromPDF(filePath);
    result.metadata.extractedLength = extractedText.length;

    if (extractedText.length < minTextLength) {
      result.type = ValidationResult.SCANNED_PDF;
      result.reason = 'El PDF parece ser un documento escaneado (imagen) y no contiene texto extraíble.';
      result.suggestions = [
        'Usa un servicio OCR para convertir la imagen a texto.',
        'Copia manualmente el texto relevante y pégalo en un archivo .txt.'
      ];
      return result;
    }

    result.valid = true;
    result.type = ValidationResult.VALID;
    result.reason = 'PDF válido con texto extraíble.';
    return result;

  } catch (error) {
    console.error('Error validando PDF:', error);
    result.type = ValidationResult.CORRUPTED;
    result.reason = 'No se pudo procesar el PDF. Puede estar corrupto o dañado.';
    result.suggestions = [
      'Intenta abrir el PDF en un lector para verificar que funciona.',
      'Vuelve a descargar o generar el documento.'
    ];
    return result;
  }
}

function validateTextFile(filePath, options = {}) {
  const { minTextLength } = options;
  const result = { valid: false, type: null, reason: null, suggestions: [], metadata: {} };

  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    result.metadata.length = content.length;

    if (content.length < minTextLength) {
      result.type = ValidationResult.EMPTY;
      result.reason = `El archivo está vacío o tiene muy poco contenido (${content.length} caracteres).`;
      result.suggestions = ['Verifica que el archivo contiene el texto correcto.'];
      return result;
    }

    result.valid = true;
    result.type = ValidationResult.VALID;
    result.reason = 'Archivo de texto válido.';
    return result;

  } catch (error) {
    console.error('Error validando archivo de texto:', error);
    result.type = ValidationResult.CORRUPTED;
    result.reason = 'No se pudo leer el archivo de texto.';
    result.suggestions = ['Verifica que el archivo no está corrupto.'];
    return result;
  }
}

function generateUserMessage({ type, reason, suggestions, metadata }) {
  let emoji = '❌';
  let title = 'Error al Procesar Documento';
  let message = `📄 Archivo: ${metadata.filename}\n⚠️ Problema: ${reason}`;

  switch (type) {
    case ValidationResult.VALID:
      return `✅ Documento válido: ${metadata.filename}\n📄 Páginas: ${metadata.pages || 'N/A'}\n📊 Tamaño: ${metadata.sizeMB} MB\n🔄 Procesando documento...`;
    case ValidationResult.SCANNED_PDF:
      emoji = '⚠️';
      title = 'Documento Escaneado Detectado';
      break;
    case ValidationResult.PROTECTED:
      emoji = '🔒';
      title = 'Documento Protegido';
      break;
    case ValidationResult.TOO_LARGE:
      emoji = '📏';
      title = 'Documento Demasiado Grande';
      break;
    case ValidationResult.UNSUPPORTED:
      title = 'Formato No Soportado';
      break;
  }

  const suggestionText = suggestions.map(s => `→ ${s}`).join('\n');
  return `${emoji} **${title}**\n\n${message}\n\n**Soluciones:**\n${suggestionText}`;
}

module.exports = {
  validateDocument,
  generateUserMessage,
  ValidationResult
};

