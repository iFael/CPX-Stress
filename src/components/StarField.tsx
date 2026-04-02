/**
 * StarField.tsx — Fundo animado de estrelas em movimento
 *
 * Renderiza um campo de estrelas usando Canvas 2D.
 * As estrelas se movem do centro para as bordas (efeito warp/galaxia),
 * com brilho e velocidade variados para criar profundidade.
 *
 * Performance: usa requestAnimationFrame e renderiza apenas quando visível.
 * O canvas e posicionado como fundo fixo (position: fixed, z-index: 0).
 */

import { useEffect, useRef, memo } from "react";

/* -------------------------------------------------------------------------- */
/*  Configuração                                                              */
/* -------------------------------------------------------------------------- */

/** Quantidade de estrelas renderizadas simultaneamente */
const STAR_COUNT = 200;

/** Velocidade base de deslocamento (pixels por frame em 60fps) */
const BASE_SPEED = 0.005;

/** Cor base das estrelas (RGB) — branco com leve tom azul */
const STAR_COLOR = { r: 180, g: 200, b: 255 };

/* -------------------------------------------------------------------------- */
/*  Interface interna — dados de uma estrela                                  */
/* -------------------------------------------------------------------------- */

interface Star {
  /** Posição X normalizada (-1 a 1, relativo ao centro) */
  x: number;
  /** Posição Y normalizada (-1 a 1, relativo ao centro) */
  y: number;
  /** Profundidade (0 = longe, 1 = perto da camera) */
  z: number;
  /** Velocidade individual */
  speed: number;
  /** Raio visual */
  radius: number;
}

/* -------------------------------------------------------------------------- */
/*  Funções auxiliares                                                        */
/* -------------------------------------------------------------------------- */

/** Cria uma estrela em posição aleatoria */
function createStar(): Star {
  const angle = Math.random() * Math.PI * 2;
  const dist = Math.random() * 0.4 + 0.01; // distância do centro
  return {
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
    z: Math.random(),
    speed: Math.random() * 0.6 + 0.4,
    radius: Math.random() * 1.2 + 0.3,
  };
}

/** Reinicia uma estrela quando sai da tela */
function resetStar(star: Star): void {
  const angle = Math.random() * Math.PI * 2;
  const dist = Math.random() * 0.02 + 0.001;
  star.x = Math.cos(angle) * dist;
  star.y = Math.sin(angle) * dist;
  star.z = Math.random() * 0.5 + 0.5;
  star.speed = Math.random() * 0.6 + 0.4;
  star.radius = Math.random() * 1.2 + 0.3;
}

/* -------------------------------------------------------------------------- */
/*  Componente                                                                */
/* -------------------------------------------------------------------------- */

export const StarField = memo(function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const starsRef = useRef<Star[]>([]);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    // Inicializar estrelas
    starsRef.current = Array.from({ length: STAR_COUNT }, createStar);

    // Ajustar tamanho do canvas ao tamanho da janela
    function resize() {
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx!.scale(dpr, dpr);
    }

    resize();
    window.addEventListener("resize", resize);

    // Loop de animação
    let lastTime = performance.now();

    function animate(now: number) {
      if (!ctx || !canvas) return;

      const w = window.innerWidth;
      const h = window.innerHeight;
      const cx = w / 2;
      const cy = h / 2;

      // Delta time normalizado para 60fps
      const dt = Math.min((now - lastTime) / 16.667, 3);
      lastTime = now;

      // Limpar canvas com fundo transparente
      const dpr = window.devicePixelRatio || 1;
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

      const stars = starsRef.current;

      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];

        // Posição anterior (para desenhar rastro)
        const prevScreenX = cx + star.x * w;
        const prevScreenY = cy + star.y * h;

        // Mover estrela para fora (efeito warp)
        const distFromCenter = Math.sqrt(star.x * star.x + star.y * star.y);
        const accel = 1 + distFromCenter * 3; // Acelera conforme se afasta do centro
        const movement = BASE_SPEED * star.speed * accel * dt * 0.008;

        // Direcao normalizada
        if (distFromCenter > 0.0001) {
          star.x += (star.x / distFromCenter) * movement;
          star.y += (star.y / distFromCenter) * movement;
        } else {
          // Estrela exatamente no centro — dar empurrao aleatorio
          const a = Math.random() * Math.PI * 2;
          star.x += Math.cos(a) * 0.001;
          star.y += Math.sin(a) * 0.001;
        }

        // Diminuir profundidade (fica "mais perto" visualmente)
        star.z = Math.max(0, star.z - 0.002 * dt);

        // Posição na tela
        const screenX = cx + star.x * w;
        const screenY = cy + star.y * h;

        // Verificar se saiu da tela
        if (
          screenX < -50 ||
          screenX > w + 50 ||
          screenY < -50 ||
          screenY > h + 50
        ) {
          resetStar(star);
          continue;
        }

        // Opacidade baseada na distância do centro (mais longe = mais visível)
        const opacity = Math.min(1, distFromCenter * 4) * (0.3 + star.z * 0.5);
        const drawRadius = star.radius * (0.5 + distFromCenter * 2);

        // Desenhar rastro (linha do ponto anterior ao atual)
        const trailDist = Math.sqrt(
          (screenX - prevScreenX) ** 2 + (screenY - prevScreenY) ** 2,
        );

        if (trailDist > 0.5) {
          const gradient = ctx.createLinearGradient(
            prevScreenX,
            prevScreenY,
            screenX,
            screenY,
          );
          gradient.addColorStop(
            0,
            `rgba(${STAR_COLOR.r}, ${STAR_COLOR.g}, ${STAR_COLOR.b}, 0)`,
          );
          gradient.addColorStop(
            1,
            `rgba(${STAR_COLOR.r}, ${STAR_COLOR.g}, ${STAR_COLOR.b}, ${opacity * 0.6})`,
          );

          ctx.beginPath();
          ctx.moveTo(prevScreenX, prevScreenY);
          ctx.lineTo(screenX, screenY);
          ctx.strokeStyle = gradient;
          ctx.lineWidth = drawRadius * 0.8;
          ctx.stroke();
        }

        // Desenhar estrela (circulo com glow)
        ctx.beginPath();
        ctx.arc(screenX, screenY, drawRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${STAR_COLOR.r}, ${STAR_COLOR.g}, ${STAR_COLOR.b}, ${opacity})`;
        ctx.fill();

        // Glow sutil ao redor das estrelas maiores
        if (drawRadius > 0.8 && opacity > 0.3) {
          ctx.beginPath();
          ctx.arc(screenX, screenY, drawRadius * 2.5, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${STAR_COLOR.r}, ${STAR_COLOR.g}, ${STAR_COLOR.b}, ${opacity * 0.1})`;
          ctx.fill();
        }
      }

      animRef.current = requestAnimationFrame(animate);
    }

    animRef.current = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
      aria-hidden="true"
    />
  );
});
