const fs = require('fs');
const path = require('path');

const turnCounts = {};

function getTurnCountPath(userId, chatId) {
    const userDir = path.join(__dirname, '../users', userId);
    if (!fs.existsSync(userDir)) {
        fs.mkdirSync(userDir, { recursive: true });
    }
    return path.join(userDir, `${chatId}_interactions.json`);
}

function loadInteractionCount(userId, chatId) {
    const turnCountPath = getTurnCountPath(userId, chatId);
    if (fs.existsSync(turnCountPath)) {
        const data = fs.readFileSync(turnCountPath, 'utf-8');
        return JSON.parse(data).count || 0;
    }
    return 0;
}

function saveInteractionCount(userId, chatId, count) {
    const turnCountPath = getTurnCountPath(userId, chatId);
    fs.writeFileSync(turnCountPath, JSON.stringify({ count }));
}

function getInteractionStatus(userId, chatId) {
    const cfg = global.bot_config || {};
    const maxInteractions = cfg.memory?.max_chat_interactions || 0;
    const warningThreshold = cfg.memory?.warning_threshold || 0;
    const current = loadInteractionCount(userId, chatId);
    const remaining = maxInteractions > 0 ? maxInteractions - current : Infinity;
    const isLimitReached = maxInteractions > 0 && current >= maxInteractions;
    const isNearLimit = maxInteractions > 0 && warningThreshold > 0 && remaining <= warningThreshold;

    return { current, max: maxInteractions, remaining, isLimitReached, isNearLimit };
}

function incrementInteractionCount(userId, chatId) {
    const currentCount = loadInteractionCount(userId, chatId);
    saveInteractionCount(userId, chatId, currentCount + 1);
}

module.exports = {
    loadInteractionCount,
    saveInteractionCount,
    getInteractionStatus,
    incrementInteractionCount
};

