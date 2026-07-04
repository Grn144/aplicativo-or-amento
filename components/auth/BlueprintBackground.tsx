// Fundo decorativo: grid + traços de planta técnica em baixa opacidade.
// Puramente visual — sem interação e invisível para leitores de tela.
export function BlueprintBackground() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1440 900"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
    >
      <defs>
        <pattern id="bp-grid" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M48 0H0v48" stroke="white" strokeOpacity="0.04" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="1440" height="900" fill="url(#bp-grid)" />
      <g stroke="white" strokeOpacity="0.07" strokeWidth="1.5">
        {/* planta baixa — canto superior esquerdo */}
        <path d="M80 120h280v200H80z" />
        <path d="M80 220h120M200 120v100M280 220v100M360 220h-80" />
        <path d="M200 270h60" strokeDasharray="6 6" />
        {/* compasso — canto inferior direito */}
        <circle cx="1240" cy="700" r="120" />
        <circle cx="1240" cy="700" r="80" strokeDasharray="4 8" />
        <path d="M1240 560v280M1100 700h280" />
        {/* treliça estrutural — topo direito */}
        <path d="M1000 80l80 120h-160l80-120z" />
        <path d="M920 200h320M1080 80l80 120M1160 80l80 120h-160" />
        {/* linha de cota — inferior esquerdo */}
        <path d="M120 760h360M120 750v20M480 750v20" />
      </g>
    </svg>
  )
}
