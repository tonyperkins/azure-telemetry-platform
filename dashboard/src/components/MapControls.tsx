import { useMemo, useState } from 'react';
import { RouteShape, Vehicle } from '../types/vehicle';

interface MapControlsProps {
  // Data Sources
  metroEnabled: boolean;
  flightEnabled: boolean;
  metroCount: number;
  flightCount: number;
  onToggleMetro: () => void;
  onToggleFlight: () => void;
  
  // Map Layers
  showBusStops: boolean;
  showBusRoutes: boolean;
  showFlightPaths: boolean;
  onToggleBusStops: () => void;
  onToggleBusRoutes: () => void;
  onToggleFlightPaths: () => void;
  
  // Route Filter
  vehicles: Vehicle[];
  routeShapes: Map<string, RouteShape>;
  selectedRoutes: Set<string>;
  onSelectedRoutesChange: (routes: Set<string>) => void;
  
  // Display Options
  showVehicleLabels: boolean;
  enableClustering: boolean;
  onToggleVehicleLabels: () => void;
  onToggleClustering: () => void;
  
  // Reset
  onResetAll: () => void;
}

export function MapControls({
  metroEnabled,
  flightEnabled,
  metroCount,
  flightCount,
  onToggleMetro,
  onToggleFlight,
  showBusStops,
  showBusRoutes,
  showFlightPaths,
  onToggleBusStops,
  onToggleBusRoutes,
  onToggleFlightPaths,
  vehicles,
  routeShapes,
  selectedRoutes,
  onSelectedRoutesChange,
  showVehicleLabels,
  enableClustering,
  onToggleVehicleLabels,
  onToggleClustering,
  onResetAll,
}: MapControlsProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [routeSearch, setRouteSearch] = useState('');

  // Extract routeId from rawJson since API doesn't populate top-level field
  const extractRouteId = (vehicle: Vehicle): string | null => {
    if (vehicle.routeId) return vehicle.routeId;
    if (!vehicle.rawJson) return null;
    try {
      const raw = JSON.parse(vehicle.rawJson) as Record<string, unknown>;
      return (raw['route_id'] ?? raw['routeId']) as string | null;
    } catch {
      return null;
    }
  };

  // Derive route list from current vehicles
  const routeList = useMemo(() => {
    const routeMap = new Map<string, number>();
    
    vehicles
      .filter(v => v.source === 'metro')
      .forEach(v => {
        const routeId = extractRouteId(v);
        if (routeId) {
          routeMap.set(routeId, (routeMap.get(routeId) || 0) + 1);
        }
      });

    return Array.from(routeMap.entries())
      .map(([routeId, count]) => ({ routeId, count }))
      .sort((a, b) => {
        const aNum = parseInt(a.routeId);
        const bNum = parseInt(b.routeId);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        return a.routeId.localeCompare(b.routeId);
      });
  }, [vehicles]);

  // Filter routes by search
  const filteredRoutes = useMemo(() => {
    if (!routeSearch.trim()) return routeList;
    const search = routeSearch.toLowerCase();
    return routeList.filter(r => r.routeId.toLowerCase().includes(search));
  }, [routeList, routeSearch]);

  const handleSelectAll = () => {
    onSelectedRoutesChange(new Set());
  };

  const handleClearAll = () => {
    // Use route IDs from routeShapes (the actual map data) instead of from vehicles
    const allRouteIds = new Set(Array.from(routeShapes.keys()));
    console.log('Clear All - hiding routes:', Array.from(allRouteIds));
    onSelectedRoutesChange(allRouteIds);
  };

  const handleToggleRoute = (routeId: string) => {
    const newHidden = new Set(selectedRoutes);
    if (newHidden.has(routeId)) {
      newHidden.delete(routeId); // Remove from hidden set = make visible
    } else {
      newHidden.add(routeId); // Add to hidden set = hide it
    }
    onSelectedRoutesChange(newHidden);
  };

  const isRouteVisible = (routeId: string) => {
    // Empty set = all visible. Otherwise, visible if NOT in the hidden set
    return selectedRoutes.size === 0 || !selectedRoutes.has(routeId);
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: '120px',
        left: '10px',
        zIndex: 1000,
        background: '#FFFFFF',
        border: '2px solid #60A5FA',
        borderRadius: '8px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        width: '280px',
        fontFamily: "'Inter', sans-serif",
      }}
    >
      {/* Header */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        style={{
          padding: '12px 16px',
          background: '#F8FAFC',
          borderBottom: isExpanded ? '1px solid #E2E8F0' : 'none',
          borderTopLeftRadius: '6px',
          borderTopRightRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          cursor: 'pointer',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>🗂</span>
          <span style={{ fontWeight: 600, fontSize: '14px', color: '#1E293B' }}>
            Map Controls
          </span>
        </div>
        <span style={{ fontSize: '12px', color: '#64748B' }}>
          {isExpanded ? '▼' : '▲'}
        </span>
      </div>

      {/* Content */}
      {isExpanded && (
        <div style={{ padding: '16px' }}>
          {/* Section 1: Data Sources */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Data Sources
            </div>
            
            {/* Metro Buses Toggle */}
            <div
              onClick={onToggleMetro}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                background: '#F8FAFC',
                borderRadius: '6px',
                marginBottom: '8px',
                cursor: 'pointer',
                border: '1px solid #E2E8F0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                <span style={{ fontSize: '18px' }}>🚌</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: '#1E293B' }}>
                    Metro Buses
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>
                    {metroEnabled ? `${metroCount} buses active` : 'Hidden'}
                  </div>
                </div>
              </div>
              <div
                style={{
                  width: '44px',
                  height: '24px',
                  background: metroEnabled ? '#10B981' : '#CBD5E0',
                  borderRadius: '12px',
                  position: 'relative',
                  transition: 'background 0.2s',
                }}
              >
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    background: 'white',
                    borderRadius: '50%',
                    position: 'absolute',
                    top: '2px',
                    left: metroEnabled ? '22px' : '2px',
                    transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }}
                />
              </div>
            </div>

            {/* Flights Toggle */}
            <div
              onClick={onToggleFlight}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                background: '#F8FAFC',
                borderRadius: '6px',
                cursor: 'pointer',
                border: '1px solid #E2E8F0',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                <span style={{ fontSize: '18px' }}>✈</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: '#1E293B' }}>
                    Flights
                  </div>
                  <div style={{ fontSize: '11px', color: '#64748B' }}>
                    {flightEnabled ? `${flightCount} aircraft active` : 'Hidden'}
                  </div>
                </div>
              </div>
              <div
                style={{
                  width: '44px',
                  height: '24px',
                  background: flightEnabled ? '#10B981' : '#CBD5E0',
                  borderRadius: '12px',
                  position: 'relative',
                  transition: 'background 0.2s',
                }}
              >
                <div
                  style={{
                    width: '20px',
                    height: '20px',
                    background: 'white',
                    borderRadius: '50%',
                    position: 'absolute',
                    top: '2px',
                    left: flightEnabled ? '22px' : '2px',
                    transition: 'left 0.2s',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Section 2: Map Layers */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Map Layers
            </div>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer', fontSize: '13px', color: '#1E293B' }}>
              <input type="checkbox" checked={showBusStops} onChange={onToggleBusStops} />
              Bus Stops
            </label>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer', fontSize: '13px', color: '#1E293B' }}>
              <input type="checkbox" checked={showBusRoutes} onChange={onToggleBusRoutes} />
              Bus Routes
            </label>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#1E293B' }}>
              <input type="checkbox" checked={showFlightPaths} onChange={onToggleFlightPaths} />
              Flight Paths
            </label>
          </div>

          {/* Section 3: Route Filter */}
          <div style={{ marginBottom: '20px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Route Filter
            </div>
            
            {/* Search Input */}
            <div style={{ position: 'relative', marginBottom: '10px' }}>
              <input
                type="text"
                placeholder="Search routes... (e.g. 801, 3, 10)"
                value={routeSearch}
                onChange={(e) => setRouteSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 28px 8px 10px',
                  border: '1px solid #E2E8F0',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontFamily: "'Inter', sans-serif",
                  outline: 'none',
                }}
              />
              {routeSearch && (
                <button
                  onClick={() => setRouteSearch('')}
                  style={{
                    position: 'absolute',
                    right: '8px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'transparent',
                    border: 'none',
                    color: '#94A3B8',
                    cursor: 'pointer',
                    fontSize: '14px',
                    padding: '0 4px',
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Select All / Clear All */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <button
                onClick={handleSelectAll}
                style={{
                  flex: 1,
                  padding: '6px',
                  background: '#F1F5F9',
                  border: '1px solid #E2E8F0',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 500,
                  color: '#475569',
                  cursor: 'pointer',
                }}
              >
                Select All
              </button>
              <button
                onClick={handleClearAll}
                style={{
                  flex: 1,
                  padding: '6px',
                  background: '#F1F5F9',
                  border: '1px solid #E2E8F0',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 500,
                  color: '#475569',
                  cursor: 'pointer',
                }}
              >
                Clear All
              </button>
            </div>

            {/* Route List */}
            <div
              style={{
                maxHeight: '200px',
                overflowY: 'auto',
                border: '1px solid #E2E8F0',
                borderRadius: '6px',
                padding: '8px',
                background: '#FAFAFA',
              }}
            >
              {filteredRoutes.length === 0 ? (
                <div style={{ fontSize: '12px', color: '#94A3B8', textAlign: 'center', padding: '12px' }}>
                  {routeSearch ? 'No routes match search' : 'No active routes'}
                </div>
              ) : (
                filteredRoutes.map(({ routeId, count }) => (
                  <label
                    key={routeId}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 8px',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      marginBottom: '4px',
                      background: isRouteVisible(routeId) ? 'white' : '#F1F5F9',
                      opacity: isRouteVisible(routeId) ? 1 : 0.6,
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isRouteVisible(routeId)}
                      onChange={() => handleToggleRoute(routeId)}
                    />
                    <span style={{ fontSize: '12px', fontWeight: 500, color: '#1E293B', flex: 1 }}>
                      Route {routeId}
                    </span>
                    <span
                      style={{
                        fontSize: '10px',
                        fontWeight: 600,
                        color: '#64748B',
                        background: '#E2E8F0',
                        padding: '2px 6px',
                        borderRadius: '10px',
                      }}
                    >
                      {count}
                    </span>
                  </label>
                ))
              )}
            </div>
          </div>

          {/* Section 4: Display Options */}
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#64748B', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Display
            </div>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer', fontSize: '13px', color: '#1E293B' }}>
              <input type="checkbox" checked={showVehicleLabels} onChange={onToggleVehicleLabels} />
              Show Vehicle Labels
            </label>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '13px', color: '#1E293B' }}>
              <input type="checkbox" checked={enableClustering} onChange={onToggleClustering} />
              Cluster at Low Zoom
            </label>
          </div>

          {/* Reset All Button */}
          <button
            onClick={onResetAll}
            style={{
              width: '100%',
              padding: '10px',
              background: 'transparent',
              border: '1px solid #CBD5E0',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 500,
              color: '#64748B',
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#F1F5F9';
              e.currentTarget.style.borderColor = '#94A3B8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = '#CBD5E0';
            }}
          >
            Reset All
          </button>
        </div>
      )}
    </div>
  );
}
