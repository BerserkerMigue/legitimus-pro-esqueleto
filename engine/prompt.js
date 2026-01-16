
function makeMessages(systemPrompt, context, question){
  const messages = [];
  messages.push({ role: 'system', content: systemPrompt });
  for(const turn of context){
    if (turn && turn.role && turn.content){
      messages.push({ role: turn.role, content: turn.content });
    } else if (turn && 'user' in turn && 'bot' in turn){
      // compat: formato antiguo
      messages.push({ role: 'user', content: turn.user });
      messages.push({ role: 'assistant', content: turn.bot });
    }
  }
  messages.push({ role: 'user', content: question });
  return messages;
}

module.exports = { makeMessages, summarizeText };


async function summarizeText(text){
  const llm = require("./llm");
  const sys = "Resume brevemente el contenido para memoria de conversación, conservando hechos clave y acuerdos.";
  const messages = [{ role: "system", content: sys }, { role: "user", content: text }];
  try{
    if (llm.responses){
      const out = await llm.responses({ messages, max_tokens: 256, temperature: 0.2 });
      return (out || "").trim();
    } else if (llm.chat){
      const out = await llm.chat({ modelo: "gpt-4o-mini" }, messages);
      return (out && out.choices && out.choices[0] && out.choices[0].message && out.choices[0].message.content) || "";
    }
  }catch(e){}
  return "";
}