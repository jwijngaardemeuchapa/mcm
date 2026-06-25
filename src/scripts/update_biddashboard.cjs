const fs = require('fs');

const path = 'c:/Users/Jeremiah/Downloads/meuchapa/mcm/src/pages/BIDDashboard.tsx';
let content = fs.readFileSync(path, 'utf8');

// 0. Add imports and types
content = content.replace(
  'import { useState, useEffect, useCallback, useMemo, useRef } from "react";',
  'import { useState, useEffect, useCallback, useMemo, useRef } from "react";\nimport { useVirtualizer } from "@tanstack/react-virtual";'
);
content = content.replace(
  '  aso: string | null;\n  importado_em: string;\n  lat: number | null;',
  '  aso: string | null;\n  importado_em: string;\n  fonte: string | null;\n  lat: number | null;'
);

// 1. Add sortConfig state
content = content.replace(
  'const [onlyExtras, setOnlyExtras] = useState(false);',
  'const [onlyExtras, setOnlyExtras] = useState(false);\n  const [sortConfig, setSortConfig] = useState<{ key: string, dir: "asc" | "desc" } | null>(null);\n  const parentRef = useRef<HTMLDivElement>(null);'
);

// 1.5 Add r.fonte to SQL queries
content = content.replace(
  /r\.motivo_bloqueio, r\.aso, r\.importado_em, cc\.lat, cc\.lng/g,
  'r.motivo_bloqueio, r.aso, r.importado_em, r.fonte, cc.lat, cc.lng'
);
content = content.replace(
  /b\.importado_em, b\.lat, b\.lng/g,
  'b.importado_em, NULL as fonte, b.lat, b.lng'
);

// 2. Modify candidate sorting inside useMemo
content = content.replace(
  '}).sort((a, b) => b.score - a.score);',
  `}).sort((a, b) => {
      if (!sortConfig) return b.score - a.score; // Default
      const dir = sortConfig.dir === "asc" ? 1 : -1;
      if (sortConfig.key === "nome") return dir * a.nome.localeCompare(b.nome);
      if (sortConfig.key === "dist") return dir * ((a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
      if (sortConfig.key === "tarefas") return dir * (a.tarefas - b.tarefas);
      if (sortConfig.key === "situacao") return dir * (a.situacao || "").localeCompare(b.situacao || "");
      return b.score - a.score;
    });`
);
content = content.replace(
  '[rawCandidates, occupiedCpfSet, occupiedNameSet, dispatchParams.localLat, dispatchParams.localLng, dispatchParams.localCep, taskDisparos, maxDistKm, leoCache]',
  '[rawCandidates, occupiedCpfSet, occupiedNameSet, dispatchParams.localLat, dispatchParams.localLng, dispatchParams.localCep, taskDisparos, maxDistKm, leoCache, sortConfig]'
);

// Do the same for blockedCandidates
content = content.replace(
  '}).sort((a, b) => b.score - a.score);\n  }, [rawBlocked, blockedTipoFilter, blockedMotivoFilter, dispatchParams.localLat, dispatchParams.localLng, dispatchParams.localCep, taskDisparos, maxDistKm, leoCache]);',
  `}).sort((a, b) => {
      if (!sortConfig) return b.score - a.score;
      const dir = sortConfig.dir === "asc" ? 1 : -1;
      if (sortConfig.key === "nome") return dir * a.nome.localeCompare(b.nome);
      if (sortConfig.key === "dist") return dir * ((a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
      if (sortConfig.key === "tarefas") return dir * (a.tarefas - b.tarefas);
      if (sortConfig.key === "situacao") return dir * (a.situacao || "").localeCompare(b.situacao || "");
      return b.score - a.score;
    });\n  }, [rawBlocked, blockedTipoFilter, blockedMotivoFilter, dispatchParams.localLat, dispatchParams.localLng, dispatchParams.localCep, taskDisparos, maxDistKm, leoCache, sortConfig]);`
);

// 3. Remove slice(0, 40) from visibleCandidates
content = content.replace(
  `  const visibleCandidates = showAll\n    ? (useProximityFilter ? [...withinDist, ...beyondDist] : available)\n    : (useProximityFilter ? withinDist.slice(0, 40) : available.slice(0, 40));`,
  `  const visibleCandidates = showAll\n    ? (useProximityFilter ? [...withinDist, ...beyondDist] : available)\n    : (useProximityFilter ? withinDist : available);`
);

content = content.replace(
  `  const blockedVisible = showAll ? blockedWithinDist : blockedWithinDist.slice(0, 40);`,
  `  const blockedVisible = blockedWithinDist;`
);

