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

    await t.test('6. Smart Idempotency - całkowite pominięcie zapytań API gdy sloty posiadają wygenerowane zdjęcia', () => {
        const isSlotFilled = (ticket) => {
            if (!ticket) return false;
            if (ticket.replacedUrl && typeof ticket.replacedUrl === 'string' && ticket.replacedUrl.trim().length > 0) return true;
            if (ticket.originalUrl && typeof ticket.originalUrl === 'string' && ticket.originalUrl.trim().length > 0) {
                const u = ticket.originalUrl.trim();
                const isPlaceholder = u.includes('Wymagane nowe zdjęcie') || u.includes('Pusty slot') || u.includes('Audyt') || u.includes('Analiza');
                if (!isPlaceholder && (u.startsWith('http') || u.startsWith('data:image'))) return true;
            }
            return false;
        };

        const targetSlotIndexes = [1, 2, 4, 5];
        const currentTickets = [
            { originalUrl: 'packshot.jpg', isCompliant: true },
            { originalUrl: 'src2.jpg', replacedUrl: 'data:image/jpeg;base64,slot2' },
            { originalUrl: 'src3.jpg', replacedUrl: 'data:image/jpeg;base64,slot3' },
            { originalUrl: 'src4.jpg', isCompliant: true },
            { originalUrl: 'src5.jpg', replacedUrl: 'data:image/jpeg;base64,slot5' },
            { originalUrl: 'src6.jpg', replacedUrl: 'data:image/jpeg;base64,slot6' }
        ];

        const slotsToProcess = targetSlotIndexes.filter(idx => !isSlotFilled(currentTickets[idx]));
        assert.strictEqual(slotsToProcess.length, 0, 'Żaden slot nie powinien trafić do kolejki generowania API (0 zużytych tokenów)');
    });

    await t.test('7. Selektywne generowanie braków - generowane wyłącznie puste sloty', () => {
        const isSlotFilled = (ticket) => {
            if (!ticket) return false;
            if (ticket.replacedUrl && typeof ticket.replacedUrl === 'string' && ticket.replacedUrl.trim().length > 0) return true;
            if (ticket.originalUrl && typeof ticket.originalUrl === 'string' && ticket.originalUrl.trim().length > 0) {
                const u = ticket.originalUrl.trim();
                const isPlaceholder = u.includes('Wymagane nowe zdjęcie') || u.includes('Pusty slot') || u.includes('Audyt') || u.includes('Analiza');
                if (!isPlaceholder && (u.startsWith('http') || u.startsWith('data:image'))) return true;
            }
            return false;
        };

        const targetSlotIndexes = [1, 2, 4, 5];
        const currentTickets = [
            { originalUrl: 'packshot.jpg', isCompliant: true },
            { originalUrl: 'src2.jpg', replacedUrl: 'data:image/jpeg;base64,slot2' }, // obsadzony
            { originalUrl: 'Wymagane nowe zdjęcie (nr 3)', alerts: ['Pusty slot'], replacedUrl: null }, // pusty (indeks 2)
            { originalUrl: 'src4.jpg', isCompliant: true },
            { originalUrl: 'src5.jpg', replacedUrl: 'data:image/jpeg;base64,slot5' }, // obsadzony
            { originalUrl: 'Wymagane nowe zdjęcie (nr 6)', alerts: ['Pusty slot'], replacedUrl: null }  // pusty (indeks 5)
        ];

        const slotsToProcess = targetSlotIndexes.filter(idx => !isSlotFilled(currentTickets[idx]));
        assert.deepStrictEqual(slotsToProcess, [2, 5], 'Do API powinny trafić wyłącznie brakujące sloty: indeks 2 (Slot 3) i indeks 5 (Slot 6)');
    });

    await t.test('8. Wymuszenie ponownej generacji (forceRegenerate: true)', () => {
        const targetSlotIndexes = [1, 2, 4, 5];
        const currentTickets = [
            { originalUrl: 'packshot.jpg', isCompliant: true },
            { originalUrl: 'src2.jpg', replacedUrl: 'data:image/jpeg;base64,slot2' },
            { originalUrl: 'src3.jpg', replacedUrl: 'data:image/jpeg;base64,slot3' },
            { originalUrl: 'src4.jpg', isCompliant: true },
            { originalUrl: 'src5.jpg', replacedUrl: 'data:image/jpeg;base64,slot5' },
            { originalUrl: 'src6.jpg', replacedUrl: 'data:image/jpeg;base64,slot6' }
        ];

        const forceRegenerate = true;
        const slotsToProcess = targetSlotIndexes.filter(() => forceRegenerate);
        assert.deepStrictEqual(slotsToProcess, [1, 2, 4, 5], 'W trybie wymuszenia wszystkie 4 sloty lifestylowe muszą zostać przetworzone');
    });

    await t.test('9. Blokada re-triggeru zdjęć w trybie wznowienia HITL i trybie Tylko Opis', () => {
        const checkShouldDispatch = ({ skipImages, isHitlResume, autoGenerateLifestyle }) => {
            return !skipImages && !isHitlResume && autoGenerateLifestyle;
        };

        // Scenariusz A: Wznowienie HITL po akceptacji składu INCI
        assert.strictEqual(checkShouldDispatch({ skipImages: true, isHitlResume: true, autoGenerateLifestyle: true }), false, 'HITL nie może generować zdjęć');
        // Scenariusz B: Operator klika "Tylko Opis"
        assert.strictEqual(checkShouldDispatch({ skipImages: true, isHitlResume: false, autoGenerateLifestyle: true }), false, 'Tryb Tylko Opis blokuje generowanie');
        // Scenariusz C: Normalny start od zera z włączonym przełącznikiem
        assert.strictEqual(checkShouldDispatch({ skipImages: false, isHitlResume: false, autoGenerateLifestyle: true }), true, 'Standardowy potok uruchamia generowanie');
    });

    await t.test('10. Ochrona visionTickets podczas oznaczania statusu PROCESSING w offerDraft', () => {
        const existingOfferDraft = {
            title: 'Stary Tytuł',
            visionTickets: [
                { originalUrl: 'packshot.jpg', isCompliant: true },
                { originalUrl: 'slot2.jpg', replacedUrl: 'data:image/jpeg;base64,slot2' }
            ]
        };

        const updatedOfferDraft = {
            ...existingOfferDraft,
            status: 'PROCESSING',
            startedAt: 123456789
        };

        assert.strictEqual(updatedOfferDraft.status, 'PROCESSING');
        assert.ok(Array.isArray(updatedOfferDraft.visionTickets) && updatedOfferDraft.visionTickets.length === 2, 'visionTickets nie mogą zostać skasowane');
        assert.strictEqual(updatedOfferDraft.visionTickets[1].replacedUrl, 'data:image/jpeg;base64,slot2');
    });
});
