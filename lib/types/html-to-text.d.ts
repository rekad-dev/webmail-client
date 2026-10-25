declare module "html-to-text" {
  export function convert(
    html: string,
    options?: {
      decodeEntities?: boolean;
      wordwrap?: number | false | null;
      preserveNewlines?: boolean;
      limits?: {
        maxInputLength?: number;
        maxDepth?: number;
        maxChildNodes?: number;
      };
    },
  ): string;
}