// Fix toggleSelectAll pool calculation
content = content.replace(
  `  function toggleSelectAll() {\n    const pool = candidateView === "bloqueados"\n      ? blockedVisible.filter((c) => c.telefone)\n      : available.filter((c) => c.telefone);`,
  `  function toggleSelectAll() {\n    const pool = candidateView === "bloqueados"\n      ? blockedVisible.filter((c) => c.telefone)\n      : visibleCandidates.filter((c) => c.telefone);`
);

// 4. Update the Header for sorting
const toggleSortFn = `  function toggleSort(key: string) {
    setSortConfig(prev => {
      if (prev?.key === key) return prev.dir === "asc" ? { key, dir: "desc" } : null;
      return { key, dir: "asc" };
    });
  }
`;
content = content.replace('  return (\n    <div ref={cardRef}', toggleSortFn + '\n  return (\n    <div ref={cardRef}');

const newHeaders = `                <span>#</span>
                <span className="cursor-pointer hover:underline flex items-center gap-1" onClick={() => toggleSort("nome")}>Nome {sortConfig?.key === "nome" && (sortConfig.dir === "asc" ? "↑" : "↓")}</span>
                <span className="cursor-pointer hover:underline flex items-center gap-1" onClick={() => toggleSort("dist")}>Distância {sortConfig?.key === "dist" && (sortConfig.dir === "asc" ? "↑" : "↓")}</span>
                <Tooltip>
                  <TooltipTrigger asChild><span className="cursor-pointer hover:underline decoration-dotted flex items-center gap-1" onClick={() => toggleSort("tarefas")}>Tarefas {sortConfig?.key === "tarefas" && (sortConfig.dir === "asc" ? "↑" : "↓")}</span></TooltipTrigger>
                  <TooltipContent>Total de tarefas realizadas</TooltipContent>
                </Tooltip>
                <span className="cursor-pointer hover:underline flex items-center gap-1" onClick={() => toggleSort("situacao")}>Situação {sortConfig?.key === "situacao" && (sortConfig.dir === "asc" ? "↑" : "↓")}</span>`;
content = content.replace(
  /<span>#<\/span><span>Nome<\/span><span>Distância<\/span>\s*<Tooltip>\s*<TooltipTrigger asChild><span className="cursor-help underline decoration-dotted">Tarefas<\/span><\/TooltipTrigger>\s*<TooltipContent>Total de tarefas realizadas<\/TooltipContent>\s*<\/Tooltip>\s*<span>Situação<\/span>/g,
  newHeaders
);

// 5. Update the table body to use Virtualizer
const activeListDeclarationStr = `
  const activeList = candidateView === "disponiveis" ? visibleCandidates : blockedVisible;
  const virtualizer = useVirtualizer({
    count: activeList.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64, // estimated row height
    overscan: 10,
  });
`;
content = content.replace('  return (\n    <div ref={cardRef}', activeListDeclarationStr + '  return (\n    <div ref={cardRef}');

// Find the exact mapping block
const mapStartIdx = content.indexOf('{(candidateView === "disponiveis" ? visibleCandidates : blockedVisible).map((c, idx) => {');
if (mapStartIdx !== -1) {
  const mapEndIdx = content.indexOf('                })}', mapStartIdx);
  if (mapEndIdx !== -1) {
    let mapBlock = content.substring(mapStartIdx, mapEndIdx + 19);
    
    // Replace the mapping start
    mapBlock = mapBlock.replace(
      '{(candidateView === "disponiveis" ? visibleCandidates : blockedVisible).map((c, idx) => {',
      `{virtualizer.getVirtualItems().map((virtualItem) => {
                    const c = activeList[virtualItem.index];
                    const idx = virtualItem.index;`
    );
    
    // Replace the grid styling ONLY inside the map block
    mapBlock = mapBlock.replace(
      /style={{ gridTemplateColumns: "28px 24px 1fr 80px 60px 100px 100px 100px" }}/g,
      `style={{ 
    gridTemplateColumns: "28px 24px 1fr 80px 60px 100px 100px 100px",
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: \`\${virtualItem.size}px\`,
    transform: \`translateY(\${virtualItem.start}px)\`,
  }}`
    );
    
    // Add Lead Saac badge
    const badgeSaac = `
                          {c.fonte === "leads_saac" && (
                            <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-indigo-500/10 text-indigo-500 border border-indigo-500/25 leading-none">
                              LEAD SAAC
                            </span>
                          )}`;
    mapBlock = mapBlock.replace(
      /                            <\/span>\n                          \)}/g,
      `                            </span>\n                          )}\n${badgeSaac}`
    );
    
    // Put it back together with the virtualizer container wrapping the map
    const beforeMap = content.substring(0, mapStartIdx);
    const afterMap = content.substring(mapEndIdx + 19);
    
    // We also need to add the parentRef and the totalSize div
    content = beforeMap + 
      `<div ref={parentRef} className="max-h-[600px] overflow-auto divide-y divide-border/50">
                  <div style={{ height: \`\${virtualizer.getTotalSize()}px\`, width: '100%', position: 'relative' }}>
                  ` + mapBlock + `
                  </div>
                </div>` + afterMap;
  }
}

