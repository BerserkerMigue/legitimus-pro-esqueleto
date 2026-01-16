const fs = require('fs');
const path = require('path');
function safeJson(p) { try { return JSON.parse(fs.readFileSync(p,'utf-8')); } catch { return null; } }
function getEnabledActions(baseDir = process.cwd()) {
  const candidates = [
    path.join(baseDir, 'lexcode_instances', 'general', 'builder.json'),
    path.join(baseDir, 'builder.json'),
  ];
  let enabled = null;
  for (const c of candidates) {
    const j = safeJson(c);
    if (j) {
      enabled = j.enabled_actions || (j.capabilities && j.capabilities.enabled_actions);
      if (enabled && Array.isArray(enabled)) break;
    }
  }
  if (!enabled || !Array.isArray(enabled)) {
    const ident = safeJson(path.join(baseDir, 'bot.identity.json'));
    enabled = ident && ident.enabled_actions;
  }
  return Array.isArray(enabled) ? enabled : [];
}
module.exports = { getEnabledActions };
