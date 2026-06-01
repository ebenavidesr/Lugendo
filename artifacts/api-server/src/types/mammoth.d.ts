declare module "mammoth" {
  interface ExtractRawTextOptions {
    buffer: Buffer;
  }
  interface Result {
    value: string;
    messages: unknown[];
  }
  export function extractRawText(options: ExtractRawTextOptions): Promise<Result>;
}
