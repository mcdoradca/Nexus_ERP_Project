const fs = require('fs');
const pdf = require('pdf-parse');

let dataBuffer = fs.readFileSync('src/modules/offer-optimizer/System Prompt dla Audytora Prawnego Kosmetyków (1).pdf');

pdf(dataBuffer).then(function(data) {
    console.log(data.text);
}).catch(console.error);
