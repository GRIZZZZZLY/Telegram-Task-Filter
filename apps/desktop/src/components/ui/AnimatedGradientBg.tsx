/**
 * Animated Gradient SVG Background
 * Inspired by Fancy Components — адаптировано для проекта
 * Цвета: #0f0f0f, #1a1a2e, #16213e (тёмная тема)
 */
export function AnimatedGradientBg() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      <svg
        className="absolute inset-0 h-full w-full"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <radialGradient id="rg1" cx="20%" cy="20%" r="60%">
            <stop offset="0%" stopColor="#1a1a2e" stopOpacity="1">
              <animate
                attributeName="cx"
                values="20%;80%;20%"
                dur="12s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="cy"
                values="20%;70%;20%"
                dur="10s"
                repeatCount="indefinite"
              />
            </stop>
            <stop offset="100%" stopColor="#0f0f0f" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="rg2" cx="80%" cy="70%" r="55%">
            <stop offset="0%" stopColor="#16213e" stopOpacity="0.9">
              <animate
                attributeName="cx"
                values="80%;30%;80%"
                dur="15s"
                repeatCount="indefinite"
              />
              <animate
                attributeName="cy"
                values="70%;20%;70%"
                dur="13s"
                repeatCount="indefinite"
              />
            </stop>
            <stop offset="100%" stopColor="#0f0f0f" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="rg3" cx="50%" cy="50%" r="40%">
            <stop offset="0%" stopColor="#1e1b4b" stopOpacity="0.5">
              <animate
                attributeName="r"
                values="40%;60%;40%"
                dur="9s"
                repeatCount="indefinite"
              />
            </stop>
            <stop offset="100%" stopColor="#0f0f0f" stopOpacity="0" />
          </radialGradient>
          <filter id="blur">
            <feGaussianBlur stdDeviation="40" />
          </filter>
        </defs>

        {/* Базовый фон */}
        <rect width="100%" height="100%" fill="#0f0f0f" />

        {/* Анимированные градиенты */}
        <g filter="url(#blur)">
          <rect width="100%" height="100%" fill="url(#rg1)" />
          <rect width="100%" height="100%" fill="url(#rg2)" />
          <rect width="100%" height="100%" fill="url(#rg3)" />
        </g>
      </svg>
    </div>
  )
}
