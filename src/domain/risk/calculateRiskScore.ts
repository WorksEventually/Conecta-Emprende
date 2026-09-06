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
};

export type RiskLevel = "normal"|"unusual"|"suspicious"|"high-risk";

export type RiskScoreResult = {
  score:number;
  level:RiskLevel;
  penalty:number;
  recommendedAction:string;
  shouldGenerateReport:boolean;
};

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

export function calculateRiskScore(input:RiskScoreInput):RiskScoreResult {
  // `null` = signal unavailable: excluded from the score, never compared
  // numerically (null coerces to 0 in comparisons, which reintroduces the
  // false-positive penalties this contract exists to prevent).
  const fastSearchPenalty=input.avgSearchTimeSeconds===null?0:input.avgSearchTimeSeconds<8?20:input.avgSearchTimeSeconds<20?10:0;
  const fastCompletionPenalty=input.avgRequestToCompletionMinutes===null?0:input.avgRequestToCompletionMinutes<15?20:input.avgRequestToCompletionMinutes<60?10:0;
  const lowMessagePenalty=input.avgMessagesPerRequest===null?0:input.avgMessagesPerRequest<2?15:input.avgMessagesPerRequest<4?8:0;
  const newAccountPenalty=clamp(input.newAccountsPercentage??0)*0.2;
  const repeatedTargetPenalty=clamp(input.repeatedTargetProviderScore??0)*0.25;
  const concentrationPenalty=clamp(input.ratingConcentrationScore??0)*0.2;
  const score=Math.round(clamp(fastSearchPenalty+fastCompletionPenalty+lowMessagePenalty+newAccountPenalty+repeatedTargetPenalty+concentrationPenalty));
  const level=classifyRiskScore(score);
  const penalty=riskPenaltyForLevel(level);

  return {
    score,
    level,
    penalty,
    shouldGenerateReport:score>=70,
    recommendedAction:score>=70?"Revisión manual: analizar patrón agregado sin exponer datos personales.":"Monitorear con controles normales.",
  };
}
