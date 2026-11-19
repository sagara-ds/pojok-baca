import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import { editionRequest } from './admin-edition-api';

const maxPdfBytes = 100 * 1024 * 1024;

async function pageWebp(page: PDFPageProxy) {
  const full = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: Math.min(1, 1100 / full.width, 8192 / full.height) });
  if (!Number.isFinite(viewport.width) || !Number.isFinite(viewport.height) || viewport.width <= 0 || viewport.height <= 0) {
    throw new Error('Dimensi halaman PDF tidak valid.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  try {
    await page.render({ canvas, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.78));
    if (!blob || blob.type !== 'image/webp') throw new Error('Browser belum bisa membuat WebP.');
    if (blob.size > 4 * 1024 * 1024) throw new Error('Ukuran WebP halaman melebihi 4 MB.');
    return blob;
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

export function initAdminUpload() {
  const form = document.querySelector<HTMLFormElement>('#edition-upload-form');
  if (!form) return;
  const maxUploadWorkers = form.dataset.uploadConcurrency === '2' ? 2 : 4;
  const start = document.querySelector<HTMLButtonElement>('#edition-start')!;
  const publish = document.querySelector<HTMLButtonElement>('#edition-publish')!;
  const container = document.querySelector<HTMLElement>('#edition-progress')!;
  const progress = container.querySelector('progress')!;
  const count = document.querySelector('#edition-count')!;
  const list = document.querySelector('#edition-pages')!;
  const status = document.querySelector('#edition-status')!;
  const link = document.querySelector<HTMLAnchorElement>('#edition-published-link')!;
  const phase = document.querySelector('#edition-phase');
  const dropTarget = document.querySelector<HTMLElement>('[data-pdf-drop]')!;
  const pdfInput = form.querySelector<HTMLInputElement>('input[name="pdf"]')!;
  const selection = document.querySelector('#pdf-selection')!;
  let pdf: PDFDocumentProxy | undefined;
  let loadingTask: ReturnType<typeof import('pdfjs-dist').getDocument> | undefined;
  let edition = '';
  let busy = false;
  let published = false;
  const ready = new Set<number>();
  const rows = new Map<number, { message: HTMLElement; retry: HTMLButtonElement }>();

  function showFile() {
    const file = pdfInput.files?.[0];
    selection.textContent = file ? `${file.name} · ${new Intl.NumberFormat('id-ID', {
      maximumFractionDigits: 2,
    }).format(file.size / (1024 * 1024))} MB` : '';
  }
  pdfInput.addEventListener('change', showFile);
  dropTarget.addEventListener('dragover', (event) => {
    if (!event.dataTransfer?.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = busy || edition ? 'none' : 'copy';
    dropTarget.toggleAttribute('data-dragging', !busy && !edition);
  });
  dropTarget.addEventListener('dragleave', (event) => {
    if (!(event.relatedTarget instanceof Node) || !dropTarget.contains(event.relatedTarget)) dropTarget.removeAttribute('data-dragging');
  });
  dropTarget.addEventListener('drop', (event) => {
    event.preventDefault();
    dropTarget.removeAttribute('data-dragging');
    if (busy || edition) return;
    const files = event.dataTransfer?.files;
    const file = files?.[0];
    if (files?.length !== 1 || !file || !/\.pdf$/i.test(file.name)) {
      selection.textContent = 'Pilih satu file PDF.';
      return;
    }
    pdfInput.files = files;
    showFile();
  });
  showFile();

  function updateProgress() {
    const total = pdf?.numPages ?? 0;
    progress.max = total || 1;
    progress.value = ready.size;
    count.textContent = `${ready.size} / ${total} halaman`;
    publish.disabled = busy || published || !total || ready.size !== total;
    for (const { retry } of rows.values()) retry.disabled = busy || published;
  }

  async function uploadPage(number: number) {
    const row = rows.get(number)!;
    row.retry.hidden = true;
    row.message.textContent = 'Menyiapkan halaman…';
    let page: PDFPageProxy | undefined;
    try {
      page = await pdf!.getPage(number);
      const textContent = await page.getTextContent();
      const text = textContent.items.map((item) => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').slice(0, 30_000);
      const blob = await pageWebp(page);
      const target = await editionRequest('target', { edition, page: number });
      if (!target.stored) {
        row.message.textContent = 'Mengunggah…';
        const url = new URL(target.url, window.location.href);
        const response = await fetch(url, {
          method: 'PUT', headers: target.headers, body: blob,
          credentials: url.origin === window.location.origin ? 'same-origin' : 'omit',
        });
        await response.arrayBuffer();
        // A create-only upload may already exist if a prior response was lost.
        if (!response.ok && response.status !== 412) throw new Error('Upload gagal. Coba lagi.');
      }
      await editionRequest('confirm', { edition, page: number, text });
      ready.add(number);
      row.message.textContent = 'Terkonfirmasi';
    } catch (error) {
      row.message.textContent = (error as Error).message;
      row.retry.hidden = false;
    } finally {
      page?.cleanup();
      updateProgress();
    }
  }

  async function runQueue(queue: number[]) {
    if (busy || published) return;
    busy = true;
    updateProgress();
    let cursor = 0;
    try {
      await Promise.all(Array.from({ length: Math.min(queue.length, maxUploadWorkers) }, async () => {
        while (cursor < queue.length) await uploadPage(queue[cursor++]);
      }));
    } finally { busy = false; updateProgress(); }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (busy || edition) return;
    const fields = new FormData(form);
    const file = fields.get('pdf');
    if (!(file instanceof File) || !file.size || file.size > maxPdfBytes) {
      status.textContent = 'Pilih PDF dengan ukuran maksimal 100 MB.';
      return;
    }
    start.disabled = true;
    status.textContent = 'Membuka PDF…';
    try {
      const data = await file.arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', data);
      const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
      const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist');
      GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      loadingTask = getDocument({
        data: new Uint8Array(data), maxImageSize: 40_000_000,
        cMapUrl: '/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: '/pdfjs/standard_fonts/',
        wasmUrl: '/pdfjs/wasm/', iccUrl: '/pdfjs/iccs/',
      });
      pdf = await loadingTask.promise;
      if (pdf.numPages > 5000) throw new Error('Jumlah halaman PDF melebihi 5.000.');
      const draft = await editionRequest('start', {
        existing: form.dataset.existing || null, title: fields.get('title'), author: fields.get('author'),
        synopsis: fields.get('synopsis'), categories: fields.get('categories'), pages: pdf.numPages, hash,
      });
      edition = draft.edition;
      for (const number of draft.confirmed) ready.add(number);
      const staging = document.createDocumentFragment();
      const queue: number[] = [];
      for (let number = 1; number <= pdf.numPages; number++) {
        const item = document.createElement('li');
        item.className = 'flex flex-wrap items-center gap-3 py-2 text-sm';
        const label = document.createElement('strong');
        label.textContent = `Halaman ${number}`;
        const message = document.createElement('span');
        message.textContent = ready.has(number) ? 'Terkonfirmasi' : 'Menunggu';
        const retry = document.createElement('button');
        retry.type = 'button';
        retry.className = 'underline';
        retry.textContent = 'Coba lagi';
        retry.hidden = true;
        retry.addEventListener('click', () => void runQueue([number]));
        item.append(label, message, retry);
        staging.append(item);
        rows.set(number, { message, retry });
        if (!ready.has(number)) queue.push(number);
      }
      list.replaceChildren(staging);
      container.hidden = false;
      form.hidden = true;
      status.textContent = '';
      await runQueue(queue);
    } catch (error) {
      status.textContent = (error as Error).message;
      if (!edition) {
        await loadingTask?.destroy().catch(() => {});
        pdf = undefined;
        start.disabled = false;
      }
    }
  });

  publish.addEventListener('click', async () => {
    if (busy || published || !pdf || ready.size !== pdf.numPages) return;
    busy = true;
    updateProgress();
    status.textContent = 'Memfinalisasi edisi…';
    try {
      const result = await editionRequest('finalize', { edition });
      published = true;
      if (phase) phase.textContent = 'Edisi terbit';
      link.href = '/books/' + encodeURIComponent(result.slug) + '/';
      link.hidden = false;
      status.textContent = result.cleanup?.some((entry: { done?: boolean }) => !entry.done)
        ? 'Edisi terbit. Pembersihan edisi lama dapat dilanjutkan dari katalog admin.'
        : 'Edisi terbit.';
      await loadingTask?.destroy().catch(() => {});
    } catch (error) {
      status.textContent = (error as Error).message;
    } finally { busy = false; updateProgress(); }
  });
}
