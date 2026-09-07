/**
 * Telemetry inputs. `null` means "no data available yet" (e.g. a provider
 * without bilateral completions or reviews, or before search telemetry
 * exists). Unavailable signals are excluded from the score instead of being
 * read as extreme values: treating them as 0 produced false positives
 * (+20 for avgSearchTimeSeconds = 0 on every provider, since search
 * telemetry is not implemented yet).
 */
export type RiskScoreInput = {
  avgSearchTimeSeconds:number|null;
  avgRequestToCompletionMinutes:number|null;
  avgMessagesPerRequest:number|null;
  newAccountsPercentage:number|null;
  repeatedTargetProviderScore:number|null;
  ratingConcentrationScore:number|null;
  synchronizedCompletionScore?: number|null;
  reviewBurstScore?: number|null;
  accountClusterScore?: number|null;
  profileRecreationScore?: number|null;
  actionVolumeScore?: number|null;
};

export type RiskLevel = "normal"|"unusual"|"suspicious"|"high-risk";

export type RiskSignalKey =
  | "FAST_SEARCH"
  | "FAST_COMPLETION"
  | "LOW_MESSAGE_COUNT"
  | "NEW_ACCOUNT_CONCENTRATION"
  | "REPEATED_PROVIDER_TARGET"
  | "RATING_CONCENTRATION"
  | "SYNCHRONIZED_COMPLETIONS"
  | "REVIEW_BURST"
  | "ACCOUNT_CLUSTER"
  | "PROFILE_RECREATION"
  | "ACTION_VOLUME";

export type RiskSignal = {
  key: RiskSignalKey;
  observedValue: number | null;
  threshold: number;
  contribution: number;
  sourceEventIds?: string[];
};

export type RiskScoreResult = {
  score:number;
  level:RiskLevel;
  penalty:number;
  signals: RiskSignal[];
  recommendedAction:string;
  shouldGenerateReport:boolean;
};

export const RISK_ALGORITHM_VERSION = "risk-v1.0.0";

export const RISK_SIGNAL_CATALOG: ReadonlyArray<{
  key: RiskSignalKey;
  source: string;
  window: string;
  confirmationRequired: boolean;
}> = [
  { key: "FAST_SEARCH", source: "SearchEvent (no disponible en MVP)", window: "Por interacción", confirmationRequired: true },
  { key: "FAST_COMPLETION", source: "QuoteThread + RequestEvent COMPLETION_CONFIRMED", window: "Últimos 30 días", confirmationRequired: true },
  { key: "LOW_MESSAGE_COUNT", source: "QuoteMessage + RequestEvent MESSAGE_SENT", window: "Por solicitud", confirmationRequired: true },
  { key: "NEW_ACCOUNT_CONCENTRATION", source: "User.createdAt + QuoteThread", window: "Últimos 30 días", confirmationRequired: true },
  { key: "REPEATED_PROVIDER_TARGET", source: "QuoteThread.senderId", window: "Últimos 30 días", confirmationRequired: true },
  { key: "RATING_CONCENTRATION", source: "Review + User.createdAt", window: "Últimos 30 días", confirmationRequired: true },
  { key: "SYNCHRONIZED_COMPLETIONS", source: "QuoteThread.completedAt + RequestEvent", window: "Últimos 30 días", confirmationRequired: true },
  { key: "REVIEW_BURST", source: "Review.createdAt + RequestEvent", window: "Últimas 24 horas", confirmationRequired: true },
  { key: "ACCOUNT_CLUSTER", source: "User.createdAt + QuoteThread.senderId", window: "Últimos 30 días", confirmationRequired: true },
  { key: "PROFILE_RECREATION", source: "Provider lineage group + Provider.status", window: "Histórico", confirmationRequired: true },
  { key: "ACTION_VOLUME", source: "QuoteThread/QuoteMessage/Review timestamps", window: "Última hora", confirmationRequired: true },
];

const clamp=(value:number,min=0,max=100)=>Math.min(max,Math.max(min,value));

