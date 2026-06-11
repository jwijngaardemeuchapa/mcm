import React from "react";
import { type RankedCandidate, type OpenTask, type DispatchParams } from "@/pages/BIDDashboard";
import { MapContainer, TileLayer, CircleMarker, Popup, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";

interface BidRadarProps {
  task: OpenTask;
  candidates: RankedCandidate[];
  dispatchParams: DispatchParams;
}

export function BidRadar({ task, candidates, dispatchParams }: BidRadarProps) {
  // If no coords available for task, fallback
  const centerLat = dispatchParams.localLat;
  const centerLng = dispatchParams.localLng;

  if (!centerLat || !centerLng) {
    return (
      <div className="p-12 text-center border border-dashed border-border rounded-xl m-4 bg-muted/10">
        <h3 className="font-semibold mb-2">Localização Desconhecida</h3>
        <p className="text-sm text-muted-foreground">
          Para exibir o radar, você precisa selecionar um endereço válido no painel de configuração que contenha coordenadas ou um link do Google Maps mapeado.
        </p>
      </div>
    );
  }

  const validCandidates = candidates.filter(c => c.lat !== null && c.lng !== null);

  return (
    <div className="h-[600px] w-full relative rounded-xl overflow-hidden border border-border m-4 shadow-sm z-0">
      <MapContainer 
        center={[centerLat, centerLng]} 
        zoom={11} 
        style={{ height: "100%", width: "100%", zIndex: 0 }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        
        {/* Raio de 15km */}
        <Circle center={[centerLat, centerLng]} radius={15000} pathOptions={{ color: "var(--primary)", fillColor: "var(--primary)", fillOpacity: 0.05, weight: 1, dashArray: "5, 5" }} />
        {/* Raio de 30km */}
        <Circle center={[centerLat, centerLng]} radius={30000} pathOptions={{ color: "var(--primary)", fillColor: "var(--primary)", fillOpacity: 0.02, weight: 1, dashArray: "5, 5" }} />

        {/* Task marker */}
        <CircleMarker
          center={[centerLat, centerLng]}
          radius={8}
          pathOptions={{ color: "white", fillColor: "black", fillOpacity: 1, weight: 2 }}
        >
          <Popup>
            <div className="font-bold">{task.empresa}</div>
            <div className="text-xs">Destino da Tarefa</div>
          </Popup>
        </CircleMarker>

        {/* Candidates markers */}
        {validCandidates.map((c) => {
          const isOccupied = c.is_occupied;
          const isBlocked = c.score < -100; // approximation if blocked view passed it
          const isDispatched = !!c.disparo;
          
          let color = "#3b82f6"; // blue (available)
          if (isOccupied) color = "#94a3b8"; // gray
          else if (isDispatched) color = "#22c55e"; // green
          else if (isBlocked) color = "#ef4444"; // red

          return (
            <CircleMarker
              key={c._key}
              center={[c.lat!, c.lng!]}
              radius={6}
              pathOptions={{ color: "white", fillColor: color, fillOpacity: 0.8, weight: 1 }}
            >
              <Popup>
                <div className="font-bold capitalize">{c.nome.toLowerCase()}</div>
                <div className="text-xs">{c.telefone}</div>
                {c.distance_km !== null && <div className="text-xs text-muted-foreground mt-1">{c.distance_km.toFixed(1)} km de distância</div>}
                {isOccupied && <div className="text-xs text-warning mt-1 font-semibold">Ocupado</div>}
                {isDispatched && <div className="text-xs text-success mt-1 font-semibold">Disparado</div>}
              </Popup>
            </CircleMarker>
          );
        })}
      </MapContainer>
      
      {/* Legend */}
      <div className="absolute bottom-6 right-6 bg-background/90 backdrop-blur-sm border border-border p-3 rounded-lg shadow-lg z-[400] text-xs">
        <div className="font-semibold mb-2 uppercase tracking-wider text-[10px] text-muted-foreground">Legenda</div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-black border border-white"></div> Local da Tarefa</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-blue-500 border border-white"></div> Chapa Disponível</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500 border border-white"></div> Disparado</div>
          <div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-slate-400 border border-white"></div> Ocupado / Indisponível</div>
        </div>
      </div>
    </div>
  );
}
