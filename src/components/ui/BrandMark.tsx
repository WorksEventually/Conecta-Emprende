import logoUrl from "../../assets/tradearc-logo.svg";

interface BrandMarkProps {
  size?: number;
  className?: string;
}

export function BrandMark({ size = 116, className = "" }: BrandMarkProps) {
  return (
    <div
      className={`auth-brand-mark ${className}`}
      style={{ width: size, height: size }}
    >
      <img src={logoUrl} alt="TradeArc" />
    </div>
  );
}
