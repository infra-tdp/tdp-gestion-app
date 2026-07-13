/**
 * Wordmark TDP. El degradado #59FF00 → #EAFF00 es EXCLUSIVO del logotipo
 * (guía de marca) — aquí es el único sitio donde se usa.
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-baseline gap-1 select-none">
      <span
        className="headline"
        style={{
          fontSize: size,
          background: "linear-gradient(90deg, #59FF00, #EAFF00)",
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
          lineHeight: 1,
        }}
      >
        TDP
      </span>
      <span className="headline text-text" style={{ fontSize: size * 0.62, lineHeight: 1 }}>
        Gestión
      </span>
    </span>
  );
}