// Finally, we MUST REMOVE the old divide-y div that wrapped the map, because we replaced it.
// The old structure was:
// <div className="divide-y divide-border/50">
//   {/* Loading states */}
//   ...
//   {(candidateView === ...).map(...)}
//   {showOccupied && ...}
// </div>
//
// By adding our own <div ref={parentRef}...> inside the old <div className="divide-y...">, we have doubled it.
// Wait, actually, let's just keep the old divide-y div, but give IT the ref!
// Let's replace the old opening tag:
content = content.replace(
  '<div className="divide-y divide-border/50">',
  '<div className="divide-y divide-border/50">'
);
// Actually, if we just keep the old `divide-y divide-border/50` tag, then we should NOT add `<div ref={parentRef}...>`.
// Instead, we can just replace `<div className="divide-y divide-border/50">` with `<div ref={parentRef} className="max-h-[600px] overflow-auto divide-y divide-border/50">`.
// But wait, the loading states and empty states will be INSIDE the scrollable area. That is fine!
// We should put the `<div style={{ height: \`\${virtualizer.getTotalSize()}px\`, width: '100%', position: 'relative' }}>` right BEFORE the `virtualizer.getVirtualItems().map`.
// And close it right AFTER the `})}`.

// Let's reset and do it carefully.
let content2 = fs.readFileSync(path, 'utf8');

// 0-4 unchanged
content2 = content2.replace(
  'import { useState, useEffect, useCallback, useMemo, useRef } from "react";',
  'import { useState, useEffect, useCallback, useMemo, useRef } from "react";\nimport { useVirtualizer } from "@tanstack/react-virtual";'
);
content2 = content2.replace(
  '  aso: string | null;\n  importado_em: string;\n  lat: number | null;',
  '  aso: string | null;\n  importado_em: string;\n  fonte: string | null;\n  lat: number | null;'
);
content2 = content2.replace(
  'const [onlyExtras, setOnlyExtras] = useState(false);',
  'const [onlyExtras, setOnlyExtras] = useState(false);\n  const [sortConfig, setSortConfig] = useState<{ key: string, dir: "asc" | "desc" } | null>(null);\n  const parentRef = useRef<HTMLDivElement>(null);'
);
content2 = content2.replace(
  /r\.motivo_bloqueio, r\.aso, r\.importado_em, cc\.lat, cc\.lng/g,
  'r.motivo_bloqueio, r.aso, r.importado_em, r.fonte, cc.lat, cc.lng'
);
content2 = content2.replace(
  /b\.importado_em, b\.lat, b\.lng/g,
  'b.importado_em, NULL as fonte, b.lat, b.lng'
);
content2 = content2.replace(
  '}).sort((a, b) => b.score - a.score);',
  `}).sort((a, b) => {
      if (!sortConfig) return b.score - a.score;
      const dir = sortConfig.dir === "asc" ? 1 : -1;
      if (sortConfig.key === "nome") return dir * a.nome.localeCompare(b.nome);
      if (sortConfig.key === "dist") return dir * ((a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
      if (sortConfig.key === "tarefas") return dir * (a.tarefas - b.tarefas);
      if (sortConfig.key === "situacao") return dir * (a.situacao || "").localeCompare(b.situacao || "");
      return b.score - a.score;
    });`
);
content2 = content2.replace(
  '[rawCandidates, occupiedCpfSet, occupiedNameSet, dispatchParams.localLat, dispatchParams.localLng, dispatchParams.localCep, taskDisparos, maxDistKm, leoCache]',
  '[rawCandidates, occupiedCpfSet, occupiedNameSet, dispatchParams.localLat, dispatchParams.localLng, dispatchParams.localCep, taskDisparos, maxDistKm, leoCache, sortConfig]'
);
content2 = content2.replace(
  '}).sort((a, b) => b.score - a.score);\n  }, [rawBlocked, blockedTipoFilter, blockedMotivoFilter, dispatchParams.localLat, dispatchParams.localLng, dispatchParams.localCep, taskDisparos, maxDistKm, leoCache]);',
  `}).sort((a, b) => {
      if (!sortConfig) return b.score - a.score;
      const dir = sortConfig.dir === "asc" ? 1 : -1;
      if (sortConfig.key === "nome") return dir * a.nome.localeCompare(b.nome);
      if (sortConfig.key === "dist") return dir * ((a.distance_km ?? Infinity) - (b.distance_km ?? Infinity));
      if (sortConfig.key === "tarefas") return dir * (a.tarefas - b.tarefas);
      if (sortConfig.key === "situacao") return dir * (a.situacao || "").localeCompare(b.situacao || "");
      return b.score - a.score;
    });\n  }, [rawBlocked, blockedTipoFilter, blockedMotivoFilter, dispatchParams.localLat, dispatchParams.localLng, dispatchParams.localCep, taskDisparos, maxDistKm, leoCache, sortConfig]);`
);
content2 = content2.replace(
  `  const visibleCandidates = showAll\n    ? (useProximityFilter ? [...withinDist, ...beyondDist] : available)\n    : (useProximityFilter ? withinDist.slice(0, 40) : available.slice(0, 40));`,
  `  const visibleCandidates = showAll\n    ? (useProximityFilter ? [...withinDist, ...beyondDist] : available)\n    : (useProximityFilter ? withinDist : available);`
);
content2 = content2.replace(
  `  const blockedVisible = showAll ? blockedWithinDist : blockedWithinDist.slice(0, 40);`,
  `  const blockedVisible = blockedWithinDist;`
);
content2 = content2.replace(
  `  function toggleSelectAll() {\n    const pool = candidateView === "bloqueados"\n      ? blockedVisible.filter((c) => c.telefone)\n      : available.filter((c) => c.telefone);`,
  `  function toggleSelectAll() {\n    const pool = candidateView === "bloqueados"\n      ? blockedVisible.filter((c) => c.telefone)\n      : visibleCandidates.filter((c) => c.telefone);`
);
content2 = content2.replace('  return (\n    <div ref={cardRef}', toggleSortFn + '\n  return (\n    <div ref={cardRef}');
content2 = content2.replace(
  /<span>#<\/span><span>Nome<\/span><span>Distância<\/span>\s*<Tooltip>\s*<TooltipTrigger asChild><span className="cursor-help underline decoration-dotted">Tarefas<\/span><\/TooltipTrigger>\s*<TooltipContent>Total de tarefas realizadas<\/TooltipContent>\s*<\/Tooltip>\s*<span>Situação<\/span>/g,
  newHeaders
);
content2 = content2.replace('  return (\n    <div ref={cardRef}', activeListDeclarationStr + '  return (\n    <div ref={cardRef}');

