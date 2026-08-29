import { ShieldAlert, ShieldCheck } from "lucide-react";

type TrustScoreBadgeProps = {
  trustScore: number | null;
  bilateralCompletions: number;
  emailVerified?: boolean;
  phoneVerified?: boolean;
};

export function TrustScoreBadge({
  trustScore,
  bilateralCompletions,
  emailVerified = false,
  phoneVerified = false,
}: TrustScoreBadgeProps) {
  const verificationBadges: string[] = [];
  if (emailVerified) verificationBadges.push("Email verificado");
  if (phoneVerified) verificationBadges.push("Teléfono verificado");

  // Caso 1: Evidencia insuficiente (< 3 trabajos)
  if (bilateralCompletions < 3) {
    return (
      <span className="badge badge-trust-insufficient" title="Mínimo 3 trabajos para calificación pública">
        <ShieldAlert size={15} />
        {bilateralCompletions} trabajo{bilateralCompletions !== 1 ? "s" : ""} · Evidencia insuficiente
        {verificationBadges.length > 0 && ` · ${verificationBadges.join(" · ")}`}
      </span>
    );
  }

  const scoreColor =
    trustScore !== null && trustScore >= 80 ? "badge-trust-high" :
    trustScore !== null && trustScore >= 60 ? "badge-trust-med" :
    "badge-trust";

  return (
    <span className={`badge ${scoreColor}`} title={`Basado en ${bilateralCompletions} trabajo${bilateralCompletions !== 1 ? "s" : ""} verificado${bilateralCompletions !== 1 ? "s" : ""}`}>
      <ShieldCheck size={15} />
      {trustScore ?? "—"} confianza
      {verificationBadges.length > 0 && ` · ${verificationBadges.join(" · ")}`}
    </span>
  );
}