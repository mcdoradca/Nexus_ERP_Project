import { useState, useMemo, useCallback } from 'react';

function isMissingSortValue(val) {
    if (val === null || val === undefined || val === '') return true;
    if (typeof val === 'number' && !Number.isFinite(val)) return true;
    return false;
}

/**
 * Uniwersalny hook sortowania tabel i list raportowych.
 * Puste/nieznane wartości (null, undefined, '', NaN) trzyma zawsze na dole niezależnie od kierunku sortowania.
 */
export function useSortableData(items = [], defaultConfig = { key: null, direction: 'desc' }, accessors = {}) {
    const [sortConfig, setSortConfig] = useState(() => ({
        key: defaultConfig?.key || null,
        direction: defaultConfig?.direction || 'desc'
    }));

    const requestSort = useCallback((key, defaultDirection = 'desc') => {
        if (!key) return;
        setSortConfig(prev => {
            if (prev.key === key) {
                return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: defaultDirection };
        });
    }, []);

    const sortedItems = useMemo(() => {
        const list = Array.isArray(items) ? items : [];
        if (!sortConfig.key) return list;

        const accessor = accessors[sortConfig.key];
        const mult = sortConfig.direction === 'asc' ? 1 : -1;

        return [...list].sort((a, b) => {
            const valA = typeof accessor === 'function' ? accessor(a) : a?.[sortConfig.key];
            const valB = typeof accessor === 'function' ? accessor(b) : b?.[sortConfig.key];

            const missA = isMissingSortValue(valA);
            const missB = isMissingSortValue(valB);
            if (missA && missB) return 0;
            if (missA) return 1;
            if (missB) return -1;

            if (typeof valA === 'number' && typeof valB === 'number') {
                return (valA - valB) * mult;
            }
            if (typeof valA === 'boolean' && typeof valB === 'boolean') {
                return ((valA === valB) ? 0 : (valA ? 1 : -1)) * mult;
            }
            return String(valA).localeCompare(String(valB), 'pl', { numeric: true, sensitivity: 'base' }) * mult;
        });
    }, [items, sortConfig, accessors]);

    return {
        sortedItems,
        sortConfig,
        requestSort
    };
}
