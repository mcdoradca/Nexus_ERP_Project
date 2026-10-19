const test = require('node:test');
const assert = require('node:assert');

test('Wieloslotowe generowanie zdjęć AI (Sloty 2, 3, 5, 6) - Weryfikacja architektury', async (t) => {
    
    await t.test('1. Mapowanie slotów UI na indeksy tablicy (Slot 2,3,5,6 -> 1,2,4,5)', () => {
        const targetSlots = [2, 3, 5, 6];
        const targetIndexes = targetSlots.map(s => s - 1);
        assert.deepStrictEqual(targetIndexes, [1, 2, 4, 5], 'Sloty 2,3,5,6 muszą odpowiadać indeksom 1,2,4,5 w tablicy biletów');
    });

    await t.test('2. Dwukierunkowa izolacja awarii w Promise.allSettled', async () => {
        const slotIndexes = [1, 2, 4, 5];
        
        // Symulacja: Slot 2 (indeks 1) i Slot 6 (indeks 5) sukces, Slot 3 (indeks 2) timeout sieci, Slot 5 (indeks 4) błąd 500
        const mockTasks = slotIndexes.map(idx => {
            if (idx === 2) return Promise.reject(new Error("Timeout Photoroom API"));
            if (idx === 4) return Promise.reject(new Error("500 Internal Server Error"));
            return Promise.resolve({ newImageBase64: `data:image/jpeg;base64,mockSlot_${idx}`, slotIndex: idx });
        });

        const results = await Promise.allSettled(mockTasks);

        const succeeded = results.filter(r => r.status === 'fulfilled').map(r => r.value.slotIndex);
        const failed = results.filter(r => r.status === 'rejected');

        assert.strictEqual(succeeded.length, 2, 'Dokładnie dwa sloty zakończyły się sukcesem');
        assert.deepStrictEqual(succeeded, [1, 5], 'Pomyślnie przetworzono Slot 2 i Slot 6');
        assert.strictEqual(failed.length, 2, 'Awaria dwóch slotów nie zatrzymała pozostałych');
    });

    await t.test('3. Normalizacja tablicy visionTickets - ochrona przed sparse array', () => {
        const targetIndexes = [1, 2, 4, 5];
        const prevTickets = [{ originalUrl: 'https://example.com/packshot.jpg', isCompliant: true }];
        
        const next = [...prevTickets];
        const maxNeededIndex = Math.max(...targetIndexes);
        while (next.length <= maxNeededIndex) {
            next.push({
                originalUrl: `Wymagane nowe zdjęcie (nr ${next.length + 1})`,
                alerts: ["Oczekiwanie na generowanie AI"],
                isCompliant: false,
                replacedUrl: null
            });
        }

        assert.strictEqual(next.length, 6, 'Tablica biletów musi zawierać co najmniej 6 ciągłych elementów');
        for (let i = 0; i < 6; i++) {
            assert.ok(next[i] !== undefined, `Slot o indeksie ${i} nie może być undefined`);
        }
    });

    await t.test('4. Bezpieczny merge biletów w PIPELINE_COMPLETE - ochrona wygenerowanych grafik', () => {
        const currentTickets = [
            { originalUrl: 'src1.jpg', replacedUrl: null },
            { originalUrl: 'src2.jpg', replacedUrl: 'data:image/jpeg;base64,slot2_lifestyle' },
            { originalUrl: 'src3.jpg', replacedUrl: 'data:image/jpeg;base64,slot3_lifestyle' },
            { originalUrl: 'src4.jpg', replacedUrl: null },
            { originalUrl: 'src5.jpg', replacedUrl: 'data:image/jpeg;base64,slot5_lifestyle' },
            { originalUrl: 'src6.jpg', replacedUrl: 'data:image/jpeg;base64,slot6_lifestyle' }
        ];

        // Przychodzi zdarzenie z backendu z surowymi biletami bez replacedUrl
        const incomingTickets = [
            { originalUrl: 'src1.jpg', isCompliant: true },
            { originalUrl: 'src2.jpg', isCompliant: false },
            { originalUrl: 'src3.jpg', isCompliant: false },
            { originalUrl: 'src4.jpg', isCompliant: true }
        ];

        const merged = incomingTickets.map((t, idx) => ({
            ...t,
            replacedUrl: currentTickets[idx]?.replacedUrl || t.replacedUrl
        }));

        assert.strictEqual(merged[1].replacedUrl, 'data:image/jpeg;base64,slot2_lifestyle', 'Slot 2 nie może utracić wygenerowanego zdjęcia');
        assert.strictEqual(merged[2].replacedUrl, 'data:image/jpeg;base64,slot3_lifestyle', 'Slot 3 nie może utracić wygenerowanego zdjęcia');
    });

    await t.test('5. Walidacja formatu onLog w kontrolerze dla strumieniowania per-slot', () => {
        const imageIndex = 4;
        const msg = "Optymalizacja RGB dla Allegro";
        const ean = "5901234567890";
        
        const logObj = { 
            time: "10:30:00", 
            agentId: `Agent 11 (Slot ${Number(imageIndex) + 1})`, 
            message: msg, 
            ean, 
            imageIndex: Number(imageIndex) 
        };

        assert.strictEqual(logObj.agentId, 'Agent 11 (Slot 5)', 'AgentId musi precyzyjnie identyfikować numer slotu (5 dla indeksu 4)');
        assert.strictEqual(logObj.imageIndex, 4, 'imageIndex musi być liczbą odpowiadającą indeksowi slotu');
    });
});
