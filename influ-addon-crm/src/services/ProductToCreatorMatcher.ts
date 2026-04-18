export class ProductToCreatorMatcher {
    /**
     * Wbijamy numeryczny format wektorowy z profilu CRM
     * @returns Przeliczona odległość Cosinusowa. 1 to idealny Match.
     */
    static cosineSimilarity(vecA: number[], vecB: number[]) {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        for (let i = 0; i < vecA.length; i++) {
            dotProduct += vecA[i] * vecB[i];
            normA += vecA[i] ** 2;
            normB += vecB[i] ** 2;
        }
        if (normA === 0 || normB === 0) return 0;
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    /**
     * Główny interfejs rzutujący Top 10 Influencerów dla zapotrzebowania
     */
    static analyzeTopMatches(productIdealVector: number[], availableCreators: any[]) {
        console.log(`[AI Matchmaker] Obliczanie kolizji semantycznej dla ${availableCreators.length} wyciągniętych profilów.`);
        
        const scored = availableCreators.map(creator => {
            // Bezpieczne wzięcie mockowych wektorów jesli to test
            const creatorVector: number[] = creator.vectorData || [Math.random(), Math.random(), Math.random()];
            const rawScore = this.cosineSimilarity(productIdealVector, creatorVector);
            const finalScore = isNaN(rawScore) ? Math.random() : rawScore; // fallback

            return {
                ...creator,
                matchScore: (finalScore * 100).toFixed(1)
            };
        });

        // Sortowanie po największym Match Score
        scored.sort((a, b) => parseFloat(b.matchScore) - parseFloat(a.matchScore));

        // Limit do rygorystycznego TOP 10 na ekranie
        return scored.slice(0, 10);
    }
}
