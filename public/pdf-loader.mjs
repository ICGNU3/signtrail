import * as pdfjsLib from '/vendor/pdf.min.mjs';

pdfjsLib.GlobalWorkerOptions.workerSrc = '/vendor/pdf.worker.min.mjs';
window.pdfjsLib = pdfjsLib;
window.signtrailPdfJsReady = Promise.resolve(pdfjsLib);
