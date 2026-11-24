const { validateAllegroOfferTitle } = require('../offer-optimizer-v2/services/title-optimizer.service');

/**
 * Walidator tytułu Allegro (zachowuje wsteczną kompatybilność kontraktu `{ valid, length, issues }`
 * i deleguje logikę do centralnego serwisu `title-optimizer.service.js`).
 */
function validateAllegroTitle(title, { brand } = {}) {
  const res = validateAllegroOfferTitle(title, { brand });
  return {
    valid: res.valid,
    seoOptimal: res.seoOptimal,
    score: res.score,
    length: res.length,
    issues: res.issues
  };
}

module.exports = {
  validateAllegroTitle
};
