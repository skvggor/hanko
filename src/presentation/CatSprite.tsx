import type { CatActivity, CatBreed } from "@domain/cat";

interface Palette {
  contorno: string;
  principal: string;
  listras: string;
  peito: string;
  olhos: string;
  focinho: string;
}

const BREED_PALETTES: Record<CatBreed, Palette> = {
  tabby: {
    contorno: "#221c1a",
    principal: "#ff9933",
    listras: "#cc5200",
    peito: "#fff0dd",
    olhos: "#221c1a",
    focinho: "#ff80aa",
  },
  siamese: {
    contorno: "#2b1e1a",
    principal: "#f0e6d8",
    listras: "#5a4a42",
    peito: "#fff8f0",
    olhos: "#1f4e8c",
    focinho: "#cfa5a5",
  },
  black: {
    contorno: "#16150f",
    principal: "#2d2d2d",
    listras: "#16150f",
    peito: "#6d6a61",
    olhos: "#f0b323",
    focinho: "#ff80aa",
  },
  ginger: {
    contorno: "#221c1a",
    principal: "#f4a261",
    listras: "#c46c2b",
    peito: "#fff0dd",
    olhos: "#221c1a",
    focinho: "#ff80aa",
  },
  spotted: {
    contorno: "#221c1a",
    principal: "#fdfbf7",
    listras: "#4a4a4a",
    peito: "#ffffff",
    olhos: "#221c1a",
    focinho: "#ff80aa",
  },
};

export interface CatSpriteProps {
  breed: CatBreed;
  activity?: CatActivity;
  direction?: "left" | "right";
}

export function CatSprite({ breed, activity = "walking", direction = "right" }: Readonly<CatSpriteProps>) {
  const palette = BREED_PALETTES[breed];

  return (
    <svg
      aria-hidden="true"
      className={`cat-sprite cat-sprite--${activity}`}
      data-direction={direction}
      style={{
          "--cor-contorno": palette.contorno,
          "--cor-principal": palette.principal,
          "--cor-listras": palette.listras,
          "--cor-peito": palette.peito,
          "--cor-olhos": palette.olhos,
          "--cor-focinho": palette.focinho,
          "--cat-direction": direction === "left" ? 1 : -1,
        }
      }
      viewBox="0 0 16 16"
      xmlns="http://www.w3.org/2000/svg"
    >

      <g>
        <rect className="contorno" height="4" width="2" x="12" y="10" />
        <rect className="pelagem" height="2" width="1" x="12" y="11" />
        <g className="rabo-ponta">
          <rect className="contorno" height="4" width="2" x="13" y="7" />
          <rect className="pelagem" height="2" width="1" x="13" y="8" />
          <rect className="listra" height="1" width="1" x="13" y="7" />
        </g>
      </g>

      <g>
        <path className="contorno" d="M4,9 h8 v6 h-8 z" />
        <rect className="pelagem" height="5" width="6" x="5" y="9" />
        <rect className="listra" height="1" width="2" x="9" y="10" />
        <rect className="listra" height="1" width="1" x="10" y="12" />
        <rect className="claro" height="3" width="3" x="6" y="10" />
        <rect className="claro" height="1" width="2" x="5" y="14" />
        <rect className="claro" height="1" width="2" x="9" y="14" />
        <rect className="contorno perna perna--back" height="2" width="2" x="7" y="13" />
        <rect className="contorno perna perna--front" height="2" width="2" x="10" y="13" />
      </g>

      <g className="cabeca">
        <rect className="contorno" height="2" width="2" x="3" y="2" />
        <rect className="contorno" height="2" width="2" x="10" y="2" />
        <rect className="contorno" height="6" width="11" x="2" y="4" />

        <rect className="pelagem" height="1" width="1" x="3" y="3" />
        <rect className="pelagem" height="1" width="1" x="10" y="3" />
        <rect className="pelagem" height="5" width="9" x="3" y="4" />

        <rect className="listra" height="2" width="1" x="7" y="4" />
        <rect className="listra" height="1" width="1" x="3" y="6" />
        <rect className="listra" height="1" width="1" x="11" y="6" />

        <rect className="focinho" height="1" width="1" x="7" y="7" />

        <rect className="listra" height="1" width="1" x="5" y="7" />
        <rect className="listra" height="1" width="1" x="9" y="7" />

        <g className="olhos-abertos">
          <rect className="olho" height="2" width="1" x="5" y="6" />
          <rect className="olho" height="2" width="1" x="9" y="6" />
        </g>

        <g className="olhos-fechados">
          <rect className="listra" height="1" width="2" x="5" y="7" />
          <rect className="listra" height="1" width="2" x="8" y="7" />
        </g>
      </g>
    </svg>
  );
}
