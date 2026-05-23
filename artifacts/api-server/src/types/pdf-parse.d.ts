declare module "pdf-parse" {
  interface PdfData {
    text: string;
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    version: string;
  }
  function pdfParse(dataBuffer: Buffer): Promise<PdfData>;
  export = pdfParse;
}
