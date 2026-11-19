const test = require('node:test');
const assert = require('node:assert');
const {
    trimOrNull,
    parseLocaleFloat,
    parseLocaleInt,
    resolveProductByIdOrEan,
    buildNumericProductUpdateFields
} = require('../../../utils/productLookup');

test('productLookup - parseLocaleFloat, parseLocaleInt i buildNumericProductUpdateFields konwertują stringi i puste pola UI bez NaN', () => {
    assert.strictEqual(trimOrNull('  8032680390036  '), '8032680390036');
    assert.strictEqual(trimOrNull('   '), null);
    assert.strictEqual(parseLocaleFloat('1,25'), 1.25);
    assert.strictEqual(parseLocaleFloat(' 10.5 '), 10.5);
    assert.strictEqual(parseLocaleFloat('', null), null);
    assert.strictEqual(parseLocaleFloat('abc', null), null);
    assert.strictEqual(parseLocaleInt('6'), 6);
    assert.strictEqual(parseLocaleInt('', 0), 0);

    const updateFields = buildNumericProductUpdateFields({
        weight: '1,1',
        length: '',
        width: '12.5',
        height: null,
        taxRate: '',
        stock: '6',
        stockErpUnits: '',
        stockWmsUnits: '4',
        basePrice: '',
        salePrice: '9,30',
        bdoEprCost: '0.015'
    });

    assert.strictEqual(updateFields.weight, 1.1);
    assert.strictEqual(updateFields.length, null);
    assert.strictEqual(updateFields.width, 12.5);
    assert.strictEqual(updateFields.height, null);
    assert.strictEqual(updateFields.taxRate, 23.0);
    assert.strictEqual(updateFields.stock, 6);
    assert.strictEqual(updateFields.stockErpUnits, null);
    assert.strictEqual(updateFields.stockWmsUnits, 4);
    assert.strictEqual(updateFields.basePrice, 0.0);
    assert.strictEqual(updateFields.salePrice, 9.3);
    assert.strictEqual(updateFields.bdoEprCost, 0.015);
    assert.strictEqual('inboundTransportCost' in updateFields, false, 'Nieobecne klucze nie mogą trafiać do updatePayload');
});

test('productLookup - resolveProductByIdOrEan znajduje produkt ze spacją w kolumnie EAN i chroni przed częściowym dopasowaniem', async () => {
    const dirtyRow = {
        id: '1a4ec6f8-73b0-4987-a232-d3cb76df4454',
        ean: '8032680390036 ',
        sku: '0000009938',
        name: 'Dermomed Mydło w płynie talk i irys 1000 ml zapas'
    };
    const similarPrefixRow = {
        id: 'other-id',
        ean: '8032680390036999',
        sku: '0000009999'
    };

    const queries = [];
    const fakePrisma = {
        product: {
            async findUnique(args) {
                queries.push({ op: 'findUnique', args });
                if (args.where.id === dirtyRow.id) return dirtyRow;
                return null;
            },
            async findMany(args) {
                queries.push({ op: 'findMany', args });
                return [similarPrefixRow, dirtyRow];
            }
        }
    };

    // 1. Rozwiązywanie po przyciętym EAN ("8032680390036") mimo spacji w bazie ("8032680390036 ")
    const byTrimmedEan = await resolveProductByIdOrEan(fakePrisma, {
        ean: '8032680390036',
        select: { id: true, offerDraft: true }
    });
    assert.strictEqual(byTrimmedEan?.id, dirtyRow.id);
    const fallbackQuery = queries.find(q => q.op === 'findMany');
    assert.strictEqual(fallbackQuery.args.select.ean, true, 'Fallback musi dołączyć ean do selecta przy filtrowaniu .trim()');

    // 2. Odrzucenie niepełnego prefiksu
    const partial = await resolveProductByIdOrEan(fakePrisma, { ean: '803268039003' });
    assert.strictEqual(partial, null);

    // 3. Priorytet productId przy zapisie szkicu
    const byId = await resolveProductByIdOrEan(fakePrisma, {
        productId: dirtyRow.id,
        ean: 'inny-ean'
    });
    assert.strictEqual(byId?.id, dirtyRow.id);
});
