export interface SizingProfile {
  model: string;
  displayName: string;
  gpuType: string;
  gpusPerReplica: number;
  tokPerSec: number;
  utilisationTarget: number;
  costPer1kTPMHr: number;
}

export const sizingProfiles: SizingProfile[] = [
  {
    model: 'llama3-70b',
    displayName: 'Llama 3 70B',
    gpuType: 'H100 NVL',
    gpusPerReplica: 8,
    tokPerSec: 2500,
    utilisationTarget: 0.7,
    costPer1kTPMHr: 0.30,
  },
  {
    model: 'llama3-8b',
    displayName: 'Llama 3 8B',
    gpuType: 'H100 NVL',
    gpusPerReplica: 2,
    tokPerSec: 5000,
    utilisationTarget: 0.7,
    costPer1kTPMHr: 0.15,
  },
  {
    model: 'mistral-7b',
    displayName: 'Mistral 7B',
    gpuType: 'H100 NVL',
    gpusPerReplica: 1,
    tokPerSec: 6000,
    utilisationTarget: 0.7,
    costPer1kTPMHr: 0.12,
  },
  {
    model: 'embedding-v2',
    displayName: 'Embedding v2',
    gpuType: 'A100 MIG 1g.10gb',
    gpusPerReplica: 1,
    tokPerSec: 500000,
    utilisationTarget: 0.7,
    costPer1kTPMHr: 0.02,
  },
];

export type TierName = 'S' | 'M' | 'L' | 'XL';

export function calculateSizing(
  profile: SizingProfile,
  rpm: number,
  avgInputTokens: number,
  avgOutputTokens: number
) {
  const weightedTPM = (avgInputTokens + avgOutputTokens * 4) * rpm;
  const tokPerMinPerReplica = profile.tokPerSec * 60 * profile.utilisationTarget;
  const replicas = Math.max(1, Math.ceil(weightedTPM / tokPerMinPerReplica));
  const gpus = replicas * profile.gpusPerReplica;
  const committedTPM = weightedTPM;

  let tier: TierName;
  if (gpus <= 2) tier = 'S';
  else if (gpus <= 16) tier = 'M';
  else if (gpus <= 32) tier = 'L';
  else tier = 'XL';

  const monthlyCost = (committedTPM / 1000) * profile.costPer1kTPMHr * 24 * 30;

  return {
    tier,
    replicas,
    gpus,
    committedTPM,
    monthlyCost,
  };
}
