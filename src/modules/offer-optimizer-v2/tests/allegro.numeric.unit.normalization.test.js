const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const {
    mapPackagingFeaturesToAllegroSchema,
    normalizeUnitToken,
    convertBetweenUnits,
    normalizeNumericValueForAllegroParam,
    normalizeNumericFeaturesForAllegroSchema
} = require('../services/allegro-param-automapper.service');
const { convertValueToParameterUnit } = require('../../../utils/allegro_mapper');
const aiService = require('../../offer-optimizer/ai.service');
const aiWrapper = require('../ai.wrapper');

const CHANTE_CLAIR_SCHEMA = [
    { id: '248811', name: 'Marka', type: 'dictionary', required: true, dictionary: [{ id: '1', value: 'Chante Clair' }] },
    { id: '221905', name: 'Pojemność', type: 'float', unit: 'l', required: true, restrictions: { min: 0.001, max: 1000, precision: 3 } },
    { id: '17448', name: 'Waga produktu', type: 'float', unit: 'kg', required: true, restrictions: { min: 0.001, max: 1000, precision: 3 } },
    { id: '219', name: 'Postać', type: 'dictionary', required: true, dictionary: [{ id: '1', value: 'płyn' }, { id: '2', value: 'spray' }] }
];

test('Backend & Frontend parity: regresja zrzutu Chante Clair ("600 Ml" -> "0.6" w L, "0,650 kg" -> "0.65" w KG)', async () => {
    const dirtyFeatures = {
        Marka: 'Chante Clair',
        Postać: 'płyn',
        'Pojemność': '600 Ml',
        'Waga produktu': '0,650 kg'
    };

    const autoRes = mapPackagingFeaturesToAllegroSchema({
        allegroSchema: CHANTE_CLAIR_SCHEMA,
        currentFeatures: dirtyFeatures,
        product: { name: 'Chante Clair Odtłuszczacz 600 ml', ean: '8015194524906' }
    });
    assert.equal(autoRes.updatedFeatures['Pojemność'], '0.6');
    assert.equal(autoRes.updatedFeatures['Waga produktu'], '0.65');

    const schemaNorm = normalizeNumericFeaturesForAllegroSchema(dirtyFeatures, CHANTE_CLAIR_SCHEMA, {
        productName: 'Chante Clair Odtłuszczacz 600 ml'
    });
    assert.equal(schemaNorm.changed, true);
    assert.equal(schemaNorm.features['Pojemność'], '0.6');
    assert.equal(schemaNorm.features['Waga produktu'], '0.65');

    // Drugi przebieg powinien być idempotentny (changed === false)
    const secondPass = normalizeNumericFeaturesForAllegroSchema(schemaNorm.features, CHANTE_CLAIR_SCHEMA, {
        productName: 'Chante Clair Odtłuszczacz 600 ml'
    });
    assert.equal(secondPass.changed, false);

    // Weryfikacja identycznego zachowania helpera frontendowego (ESM)
    const feModuleUrl = pathToFileURL(
        path.resolve(__dirname, '../../../../frontend/src/views/OfferOptimizer/utils/allegroParamFormatter.js')
    ).href;
    const feFmt = await import(feModuleUrl);
    const feNorm = feFmt.normalizeFeaturesForAllegroSchema(dirtyFeatures, CHANTE_CLAIR_SCHEMA, {
        productName: 'Chante Clair Odtłuszczacz 600 ml'
    });
    assert.equal(feNorm.changed, true);
    assert.equal(feNorm.features['Pojemność'], '0.6');
    assert.equal(feNorm.features['Waga produktu'], '0.65');
    assert.equal(feFmt.normalizeFeaturesForAllegroSchema(feNorm.features, CHANTE_CLAIR_SCHEMA).changed, false);

    // Walidacja UI na brudnej vs czystej wartości
    const dirtyValState = feFmt.validateNumericAllegroParamValue('600 Ml', CHANTE_CLAIR_SCHEMA[1]);
    assert.equal(dirtyValState.valid, false);
    assert.equal(dirtyValState.canAutoConvert, true);
    assert.equal(dirtyValState.suggestedValue, '0.6');

    const cleanValState = feFmt.validateNumericAllegroParamValue('0.6', CHANTE_CLAIR_SCHEMA[1]);
    assert.equal(cleanValState.valid, true);
});

