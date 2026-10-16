export {};

declare global {
  interface ImportMetaEnv {
    readonly MODE: string;
    readonly DEV: boolean;
    readonly PROD: boolean;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

/**
 * The cat is drawn from custom properties: its palette, its stride length and which
 * way it faces are all set from a component and read by the stylesheet. Declaring
 * them here means a component writes them in a plain style object, instead of
 * casting the object to smuggle in a key the type has never heard of.
 */
declare module "react" {
  interface CSSProperties {
    "--cat-direction"?: number | undefined;
    "--cat-duration"?: string | undefined;
    "--cor-contorno"?: string | undefined;
    "--cor-focinho"?: string | undefined;
    "--cor-listras"?: string | undefined;
    "--cor-olhos"?: string | undefined;
    "--cor-peito"?: string | undefined;
    "--cor-principal"?: string | undefined;
  }
}