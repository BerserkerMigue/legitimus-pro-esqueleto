/**
 * Markdown Parser para documentos PDF y Word
 * Convierte sintaxis Markdown a elementos formateados
 */

const { Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle } = require('docx');

/**
 * Parsea una línea de Markdown y retorna información sobre su tipo y contenido
 */
function parseMarkdownLine(line) {
  const trimmed = line.trim();
  
  // Línea vacía
  if (!trimmed) {
    return { type: 'empty', content: '' };
  }
  
  // Separador horizontal ---
  if (/^-{3,}$/.test(trimmed) || /^\*{3,}$/.test(trimmed) || /^_{3,}$/.test(trimmed)) {
    return { type: 'separator', content: '' };
  }
  
  // Encabezados
  const h1Match = trimmed.match(/^#\s+(.+)$/);
  if (h1Match) {
    return { type: 'h1', content: h1Match[1] };
  }
  
  const h2Match = trimmed.match(/^##\s+(.+)$/);
  if (h2Match) {
    return { type: 'h2', content: h2Match[1] };
  }
  
  const h3Match = trimmed.match(/^###\s+(.+)$/);
  if (h3Match) {
    return { type: 'h3', content: h3Match[1] };
  }
  
  const h4Match = trimmed.match(/^####\s+(.+)$/);
  if (h4Match) {
    return { type: 'h4', content: h4Match[1] };
  }
  
  // Lista con viñeta
  const bulletMatch = trimmed.match(/^[-*]\s+(.+)$/);
  if (bulletMatch) {
    return { type: 'bullet', content: bulletMatch[1] };
  }
  
  // Lista numerada
  const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
  if (numberedMatch) {
    return { type: 'numbered', number: numberedMatch[1], content: numberedMatch[2] };
  }
  
  // Texto normal
  return { type: 'text', content: trimmed };
}

/**
 * Parsea texto con formato inline (negrita, cursiva)
 * Retorna un array de TextRun para Word
 */
function parseInlineFormatting(text, baseSize = 24) {
  const runs = [];
  let remaining = text;
  
  // Regex para encontrar **texto** o __texto__ (negrita)
  // y *texto* o _texto_ (cursiva)
  const boldRegex = /\*\*(.+?)\*\*|__(.+?)__/g;
  const italicRegex = /\*(.+?)\*|_(.+?)_/g;
  
  // Primero procesamos negrita
  let lastIndex = 0;
  let match;
  
  // Crear una versión simplificada: procesar todo el texto
  // Dividir por patrones de negrita
  const parts = [];
  let currentText = text;
  
  // Buscar todos los patrones **texto**
  const boldPattern = /\*\*([^*]+)\*\*/g;
  let boldMatch;
  let lastBoldIndex = 0;
  
  while ((boldMatch = boldPattern.exec(text)) !== null) {
    // Texto antes del match
    if (boldMatch.index > lastBoldIndex) {
      parts.push({ text: text.slice(lastBoldIndex, boldMatch.index), bold: false });
    }
    // Texto en negrita
    parts.push({ text: boldMatch[1], bold: true });
    lastBoldIndex = boldMatch.index + boldMatch[0].length;
  }
  
  // Texto restante después del último match
  if (lastBoldIndex < text.length) {
    parts.push({ text: text.slice(lastBoldIndex), bold: false });
  }
  
  // Si no hubo matches, agregar todo el texto
  if (parts.length === 0) {
    parts.push({ text: text, bold: false });
  }
  
  // Convertir a TextRuns
  for (const part of parts) {
    if (part.text) {
      runs.push(new TextRun({
        text: part.text,
        bold: part.bold,
        size: baseSize
      }));
    }
  }
  
  return runs.length > 0 ? runs : [new TextRun({ text: text, size: baseSize })];
}

/**
 * Convierte contenido Markdown a párrafos de Word
 */
function markdownToWordParagraphs(content) {
  const lines = content.split('\n');
  const paragraphs = [];
  
  for (const line of lines) {
    const parsed = parseMarkdownLine(line);
    
    switch (parsed.type) {
      case 'empty':
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: '' })]
        }));
        break;
        
      case 'separator':
        paragraphs.push(new Paragraph({
          children: [new TextRun({ text: '─'.repeat(50) })],
          spacing: { before: 200, after: 200 }
        }));
        break;
        
      case 'h1':
        paragraphs.push(new Paragraph({
          children: parseInlineFormatting(parsed.content, 36),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 }
        }));
        break;
        
      case 'h2':
        paragraphs.push(new Paragraph({
          children: parseInlineFormatting(parsed.content, 32),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 150 }
        }));
        break;
        
      case 'h3':
        paragraphs.push(new Paragraph({
          children: parseInlineFormatting(parsed.content, 28),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 250, after: 100 }
        }));
        break;
        
      case 'h4':
        paragraphs.push(new Paragraph({
          children: parseInlineFormatting(parsed.content, 26),
          heading: HeadingLevel.HEADING_4,
          spacing: { before: 200, after: 100 }
        }));
        break;
        
      case 'bullet':
        paragraphs.push(new Paragraph({
          children: [
            new TextRun({ text: '• ', size: 24 }),
            ...parseInlineFormatting(parsed.content, 24)
          ],
          indent: { left: 720 }, // 0.5 pulgadas
          spacing: { before: 50, after: 50 }
        }));
        break;
        
      case 'numbered':
        paragraphs.push(new Paragraph({
          children: [
            new TextRun({ text: `${parsed.number}. `, size: 24 }),
            ...parseInlineFormatting(parsed.content, 24)
          ],
          indent: { left: 720 },
          spacing: { before: 50, after: 50 }
        }));
        break;
        
      case 'text':
      default:
        paragraphs.push(new Paragraph({
          children: parseInlineFormatting(parsed.content, 24),
          spacing: { before: 50, after: 50 }
        }));
        break;
    }
  }
  
  return paragraphs;
}

