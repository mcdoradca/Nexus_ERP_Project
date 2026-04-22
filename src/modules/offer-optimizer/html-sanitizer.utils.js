const sanitizeHtml = (htmlString) => {
    if (!htmlString || typeof htmlString !== 'string') return '';
    
    // 1. Remove all \n and \t explicitly added by AI
    let sanitized = htmlString.replace(/[\n\t\r]/g, ' ');

    // 2. Change <strong> and <em> to <b> and <i> (Allegro allows <b>)
    sanitized = sanitized.replace(/<strong[^>]*>/gi, '<b>').replace(/<\/strong>/gi, '</b>');
    sanitized = sanitized.replace(/<em[^>]*>/gi, '<b>').replace(/<\/em>/gi, '</b>');
    
    // 3. Remove inline styles
    sanitized = sanitized.replace(/\sstyle="[^"]*"/gi, '');
    
    // 4. Remove attributes class, id, width, height, etc. except src for images if images were permitted, but Allegro only allows: <h1>, <h2>, <p>, <ul>, <ol>, <li>, <b>
    sanitized = sanitized.replace(/\s(class|id|width|height|align)="[^"]*"/gi, '');
    
    // 5. White-list tags: <h1>, <h2>, <p>, <ul>, <ol>, <li>, <b>
    // We match any tag, if it's not in the whitelist, we either remove it (but keep content), or just strip it.
    // E.g., <br/> becomes space
    sanitized = sanitized.replace(/<br\s*\/?>/gi, ' ');
    
    const allowedTags = ['h1', 'h2', 'p', 'ul', 'ol', 'li', 'b'];
    const tagRegex = /<\/?([a-z0-9]+)[^>]*>/gi;
    
    sanitized = sanitized.replace(tagRegex, (match, tagName) => {
        const lowerTag = tagName.toLowerCase();
        if (allowedTags.includes(lowerTag)) {
            // Re-build clean tag, stripping any remaining rogue attributes
            if (match.startsWith('</')) {
                return `</${lowerTag}>`;
            }
            return `<${lowerTag}>`;
        }
        // Remove the disallowed tag, but keep its inner content
        return ''; 
    });

    // 6. Clean up multiple spaces
    sanitized = sanitized.replace(/\s{2,}/g, ' ').trim();

    return sanitized;
};

// Title sanitizer -> limit to 75 chars
const sanitizeTitle = (title) => {
    if (!title) return '';
    let cleaned = title.replace(/[!]/g, ''); // remove exclamation marks
    // Remove promotional words
    cleaned = cleaned.replace(/\b(hit|super|okazja|wyprzedaż|mega|promocja|taniej|najtaniej)\b/gi, '').trim();
    cleaned = cleaned.replace(/\s{2,}/g, ' ');
    if (cleaned.length > 75) {
        cleaned = cleaned.substring(0, 75).trim();
    }
    return cleaned;
};

module.exports = {
    sanitizeHtml,
    sanitizeTitle
};
