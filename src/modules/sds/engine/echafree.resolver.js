// Auto-extracted module: ECHAFreeResolver
const fs = require('fs');
const path = require('path');

class ECHAFreeResolver {
  static async resolveSubstanceData(casNumber) {
    const infoCardUrl = `https://echa.europa.eu/pl/substance-information/-/substanceinfo/${casNumber.replace(/-/g, "")}`;
    const pubchemUrl = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(casNumber)}/property/IUPACName,MolecularFormula/JSON`;
    
    // Prosty Exponential Backoff
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const responseData = await this.httpGetJson(pubchemUrl, 2500 * attempt);
        if (responseData && responseData.PropertyTable && responseData.PropertyTable.Properties[0]) {
          const props = responseData.PropertyTable.Properties[0];
          const rawIupac = props.IUPACName || "";
          const namePl = SDSChemicalExtractor.resolvePlName(casNumber, rawIupac);
          return {
            source: "PUBCHEM_OPEN_API",
            name_pl: namePl,
            iupac_name: rawIupac,
            molecular_formula: props.MolecularFormula,
            echa_infocard_url: infoCardUrl,
            status: "ZWERYFIKOWANO_API"
          };
        }
      } catch (e) {
        if (attempt === 3) break;
      }
    }
    throw new Error(`[CRITICAL HALT] Nie zidentyfikowano substancji o CAS: ${casNumber} w bazach API. DOKUMENT ZABLOKOWANY.`);
  }

  static httpGetJson(url, timeoutMs) {
    return new Promise((resolve, reject) => {
      const req = https.get(url, { headers: { "User-Agent": "SDSAgent/3.0" } }, (res) => {
        if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode}`)); }
        let raw = ""; res.setEncoding("utf8");
        res.on("data", chunk => raw += chunk);
        res.on("end", () => { try { resolve(JSON.parse(raw)); } catch (err) { reject(err); } });
      });
      req.on("error", reject);
      req.setTimeout(timeoutMs, () => { req.destroy(); reject(new Error("Timeout")); });
    });
  }
}

// ============================================================================
// 6. SZABLONY PRAWNE RP
// ============================================================================

module.exports = { ECHAFreeResolver };
