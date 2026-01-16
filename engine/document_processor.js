const { default: OpenAI } = require("openai");
const fs = require("fs");
const path = require("path");
const { validateDocument, generateUserMessage, ValidationResult } = require("./document_validator");
const { extractTextFromPDF } = require("./pdf_extractor");
const chatDocManager = require("./chat_document_manager");

let client = null;

function getClient() {
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

const LEGAL_SUMMARY_SYSTEM_PROMPT = `Eres un asistente jurídico experto especializado en derecho chileno.
Tu tarea es analizar documentos legales y generar resúmenes ejecutivos estructurados que permitan a un abogado entender rápidamente el contenido sin leer todo el documento.

ESTRUCTURA DEL RESUMEN:
1. TIPO DE DOCUMENTO: Identifica el tipo (contrato, demanda, sentencia, escritura, etc.)
2. PARTES INVOLUCRADAS: Nombres completos, RUT, roles.
3. FECHAS CLAVE: Todas las fechas relevantes.
4. HECHOS PRINCIPALES: Resumen cronológico de los hechos.
5. CLÁUSULAS Y OBLIGACIONES CLAVE: Obligaciones, derechos, plazos, montos.
6. NORMATIVA CITADA: Leyes, artículos, decretos.
7. TÉRMINOS JURÍDICOS RELEVANTES: Conceptos legales importantes.

INSTRUCCIONES:
- Sé preciso y conciso.
- Mantén TODOS los datos exactos (números, fechas, nombres, RUT).
- Usa lenguaje jurídico profesional.
- Máximo 3000 caracteres.
- Usa formato numerado claro.`;

async function generateDocumentSummary(documentText, metadata = {}, model = "gpt-4o-mini") {
  try {
    console.log(`📝 Generando resumen con ${model}...`);
    const startTime = Date.now();

    const response = await getClient().chat.completions.create({
      model,
      messages: [
        { role: "system", content: LEGAL_SUMMARY_SYSTEM_PROMPT },
        { role: "user", content: `Analiza el siguiente documento y genera un resumen ejecutivo:\n\n${documentText.slice(0, 120000)}` },
      ],
      temperature: 0.2,
      max_tokens: 1500,
    });

    const summary = response.choices[0].message.content;
    const processingTime = Date.now() - startTime;

    const result = {
      summary,
      metadata: {
        ...metadata,
        originalLength: documentText.length,
        summaryLength: summary.length,
        compressionRatio: ((summary.length / documentText.length) * 100).toFixed(2) + "%",
        model,
        tokensUsed: response.usage.total_tokens,
        processingTimeMs: processingTime,
        estimatedCost: (
          (response.usage.prompt_tokens / 1000000 * 0.15) + 
          (response.usage.completion_tokens / 1000000 * 0.60)
        ).toFixed(6)
      },
    };

    console.log(`✅ Resumen generado en ${processingTime}ms. Costo estimado: $${result.metadata.estimatedCost} USD`);
    return result;
  } catch (error) {
    console.error("❌ Error generando resumen:", error);
    throw error;
  }
}

async function processDocumentWithSmartSummary(filePath, userId, chatId, options = {}) {
  const { smartSummaryConfig, validationConfig } = options;
  const filename = path.basename(filePath);

  try {
    console.log(`📄 Validando documento: ${filename}`);
    const validation = await validateDocument(filePath, validationConfig);

    if (!validation.valid) {
      return {
        mode: "error",
        valid: false,
        message: generateUserMessage(validation),
        filename,
      };
    }

    console.log(`✅ Documento válido, procediendo a procesar...`);
    const ext = path.extname(filePath).toLowerCase();
    let documentText = "";

    if (ext === ".txt" || ext === ".md") {
      documentText = fs.readFileSync(filePath, "utf-8");
    } else if (ext === ".pdf") {
      documentText = await extractTextFromPDF(filePath);
    }

    if (documentText.length <= smartSummaryConfig.threshold_chars) {
        console.log(`📋 Documento pequeño (${documentText.length} chars), subiendo directamente.`);
        const vectorStoreId = await chatDocManager.getOrCreateChatVectorStore(chatId, userId, options.chatVectorStoresConfig.expiration_days);
        await chatDocManager.uploadFullDocumentToVectorStore(vectorStoreId, filePath);
        return {
            mode: "direct",
            valid: true,
            message: `✅ Documento "${filename}" procesado y almacenado en este chat.`
        };
    }

    const summaryResult = await generateDocumentSummary(documentText, { filename }, smartSummaryConfig.model);

    await chatDocManager.storeDocumentSummary(
      chatId,
      userId,
      `[RESUMEN DOCUMENTO: ${filename}]\n\n${summaryResult.summary}`,
      { filename, ...summaryResult.metadata }
    );

    if (smartSummaryConfig.keep_original_in_vector) {
        const vectorStoreId = chatDocManager.getChatVectorStore(chatId);
        await chatDocManager.uploadFullDocumentToVectorStore(vectorStoreId, filePath);
    }

    return {
      mode: "summary",
      valid: true,
      message: `✅ Documento procesado: ${filename}\n📝 Resumen ejecutivo generado (${summaryResult.metadata.compressionRatio} del original)\n💾 Almacenado en este chat (expira en ${options.chatVectorStoresConfig.expiration_days} días)\n💡 Documento completo también disponible para consultas específicas.`,
    };

  } catch (error) {
    console.error(`❌ Error procesando documento ${filename}:`, error);
    return {
      mode: "error",
      valid: false,
      message: `⚠️ Error inesperado al procesar el documento: ${filename}. Por favor, verifica que no esté corrupto e inténtalo de nuevo.`,
      filename,
    };
  }
}

module.exports = { processDocumentWithSmartSummary };

