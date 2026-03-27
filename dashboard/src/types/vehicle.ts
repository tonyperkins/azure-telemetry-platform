export interface Vehicle {
  id: number;
  source: 'metro' | 'flight';
  vehicleId: string;
  label: string | null;
  latitude: number;
  longitude: number;
  altitudeM: number | null;
  speedKmh: number | null;
  heading: number | null;
  onGround: boolean | null;
  rawJson: string | null;
  ingestedAt: string; // ISO 8601
  routeId?: string;
  tripId?: string;
  verticalRateMs?: number | null;
}

export interface SourceHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastIngest: string | null;
  vehicleCount: number;
  configDisabled?: boolean; // true = intentionally paused via ENABLE_* config, not a failure
}


export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  sources: {
    metro: SourceHealth;
    flight: SourceHealth;
  };
}

export type SourceFilter = 'both' | 'metro' | 'flight';

export interface PathPoint {
  latitude:   number;
  longitude:  number;
  ingestedAt: string;
}

export interface RouteDirection {
  directionId: number;
  shape:       [number, number][]; // [lat, lon] pairs
}

export interface RouteShape {
  routeId:    string;
  shortName:  string;
  color:      string | null;
  directions: RouteDirection[];
}

export interface VehiclePathGroup {
  vehicleId: string;
  points:    PathPoint[];
}