// Virtualizer DOM replacements
content2 = content2.replace(
  '<div className="divide-y divide-border/50">',
  '<div ref={parentRef} className="max-h-[600px] overflow-auto divide-y divide-border/50">'
);

const mapStartIdx2 = content2.indexOf('{(candidateView === "disponiveis" ? visibleCandidates : blockedVisible).map((c, idx) => {');
if (mapStartIdx2 !== -1) {
  const mapEndIdx2 = content2.indexOf('                })}', mapStartIdx2);
  let mapBlock2 = content2.substring(mapStartIdx2, mapEndIdx2 + 19);
  
  mapBlock2 = mapBlock2.replace(
    '{(candidateView === "disponiveis" ? visibleCandidates : blockedVisible).map((c, idx) => {',
    `<div style={{ height: \`\${virtualizer.getTotalSize()}px\`, width: '100%', position: 'relative' }}>
                  {virtualizer.getVirtualItems().map((virtualItem) => {
                    const c = activeList[virtualItem.index];
                    const idx = virtualItem.index;`
  );
  
  mapBlock2 = mapBlock2.replace(
    /style={{ gridTemplateColumns: "28px 24px 1fr 80px 60px 100px 100px 100px" }}/g,
    `style={{ 
    gridTemplateColumns: "28px 24px 1fr 80px 60px 100px 100px 100px",
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: \`\${virtualItem.size}px\`,
    transform: \`translateY(\${virtualItem.start}px)\`,
  }}`
  );
  
  const badgeSaac = `
                          {c.fonte === "leads_saac" && (
                            <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-indigo-500/10 text-indigo-500 border border-indigo-500/25 leading-none">
                              LEAD SAAC
                            </span>
                          )}`;
  mapBlock2 = mapBlock2.replace(
    /                            <\/span>\n                          \)}/g,
    `                            </span>\n                          )}\n${badgeSaac}`
  );
  
  mapBlock2 = mapBlock2.replace(
    /                }\)}/g,
    `                })}\n                  </div>`
  );
  
  const beforeMap2 = content2.substring(0, mapStartIdx2);
  const afterMap2 = content2.substring(mapEndIdx2 + 19);
  content2 = beforeMap2 + mapBlock2 + afterMap2;
}

fs.writeFileSync(path, content2);
console.log('Successfully updated BIDDashboard.tsx with precision');
