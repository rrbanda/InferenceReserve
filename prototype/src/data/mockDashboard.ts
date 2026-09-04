export interface TimeSeriesPoint {
  time: string;
  hour: number;
  tpmConsumed: number;
  tpmCommitted: number;
  ttftP95: number;
  slaThreshold: number;
  spillover: number;
  gpuUtil: number;
  queueDepth: number;
  kvCacheHit: number;
}

export interface FleetRow {
  gpuType: string;
  total: number;
  committed: number;
  available: number;
}

export interface ReservationRow {
  name: string;
  model: string;
  tpm: number;
  utilisation: number;
  slaStatus: 'Meeting' | 'At Risk' | 'Breached';
}

function diurnalFactor(hour: number): number {
  const peak = 14;
  const dist = Math.abs(hour - peak);
  return Math.max(0.3, 1 - dist * 0.05);
}

export function generateTimeSeriesData(hours: number): TimeSeriesPoint[] {
  const data: TimeSeriesPoint[] = [];
  const committedTPM = 100000;
  const slaThreshold = 500;

  for (let i = 0; i < hours; i++) {
    const hour = i % 24;
    const factor = diurnalFactor(hour);
    const noise = () => (Math.random() - 0.5) * 0.1;

    const baseTPM = 70000;
    const tpmConsumed = Math.round(
      Math.min(baseTPM * factor * (1 + noise()), 95000) + Math.random() * 5000
    );

    const baseTTFT = 380;
    const spike = Math.random() > 0.9 ? Math.random() * 100 : 0;
    const ttftP95 = Math.round(baseTTFT + (1 - factor) * 40 + spike + noise() * 20);

    const isSpilloverWindow = factor > 0.85 && Math.random() > 0.6;
    const spillover = isSpilloverWindow ? Math.floor(Math.random() * 4) + 2 : 0;

    const gpuUtil = Math.round((62 + factor * 15 + noise() * 5) * 10) / 10;

    const baseQueue = 0.5;
    const queueSpike = Math.random() > 0.85 ? Math.random() * 7.5 : 0;
    const queueDepth = Math.round((baseQueue + queueSpike + noise()) * 10) / 10;

    const kvCacheHit = Math.round((55 + factor * 20 + noise() * 8) * 10) / 10;

    const h = hour.toString().padStart(2, '0');
    data.push({
      time: `${h}:00`,
      hour,
      tpmConsumed,
      tpmCommitted: committedTPM,
      ttftP95,
      slaThreshold,
      spillover,
      gpuUtil: Math.min(gpuUtil, 98),
      queueDepth: Math.max(queueDepth, 0),
      kvCacheHit: Math.min(kvCacheHit, 95),
    });
  }
  return data;
}

export const fleetData: FleetRow[] = [
  { gpuType: 'H100 NVL', total: 64, committed: 48, available: 16 },
  { gpuType: 'H200 NVL', total: 32, committed: 16, available: 16 },
  { gpuType: 'A100 80GB', total: 24, committed: 8, available: 16 },
];

export const reservationsData: ReservationRow[] = [
  { name: 'team-alpha', model: 'llama3-70b', tpm: 75000, utilisation: 68, slaStatus: 'Meeting' },
  { name: 'team-beta', model: 'llama3-70b', tpm: 100000, utilisation: 82, slaStatus: 'Meeting' },
  { name: 'team-gamma', model: 'llama3-8b', tpm: 50000, utilisation: 45, slaStatus: 'Meeting' },
  { name: 'team-delta', model: 'mistral-7b', tpm: 30000, utilisation: 91, slaStatus: 'At Risk' },
  { name: 'team-epsilon', model: 'embedding-v2', tpm: 200000, utilisation: 55, slaStatus: 'Meeting' },
];