/**
 * Renderiza contenido Markdown a un documento PDF
 */
function renderMarkdownToPdf(doc, content) {
  const lines = content.split('\n');
  
  for (const line of lines) {
    const parsed = parseMarkdownLine(line);
    
    switch (parsed.type) {
      case 'empty':
        doc.moveDown(0.5);
        break;
        
      case 'separator':
        doc.moveDown(0.3);
        doc.strokeColor('#cccccc')
           .lineWidth(1)
           .moveTo(doc.page.margins.left, doc.y)
           .lineTo(doc.page.width - doc.page.margins.right, doc.y)
           .stroke();
        doc.moveDown(0.5);
        break;
        
      case 'h1':
        doc.moveDown(0.5);
        doc.fontSize(18).font('Helvetica-Bold');
        renderInlineText(doc, parsed.content);
        doc.font('Helvetica');
        doc.moveDown(0.3);
        break;
        
      case 'h2':
        doc.moveDown(0.4);
        doc.fontSize(16).font('Helvetica-Bold');
        renderInlineText(doc, parsed.content);
        doc.font('Helvetica');
        doc.moveDown(0.2);
        break;
        
      case 'h3':
        doc.moveDown(0.3);
        doc.fontSize(14).font('Helvetica-Bold');
        renderInlineText(doc, parsed.content);
        doc.font('Helvetica');
        doc.moveDown(0.2);
        break;
        
      case 'h4':
        doc.moveDown(0.2);
        doc.fontSize(13).font('Helvetica-Bold');
        renderInlineText(doc, parsed.content);
        doc.font('Helvetica');
        doc.moveDown(0.1);
        break;
        
      case 'bullet':
        doc.fontSize(12).font('Helvetica');
        doc.text('•  ', { continued: true, indent: 20 });
        renderInlineText(doc, parsed.content);
        break;
        
      case 'numbered':
        doc.fontSize(12).font('Helvetica');
        doc.text(`${parsed.number}. `, { continued: true, indent: 20 });
        renderInlineText(doc, parsed.content);
        break;
        
      case 'text':
      default:
        doc.fontSize(12).font('Helvetica');
        renderInlineText(doc, parsed.content);
        break;
    }
  }
}

