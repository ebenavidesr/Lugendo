type LogoVariant = "light" | "dark";

interface LugendoCompassProps {
  size?: number;
  variant?: LogoVariant;
  className?: string;
}

export function LugendoCompass({ size = 28, variant = "light", className }: LugendoCompassProps) {
  if (variant === "dark") {
    return (
      <svg width={size} height={size} viewBox="0 0 56 56" fill="none" className={className}>
        <circle cx="28" cy="28" r="26" fill="#3D2410" stroke="#C4793A" strokeWidth="1.5" />
        <g transform="rotate(60,28,28)">
          <polygon points="28,8 21,28 28,22 35,28" fill="#C4B5E8" />
          <polygon points="28,48 35,28 28,34 21,28" fill="#C4793A" />
        </g>
        <circle cx="28" cy="28" r="4" fill="#ECD5B8" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 56 56" fill="none" className={className}>
      <circle cx="28" cy="28" r="26" fill="#ECD5B8" stroke="#C4793A" strokeWidth="1.5" />
      <g transform="rotate(60,28,28)">
        <polygon points="28,8 21,28 28,22 35,28" fill="#3D2F6B" />
        <polygon points="28,48 35,28 28,34 21,28" fill="#C4793A" />
      </g>
      <circle cx="28" cy="28" r="4" fill="#2D1F0E" />
    </svg>
  );
}

interface LugendoWordmarkProps {
  variant?: LogoVariant;
  size?: "sm" | "md" | "lg";
}

export function LugendoWordmark({ variant = "light", size = "md" }: LugendoWordmarkProps) {
  const base = variant === "dark" ? "#FAF2EB" : "#2D1F0E";
  const sizes = { sm: "text-base", md: "text-xl", lg: "text-3xl" };

  return (
    <span
      className={`font-sans font-medium tracking-tight ${sizes[size]}`}
      style={{ letterSpacing: "-0.02em" }}
    >
      <span style={{ color: base }}>Lu</span>
      <span style={{ color: "#C4793A" }}>g</span>
      <span style={{ color: base }}>endo</span>
    </span>
  );
}

interface LugendoLogoProps {
  variant?: LogoVariant;
  compassSize?: number;
  wordmarkSize?: "sm" | "md" | "lg";
  className?: string;
}

export function LugendoLogo({ variant = "light", compassSize = 28, wordmarkSize = "md", className }: LugendoLogoProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <LugendoCompass size={compassSize} variant={variant} />
      <LugendoWordmark variant={variant} size={wordmarkSize} />
    </span>
  );
}
