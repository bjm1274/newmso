import type { jsPDF as JsPDFConstructor } from 'jspdf';

type JsPDFModule = {
  jsPDF?: typeof JsPDFConstructor;
  default?:
    | typeof JsPDFConstructor
    | {
        jsPDF?: typeof JsPDFConstructor;
        default?: typeof JsPDFConstructor;
      };
};

export async function loadJsPDF(): Promise<typeof JsPDFConstructor> {
  const jspdfModule = (await import('jspdf/dist/jspdf.umd.min.js')) as JsPDFModule;
  const defaultExport = jspdfModule.default;
  const jsPDF =
    jspdfModule.jsPDF ??
    (typeof defaultExport === 'function'
      ? defaultExport
      : defaultExport?.jsPDF ?? defaultExport?.default);

  if (!jsPDF) {
    throw new Error('jsPDF constructor was not found in the bundled module.');
  }

  return jsPDF;
}
