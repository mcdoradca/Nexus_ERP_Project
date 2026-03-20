import React from 'react';

export const DevBadge = ({ id, devMode }) => {
  if (!devMode) return null;
  return (
    <span className="absolute top-2 left-2 z-[9999] bg-fuchsia-500 text-white text-[10px] font-black px-2 py-0.5 rounded shadow-[0_0_15px_rgba(217,70,239,0.6)] pointer-events-none border-[1.5px] border-white uppercase tracking-widest hover:scale-150 transition-transform origin-top-left flex items-center justify-center opacity-90 backdrop-blur-sm">
      {id}
    </span>
  );
};
