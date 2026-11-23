import React from 'react';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import MetricTooltip from './MetricTooltip';

/**
 * Klikalny nagłówek kolumny tabeli (`<th>`) ze stanem kierunku sortowania oraz opcjonalną chmurką `<MetricTooltip>`.
 */
export default function SortableTh({
    label,
    sortKey,
    sortConfig,
    onSort,
    tooltip = '',
    align = 'left',
    defaultDirection = 'desc',
    className = ''
}) {
    const isActive = Boolean(sortKey && sortConfig?.key === sortKey);
    const dir = isActive ? sortConfig.direction : null;

    const justifyClass = align === 'right'
        ? 'justify-end text-right'
        : (align === 'center' ? 'justify-center text-center' : 'justify-start text-left');

    const handleClick = () => {
        if (sortKey && typeof onSort === 'function') {
            onSort(sortKey, defaultDirection);
        }
    };

    return (
        <th
            onClick={handleClick}
            className={`cursor-pointer select-none hover:bg-slate-100/80 transition-colors ${align === 'right' ? 'text-right' : (align === 'center' ? 'text-center' : 'text-left')} ${isActive ? 'text-indigo-700' : ''} ${className}`}
            title="Kliknij, aby posortować"
        >
            <div className={`inline-flex items-center gap-1 ${justifyClass}`}>
                <span>{label}</span>
                {tooltip && <MetricTooltip text={tooltip} iconSize={12} />}
                <span className="shrink-0 print:hidden">
                    {dir === 'asc' && <ArrowUp className="w-3 h-3 text-indigo-600" />}
                    {dir === 'desc' && <ArrowDown className="w-3 h-3 text-indigo-600" />}
                    {!dir && <ArrowUpDown className="w-3 h-3 text-slate-300" />}
                </span>
            </div>
        </th>
    );
}
