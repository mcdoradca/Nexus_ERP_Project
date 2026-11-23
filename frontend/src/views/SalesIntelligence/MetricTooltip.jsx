import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { HelpCircle } from 'lucide-react';

/**
 * Lekka, natychmiastowa "chmurka" z opisem biznesowym renderowana przez portal (nie jest przycinana przez overflow tabel).
 * Automatycznie znika podczas wydruku PDF A4 (`print:hidden`).
 */
export default function MetricTooltip({ text, children = null, iconSize = 13, className = '' }) {
    const [coords, setCoords] = useState(null);

    if (!text) {
        return children || null;
    }

    const openTooltip = (e) => {
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const maxWidth = 310;
        const margin = 12;
        const centerX = rect.left + rect.width / 2;
        const clampedLeft = Math.max(margin + maxWidth / 2, Math.min(window.innerWidth - margin - maxWidth / 2, centerX));
        const openBelow = rect.top < 120;
        setCoords({
            left: clampedLeft,
            top: openBelow ? rect.bottom + 8 : rect.top - 8,
            placement: openBelow ? 'bottom' : 'top'
        });
    };

    const closeTooltip = (e) => {
        e.stopPropagation();
        setCoords(null);
    };

    return (
        <>
            <span
                role="button"
                tabIndex={0}
                onMouseEnter={openTooltip}
                onMouseLeave={closeTooltip}
                onFocus={openTooltip}
                onBlur={closeTooltip}
                onClick={(e) => {
                    e.stopPropagation();
                    if (coords) setCoords(null);
                    else openTooltip(e);
                }}
                className={`inline-flex items-center gap-1 cursor-help select-none focus:outline-none ${className}`}
                aria-label={text}
            >
                {children}
                <HelpCircle
                    style={{ width: iconSize, height: iconSize }}
                    className="text-slate-400 hover:text-indigo-600 transition-colors shrink-0 print:hidden"
                />
            </span>
            {coords && createPortal(
                <div
                    role="tooltip"
                    style={{
                        position: 'fixed',
                        left: coords.left,
                        top: coords.top,
                        transform: coords.placement === 'top' ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
                        zIndex: 9999,
                        maxWidth: 310
                    }}
                    className="pointer-events-none print:hidden bg-slate-900 text-slate-50 text-[11px] leading-relaxed font-normal rounded-lg px-3 py-2 shadow-xl border border-slate-700 normal-case tracking-normal text-left whitespace-normal"
                >
                    {text}
                </div>,
                document.body
            )}
        </>
    );
}