/**
 * Renderiza texto con formato inline (negrita) en PDF
 */
function renderInlineText(doc, text) {
  const boldPattern = /\*\*([^*]+)\*\*/g;
  let lastIndex = 0;
  let match;
  let hasContent = false;
  
  while ((match = boldPattern.exec(text)) !== null) {
    // Texto antes del match
    if (match.index > lastIndex) {
      const beforeText = text.slice(lastIndex, match.index);
      if (beforeText) {
        doc.font('Helvetica').text(beforeText, { continued: true });
        hasContent = true;
      }
    }
    
    // Texto en negrita
    doc.font('Helvetica-Bold').text(match[1], { continued: true });
    hasContent = true;
    lastIndex = match.index + match[0].length;
  }
  
  // Texto restante
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    doc.font('Helvetica').text(remaining, { continued: false });
  } else if (hasContent) {
    doc.text('', { continued: false }); // Finalizar línea
  } else {
    doc.text(text, { continued: false });
  }
}

/**
 * Convierte texto con formato inline Markdown a texto plano
 * Elimina **negrita** y *cursiva* dejando solo el texto
 */
function removeInlineFormatting(text) {
  // Remover **negrita**
  let result = text.replace(/\*\*([^*]+)\*\*/g, '$1');
  // Remover __negrita__
  result = result.replace(/__([^_]+)__/g, '$1');
  // Remover *cursiva* (cuidado de no afectar listas)
  result = result.replace(/(?<!^)\*([^*]+)\*/g, '$1');
  // Remover _cursiva_
  result = result.replace(/(?<!^)_([^_]+)_/g, '$1');
  return result;
}

/**
 * Convierte contenido Markdown a texto plano limpio
 * Ideal para exportación TXT y copiar al portapapeles
 */
function markdownToPlainText(content) {
  const lines = content.split('\n');
  const outputLines = [];
  
  for (const line of lines) {
    const parsed = parseMarkdownLine(line);
    
    switch (parsed.type) {
      case 'empty':
        outputLines.push('');
        break;
        
      case 'separator':
        outputLines.push('\u2500'.repeat(50)); // Línea horizontal con carácter especial
        break;
        
      case 'h1':
        // Título principal en mayúsculas
        outputLines.push('');
        outputLines.push(removeInlineFormatting(parsed.content).toUpperCase());
        outputLines.push('='.repeat(parsed.content.length));
        break;
        
      case 'h2':
        // Subtítulo con subrayado
        outputLines.push('');
        outputLines.push(removeInlineFormatting(parsed.content));
        outputLines.push('-'.repeat(parsed.content.length));
        break;
        
      case 'h3':
        // Sección con prefijo
        outputLines.push('');
        outputLines.push(`▶ ${removeInlineFormatting(parsed.content)}`);
        break;
        
      case 'h4':
        // Subsección con prefijo menor
        outputLines.push(`  ▷ ${removeInlineFormatting(parsed.content)}`);
        break;
        
      case 'bullet':
        // Viñeta con carácter especial
        outputLines.push(`  • ${removeInlineFormatting(parsed.content)}`);
        break;
        
      case 'numbered':
        // Lista numerada con indentación
        outputLines.push(`  ${parsed.number}. ${removeInlineFormatting(parsed.content)}`);
        break;
        
      case 'text':
      default:
        outputLines.push(removeInlineFormatting(parsed.content));
        break;
    }
  }
  
  return outputLines.join('\n');
}

module.exports = {
  parseMarkdownLine,
  parseInlineFormatting,
  markdownToWordParagraphs,
  renderMarkdownToPdf,
  markdownToPlainText,
  removeInlineFormatting
};
