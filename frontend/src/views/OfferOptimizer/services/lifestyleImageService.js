/**
 * lifestyleImageService.js
 * Zunifikowana usługa wywoływania i pollingu generowania zdjęć Photoroom AI (Lifestyle)
 * Wykorzystywana zarówno przez pojedyncze karty PhotographicAuditorCard, jak i zbiorczy orkiestrator.
 */

export const requestLifestyleGeneration = async ({ ean, imageIndex, primaryImageObj, token: explicitToken, apiUrl: explicitApiUrl }) => {
    if (!ean) {
        throw new Error("Brak kodu EAN niezbędnego do wygenerowania zdjęcia lifestylowego.");
    }

    const token = explicitToken || localStorage.getItem('aps_token') || localStorage.getItem('token') || '';
    const API_URL = explicitApiUrl !== undefined 
        ? explicitApiUrl 
        : (import.meta.env.PROD ? '' : `http://${window.location.hostname}:3001`);

    const bodyData = { ean: String(ean), imageIndex: Number(imageIndex) };

    if (primaryImageObj) {
        if (primaryImageObj.replacedUrl) {
            bodyData.imageBase64 = primaryImageObj.replacedUrl;
        } else if (primaryImageObj.originalUrl) {
            if (primaryImageObj.originalUrl.startsWith('data:image')) {
                bodyData.imageBase64 = primaryImageObj.originalUrl;
            } else if (primaryImageObj.originalUrl.startsWith('http')) {
                bodyData.sourceImageUrl = primaryImageObj.originalUrl;
            }
        }
    }

    if (!bodyData.imageBase64 && !bodyData.sourceImageUrl) {
        throw new Error("Brak zdjęcia źródłowego (wymagany obraz w Slocie 1 lub formularzu PIM) do wygenerowania scenerii.");
    }

    const res = await fetch(`${API_URL}/api/offer-optimizer/generate-lifestyle`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(bodyData)
    });

    if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${res.status}`);
    }

    const initData = await res.json();

    if (initData && initData.jobId) {
        const jobId = initData.jobId;
        let attempts = 0;
        const maxAttempts = 60; // Max 60 prób x 3s = 180s

        while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 3000));
            attempts++;

            try {
                const statusRes = await fetch(`${API_URL}/api/offer-optimizer/generate-lifestyle/status/${jobId}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!statusRes.ok) continue;

                const statusData = await statusRes.json();

                if (statusData.status === 'COMPLETED') {
                    const result = statusData.result || {};
                    const newImageBase64 = result.newImageBase64 || statusData.newImageBase64;
                    const visualTrendReport = result.visualTrendReport || statusData.visualTrendReport;
                    return {
                        newImageBase64,
                        visualTrendReport
                    };
                }

                if (statusData.status === 'ERROR') {
                    throw new Error(statusData.error || "Wystąpił błąd podczas przetwarzania obrazu przez AI.");
                }
            } catch (pollErr) {
                if (pollErr.message && !pollErr.message.includes('fetch')) {
                    throw pollErr;
                }
            }
        }
        throw new Error("Przekroczono czas oczekiwania na odpowiedź serwera Wizualnego AI (180s). Próba przerwana.");
    } else if (initData && (initData.newImageBase64 || initData.result?.newImageBase64)) {
        return {
            newImageBase64: initData.newImageBase64 || initData.result?.newImageBase64,
            visualTrendReport: initData.visualTrendReport || initData.result?.visualTrendReport
        };
    } else {
        throw new Error("Nieznany format odpowiedzi z serwera generowania zdjęć.");
    }
};