test('Konwersje wielokierunkowe: ml/cl/l, mg/g/dag/kg, mm/cm/m, integer, min/max oraz ochrona przed niezgodną rodziną jednostek', () => {
    assert.equal(normalizeUnitToken('Ml'), 'ml');
    assert.equal(normalizeUnitToken('litry'), 'l');
    assert.equal(normalizeUnitToken('dkg'), 'dag');
    assert.equal(convertBetweenUnits(75, 'cl', 'l'), 0.75);
    assert.equal(convertBetweenUnits(600, 'ml', 'kg'), null);

    // L -> ML
    const paramMl = { id: '1', name: 'Pojemność', type: 'integer', unit: 'ml', restrictions: { min: 1, max: 50000 } };
    assert.equal(normalizeNumericValueForAllegroParam('0,6 l', paramMl).value, '600');
    assert.equal(normalizeNumericValueForAllegroParam('75 cl', paramMl).value, '750');

    // G / MG / DAG -> KG & KG -> G
    const paramKg = { id: '2', name: 'Waga', type: 'float', unit: 'kg', restrictions: { min: 0.001, max: 1000, precision: 3 } };
    assert.equal(normalizeNumericValueForAllegroParam('650 g', paramKg).value, '0.65');
    assert.equal(normalizeNumericValueForAllegroParam('45 dag', paramKg).value, '0.45');

    const paramG = { id: '3', name: 'Waga', type: 'float', unit: 'g', restrictions: { min: 0.1, max: 100000, precision: 2 } };
    assert.equal(normalizeNumericValueForAllegroParam('0,65 kg', paramG).value, '650');
    assert.equal(normalizeNumericValueForAllegroParam('500 mg', paramG).value, '0.5');

    // Długość (mm / m -> cm)
    const paramCm = { id: '4', name: 'Wysokość', type: 'float', unit: 'cm', restrictions: { min: 0.1, max: 500, precision: 1 } };
    assert.equal(normalizeNumericValueForAllegroParam('250 mm', paramCm).value, '25');
    assert.equal(normalizeNumericValueForAllegroParam('1,2 m', paramCm).value, '120');

    // Samotna liczba bez jednostki: "600" przy nazwie zawierającej "600 ml" lub przekroczeniu max
    const paramLitresSmallMax = { id: '5', name: 'Pojemność', type: 'float', unit: 'l', restrictions: { min: 0.01, max: 50, precision: 3 } };
    assert.equal(normalizeNumericValueForAllegroParam('600', paramLitresSmallMax).value, '0.6');
    assert.equal(normalizeNumericValueForAllegroParam('600', CHANTE_CLAIR_SCHEMA[1], { fallbackSources: 'Chante Clair 600 ml' }).value, '0.6');
    assert.equal(normalizeNumericValueForAllegroParam('1.5', paramLitresSmallMax).value, '1.5');

    // Ochrona przed niezgodną rodziną ("600 ml" wpisane w polu kg) oraz wartościami ujemnymi/poza zakresem
    const badUnitInWeight = normalizeNumericValueForAllegroParam('600 ml', paramKg);
    assert.equal(badUnitInWeight.ok, false);
    assert.equal(normalizeNumericValueForAllegroParam('0 ml', CHANTE_CLAIR_SCHEMA[1]).ok, false);

    // Parytet allegro_mapper.convertValueToParameterUnit (cl, mg, dag)
    assert.equal(convertValueToParameterUnit('75 cl', CHANTE_CLAIR_SCHEMA[1]).value, '0.75');
    assert.equal(convertValueToParameterUnit('500 mg', paramG).value, '0.5');
    assert.equal(convertValueToParameterUnit('45 dkg', paramKg).value, '0.45');
});

test('AiService.autofillMissingParameters normalizuje odpowiedzi AI do formatu liczbowego Allegro', async () => {
    const origCall = aiWrapper.callAgentWithTelemetry;
    const prevKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-key-mock';

    aiWrapper.callAgentWithTelemetry = async () => ({
        result: {
            features: {
                'Pojemność': '600 Ml',
                'Waga produktu': '0,650 kg'
            }
        }
    });

    try {
        const res = await aiService.autofillMissingParameters(
            '8015194524906',
            'Chante Clair 600 ml',
            { Marka: 'Chante Clair', Postać: 'płyn' },
            CHANTE_CLAIR_SCHEMA,
            { product: { ean: '8015194524906', name: 'Chante Clair 600 ml' } }
        );
        assert.equal(res['Pojemność'], '0.6');
        assert.equal(res['Waga produktu'], '0.65');
    } finally {
        aiWrapper.callAgentWithTelemetry = origCall;
        if (prevKey === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = prevKey;
    }
});
