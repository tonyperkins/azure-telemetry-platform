import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertToastContainer, Toast } from './components/AlertToast';
import { IncidentSimulation } from './components/IncidentSimulation';
import { LogViewer } from './components/LogViewer';
import { Map } from './components/Map';
import { MapControls } from './components/MapControls';
import { RunbookModal } from './components/RunbookModal';
import { SourceFilter } from './components/SourceFilter';
import { SreSidebar } from './components/SreSidebar';
import { useApiMetrics } from './hooks/useApiMetrics';
import { useBusStops } from './hooks/useBusStops';
import { useFlightTrails } from './hooks/useFlightTrails';
import { useRouteShapes } from './hooks/useRouteShapes';
import { useVehicleData } from './hooks/useVehicleData';
import { Vehicle } from './types/vehicle';

export default function App() {
  const [metroEnabled, setMetroEnabled] = useState(true);
  const [flightEnabled, setFlightEnabled] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [showBusStops, setShowBusStops] = useState(true);
  const [showBusRoutes, setShowBusRoutes] = useState(true);
  const [showFlightPaths, setShowFlightPaths] = useState(true);
  const [showVehicleLabels, setShowVehicleLabels] = useState(true);
  const [enableClustering, setEnableClustering] = useState(false);
  const [selectedRoutes, setSelectedRoutes] = useState<Set<string>>(new Set());
  const [trackedVehicleId, setTrackedVehicleId] = useState<string | null>(null);
  const [initialRoutesSet, setInitialRoutesSet] = useState(false);
  
  const [simulateMetroFailure, setSimulateMetroFailure] = useState(false);
  const [simulateLatency, setSimulateLatency] = useState(false);
  const [simulateErrors, setSimulateErrors] = useState(false);
  
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isLogViewerOpen, setIsLogViewerOpen] = useState(false);
  const [isRunbookOpen, setIsRunbookOpen] = useState(false);
  const [runbookSourceName, setRunbookSourceName] = useState<string | undefined>(undefined);
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const [isFlightCircuitBreakerActive, setIsFlightCircuitBreakerActive] = useState(false);
  const [showCircuitBreakerModal, setShowCircuitBreakerModal] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
  const activeAlerts = useRef<Set<string>>(new Set());
  const prevHealth = useRef<any>(null);
  const prevMetrics = useRef<any>(null);

  const { metrics, recordRequest } = useApiMetrics();
  const { vehicles, health, loading, error, lastUpdated, isStale } = useVehicleData(isPaused, {
    simulateMetroFailure,
    simulateLatency,
    simulateErrors,
    recordRequest,
  });
  const routeShapes  = useRouteShapes();
  const busStops     = useBusStops();
  const flightTrails = useFlightTrails(vehicles);

  // Set initial route filter to show only first 5 routes
  useEffect(() => {
    if (!initialRoutesSet && routeShapes.size > 0) {
      const allRouteIds = Array.from(routeShapes.keys()).sort((a, b) => {
        const aNum = parseInt(a);
        const bNum = parseInt(b);
        if (!isNaN(aNum) && !isNaN(bNum)) return aNum - bNum;
        return a.localeCompare(b);
      });
      
      // Hide all routes except first 5
      const routesToHide = new Set(allRouteIds.slice(5));
      setSelectedRoutes(routesToHide);
      setInitialRoutesSet(true);
    }
  }, [routeShapes, initialRoutesSet]);

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

  const filtered = useMemo(() => {
    return vehicles.filter(v => {
      if (v.source === 'metro') {
        if (!metroEnabled) return false;
        // Filter by selected routes (selectedRoutes is a "hidden" set)
        const routeId = extractRouteId(v);
        // If we have hidden routes and this vehicle's route is in the hidden set, hide it
        if (selectedRoutes.size > 0 && routeId && selectedRoutes.has(routeId)) {
          return false; // Route is hidden
        }
        // If we have hidden routes but this vehicle has no routeId, hide it too
        if (selectedRoutes.size > 0 && !routeId) {
          return false; // Vehicles without routes are hidden when filtering is active
        }
        return true;
      }
      if (v.source === 'flight') return flightEnabled;
      return false;
    });
  }, [vehicles, metroEnabled, flightEnabled, selectedRoutes]);

  const metroCount  = useMemo(() => vehicles.filter(v => v.source === 'metro').length,  [vehicles]);
  const flightCount = useMemo(() => vehicles.filter(v => v.source === 'flight').length, [vehicles]);
  
  // Detect circuit breaker: if flights enabled but no flight data for 3+ consecutive polls
  const flightDataMissingCount = useRef(0);
  useEffect(() => {
    if (flightEnabled) {
      if (flightCount === 0) {
        flightDataMissingCount.current += 1;
        if (flightDataMissingCount.current >= 3) {
          setIsFlightCircuitBreakerActive(true);
        }
      } else {
        flightDataMissingCount.current = 0;
        setIsFlightCircuitBreakerActive(false);
      }
    } else {
      // Reset when flights disabled
      flightDataMissingCount.current = 0;
      setIsFlightCircuitBreakerActive(false);
    }
  }, [flightCount, flightEnabled]);

  const handleClearData = () => {
    if (confirm('Are you sure you want to clear all historical vehicle data? This will reset trails and paths.')) {
      window.location.reload();
    }
  };

  const handleResetAll = () => {
    setMetroEnabled(true);
    setFlightEnabled(true);
    setShowBusStops(true);
    setShowBusRoutes(true);
    setShowFlightPaths(true);
    setShowVehicleLabels(true);
    setEnableClustering(false);
    setSelectedRoutes(new Set());
  };

  const handleTrackVehicle = (vehicleId: string, _source: 'metro' | 'flight') => {
    setTrackedVehicleId(vehicleId);
  };

  const handleStopTracking = () => {
    setTrackedVehicleId(null);
  };

  const addToast = (type: 'warning' | 'critical' | 'recovery', title: string, body: string) => {
    const toast: Toast = {
      id: `${Date.now()}-${Math.random()}`,
      type,
      title,
      body,
      timestamp: new Date(),
    };
    setToasts(prev => [...prev, toast]);
  };

  const dismissToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const handleToggleMetroFailure = () => {
    const newValue = !simulateMetroFailure;
    setSimulateMetroFailure(newValue);
    if (newValue) {
      console.log('[SIMULATION] Metro feed failure injected');
      addToast('critical', 'Metro Feed Failure', 'Simulating Metro feed outage');
    } else {
      console.log('[SIMULATION] Metro feed failure cleared — monitoring recovery');
      addToast('recovery', 'Metro Feed Recovered', 'Metro feed simulation cleared');
    }
  };

  const handleToggleLatency = () => {
    const newValue = !simulateLatency;
    setSimulateLatency(newValue);
    if (newValue) {
      console.log('[SIMULATION] API latency injection active — 2500ms delay');
      addToast('warning', 'API Latency Spike', 'Simulating 2500ms API delay');
    } else {
      console.log('[SIMULATION] API latency cleared — monitoring recovery');
      addToast('recovery', 'API Latency Recovered', 'Latency simulation cleared');
    }
  };

  const handleToggleErrors = () => {
    const newValue = !simulateErrors;
    setSimulateErrors(newValue);
    if (newValue) {
      console.log('[SIMULATION] Error injection active — 20% error rate');
      addToast('critical', 'High Error Rate', 'Simulating 20% error rate');
    } else {
      console.log('[SIMULATION] Error injection cleared — monitoring recovery');
      addToast('recovery', 'Error Rate Recovered', 'Error simulation cleared');
    }
  };

  const handleOpenRunbook = (sourceName?: string) => {
    setRunbookSourceName(sourceName);
    setIsRunbookOpen(true);
  };

  const handleCloseRunbook = () => {
    setIsRunbookOpen(false);
    setRunbookSourceName(undefined);
  };

  useEffect(() => {
    if (!health || !metrics) return;

    const successRate = metrics.totalRequests > 0
      ? ((metrics.totalRequests - metrics.errorCount) / metrics.totalRequests) * 100
      : 100;
    const errorRate = metrics.totalRequests > 0
      ? (metrics.errorCount / metrics.totalRequests) * 100
      : 0;

    if (prevHealth.current) {
      if (prevHealth.current.sources.metro.status === 'healthy' && health.sources.metro.status === 'degraded') {
        if (!activeAlerts.current.has('metro-degraded')) {
          addToast('warning', 'Metro Feed Degraded', `Last ingest: ${health.sources.metro.lastIngest || 'unknown'}`);
          activeAlerts.current.add('metro-degraded');
        }
      } else if (prevHealth.current.sources.metro.status === 'healthy' && health.sources.metro.status === 'unhealthy') {
        if (!activeAlerts.current.has('metro-unhealthy')) {
          addToast('critical', 'Metro Feed Unhealthy', `${health.sources.metro.vehicleCount} vehicles active`);
          activeAlerts.current.add('metro-unhealthy');
          activeAlerts.current.delete('metro-degraded');
        }
      } else if ((prevHealth.current.sources.metro.status === 'degraded' || prevHealth.current.sources.metro.status === 'unhealthy') && health.sources.metro.status === 'healthy') {
        if (activeAlerts.current.has('metro-degraded') || activeAlerts.current.has('metro-unhealthy')) {
          addToast('recovery', 'Metro Feed Recovered', 'Feed is now healthy');
          activeAlerts.current.delete('metro-degraded');
          activeAlerts.current.delete('metro-unhealthy');
        }
      }

      if (prevHealth.current.sources.flight.status === 'healthy' && health.sources.flight.status === 'degraded') {
        if (!activeAlerts.current.has('flight-degraded')) {
          addToast('warning', 'Flight Feed Degraded', `Last ingest: ${health.sources.flight.lastIngest || 'unknown'}`);
          activeAlerts.current.add('flight-degraded');
        }
      } else if (prevHealth.current.sources.flight.status === 'healthy' && health.sources.flight.status === 'unhealthy') {
        if (!activeAlerts.current.has('flight-unhealthy')) {
          addToast('critical', 'Flight Feed Unhealthy', `${health.sources.flight.vehicleCount} vehicles active`);
          activeAlerts.current.add('flight-unhealthy');
          activeAlerts.current.delete('flight-degraded');
        }
      } else if ((prevHealth.current.sources.flight.status === 'degraded' || prevHealth.current.sources.flight.status === 'unhealthy') && health.sources.flight.status === 'healthy') {
        if (activeAlerts.current.has('flight-degraded') || activeAlerts.current.has('flight-unhealthy')) {
          addToast('recovery', 'Flight Feed Recovered', 'Feed is now healthy');
          activeAlerts.current.delete('flight-degraded');
          activeAlerts.current.delete('flight-unhealthy');
        }
      }
    }

    if (prevMetrics.current) {
      if (prevMetrics.current.lastResponseTime < 200 && metrics.lastResponseTime >= 200 && metrics.lastResponseTime < 500) {
        if (!activeAlerts.current.has('latency-warning')) {
          addToast('warning', 'Latency Warning', `P95 latency: ${metrics.lastResponseTime}ms`);
          activeAlerts.current.add('latency-warning');
        }
      } else if (prevMetrics.current.lastResponseTime < 500 && metrics.lastResponseTime >= 500) {
        if (!activeAlerts.current.has('latency-critical')) {
          addToast('critical', 'SLO Breach: Latency', `P95 latency: ${metrics.lastResponseTime}ms (SLO: < 500ms)`);
          activeAlerts.current.add('latency-critical');
          activeAlerts.current.delete('latency-warning');
        }
      } else if (metrics.lastResponseTime < 200) {
        activeAlerts.current.delete('latency-warning');
        activeAlerts.current.delete('latency-critical');
      }

      const prevErrorRate = prevMetrics.current.totalRequests > 0
        ? (prevMetrics.current.errorCount / prevMetrics.current.totalRequests) * 100
        : 0;

      if (prevErrorRate < 0.05 && errorRate >= 0.05 && errorRate < 0.1) {
        if (!activeAlerts.current.has('error-warning')) {
          addToast('warning', 'Error Rate Elevated', `Error rate: ${errorRate.toFixed(2)}%`);
          activeAlerts.current.add('error-warning');
        }
      } else if (prevErrorRate < 0.1 && errorRate >= 0.1) {
        if (!activeAlerts.current.has('error-critical')) {
          addToast('critical', 'SLO Breach: Error Rate', `Error rate: ${errorRate.toFixed(2)}% (SLO: < 0.1%)`);
          activeAlerts.current.add('error-critical');
          activeAlerts.current.delete('error-warning');
        }
      } else if (errorRate < 0.05) {
        activeAlerts.current.delete('error-warning');
        activeAlerts.current.delete('error-critical');
      }

      const prevSuccessRate = prevMetrics.current.totalRequests > 0
        ? ((prevMetrics.current.totalRequests - prevMetrics.current.errorCount) / prevMetrics.current.totalRequests) * 100
        : 100;

      if (prevSuccessRate >= 99.9 && successRate < 99.9) {
        if (!activeAlerts.current.has('success-critical')) {
          addToast('critical', 'SLO Breach: Availability', `Success rate: ${successRate.toFixed(1)}% (SLO: ≥ 99.9%)`);
          activeAlerts.current.add('success-critical');
        }
      } else if (successRate >= 99.9) {
        activeAlerts.current.delete('success-critical');
      }
    }

    prevHealth.current = health;
    prevMetrics.current = metrics;
  }, [health, metrics]);

  const sidebarWidth = isSidebarCollapsed ? 48 : 280;

  return (
    <div style={{ display: 'flex', height: '100vh' }} data-theme={isDarkTheme ? 'dark' : 'light'}>
      {/* Main content area */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, marginRight: `${sidebarWidth}px`, transition: 'margin-right 0.3s ease' }}>
        {/* Top bar */}
        <div style={{
          background: '#1A202C',
          borderBottom: '1px solid #2D3748',
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
        }}>
          <span style={{
            fontWeight: 600,
            fontSize: '15px',
            color: '#E2E8F0',
            fontFamily: "'Inter', sans-serif",
            letterSpacing: '-0.2px',
          }}>
            Austin Telemetry Platform
          </span>

          <SourceFilter
            metroEnabled={metroEnabled}
            flightEnabled={flightEnabled}
            metroCount={metroCount}
            flightCount={flightCount}
            onToggleMetro={() => setMetroEnabled(!metroEnabled)}
            onToggleFlight={() => setFlightEnabled(!flightEnabled)}
            isFlightCircuitBreakerActive={isFlightCircuitBreakerActive}
            onShowCircuitBreakerModal={() => setShowCircuitBreakerModal(true)}
          />

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            {lastUpdated && (
              <span style={{ fontSize: '11px', color: '#A0AEC0', fontFamily: "'Inter', sans-serif" }}>
                Last updated {Math.floor((Date.now() - lastUpdated.getTime()) / 1000)}s ago
              </span>
            )}

            {loading && (
              <span style={{ fontSize: '12px', color: '#A0AEC0', fontFamily: "'Inter', sans-serif" }}>
                Loading…
              </span>
            )}

            {error && !isStale && (
              <span style={{ fontSize: '12px', color: '#FC8181', fontFamily: "'Inter', sans-serif" }}>
                Error: {error}
              </span>
            )}
          </div>
        </div>

        {/* Map */}
        <div style={{ position: 'relative', flex: 1, display: 'flex' }}>
          <Map
            vehicles={filtered}
            routeShapes={routeShapes}
            busStops={busStops}
            flightTrails={flightTrails}
            flightEnabled={flightEnabled}
            showBusStops={showBusStops}
            showBusRoutes={showBusRoutes}
            showFlightPaths={showFlightPaths}
            showVehicleLabels={showVehicleLabels}
            enableClustering={enableClustering}
            selectedRoutes={selectedRoutes}
            trackedVehicleId={trackedVehicleId}
            onTrackVehicle={handleTrackVehicle}
            onStopTracking={handleStopTracking}
            onThemeChange={setIsDarkTheme}
          />
          
          <MapControls
            metroEnabled={metroEnabled}
            flightEnabled={flightEnabled}
            metroCount={metroCount}
            flightCount={flightCount}
            onToggleMetro={() => setMetroEnabled(!metroEnabled)}
            onToggleFlight={() => setFlightEnabled(!flightEnabled)}
            showBusStops={showBusStops}
            showBusRoutes={showBusRoutes}
            showFlightPaths={showFlightPaths}
            onToggleBusStops={() => setShowBusStops(!showBusStops)}
            onToggleBusRoutes={() => setShowBusRoutes(!showBusRoutes)}
            onToggleFlightPaths={() => setShowFlightPaths(!showFlightPaths)}
            vehicles={vehicles}
            routeShapes={routeShapes}
            selectedRoutes={selectedRoutes}
            onSelectedRoutesChange={setSelectedRoutes}
            showVehicleLabels={showVehicleLabels}
            enableClustering={enableClustering}
            onToggleVehicleLabels={() => setShowVehicleLabels(!showVehicleLabels)}
            onToggleClustering={() => setEnableClustering(!enableClustering)}
            onResetAll={handleResetAll}
          />
        </div>

        {/* Log Viewer */}
        <LogViewer isOpen={isLogViewerOpen} onToggle={setIsLogViewerOpen} />
      </div>

      {/* SRE Sidebar */}
      <SreSidebar
        health={health}
        metrics={metrics}
        metroCount={metroCount}
        flightCount={flightCount}
        lastUpdated={lastUpdated}
        onOpenLogs={() => setIsLogViewerOpen(!isLogViewerOpen)}
        onOpenRunbook={handleOpenRunbook}
        onCollapsedChange={setIsSidebarCollapsed}
        isPaused={isPaused}
        onTogglePause={() => setIsPaused(!isPaused)}
        onClearData={handleClearData}
      />

      {/* Incident Simulation Panel */}
      <IncidentSimulation
        simulateMetroFailure={simulateMetroFailure}
        simulateLatency={simulateLatency}
        simulateErrors={simulateErrors}
        onToggleMetroFailure={handleToggleMetroFailure}
        onToggleLatency={handleToggleLatency}
        onToggleErrors={handleToggleErrors}
        onOpenRunbook={() => handleOpenRunbook()}
      />

      {/* Alert Toast Notifications */}
      <AlertToastContainer toasts={toasts} onDismiss={dismissToast} />

      {/* Runbook Modal */}
      <RunbookModal
        isOpen={isRunbookOpen}
        onClose={handleCloseRunbook}
        sourceName={runbookSourceName}
      />

      {/* Circuit Breaker Modal */}
      {showCircuitBreakerModal && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
          }}
          onClick={() => setShowCircuitBreakerModal(false)}
        >
          <div
            style={{
              background: 'white',
              borderRadius: '8px',
              padding: '24px',
              maxWidth: '500px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <span style={{ fontSize: '32px' }}>⚠️</span>
              <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 600, color: '#1E293B' }}>
                Flight API Rate Limited
              </h2>
            </div>
            
            <p style={{ color: '#475569', lineHeight: 1.6, marginBottom: '12px' }}>
              The OpenSky Network API has returned a <strong>429 Too Many Requests</strong> error.
              To prevent making the problem worse, a <strong>circuit breaker</strong> has been activated.
            </p>
            
            <div style={{ background: '#FEF3C7', border: '1px solid #FDE047', borderRadius: '6px', padding: '12px', marginBottom: '16px' }}>
              <p style={{ margin: 0, fontSize: '13px', color: '#78350F' }}>
                <strong>What this means:</strong> Flight data ingestion is paused for 5 minutes to avoid
                hammering the API. The circuit breaker will automatically reset and resume polling.
              </p>
            </div>
            
            <div style={{ marginBottom: '16px' }}>
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#1E293B', marginBottom: '8px' }}>
                Why did this happen?
              </p>
              <ul style={{ margin: 0, paddingLeft: '20px', color: '#64748B', fontSize: '13px' }}>
                <li>OpenSky has a rate limit of ~10 requests per second</li>
                <li>Daily quota: 4,000 credits/day (resets at 00:00 UTC)</li>
                <li>Polling every 30 seconds uses ~2,880 credits/day</li>
              </ul>
            </div>
            
            <div style={{ marginBottom: '20px' }}>
              <p style={{ fontSize: '14px', fontWeight: 600, color: '#1E293B', marginBottom: '8px' }}>
                What happens next?
              </p>
              <ul style={{ margin: 0, paddingLeft: '20px', color: '#64748B', fontSize: '13px' }}>
                <li>Circuit breaker active for 5 minutes</li>
                <li>Flights will resume automatically after cooldown</li>
                <li>No action needed from you</li>
              </ul>
            </div>
            
            <button
              onClick={() => setShowCircuitBreakerModal(false)}
              style={{
                width: '100%',
                padding: '10px',
                background: '#2563EB',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
