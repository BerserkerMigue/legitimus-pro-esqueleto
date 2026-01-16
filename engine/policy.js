function evaluateRisk(q){
  const s = (q || '').toLowerCase();
  const high = /(represent(ar|ación)|firm(a|ar)|poder judicial|escrito judicial|patrocinio|plazo fatal|apelaci(ón|on)|tribunal)/;
  const medium = /(demanda|contrato|recurso|carta formal|compraventa|autorizaci(ón|on))/;
  if (high.test(s)) return 'high';
  if (medium.test(s)) return 'medium';
  return 'low';
}

function maybeAppendAdvisory(answer, risk){
  if (risk === 'low') return answer;
  const note = (risk === 'high')
    ? "\n\nNota: Para actos que implican representación o presentación formal ante autoridades, valida el texto final con un profesional habilitado."
    : "\n\nAviso: Esta guía es operativa. Si vas a firmar o presentar, valida los detalles formales aplicables a tu caso.";
  return `${answer}${note}`;
}

module.exports = { evaluateRisk, maybeAppendAdvisory };