// engine/hooks/actions_tools_integration.js
let list = () => [];
let run  = async () => ({ error: 'actions module missing' });
try {
  const mod = require('../../actions');
  if (typeof mod.list === 'function') list = mod.list;
  if (typeof mod.run  === 'function') run  = mod.run;
} catch (e) {
  // console.warn('[actions] module missing, continuing without Actions');
}

function actionsToFunctionTools(enabledNames) {
  const all = list();
  const enabled = new Set(enabledNames || []);
  return all
    .filter(a => enabled.size === 0 || enabled.has(a.name))
    .map(a => ({
      type: 'function',
      function: {
        name: a.name,
        description: a.description || '',
        parameters: a.parametersSchema || { type: 'object', properties: {} }
      }
    }));
}

function augmentTools(baseTools = [], enabledNames = []) {
  const fnTools = actionsToFunctionTools(enabledNames);
  return [...baseTools, ...fnTools];
}

async function handleRequiredActions(requiredAction, client, { threadId, runId }, debugSink = null) {
  if (!requiredAction || !requiredAction.submit_tool_outputs) return false;
  const calls = requiredAction.submit_tool_outputs.tool_calls || [];
  if (!Array.isArray(calls) || calls.length === 0) return false;

  const outputs = [];
  for (const call of calls) {
    const name = call.function?.name;
    let args = {};
    try { args = JSON.parse(call.function?.arguments || '{}'); } catch (_) {}

    let result;
    try { result = await run(name, args); }
    catch (err) { result = { error: String(err && err.message || err) }; }

    if (Array.isArray(debugSink)) debugSink.push({ type:'tool_result', tool_call_id: call.id, tool_name: call.function?.name, result });

    outputs.push({ tool_call_id: call.id, output: JSON.stringify(result) });
  }

  await client.beta.threads.runs.submitToolOutputs({
    thread_id: threadId,
    run_id: runId,
    tool_outputs: outputs
  });
  return true;
}

module.exports = { augmentTools, handleRequiredActions };
