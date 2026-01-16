// engine/tools/navigate_web.js
const axios = require('axios');
const { URL } = require('url');

/**
 * Verifica si una URL está permitida según el modo (allowlist o denylist)
 * @param {string} u - URL a verificar
 * @param {string} mode - 'allowlist' o 'denylist'
 * @param {Array<string>} allowDomains - Lista de dominios permitidos (para allowlist)
 * @param {Array<string>} denyDomains - Lista de dominios bloqueados (para denylist)
 * @returns {boolean} true si está permitida, false si no
 */
function isAllowed(u, mode, allowDomains, denyDomains){
  try {
    const url = new URL(u);
    const hostname = url.hostname;
    
    if (mode === 'denylist') {
      // Modo denylist: Permitir TODOS excepto los que están en deny_domains
      return !denyDomains.some(d => hostname === d || hostname.endsWith(`.${d}`));
    } else {
      // Modo allowlist (por defecto): Permitir SOLO los que están en allow_domains
      return allowDomains.some(d => hostname === d || hostname.endsWith(`.${d}`));
    }
  } catch { return false; }
}

function extractLinks(html, baseUrl){
  const out = [];
  const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    try {
      const abs = new URL(m[1], baseUrl).toString();
      out.push(abs);
    } catch {}
  }
  return Array.from(new Set(out));
}

function strip(html){
  return String(html)
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchPage(url, timeoutMs, ua){
  const res = await axios.get(url, { timeout: timeoutMs || 12000, headers: { 'User-Agent': ua || 'LexCodeBot/1.0' }});
  return res.data;
}

async function crawl(seedUrl, cfg){
  const mode = cfg.mode || 'allowlist';
  const allow = Array.isArray(cfg.allowDomains) ? cfg.allowDomains : [];
  const deny = Array.isArray(cfg.denyDomains) ? cfg.denyDomains : [];
  const maxDepth = Math.max(0, cfg.maxDepth || 1);
  const maxPages = Math.max(1, cfg.maxPages || 6);
  const timeout = cfg.timeoutMs || 12000;
  const ua = cfg.ua || 'LexCodeBot/1.0';

  const seen = new Set();
  const queue = [{ url: seedUrl, depth:0 }];
  const out = [];

  while (queue.length && out.length < maxPages) {
    const { url, depth } = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    
    // Verificar si la URL está permitida según el modo
    if (!isAllowed(url, mode, allow, deny)) continue;

    let html;
    try { html = await fetchPage(url, timeout, ua); } catch { continue; }
    const text = strip(html);
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : '';
    out.push({ url, title, excerpt: text.slice(0, 4000) });

    if (depth < maxDepth) {
      const links = extractLinks(html, url);
      for (const ln of links) {
        if (!seen.has(ln) && isAllowed(ln, mode, allow, deny)) {
          queue.push({ url: ln, depth: depth+1 });
        }
      }
    }
  }
  return out;
}

module.exports = async function navigate_web(args, globalCfg){
  const url = args?.url;
  if (!url) return { error: "navigate_web: missing 'url'" };

  const navCfg = (globalCfg && globalCfg.web_navigation) || {};
  if (!navCfg.enabled) return { error: "navigate_web: disabled" };
  
  const results = await crawl(url, {
    mode: navCfg.mode || 'allowlist',
    allowDomains: navCfg.allow_domains || [],
    denyDomains: navCfg.deny_domains || [],
    maxDepth: navCfg.max_depth || 1,
    maxPages: navCfg.max_pages || 3,
    timeoutMs: navCfg.timeout_ms || 15000,
    ua: navCfg.user_agent || 'LexCodeBot/1.0'
  });
  
  return { ok:true, from:'navigate_web', items: results };
};
