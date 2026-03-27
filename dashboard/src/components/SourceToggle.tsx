import { SourceFilter } from '../types/vehicle';

interface Props {
  active: SourceFilter;
  metroCount: number;
  flightCount: number;
  onChange: (filter: SourceFilter) => void;
}

const BASE: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  padding: '6px 14px',
  borderRadius: '6px',
  border: '1.5px solid',
  fontSize: '13px',
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: "'Inter', sans-serif",
  transition: 'background 0.15s, color 0.15s',
};

function btn(active: boolean, color: string): React.CSSProperties {
  return {
    ...BASE,
    background: active ? color : 'transparent',
    borderColor: color,
    color: active ? '#fff' : color,
  };
}

export function SourceToggle({ active, metroCount, flightCount, onChange }: Props) {
  return (
    <div style={{ display: 'flex', gap: '8px' }}>
      <button style={btn(active === 'metro', '#0D9488')} onClick={() => onChange('metro')}>
        🚌 Buses ({metroCount})
      </button>
      <button style={btn(active === 'flight', '#D97706')} onClick={() => onChange('flight')}>
        ✈ Flights ({flightCount})
      </button>
      <button style={btn(active === 'both', '#3B82F6')} onClick={() => onChange('both')}>
        Both
      </button>
    </div>
  );
}