export function classifyRiskScore(score:number):RiskLevel {
  if(score>=70)return "high-risk";
  if(score>=51)return "suspicious";
  if(score>=31)return "unusual";
  return "normal";
}

export function riskPenaltyForLevel(level:RiskLevel):number {
  switch(level){
    case "high-risk": return 40;
    case "suspicious": return 20;
    case "unusual": return 10;
    case "normal": return 0;
  }
}

export function calculateRiskSignals(input:RiskScoreInput):RiskSignal[] {
  return [
    {
      key: "FAST_SEARCH",
      observedValue: input.avgSearchTimeSeconds,
      threshold: 8,
      contribution: input.avgSearchTimeSeconds===null?0:input.avgSearchTimeSeconds<8?20:input.avgSearchTimeSeconds<20?10:0,
    },
    {
      key: "FAST_COMPLETION",
      observedValue: input.avgRequestToCompletionMinutes,
      threshold: 15,
      contribution: input.avgRequestToCompletionMinutes===null?0:input.avgRequestToCompletionMinutes<15?20:input.avgRequestToCompletionMinutes<60?10:0,
    },
    {
      key: "LOW_MESSAGE_COUNT",
      observedValue: input.avgMessagesPerRequest,
      threshold: 2,
      contribution: input.avgMessagesPerRequest===null?0:input.avgMessagesPerRequest<2?15:input.avgMessagesPerRequest<4?8:0,
    },
    {
      key: "NEW_ACCOUNT_CONCENTRATION",
      observedValue: input.newAccountsPercentage,
      threshold: 60,
      contribution: clamp(input.newAccountsPercentage??0)*0.2,
    },
    {
      key: "REPEATED_PROVIDER_TARGET",
      observedValue: input.repeatedTargetProviderScore,
      threshold: 60,
      contribution: clamp(input.repeatedTargetProviderScore??0)*0.25,
    },
    {
      key: "RATING_CONCENTRATION",
      observedValue: input.ratingConcentrationScore,
      threshold: 60,
      contribution: clamp(input.ratingConcentrationScore??0)*0.2,
    },
    {
      key: "SYNCHRONIZED_COMPLETIONS",
      observedValue: input.synchronizedCompletionScore ?? null,
      threshold: 60,
      contribution: clamp(input.synchronizedCompletionScore ?? 0)*0.2,
    },
    {
      key: "REVIEW_BURST",
      observedValue: input.reviewBurstScore ?? null,
      threshold: 60,
      contribution: clamp(input.reviewBurstScore ?? 0)*0.2,
    },
    {
      key: "ACCOUNT_CLUSTER",
      observedValue: input.accountClusterScore ?? null,
      threshold: 60,
      contribution: clamp(input.accountClusterScore ?? 0)*0.25,
    },
    {
      key: "PROFILE_RECREATION",
      observedValue: input.profileRecreationScore ?? null,
      threshold: 60,
      contribution: clamp(input.profileRecreationScore ?? 0)*0.25,
    },
    {
      key: "ACTION_VOLUME",
      observedValue: input.actionVolumeScore ?? null,
      threshold: 80,
      contribution: clamp(input.actionVolumeScore ?? 0)*0.2,
    },
  ];
}

export function calculateRiskScore(input:RiskScoreInput):RiskScoreResult {
  // `null` = signal unavailable: excluded from the score, never compared
  // numerically (null coerces to 0 in comparisons, which reintroduces the
  // false-positive penalties this contract exists to prevent).
  const signals=calculateRiskSignals(input);
  const score=Math.round(clamp(signals.reduce((total, signal) => total + signal.contribution, 0)));
  const level=classifyRiskScore(score);
  const penalty=riskPenaltyForLevel(level);

  return {
    score,
    level,
    penalty,
    signals,
    shouldGenerateReport:score>=70,
    recommendedAction:score>=70?"Revisión manual: analizar patrón agregado sin exponer datos personales.":"Monitorear con controles normales.",
  };
}
