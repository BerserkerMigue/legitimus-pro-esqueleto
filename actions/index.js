// actions/index.js
const defs = require('./definitions');

function list() {
  return defs.map(({ name, description, parametersSchema }) => ({ name, description, parametersSchema }));
}

async function run(name, args) {
  const def = defs.find(d => d.name === name);
  if (!def) return { error: `unknown action: ${name}` };
  try { return await def.handler(args || {}); }
  catch (err) { return { error: String(err && err.message || err) }; }
}

module.exports = { list, run };
