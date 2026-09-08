'use strict';

    // PDF.js is pinned and copied into this deployment during the build.
    window.signtrailPdfJsReady ||= Promise.resolve(window.pdfjsLib || null);

    const MAX_FILE_BYTES = 25 * 1024 * 1024;
    const FIELD_DEFS = {
      signature: { label: 'Signature', placeholder: 'Click to sign', width: 0.28, height: 0.075, ink: true },
      initials: { label: 'Initials', placeholder: 'Click to initial', width: 0.15, height: 0.065, ink: true },
      print_name: { label: 'Print name', placeholder: 'Enter printed name', width: 0.28, height: 0.055, inputType: 'text', maxLength: 200 },
      date: { label: 'Date', placeholder: 'Enter date', width: 0.18, height: 0.05, inputType: 'date', maxLength: 10 },
      email: { label: 'Email', placeholder: 'Enter email', width: 0.28, height: 0.055, inputType: 'email', maxLength: 254 },
      address: { label: 'Address', placeholder: 'Enter address', width: 0.34, height: 0.095, multiline: true, maxLength: 500 },
      text: { label: 'Text', placeholder: 'Enter text', width: 0.28, height: 0.06, multiline: true, maxLength: 1000 },
      checkbox: { label: 'Checkbox', placeholder: 'Check box', width: 0.075, height: 0.06, checkbox: true }
    };
    const TOOL_ELEMENTS = () => Array.from(document.querySelectorAll('[data-tool]'));
    const state = {
      file: null,
      originalBytes: null,
      originalHash: '',
      pdf: null,
      pageSizes: [],
      fields: [],
      events: [],
      activeTool: null,
      selectedFieldId: null,
      signatureTargetId: null,
      signatureHasInk: false,
      resizeTimer: null,
      finalized: false,
      preparedForRecipient: false,
      finalizedAt: '',
      verificationId: '',
      signedBytes: null,
      signedHash: '',
      proofCapsule: null,
      preparedBytes: null,
      preparedHash: '',
      verifierReturn: 'landing',
      verifyPdfFile: null,
      verifyCapsuleFile: null,
      historyRecords: [],
      workflowMode: 'self',
      recipientMode: false,
      recipientToken: '',
      recipientEnvelopeId: '',
      recipientEmail: '',
      recipientAuthenticatedEmail: '',
      recipientAuthenticatedName: '',
      fieldValueTargetId: null,
      lastShareUrl: '',
      lastManageToken: '',
      hostedRequests: []
    };

    const el = {
      landing: document.getElementById('landing'),
      verifier: document.getElementById('verifier'),
      app: document.getElementById('app'),
      openVerifierButton: document.getElementById('openVerifierButton'),
      openHistoryButton: document.getElementById('openHistoryButton'),
      backFromVerifierButton: document.getElementById('backFromVerifierButton'),
      verifyPdfCard: document.getElementById('verifyPdfCard'),
      verifyCapsuleCard: document.getElementById('verifyCapsuleCard'),
      chooseVerifyPdfButton: document.getElementById('chooseVerifyPdfButton'),
      chooseVerifyCapsuleButton: document.getElementById('chooseVerifyCapsuleButton'),
      verifyPdfInput: document.getElementById('verifyPdfInput'),
      verifyCapsuleInput: document.getElementById('verifyCapsuleInput'),
      verifyPdfName: document.getElementById('verifyPdfName'),
      verifyCapsuleName: document.getElementById('verifyCapsuleName'),
      runVerificationButton: document.getElementById('runVerificationButton'),
      verificationResult: document.getElementById('verificationResult'),
      verificationResultKicker: document.getElementById('verificationResultKicker'),
      verificationResultTitle: document.getElementById('verificationResultTitle'),
      verificationResultMessage: document.getElementById('verificationResultMessage'),
      verificationResultDetails: document.getElementById('verificationResultDetails'),
      uploadZone: document.getElementById('uploadZone'),
      chooseFileButton: document.getElementById('chooseFileButton'),
      fileInput: document.getElementById('fileInput'),
      landingError: document.getElementById('landingError'),
      documentTitle: document.getElementById('documentTitle'),
      documentSubtitle: document.getElementById('documentSubtitle'),
      historyTopButton: document.getElementById('historyTopButton'),
      newDocumentButton: document.getElementById('newDocumentButton'),
      exportButton: document.getElementById('exportButton'),
      signatureTool: document.getElementById('signatureTool'),
      initialsTool: document.getElementById('initialsTool'),
      printNameTool: document.getElementById('printNameTool'),
      dateTool: document.getElementById('dateTool'),
      emailTool: document.getElementById('emailTool'),
      addressTool: document.getElementById('addressTool'),
      textTool: document.getElementById('textTool'),
      checkboxTool: document.getElementById('checkboxTool'),
      selfModeButton: document.getElementById('selfModeButton'),
      recipientModeButton: document.getElementById('recipientModeButton'),
      shareCard: document.getElementById('shareCard'),
      recipientBanner: document.getElementById('recipientBanner'),
      viewer: document.getElementById('viewer'),
      documentStack: document.getElementById('documentStack'),
      pageCount: document.getElementById('pageCount'),
      fieldCount: document.getElementById('fieldCount'),
      signedCount: document.getElementById('signedCount'),
      requiredCount: document.getElementById('requiredCount'),
      documentState: document.getElementById('documentState'),
      hashBox: document.getElementById('hashBox'),
      signedHashTitle: document.getElementById('signedHashTitle'),
      signedHashBox: document.getElementById('signedHashBox'),
      eventList: document.getElementById('eventList'),
      placeTip: document.getElementById('placeTip'),
      signatureModal: document.getElementById('signatureModal'),
      signatureModalTitle: document.getElementById('signatureModalTitle'),
      closeSignatureModal: document.getElementById('closeSignatureModal'),
      cancelSignatureButton: document.getElementById('cancelSignatureButton'),
      clearSignatureButton: document.getElementById('clearSignatureButton'),
      undoSignatureButton: document.getElementById('undoSignatureButton'),
      redoSignatureButton: document.getElementById('redoSignatureButton'),
      signatureStrokeStatus: document.getElementById('signatureStrokeStatus'),
      applySignatureButton: document.getElementById('applySignatureButton'),
      signaturePad: document.getElementById('signaturePad'),
      fieldValueModal: document.getElementById('fieldValueModal'),
      fieldValueModalTitle: document.getElementById('fieldValueModalTitle'),
      closeFieldValueModal: document.getElementById('closeFieldValueModal'),
      cancelFieldValueButton: document.getElementById('cancelFieldValueButton'),
      clearFieldValueButton: document.getElementById('clearFieldValueButton'),
      applyFieldValueButton: document.getElementById('applyFieldValueButton'),
      fieldValueInput: document.getElementById('fieldValueInput'),
      fieldValueTextarea: document.getElementById('fieldValueTextarea'),
      fieldValueTextareaLabel: document.getElementById('fieldValueTextareaLabel'),
      fieldValueLabel: document.getElementById('fieldValueLabel'),
      fieldRequiredLabel: document.getElementById('fieldRequiredLabel'),
      fieldRequiredInput: document.getElementById('fieldRequiredInput'),
      shareModal: document.getElementById('shareModal'),
      shareModalTitle: document.getElementById('shareModalTitle'),
      shareAuthStatus: document.getElementById('shareAuthStatus'),
      closeShareModal: document.getElementById('closeShareModal'),
      cancelShareButton: document.getElementById('cancelShareButton'),
      createShareLinkButton: document.getElementById('createShareLinkButton'),
      shareRecipientEmail: document.getElementById('shareRecipientEmail'),
      shareRequestTitle: document.getElementById('shareRequestTitle'),
      shareMessage: document.getElementById('shareMessage'),
      shareResult: document.getElementById('shareResult'),
      shareLinkOutput: document.getElementById('shareLinkOutput'),
      copyShareLinkButton: document.getElementById('copyShareLinkButton'),
      emailShareLinkButton: document.getElementById('emailShareLinkButton'),
      openShareLinkButton: document.getElementById('openShareLinkButton'),
      completionModal: document.getElementById('completionModal'),
      closeCompletionModal: document.getElementById('closeCompletionModal'),
      completionVerificationId: document.getElementById('completionVerificationId'),
      completionTime: document.getElementById('completionTime'),
      completionOriginalHash: document.getElementById('completionOriginalHash'),
      completionSignedHash: document.getElementById('completionSignedHash'),
      downloadSignedPdfButton: document.getElementById('downloadSignedPdfButton'),
      downloadProofCapsuleButton: document.getElementById('downloadProofCapsuleButton'),
      verifyCurrentPackageButton: document.getElementById('verifyCurrentPackageButton'),
      exportHandoffButton: document.getElementById('exportHandoffButton'),
      historyModal: document.getElementById('historyModal'),
      closeHistoryModal: document.getElementById('closeHistoryModal'),
      closeHistoryFooterButton: document.getElementById('closeHistoryFooterButton'),
      clearHistoryButton: document.getElementById('clearHistoryButton'),
      historyList: document.getElementById('historyList'),
      hostedList: document.getElementById('hostedList'),
      refreshHostedButton: document.getElementById('refreshHostedButton'),
      loadingOverlay: document.getElementById('loadingOverlay'),
      loadingText: document.getElementById('loadingText'),
      toast: document.getElementById('toast')
    };

    let sigCtx = null;
    let sigDpr = 1;
    let sigDrawing = false;
    let sigPointerId = null;
    let sigActiveStroke = null;
    let sigStrokes = [];
    let sigRedoStrokes = [];
    let toastTimer = null;
    let historyDbPromise = null;

    function showError(message) {
      el.landingError.textContent = message;
      el.landingError.classList.remove('hidden');
    }

    function clearError() {
      el.landingError.textContent = '';
      el.landingError.classList.add('hidden');
    }

    function setLoading(visible, text = 'Working…') {
      el.loadingText.textContent = text;
      el.loadingOverlay.classList.toggle('hidden', !visible);
    }

    function showToast(message) {
      window.clearTimeout(toastTimer);
      el.toast.textContent = message;
      el.toast.classList.remove('hidden');
      toastTimer = window.setTimeout(() => el.toast.classList.add('hidden'), 3300);
    }

    function makeId(prefix) {
      const random = crypto.getRandomValues(new Uint32Array(2));
      return `${prefix}-${Date.now().toString(36)}-${random[0].toString(36)}${random[1].toString(36)}`;
    }

    function addEvent(type, title, detail = {}) {
      state.events.unshift({ id: makeId('event'), type, title, timestamp: new Date().toISOString(), ...detail });
      renderEvents();
    }

    function renderEvents() {
      if (!state.events.length) {
        el.eventList.innerHTML = '<div class="empty-events">Events will appear as you work.</div>';
        return;
      }
      el.eventList.replaceChildren(...state.events.slice(0, 12).map(event => {
        const node = document.createElement('article');
        node.className = 'event';
        const title = document.createElement('div');
        title.className = 'event-title';
        title.textContent = event.title;
        const time = document.createElement('div');
        time.className = 'event-time';
        time.textContent = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(event.timestamp));
        node.append(title, time);
        return node;
      }));
    }

    async function sha256Hex(bytes) {
      const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      const digest = await crypto.subtle.digest('SHA-256', source);
      return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    }

    function canonicalize(value) {
      if (value === null || typeof value !== 'object') return JSON.stringify(value);
      if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
      return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(',')}}`;
    }

    function formatDateTime(iso) {
      const date = new Date(iso);
      return Number.isNaN(date.getTime()) ? 'Unknown' : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium', timeStyle: 'short'
      }).format(date);
    }

    function createVerificationId() {
      const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
      const random = crypto.getRandomValues(new Uint8Array(5));
      const token = Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
      return `ST-${date}-${token}`;
    }

    function downloadBlob(blob, fileName) {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1800);
    }

    function downloadBytes(bytes, type, fileName) {
      downloadBlob(new Blob([bytes], { type }), fileName);
    }

    function safeBaseName(name = 'document.pdf') {
      return name.replace(/\.pdf$/i, '').replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '') || 'document';
    }

    function proofCapsuleBytes(capsule) {
      return new TextEncoder().encode(`${JSON.stringify(capsule, null, 2)}\n`);
    }

    async function exportHandoffBundle({ signedBytes, proofCapsule, documentName, verificationId }) {
      if (!signedBytes || !proofCapsule) throw new Error('The signed PDF and Integrity receipt are required for handoff.');
      const bytes = signedBytes instanceof Uint8Array ? signedBytes : new Uint8Array(signedBytes);
      const base = safeBaseName(documentName);
      const pdfName = `${base}-signed.pdf`;
      const proofName = `${base}-${verificationId}-integrity-receipt.json`;
      const readme = [
        'SIGNTRAIL SIGNED DOCUMENT HANDOFF',
        '',
        `Document: ${documentName}`,
        `Verification ID: ${verificationId}`,
        `Completed: ${formatDateTime(proofCapsule.completedAt)}`,
        '',
        'Files in this bundle:',
        `- ${pdfName}: the exact finalized signed PDF`,
        `- ${proofName}: the matching SignTrail Integrity receipt`,
        '',
        'To verify: open SignTrail, choose Verify a signed document, and select both files.',
        'Verification confirms an exact byte-for-byte document match. It does not authenticate legal identity or guarantee enforceability.'
      ].join('\n');

      if (window.JSZip) {
        const zip = new window.JSZip();
        zip.file(pdfName, bytes);
        zip.file(proofName, proofCapsuleBytes(proofCapsule));
        zip.file('VERIFY_THIS_PACKAGE.txt', readme);
        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        downloadBlob(blob, `${base}-${verificationId}-handoff.zip`);
        return 'zip';
      }

      downloadBytes(bytes, 'application/pdf', pdfName);
      downloadBytes(proofCapsuleBytes(proofCapsule), 'application/json', proofName);
      downloadBytes(new TextEncoder().encode(readme), 'text/plain', 'VERIFY_THIS_PACKAGE.txt');
      return 'files';
    }

    function openHistoryDb() {
      if (!('indexedDB' in window)) return Promise.reject(new Error('IndexedDB is unavailable in this browser.'));
      if (historyDbPromise) return historyDbPromise;
      historyDbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open('signtrail-local-history', 1);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('signedDocuments')) {
            const store = db.createObjectStore('signedDocuments', { keyPath: 'verificationId' });
            store.createIndex('finalizedAt', 'finalizedAt');
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Could not open signed document history.'));
      });
      return historyDbPromise;
    }

    async function historyPut(record) {
      const db = await openHistoryDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('signedDocuments', 'readwrite');
        tx.objectStore('signedDocuments').put(record);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('Could not save signed document history.'));
        tx.onabort = () => reject(tx.error || new Error('History save was aborted.'));
      });
      await trimHistory(20);
    }

    async function historyGetAll() {
      const db = await openHistoryDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction('signedDocuments', 'readonly');
        const request = tx.objectStore('signedDocuments').getAll();
        request.onsuccess = () => resolve((request.result || []).sort((a, b) => String(b.finalizedAt).localeCompare(String(a.finalizedAt))));
        request.onerror = () => reject(request.error || new Error('Could not load signed document history.'));
      });
    }

    async function historyDelete(verificationId) {
      const db = await openHistoryDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('signedDocuments', 'readwrite');
        tx.objectStore('signedDocuments').delete(verificationId);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('Could not delete the history record.'));
      });
    }

    async function historyClear() {
      const db = await openHistoryDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('signedDocuments', 'readwrite');
        tx.objectStore('signedDocuments').clear();
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error || new Error('Could not clear signed document history.'));
      });
    }

    async function trimHistory(limit) {
      const records = await historyGetAll();
      for (const record of records.slice(limit)) await historyDelete(record.verificationId);
    }

    async function saveCurrentPackageToHistory() {
      if (!state.finalized || !state.signedBytes || !state.proofCapsule) return false;
      await historyPut({
        verificationId: state.verificationId,
        documentName: state.file.name,
        finalizedAt: state.finalizedAt,
        originalHash: state.originalHash,
        signedHash: state.signedHash,
        pageCount: state.pdf.numPages,
        signedBytes: state.signedBytes,
        proofCapsule: state.proofCapsule
      });
      return true;
    }

    function capsuleFileName() {
      const baseName = (state.file?.name || 'document.pdf').replace(/\.pdf$/i, '');
      return `${baseName}-${state.verificationId || 'integrity'}-integrity-receipt.json`;
    }

    function validateFile(file) {
      if (!file) return 'No file was selected.';
      const looksLikePdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (!looksLikePdf) return 'Choose a PDF file to continue.';
      if (file.size <= 0) return 'This PDF appears to be empty.';
      if (file.size > MAX_FILE_BYTES) return 'This PDF is larger than the 25 MB limit for this build.';
      return '';
    }

    async function openPdf(file) {
      const problem = validateFile(file);
      if (problem) {
        showError(problem);
        return;
      }

      clearError();
      setLoading(true, 'Opening PDF…');
      try {
        if (window.signtrailPdfJsReady) await window.signtrailPdfJsReady;
        if (!window.pdfjsLib || !window.PDFLib) {
          throw new Error('Required local PDF libraries did not load. Reload the application and try again.');
        }

        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const loadingTask = window.pdfjsLib.getDocument({
          data: bytes.slice(),
          disableJavaScript: true,
          enableXfa: false,
          isEvalSupported: false,
          cMapUrl: '/vendor/pdfjs/cmaps/',
          cMapPacked: true,
          iccUrl: '/vendor/pdfjs/iccs/',
          standardFontDataUrl: '/vendor/pdfjs/standard_fonts/',
          wasmUrl: '/vendor/pdfjs/wasm/',
          useWorkerFetch: true
        });
        const pdf = await loadingTask.promise;

        state.file = file;
        state.originalBytes = bytes;
        state.pdf = pdf;
        state.pageSizes = [];
        state.fields = [];
        state.events = [];
        state.activeTool = null;
        state.selectedFieldId = null;
        state.finalized = false;
        state.preparedForRecipient = false;
        state.finalizedAt = '';
        state.verificationId = '';
        state.signedBytes = null;
        state.signedHash = '';
        state.proofCapsule = null;
        state.preparedBytes = null;
        state.preparedHash = '';
        state.workflowMode = 'self';
        state.recipientMode = false;
        state.recipientToken = '';
        state.recipientEnvelopeId = '';
        state.recipientEmail = '';
        state.recipientAuthenticatedEmail = '';
        state.recipientAuthenticatedName = '';
        state.recipientCompleted = false;
        state.recipientSignedPdfUrl = '';
        state.recipientProofCapsuleUrl = '';
        state.fieldValueTargetId = null;
        state.lastShareUrl = '';
        state.lastManageToken = '';
        setWorkflowMode('self');

        el.documentTitle.textContent = file.name;
        el.documentSubtitle.textContent = `${pdf.numPages} page${pdf.numPages === 1 ? '' : 's'} · Prepare, fill, or send for signature`;
        el.pageCount.textContent = String(pdf.numPages);
        el.hashBox.textContent = 'Calculating…';

        state.originalHash = await sha256Hex(bytes);
        el.hashBox.textContent = state.originalHash;
        addEvent('document_uploaded', 'Document uploaded');
        addEvent('fingerprint_created', 'Original fingerprint created');

        el.landing.classList.add('hidden');
        el.app.classList.remove('hidden');
        await renderDocument();
        updateStatus();
      } catch (error) {
        console.error(error);
        const message = String(error?.message || error);
        if (/password/i.test(message)) {
          showError('Password-protected PDFs are not supported in this build.');
        } else {
          showError(message.startsWith('Required PDF') ? message : 'The PDF could not be opened. It may be damaged or unsupported.');
        }
        el.landing.classList.remove('hidden');
        el.app.classList.add('hidden');
      } finally {
        setLoading(false);
        el.fileInput.value = '';
      }
    }

    async function renderDocument() {
      if (!state.pdf) return;
      const savedScrollTop = el.viewer.scrollTop;
      const availableWidth = Math.max(300, el.viewer.clientWidth - 56);
      const fragment = document.createDocumentFragment();
      state.pageSizes = [];

      for (let pageIndex = 0; pageIndex < state.pdf.numPages; pageIndex += 1) {
        const page = await state.pdf.getPage(pageIndex + 1);
        const baseViewport = page.getViewport({ scale: 1 });
        const cssScale = Math.min(1.35, availableWidth / baseViewport.width);
        const viewport = page.getViewport({ scale: cssScale });
        const dpr = Math.min(window.devicePixelRatio || 1, 2);

        const pageWrap = document.createElement('section');
        pageWrap.className = 'page-wrap';
        pageWrap.dataset.pageIndex = String(pageIndex);

        const label = document.createElement('div');
        label.className = 'page-number';
        label.textContent = `Page ${pageIndex + 1}`;

        const shell = document.createElement('div');
        shell.className = 'page-shell';
        shell.style.width = `${viewport.width}px`;
        shell.style.height = `${viewport.height}px`;
        shell.dataset.pageIndex = String(pageIndex);

        const canvas = document.createElement('canvas');
        canvas.className = 'pdf-canvas';
        canvas.width = Math.floor(viewport.width * dpr);
        canvas.height = Math.floor(viewport.height * dpr);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        const layer = document.createElement('div');
        layer.className = 'field-layer';
        layer.dataset.pageIndex = String(pageIndex);

        shell.append(canvas, layer);
        pageWrap.append(label, shell);
        fragment.append(pageWrap);
        state.pageSizes.push({ cssWidth: viewport.width, cssHeight: viewport.height, pdfWidth: baseViewport.width, pdfHeight: baseViewport.height });

        const context = canvas.getContext('2d', { alpha: false });
        await page.render({ canvasContext: context, viewport, transform: dpr === 1 ? null : [dpr, 0, 0, dpr, 0, 0] }).promise;
      }

      el.documentStack.replaceChildren(fragment);
      renderAllFields();
      el.viewer.scrollTop = savedScrollTop;
    }

    function setWorkflowMode(mode) {
      if (state.recipientMode || state.finalized) return;
      state.workflowMode = mode === 'recipient' ? 'recipient' : 'self';
      el.selfModeButton.classList.toggle('active', state.workflowMode === 'self');
      el.recipientModeButton.classList.toggle('active', state.workflowMode === 'recipient');
      showToast(state.workflowMode === 'recipient' ? 'New fields will be left blank for the recipient.' : 'New fields will be completed in this browser.');
    }

    function setActiveTool(tool) {
      if (state.finalized) return;
      state.activeTool = tool && FIELD_DEFS[tool] ? tool : null;
      for (const button of TOOL_ELEMENTS()) {
        const active = button.dataset.tool === state.activeTool;
        button.classList.toggle('active', active);
        button.setAttribute('aria-pressed', String(active));
      }
      el.viewer.classList.toggle('place-mode', Boolean(state.activeTool));
      el.placeTip.classList.toggle('hidden', !state.activeTool);
      if (state.activeTool) el.placeTip.textContent = `Click a page to place ${FIELD_DEFS[state.activeTool].label.toLowerCase()} · Esc to cancel`;
    }

    function cancelPlacement() {
      setActiveTool(null);
    }

    function addField(pageIndex, xNorm, yNorm, type = state.activeTool) {
      const def = FIELD_DEFS[type];
      if (!def) return;
      const width = def.width;
      const height = def.height;
      const assignedTo = state.recipientMode ? 'recipient' : state.workflowMode;
      const field = {
        id: makeId('field'),
        type,
        pageIndex,
        x: Math.max(0, Math.min(1 - width, xNorm - width / 2)),
        y: Math.max(0, Math.min(1 - height, yNorm - height / 2)),
        width,
        height,
        assignedTo,
        required: assignedTo === 'recipient',
        value: '',
        signatureDataUrl: null,
        completed: false
      };
      state.fields.push(field);
      state.selectedFieldId = field.id;
      renderAllFields();
      updateStatus();
      addEvent('field_added', `${def.label} field added · Page ${pageIndex + 1}`, { fieldId: field.id, fieldType: type, pageIndex, assignedTo });
      cancelPlacement();
      if (assignedTo === 'self' || state.recipientMode) openFieldEditor(field.id);
      else showToast(`${def.label} field left blank for the recipient.`);
    }

    function renderAllFields() {
      document.querySelectorAll('.field-layer').forEach(layer => layer.replaceChildren());
      for (const field of state.fields) renderField(field);
    }

    function fieldDisplayValue(field) {
      const def = FIELD_DEFS[field.type] || FIELD_DEFS.text;
      if (def.checkbox) return field.completed ? '✓' : '□';
      return field.value || '';
    }

    function openFieldEditor(fieldId) {
      const field = state.fields.find(item => item.id === fieldId);
      if (!field || state.finalized) return;
      const def = FIELD_DEFS[field.type] || FIELD_DEFS.text;
      if (def.ink) {
        openSignatureModal(fieldId);
        return;
      }
      if (def.checkbox) {
        field.completed = !field.completed;
        field.value = field.completed ? 'checked' : '';
        renderAllFields();
        updateStatus();
        addEvent(field.completed ? 'field_completed' : 'field_cleared', `${def.label} ${field.completed ? 'checked' : 'cleared'} · Page ${field.pageIndex + 1}`, { fieldId: field.id, fieldType: field.type, pageIndex: field.pageIndex });
        return;
      }
      state.fieldValueTargetId = fieldId;
      el.fieldValueModalTitle.textContent = `Complete ${def.label.toLowerCase()}`;
      el.fieldValueLabel.textContent = def.label;
      el.fieldValueInput.type = def.inputType || 'text';
      el.fieldValueInput.maxLength = Number(def.maxLength || 1000);
      el.fieldValueTextarea.maxLength = Number(def.maxLength || 1000);
      el.fieldValueInput.value = def.multiline ? '' : (field.value || (field.type === 'date' ? new Date().toISOString().slice(0, 10) : ''));
      el.fieldValueTextarea.value = def.multiline ? (field.value || '') : '';
      el.fieldValueTextareaLabel.classList.toggle('hidden', !def.multiline);
      el.fieldValueInput.parentElement.classList.toggle('hidden', Boolean(def.multiline));
      el.fieldRequiredInput.checked = Boolean(field.required);
      el.fieldRequiredLabel.classList.toggle('hidden', state.recipientMode);
      el.fieldValueModal.classList.remove('hidden');
      requestAnimationFrame(() => (def.multiline ? el.fieldValueTextarea : el.fieldValueInput).focus());
    }

    function closeFieldValueModal() {
      el.fieldValueModal.classList.add('hidden');
      state.fieldValueTargetId = null;
    }

    function applyFieldValue() {
      const field = state.fields.find(item => item.id === state.fieldValueTargetId);
      if (!field) return;
      const def = FIELD_DEFS[field.type] || FIELD_DEFS.text;
      const maxLength = Number(def.maxLength || 1000);
      const value = String(def.multiline ? el.fieldValueTextarea.value : el.fieldValueInput.value).trim().slice(0, maxLength);
      if (field.type === 'email' && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        showToast('Enter a valid email address.');
        return;
      }
      field.value = value;
      field.completed = Boolean(value);
      if (!state.recipientMode) field.required = el.fieldRequiredInput.checked;
      closeFieldValueModal();
      renderAllFields();
      updateStatus();
      addEvent(field.completed ? 'field_completed' : 'field_cleared', `${def.label} ${field.completed ? 'completed' : 'cleared'} · Page ${field.pageIndex + 1}`, { fieldId: field.id, fieldType: field.type, pageIndex: field.pageIndex });
    }

    function clearFieldValue() {
      const field = state.fields.find(item => item.id === state.fieldValueTargetId);
      if (!field) return;
      field.value = '';
      field.completed = false;
      closeFieldValueModal();
      renderAllFields();
      updateStatus();
      addEvent('field_cleared', `${(FIELD_DEFS[field.type] || FIELD_DEFS.text).label} cleared · Page ${field.pageIndex + 1}`, { fieldId: field.id, fieldType: field.type, pageIndex: field.pageIndex });
    }

    function renderField(field) {
      const layer = document.querySelector(`.field-layer[data-page-index="${field.pageIndex}"]`);
      if (!layer) return;
      const def = FIELD_DEFS[field.type] || FIELD_DEFS.text;
      const isRecipient = field.assignedTo === 'recipient';
      const editable = !state.finalized && (!state.recipientMode || isRecipient);

      const node = document.createElement('div');
      node.className = `signature-field field-type-${field.type}${field.completed ? ' signed' : ''}${state.selectedFieldId === field.id ? ' selected' : ''}${state.finalized ? ' locked' : ''}${isRecipient ? ' recipient-field' : ' owner-field'}${field.required ? ' required' : ''}`;
      node.dataset.fieldId = field.id;
      node.style.left = `${field.x * 100}%`;
      node.style.top = `${field.y * 100}%`;
      node.style.width = `${field.width * 100}%`;
      node.style.height = `${field.height * 100}%`;

      const drag = document.createElement('div');
      drag.className = 'drag-handle';
      drag.textContent = '⋮';
      drag.title = editable ? 'Drag field' : 'Field position locked';

      const main = document.createElement('button');
      main.type = 'button';
      main.className = `field-main${def.checkbox ? ' field-checkbox' : ''}${!def.ink && !def.checkbox ? ' field-text-value' : ''}`;
      main.setAttribute('aria-label', editable && !(isRecipient && !state.recipientMode) ? `Complete ${def.label}` : `${def.label} field`);
      main.disabled = !editable || (isRecipient && !state.recipientMode);
      if (def.ink && field.completed && field.signatureDataUrl) {
        const image = document.createElement('img');
        image.src = field.signatureDataUrl;
        image.alt = `Applied ${def.label.toLowerCase()}`;
        main.append(image);
      } else if (field.completed) {
        const value = document.createElement('span');
        value.textContent = fieldDisplayValue(field);
        main.append(value);
      } else {
        const label = document.createElement('span');
        label.className = 'field-placeholder';
        label.textContent = isRecipient && !state.recipientMode ? `${def.label} · recipient` : def.placeholder;
        if (!state.recipientMode) {
          const assignee = document.createElement('span');
          assignee.className = 'field-assignee';
          assignee.textContent = isRecipient ? 'Recipient fills' : 'Fill now';
          label.append(assignee);
        }
        main.append(label);
      }

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'field-delete';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Delete ${def.label.toLowerCase()} field`);
      remove.disabled = !editable || state.recipientMode;

      main.addEventListener('click', event => {
        event.stopPropagation();
        if (!editable) return;
        state.selectedFieldId = field.id;
        renderAllFields();
        openFieldEditor(field.id);
      });
      remove.addEventListener('click', event => {
        event.stopPropagation();
        if (!editable || state.recipientMode) return;
        deleteField(field.id);
      });
      if (editable && !state.recipientMode) drag.addEventListener('pointerdown', event => beginFieldDrag(event, field.id, layer));
      node.addEventListener('pointerdown', () => {
        state.selectedFieldId = field.id;
        document.querySelectorAll('.signature-field.selected').forEach(item => item.classList.remove('selected'));
        node.classList.add('selected');
      });

      node.append(drag, main, remove);
      layer.append(node);
    }

    function beginFieldDrag(event, fieldId, layer) {
      if (state.finalized) return;
      event.preventDefault();
      event.stopPropagation();
      const field = state.fields.find(item => item.id === fieldId);
      if (!field) return;
      const startX = event.clientX;
      const startY = event.clientY;
      const initialX = field.x;
      const initialY = field.y;
      const rect = layer.getBoundingClientRect();
      const handle = event.currentTarget;
      handle.setPointerCapture(event.pointerId);

      const move = moveEvent => {
        const dx = (moveEvent.clientX - startX) / rect.width;
        const dy = (moveEvent.clientY - startY) / rect.height;
        field.x = Math.max(0, Math.min(1 - field.width, initialX + dx));
        field.y = Math.max(0, Math.min(1 - field.height, initialY + dy));
        const node = document.querySelector(`[data-field-id="${CSS.escape(field.id)}"]`);
        if (node) {
          node.style.left = `${field.x * 100}%`;
          node.style.top = `${field.y * 100}%`;
        }
      };

      const end = endEvent => {
        handle.releasePointerCapture(endEvent.pointerId);
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', end);
        handle.removeEventListener('pointercancel', end);
        addEvent('field_moved', `${(FIELD_DEFS[field.type] || FIELD_DEFS.text).label} repositioned · Page ${field.pageIndex + 1}`, { fieldId: field.id, pageIndex: field.pageIndex });
      };

      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', end);
      handle.addEventListener('pointercancel', end);
    }

    function deleteField(fieldId) {
      if (state.finalized) return;
      const index = state.fields.findIndex(item => item.id === fieldId);
      if (index < 0) return;
      const [removed] = state.fields.splice(index, 1);
      if (state.selectedFieldId === fieldId) state.selectedFieldId = null;
      renderAllFields();
      updateStatus();
      addEvent('field_deleted', `${(FIELD_DEFS[removed.type] || FIELD_DEFS.text).label} field removed · Page ${removed.pageIndex + 1}`, { fieldId });
    }

    function updateStatus() {
      const completed = state.fields.filter(field => field.completed).length;
      const requiredLeft = state.fields.filter(field => field.required && !field.completed).length;
      const recipientFields = state.fields.filter(field => field.assignedTo === 'recipient');
      const ownerRequiredLeft = state.fields.filter(field => field.assignedTo !== 'recipient' && field.required && !field.completed).length;
      el.fieldCount.textContent = String(state.fields.length);
      el.signedCount.textContent = String(completed);
      el.requiredCount.textContent = String(requiredLeft);
      el.requiredCount.classList.toggle('good', requiredLeft === 0 || (!state.recipientMode && recipientFields.length > 0 && ownerRequiredLeft === 0));

      let documentState = 'Editing';
      if (state.preparedForRecipient) documentState = 'Awaiting recipient';
      else if (state.finalized && recipientFields.length) documentState = 'Finalized · link pending';
      else if (state.finalized) documentState = 'Finalized';
      else if (state.recipientMode) documentState = 'Recipient signing';
      else if (recipientFields.length) documentState = ownerRequiredLeft ? 'Preparing request' : 'Ready to finalize';
      el.documentState.textContent = documentState;
      el.documentState.classList.toggle('good', state.finalized || state.preparedForRecipient || (state.recipientMode && requiredLeft === 0) || (!state.recipientMode && recipientFields.length > 0 && ownerRequiredLeft === 0));

      for (const button of TOOL_ELEMENTS()) button.disabled = state.finalized || state.recipientMode;
      el.selfModeButton.disabled = state.finalized || state.recipientMode;
      el.recipientModeButton.disabled = state.finalized || state.recipientMode;
      el.shareCard.classList.toggle('hidden', state.recipientMode || state.finalized);

      if (state.recipientCompleted) {
        el.exportButton.disabled = !state.recipientSignedPdfUrl;
        el.exportButton.textContent = 'Download signed PDF';
      } else if (state.preparedForRecipient) {
        el.exportButton.disabled = !state.lastShareUrl;
        el.exportButton.textContent = 'View signee link';
      } else if (state.finalized && recipientFields.length) {
        el.exportButton.disabled = !state.preparedBytes;
        el.exportButton.textContent = 'Create signee link';
      } else if (state.finalized) {
        el.exportButton.disabled = false;
        el.exportButton.textContent = 'View final package';
      } else if (state.recipientMode) {
        el.exportButton.disabled = state.fields.length === 0 || requiredLeft > 0 || completed === 0;
        el.exportButton.textContent = 'Finish signature request';
      } else if (recipientFields.length) {
        el.exportButton.disabled = ownerRequiredLeft > 0;
        el.exportButton.textContent = 'Finalize recipient document';
      } else {
        el.exportButton.disabled = state.fields.length === 0 || requiredLeft > 0 || completed === 0;
        el.exportButton.textContent = 'Finalize signed document';
      }

      el.signedHashTitle.classList.toggle('hidden', !state.signedHash);
      el.signedHashBox.classList.toggle('hidden', !state.signedHash);
      el.signedHashBox.textContent = state.signedHash || '';
      document.body.classList.toggle('recipient-mode', state.recipientMode);
      if (state.preparedForRecipient) {
        cancelPlacement();
        el.documentSubtitle.textContent = `${state.pdf?.numPages || 0} page${state.pdf?.numPages === 1 ? '' : 's'} · Finalized and locked · signee link created`;
      } else if (state.finalized && recipientFields.length) {
        cancelPlacement();
        el.documentSubtitle.textContent = `${state.pdf?.numPages || 0} page${state.pdf?.numPages === 1 ? '' : 's'} · Finalized and locked · create the signee link next`;
      } else if (state.finalized) {
        cancelPlacement();
        el.documentSubtitle.textContent = `${state.pdf?.numPages || 0} page${state.pdf?.numPages === 1 ? '' : 's'} · Finalized · ${state.verificationId}`;
      }
    }

    function prepareSignaturePad() {
      const canvas = el.signaturePad;
      const rect = canvas.getBoundingClientRect();
      sigDpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * sigDpr));
      canvas.height = Math.max(1, Math.floor(rect.height * sigDpr));
      sigCtx = canvas.getContext('2d');
      sigCtx.setTransform(sigDpr, 0, 0, sigDpr, 0, 0);
      sigCtx.lineCap = 'round';
      sigCtx.lineJoin = 'round';
      sigCtx.strokeStyle = '#171821';
      sigCtx.fillStyle = '#171821';
      sigStrokes = [];
      sigRedoStrokes = [];
      sigActiveStroke = null;
      sigDrawing = false;
      sigPointerId = null;
      redrawSignaturePad();
      updateSignatureControls();
    }

    function updateSignatureControls() {
      const strokeCount = sigStrokes.length + (sigActiveStroke?.length ? 1 : 0);
      state.signatureHasInk = strokeCount > 0;
      el.applySignatureButton.disabled = !state.signatureHasInk;
      el.undoSignatureButton.disabled = sigDrawing || sigStrokes.length === 0;
      el.redoSignatureButton.disabled = sigDrawing || sigRedoStrokes.length === 0;
      el.clearSignatureButton.disabled = sigDrawing || strokeCount === 0;
      el.signatureStrokeStatus.textContent = `${strokeCount} stroke${strokeCount === 1 ? '' : 's'} · captured samples are interpolated`;
    }

    function drawStoredStroke(points) {
      if (!sigCtx || !points?.length) return;
      if (points.length === 1) {
        const point = points[0];
        sigCtx.beginPath();
        sigCtx.arc(point.x, point.y, Math.max(1.25, point.width / 2), 0, Math.PI * 2);
        sigCtx.fill();
        return;
      }
      sigCtx.beginPath();
      sigCtx.moveTo(points[0].x, points[0].y);
      for (let index = 1; index < points.length - 1; index += 1) {
        const current = points[index];
        const next = points[index + 1];
        const midX = (current.x + next.x) / 2;
        const midY = (current.y + next.y) / 2;
        sigCtx.quadraticCurveTo(current.x, current.y, midX, midY);
      }
      const last = points[points.length - 1];
      sigCtx.lineTo(last.x, last.y);
      sigCtx.lineWidth = points.reduce((sum, point) => sum + point.width, 0) / points.length;
      sigCtx.stroke();
    }

    function redrawSignaturePad() {
      if (!sigCtx) return;
      const rect = el.signaturePad.getBoundingClientRect();
      sigCtx.clearRect(0, 0, rect.width, rect.height);
      for (const stroke of sigStrokes) drawStoredStroke(stroke);
      if (sigActiveStroke?.length) drawStoredStroke(sigActiveStroke);
    }

    function clearSignaturePad() {
      if (!sigCtx || sigDrawing) return;
      sigStrokes = [];
      sigRedoStrokes = [];
      sigActiveStroke = null;
      redrawSignaturePad();
      updateSignatureControls();
    }

    function undoSignatureStroke() {
      if (sigDrawing || !sigStrokes.length) return;
      sigRedoStrokes.push(sigStrokes.pop());
      redrawSignaturePad();
      updateSignatureControls();
    }

    function redoSignatureStroke() {
      if (sigDrawing || !sigRedoStrokes.length) return;
      sigStrokes.push(sigRedoStrokes.pop());
      redrawSignaturePad();
      updateSignatureControls();
    }

    function signaturePoint(event) {
      const rect = el.signaturePad.getBoundingClientRect();
      const pressure = Number.isFinite(event.pressure) && event.pressure > 0 ? event.pressure : 0.5;
      return {
        x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
        y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
        width: Math.max(2.1, Math.min(4.2, 2.15 + pressure * 2.05))
      };
    }

    function appendInterpolatedSignaturePoint(point) {
      if (!sigActiveStroke) return;
      const previous = sigActiveStroke[sigActiveStroke.length - 1];
      if (!previous) {
        sigActiveStroke.push(point);
        return;
      }
      const dx = point.x - previous.x;
      const dy = point.y - previous.y;
      const distance = Math.hypot(dx, dy);
      if (distance < 0.15) return;
      const steps = Math.max(1, Math.ceil(distance / 2.25));
      for (let step = 1; step <= steps; step += 1) {
        const ratio = step / steps;
        sigActiveStroke.push({
          x: previous.x + dx * ratio,
          y: previous.y + dy * ratio,
          width: previous.width + (point.width - previous.width) * ratio
        });
      }
    }

    function startSignature(event) {
      if (sigDrawing || (event.pointerType === 'mouse' && event.button !== 0)) return;
      event.preventDefault();
      sigDrawing = true;
      sigPointerId = event.pointerId;
      sigRedoStrokes = [];
      sigActiveStroke = [signaturePoint(event)];
      try { el.signaturePad.setPointerCapture(event.pointerId); } catch {}
      redrawSignaturePad();
      updateSignatureControls();
    }

    function drawSignature(event) {
      if (!sigDrawing || !sigCtx || event.pointerId !== sigPointerId) return;
      event.preventDefault();
      const samples = typeof event.getCoalescedEvents === 'function' ? event.getCoalescedEvents() : [];
      const events = samples.length ? samples : [event];
      for (const sample of events) appendInterpolatedSignaturePoint(signaturePoint(sample));
      redrawSignaturePad();
      updateSignatureControls();
    }

    function finishSignatureStroke(event, { releaseCapture = true } = {}) {
      if (!sigDrawing || event.pointerId !== sigPointerId) return;
      if (event.type === 'pointerup') drawSignature(event);
      if (sigActiveStroke?.length) sigStrokes.push(sigActiveStroke);
      sigActiveStroke = null;
      sigDrawing = false;
      const pointerId = sigPointerId;
      sigPointerId = null;
      if (releaseCapture) {
        try { if (el.signaturePad.hasPointerCapture(pointerId)) el.signaturePad.releasePointerCapture(pointerId); } catch {}
      }
      redrawSignaturePad();
      updateSignatureControls();
    }

    function endSignature(event) {
      event.preventDefault();
      finishSignatureStroke(event);
    }

    function openSignatureModal(fieldId) {
      state.signatureTargetId = fieldId;
      const field = state.fields.find(item => item.id === fieldId);
      const def = FIELD_DEFS[field?.type] || FIELD_DEFS.signature;
      el.signatureModalTitle.textContent = `Draw your ${def.label.toLowerCase()}`;
      el.signatureModal.classList.remove('hidden');
      requestAnimationFrame(() => prepareSignaturePad());
    }

    function closeSignatureModal() {
      el.signatureModal.classList.add('hidden');
      state.signatureTargetId = null;
      sigDrawing = false;
      sigPointerId = null;
      sigActiveStroke = null;
    }

    function applySignature() {
      if (!state.signatureHasInk || !state.signatureTargetId) return;
      const field = state.fields.find(item => item.id === state.signatureTargetId);
      if (!field) return;
      redrawSignaturePad();
      field.signatureDataUrl = el.signaturePad.toDataURL('image/png');
      field.completed = true;
      state.selectedFieldId = field.id;
      closeSignatureModal();
      renderAllFields();
      updateStatus();
      const def = FIELD_DEFS[field.type] || FIELD_DEFS.signature;
      addEvent('signature_applied', `${def.label} applied · Page ${field.pageIndex + 1}`, { fieldId: field.id, fieldType: field.type, pageIndex: field.pageIndex });
      showToast(`${def.label} applied. Pen samples were smoothed and gaps interpolated.`);
    }

    function dataUrlToUint8Array(dataUrl) {
      const base64 = dataUrl.split(',')[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }

    function wrapText(text, font, fontSize, maxWidth) {
      const paragraphs = String(text || '').split(/\r?\n/);
      const lines = [];
      for (const paragraph of paragraphs) {
        const words = paragraph.split(/\s+/).filter(Boolean);
        if (!words.length) { lines.push(''); continue; }
        let line = '';
        for (const word of words) {
          const candidate = line ? `${line} ${word}` : word;
          if (!line || font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) line = candidate;
          else { lines.push(line); line = word; }
        }
        if (line) lines.push(line);
      }
      return lines;
    }

    async function buildPdfBytes({ include = () => true } = {}) {
      const completedFields = state.fields.filter(field => field.completed && include(field));
      if (!state.originalBytes) throw new Error('No source PDF is loaded.');

      const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
      const pdfDoc = await PDFDocument.load(state.originalBytes.slice());
      const pages = pdfDoc.getPages();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      for (const field of completedFields) {
        const page = pages[field.pageIndex];
        if (!page) continue;
        const def = FIELD_DEFS[field.type] || FIELD_DEFS.text;
        const pageSize = page.getSize();
        const box = {
          x: field.x * pageSize.width,
          y: pageSize.height - ((field.y + field.height) * pageSize.height),
          width: field.width * pageSize.width,
          height: field.height * pageSize.height
        };

        if (def.ink && field.signatureDataUrl) {
          const pngBytes = dataUrlToUint8Array(field.signatureDataUrl);
          const png = await pdfDoc.embedPng(pngBytes);
          const imageRatio = png.width / png.height;
          const boxRatio = box.width / box.height;
          let drawWidth = box.width * 0.94;
          let drawHeight = box.height * 0.84;
          if (imageRatio > boxRatio) drawHeight = drawWidth / imageRatio;
          else drawWidth = drawHeight * imageRatio;
          page.drawImage(png, { x: box.x + (box.width - drawWidth) / 2, y: box.y + (box.height - drawHeight) / 2, width: drawWidth, height: drawHeight });
          continue;
        }

        if (def.checkbox) {
          if (field.completed) {
            const size = Math.max(10, Math.min(box.width, box.height) * 0.8);
            page.drawText('X', { x: box.x + (box.width - boldFont.widthOfTextAtSize('X', size)) / 2, y: box.y + (box.height - size) / 2 + 1, size, font: boldFont, color: rgb(0.06, 0.07, 0.1) });
          }
          continue;
        }

        const raw = String(field.value || '').trim();
        if (!raw) continue;
        let fontSize = Math.max(8, Math.min(13, box.height * 0.48));
        if (field.type === 'address' || field.type === 'text') fontSize = Math.max(7, Math.min(11, box.height * 0.27));
        let lines = wrapText(raw, font, fontSize, box.width * 0.94);
        while (fontSize > 6 && lines.length * fontSize * 1.2 > box.height * 0.92) {
          fontSize -= 0.5;
          lines = wrapText(raw, font, fontSize, box.width * 0.94);
        }
        const lineHeight = fontSize * 1.18;
        const totalHeight = lines.length * lineHeight;
        let y = box.y + Math.max(1, (box.height + totalHeight) / 2 - lineHeight);
        for (const line of lines.slice(0, Math.max(1, Math.floor(box.height / lineHeight)))) {
          page.drawText(line, { x: box.x + box.width * 0.03, y, size: fontSize, font, color: rgb(0.06, 0.07, 0.1), maxWidth: box.width * 0.94 });
          y -= lineHeight;
        }
      }
      return new Uint8Array(await pdfDoc.save());
    }

    async function buildSignedPdfBytes() {
      const completedFields = state.fields.filter(field => field.completed);
      if (!completedFields.length) throw new Error('Complete at least one field before finalizing.');
      return buildPdfBytes();
    }

    async function buildPreparedPdfBytes() {
      return buildPdfBytes({ include: field => field.assignedTo !== 'recipient' });
    }

    async function buildProofCapsule() {
      const uploadEvent = [...state.events].reverse().find(event => event.type === 'document_uploaded');
      const payload = {
        format: 'signtrail-proof-capsule',
        version: '1.0',
        verificationId: state.verificationId,
        documentName: state.file.name,
        originalHash: state.originalHash,
        signedHash: state.signedHash,
        createdAt: uploadEvent?.timestamp || state.finalizedAt,
        completedAt: state.finalizedAt,
        pageCount: state.pdf.numPages,
        fields: state.fields.map(field => ({
          id: field.id,
          type: field.type,
          page: field.pageIndex + 1,
          completed: Boolean(field.completed),
          required: Boolean(field.required),
          assignedTo: field.assignedTo || 'self',
          placement: {
            x: Number(field.x.toFixed(6)),
            y: Number(field.y.toFixed(6)),
            width: Number(field.width.toFixed(6)),
            height: Number(field.height.toFixed(6))
          }
        })),
        events: [...state.events].reverse().map(event => {
          const clean = { type: event.type, title: event.title, timestamp: event.timestamp };
          if (Number.isInteger(event.pageIndex)) clean.page = event.pageIndex + 1;
          if (event.fieldId) clean.fieldId = event.fieldId;
          return clean;
        }),
        verificationScope: 'byte-for-byte-document-match',
        identityAssurance: 'none'
      };
      const digest = await sha256Hex(new TextEncoder().encode(canonicalize(payload)));
      return { ...payload, integrity: { algorithm: 'SHA-256', digest } };
    }

    function openCompletionModal() {
      if (!state.finalized || !state.proofCapsule) return;
      el.completionVerificationId.textContent = state.verificationId;
      el.completionTime.textContent = formatDateTime(state.finalizedAt);
      el.completionOriginalHash.textContent = state.originalHash;
      el.completionSignedHash.textContent = state.signedHash;
      el.completionModal.classList.remove('hidden');
    }

    function closeCompletionModal() {
      el.completionModal.classList.add('hidden');
    }

    async function finalizeDocument() {
      if (state.recipientCompleted) {
        await downloadRecipientFile('signed');
        return;
      }
      const recipientFields = state.fields.filter(field => field.assignedTo === 'recipient');
      if (state.finalized) {
        if (state.preparedForRecipient || recipientFields.length) openShareModal();
        else openCompletionModal();
        return;
      }
      if (!state.recipientMode && recipientFields.length) {
        const ownerMissing = state.fields.filter(field => field.assignedTo !== 'recipient' && field.required && !field.completed);
        if (ownerMissing.length) {
          showToast(`Complete ${ownerMissing.length} required fill-now field${ownerMissing.length === 1 ? '' : 's'} before finalizing.`);
          const node = document.querySelector(`[data-field-id="${CSS.escape(ownerMissing[0].id)}"]`);
          node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        if (!state.originalBytes) {
          showToast('Load a PDF before finalizing.');
          return;
        }
        setLoading(true, 'Finalizing exact recipient-ready bytes…');
        el.exportButton.disabled = true;
        try {
          state.preparedBytes = await buildPreparedPdfBytes();
          state.preparedHash = await sha256Hex(state.preparedBytes);
          state.finalized = true;
          state.finalizedAt = new Date().toISOString();
          state.selectedFieldId = null;
          addEvent('recipient_document_finalized', 'Recipient-ready document finalized and editor locked', { preparedHash: state.preparedHash });
          renderAllFields();
          updateStatus();
          openShareModal();
          showToast('Document finalized and locked. Create the signee link next.');
        } catch (error) {
          console.error(error);
          state.preparedBytes = null;
          state.preparedHash = '';
          state.finalized = false;
          state.finalizedAt = '';
          showToast(error?.message || 'Finalization failed. The document remains editable.');
        } finally {
          setLoading(false);
          updateStatus();
        }
        return;
      }
      const missingRequired = state.fields.filter(field => field.required && !field.completed);
      if (missingRequired.length) {
        showToast(`Complete ${missingRequired.length} required field${missingRequired.length === 1 ? '' : 's'} before finalizing.`);
        const first = missingRequired[0];
        const node = document.querySelector(`[data-field-id="${CSS.escape(first.id)}"]`);
        node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      const completedFields = state.fields.filter(field => field.completed);
      if (!state.originalBytes || !completedFields.length) {
        showToast('Complete at least one field before finalizing.');
        return;
      }

      setLoading(true, state.recipientMode ? 'Finalizing and returning signed package…' : 'Finalizing exact signed bytes…');
      el.exportButton.disabled = true;
      try {
        state.signedBytes = await buildSignedPdfBytes();
        state.signedHash = await sha256Hex(state.signedBytes);
        state.verificationId = createVerificationId();
        state.finalizedAt = new Date().toISOString();
        addEvent('document_finalized', 'Document finalized and editor locked', { verificationId: state.verificationId });
        addEvent('signed_fingerprint_created', 'Signed document fingerprint created', { signedHash: state.signedHash });
        state.proofCapsule = await buildProofCapsule();
        let hostedResult = null;
        if (state.recipientMode) {
          hostedResult = await completeHostedEnvelope();
          state.proofCapsule = hostedResult.proofCapsule;
          state.finalizedAt = hostedResult.completedAt;
          state.verificationId = hostedResult.verificationId;
          state.signedHash = hostedResult.signedHash;
        }
        state.finalized = true;
        let savedToHistory = false;
        try { savedToHistory = await saveCurrentPackageToHistory(); }
        catch (historyError) { console.warn('Local history save failed:', historyError); }
        state.selectedFieldId = null;
        renderAllFields();
        updateStatus();
        openCompletionModal();
        if (hostedResult) addEvent('hosted_request_completed', 'Signed package returned to sender', { envelopeId: state.recipientEnvelopeId });
        showToast(state.recipientMode ? 'Signed package completed and returned to the sender.' : (savedToHistory ? 'Final package created and saved to local history.' : 'Final package created. Local history was unavailable.'));
      } catch (error) {
        console.error(error);
        state.signedBytes = null;
        state.signedHash = '';
        state.verificationId = '';
        state.finalizedAt = '';
        state.proofCapsule = null;
        showToast(error?.message || 'Finalization failed. The original document was not changed.');
      } finally {
        setLoading(false);
        updateStatus();
      }
    }

    function downloadCurrentSignedPdf() {
      if (!state.signedBytes || !state.file) return;
      const baseName = state.file.name.replace(/\.pdf$/i, '');
      downloadBytes(state.signedBytes, 'application/pdf', `${baseName}-signed.pdf`);
      addEvent('signed_pdf_downloaded', 'Signed PDF downloaded');
    }

    function downloadCurrentProofCapsule() {
      if (!state.proofCapsule) return;
      downloadBytes(proofCapsuleBytes(state.proofCapsule), 'application/json', capsuleFileName());
      addEvent('proof_capsule_downloaded', 'Integrity receipt downloaded');
    }

    function historyRecordBytes(record) {
      if (record.signedBytes instanceof Uint8Array) return record.signedBytes;
      if (record.signedBytes instanceof ArrayBuffer) return new Uint8Array(record.signedBytes);
      if (ArrayBuffer.isView(record.signedBytes)) return new Uint8Array(record.signedBytes.buffer, record.signedBytes.byteOffset, record.signedBytes.byteLength);
      return new Uint8Array(record.signedBytes || []);
    }

    function renderHistoryRecords(records) {
      state.historyRecords = records;
      if (!records.length) {
        el.historyList.innerHTML = '<div class="history-empty"><strong>No completed documents yet.</strong><br />Finalize a signed PDF and it will appear here automatically on this device.</div>';
        el.clearHistoryButton.disabled = true;
        return;
      }
      el.clearHistoryButton.disabled = false;
      el.historyList.replaceChildren(...records.map(record => {
        const item = document.createElement('article');
        item.className = 'history-item';
        const info = document.createElement('div');
        const name = document.createElement('h3');
        name.className = 'history-name';
        name.textContent = record.documentName || 'Signed document';
        const meta = document.createElement('div');
        meta.className = 'history-meta';
        meta.textContent = `${formatDateTime(record.finalizedAt)} · ${record.pageCount || '?'} page${record.pageCount === 1 ? '' : 's'} · ${record.verificationId}`;
        const hash = document.createElement('div');
        hash.className = 'history-hash';
        hash.textContent = `Signed SHA-256 ${record.signedHash}`;
        info.append(name, meta, hash);

        const actions = document.createElement('div');
        actions.className = 'history-actions';
        const pdfButton = document.createElement('button');
        pdfButton.className = 'secondary-btn';
        pdfButton.type = 'button';
        pdfButton.textContent = 'Signed PDF';
        pdfButton.addEventListener('click', () => downloadBytes(historyRecordBytes(record), 'application/pdf', `${safeBaseName(record.documentName)}-signed.pdf`));
        const handoffButton = document.createElement('button');
        handoffButton.className = 'primary-btn';
        handoffButton.type = 'button';
        handoffButton.textContent = 'Export handoff';
        handoffButton.addEventListener('click', async () => {
          handoffButton.disabled = true;
          try {
            const mode = await exportHandoffBundle({ signedBytes: historyRecordBytes(record), proofCapsule: record.proofCapsule, documentName: record.documentName, verificationId: record.verificationId });
            showToast(mode === 'zip' ? 'Handoff ZIP exported.' : 'ZIP library unavailable; handoff files downloaded separately.');
          } catch (error) {
            console.error(error);
            showToast(error?.message || 'Could not export the handoff package.');
          } finally { handoffButton.disabled = false; }
        });
        const deleteButton = document.createElement('button');
        deleteButton.className = 'danger-btn';
        deleteButton.type = 'button';
        deleteButton.textContent = 'Delete';
        deleteButton.addEventListener('click', async () => {
          if (!window.confirm(`Delete the local history record for ${record.documentName}?`)) return;
          await historyDelete(record.verificationId);
          await refreshHistory();
        });
        actions.append(pdfButton, handoffButton, deleteButton);
        item.append(info, actions);
        return item;
      }));
    }

    async function refreshHistory() {
      try {
        renderHistoryRecords(await historyGetAll());
      } catch (error) {
        console.error(error);
        el.historyList.innerHTML = '<div class="history-empty"><strong>History is unavailable.</strong><br />This browser may block IndexedDB in the current context. Final PDF export still works normally.</div>';
        el.clearHistoryButton.disabled = true;
      }
    }

    async function openHistoryModal() {
      el.historyModal.classList.remove('hidden');
      el.historyList.innerHTML = '<div class="history-empty">Loading local history…</div>';
      await Promise.all([refreshHistory(), refreshHostedRequests()]);
    }

    function closeHistoryModal() {
      el.historyModal.classList.add('hidden');
    }

    async function exportCurrentHandoff() {
      if (!state.signedBytes || !state.proofCapsule || !state.file) return;
      el.exportHandoffButton.disabled = true;
      try {
        const mode = await exportHandoffBundle({
          signedBytes: state.signedBytes,
          proofCapsule: state.proofCapsule,
          documentName: state.file.name,
          verificationId: state.verificationId
        });
        addEvent('handoff_exported', 'Signed document handoff exported');
        showToast(mode === 'zip' ? 'Handoff ZIP exported for recipients.' : 'ZIP library unavailable; handoff files downloaded separately.');
      } catch (error) {
        console.error(error);
        showToast(error?.message || 'Could not export the handoff package.');
      } finally {
        el.exportHandoffButton.disabled = false;
      }
    }

    function hostedRequestIndex() {
      try {
        const parsed = JSON.parse(localStorage.getItem('signtrail-hosted-requests') || '[]');
        return Array.isArray(parsed) ? parsed.filter(item => item && item.manageToken) : [];
      } catch { return []; }
    }

    function saveHostedRequestIndex(items) {
      localStorage.setItem('signtrail-hosted-requests', JSON.stringify(items.slice(0, 30)));
    }

    function rememberHostedRequest(record) {
      const items = hostedRequestIndex().filter(item => item.manageToken !== record.manageToken);
      items.unshift(record);
      saveHostedRequestIndex(items);
    }

    function recipientApiHeaders(extra = {}) {
      if (!state.recipientToken) throw new Error('The recipient link credential is unavailable in this tab.');
      return { ...extra, 'X-SignTrail-Recipient-Token': state.recipientToken };
    }

    function managementApiHeaders(manageToken, extra = {}) {
      if (!manageToken) throw new Error('The hosted-request management credential is missing.');
      return { ...extra, 'X-SignTrail-Manage-Token': manageToken };
    }

    async function apiJson(url, options = {}) {
      const response = await fetch(url, { ...options, cache: 'no-store', credentials: 'same-origin' });
      let payload = {};
      try { payload = await response.json(); } catch { /* ignored */ }
      if (!response.ok) throw new Error(payload.error || `Request failed (${response.status}).`);
      return payload;
    }

    async function apiDownload(url, headers, fileName, fallbackType) {
      const response = await fetch(url, { headers, cache: 'no-store', credentials: 'same-origin' });
      if (!response.ok) {
        let message = `Download failed (${response.status}).`;
        try { message = (await response.json()).error || message; } catch { /* ignored */ }
        throw new Error(message);
      }
      const blob = await response.blob();
      downloadBytes(new Uint8Array(await blob.arrayBuffer()), blob.type || fallbackType, fileName);
    }

    async function refreshSenderSession() {
      el.shareAuthStatus.className = 'share-auth-status checking';
      el.shareAuthStatus.textContent = 'Checking ChatGPT owner session…';
      try {
        const session = await apiJson('/api/session');
        if (session.authenticated) {
          el.shareAuthStatus.className = 'share-auth-status ready';
          el.shareAuthStatus.textContent = `Ready to create hosted link as ${session.email || session.name || 'the signed-in owner'}.`;
          el.createShareLinkButton.disabled = false;
          return true;
        }
        el.shareAuthStatus.className = 'share-auth-status blocked';
        el.shareAuthStatus.textContent = 'Sign in with ChatGPT as the Site owner before creating the hosted link.';
        el.createShareLinkButton.disabled = true;
        return false;
      } catch (error) {
        el.shareAuthStatus.className = 'share-auth-status blocked';
        el.shareAuthStatus.textContent = error?.message || 'Could not verify the owner session.';
        el.createShareLinkButton.disabled = true;
        return false;
      }
    }

    function setShareFormLocked(locked) {
      el.shareRecipientEmail.disabled = locked;
      el.shareRequestTitle.disabled = locked;
      el.shareMessage.disabled = locked;
    }

    function openShareModal() {
      if (state.recipientMode) return;
      if (state.preparedForRecipient) {
        el.shareModalTitle.textContent = 'Signature request ready';
        setShareFormLocked(true);
        el.shareResult.classList.remove('hidden');
        el.createShareLinkButton.classList.add('hidden');
        el.shareAuthStatus.className = 'share-auth-status ready';
        el.shareAuthStatus.textContent = 'The hosted signee link has been created.';
        el.shareModal.classList.remove('hidden');
        return;
      }
      const recipientFields = state.fields.filter(field => field.assignedTo === 'recipient');
      if (!recipientFields.length) {
        showToast('Add at least one field assigned to Recipient first.');
        return;
      }
      if (!state.finalized || !state.preparedBytes) {
        showToast('Finalize the recipient document before creating its signee link.');
        return;
      }
      el.shareModalTitle.textContent = 'Finalized — create signee link';
      setShareFormLocked(false);
      el.shareRequestTitle.value = el.shareRequestTitle.value || `Please sign ${state.file?.name || 'this document'}`;
      el.shareResult.classList.add('hidden');
      el.createShareLinkButton.classList.remove('hidden');
      el.createShareLinkButton.textContent = 'Create signee link';
      el.createShareLinkButton.disabled = true;
      el.shareModal.classList.remove('hidden');
      refreshSenderSession();
    }

    function closeShareModal() {
      el.shareModal.classList.add('hidden');
    }

    async function createShareLink() {
      if (state.preparedForRecipient) { openShareModal(); return; }
      if (!state.finalized || state.recipientMode) return;
      const recipientFields = state.fields.filter(field => field.assignedTo === 'recipient');
      if (!state.file || !recipientFields.length) return;
      const email = el.shareRecipientEmail.value.trim();
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        showToast('Enter a valid recipient email or leave it blank.');
        return;
      }
      el.createShareLinkButton.disabled = true;
      setLoading(true, 'Uploading finalized document and creating signee link…');
      try {
        if (location.protocol === 'file:') throw new Error('Hosted links require deployment to ChatGPT Sites. The local handoff ZIP remains available.');
        if (!state.preparedBytes || !state.preparedHash) throw new Error('The finalized recipient document is unavailable. Start a new document and finalize it again.');
        const preparedBytes = state.preparedBytes;
        const preparedHash = state.preparedHash;
        const metadata = {
          version: '1.0',
          documentName: state.file.name,
          title: el.shareRequestTitle.value.trim().slice(0, 120),
          message: el.shareMessage.value.trim().slice(0, 1000),
          recipientEmail: email.slice(0, 254),
          originalHash: preparedHash,
          pageCount: state.pdf.numPages,
          expiresInDays: 7,
          fields: recipientFields.map(field => ({
            id: field.id,
            type: field.type,
            pageIndex: field.pageIndex,
            x: Number(field.x.toFixed(6)),
            y: Number(field.y.toFixed(6)),
            width: Number(field.width.toFixed(6)),
            height: Number(field.height.toFixed(6)),
            required: Boolean(field.required),
            assignedTo: 'recipient'
          }))
        };
        const form = new FormData();
        form.append('document', new Blob([preparedBytes], { type: 'application/pdf' }), state.file.name);
        form.append('metadata', JSON.stringify(metadata));
        const result = await apiJson('/api/envelopes', { method: 'POST', body: form });
        state.lastShareUrl = result.shareUrl;
        state.lastManageToken = result.manageToken;
        state.recipientEnvelopeId = result.envelopeId;
        state.preparedForRecipient = true;
        state.selectedFieldId = null;
        el.shareLinkOutput.value = result.shareUrl;
        el.shareResult.classList.remove('hidden');
        el.shareModalTitle.textContent = 'Signature request ready';
        setShareFormLocked(true);
        el.createShareLinkButton.classList.add('hidden');
        rememberHostedRequest({
          manageToken: result.manageToken,
          shareUrl: result.shareUrl,
          documentName: state.file.name,
          recipientEmail: email,
          title: metadata.title,
          message: metadata.message,
          createdAt: result.createdAt
        });
        addEvent('recipient_link_uploaded', 'Finalized recipient document uploaded to hosted storage', { envelopeId: result.envelopeId });
        addEvent('recipient_link_created', 'Private signee link created', { envelopeId: result.envelopeId });
        renderAllFields();
        updateStatus();
        showToast('Signee link created from the exact finalized document.');
      } catch (error) {
        console.error(error);
        showToast(error?.message || 'Could not create the recipient link.');
      } finally {
        setLoading(false);
        el.createShareLinkButton.disabled = state.preparedForRecipient;
      }
    }

    async function copyShareLink() {
      if (!state.lastShareUrl) return;
      try { await navigator.clipboard.writeText(state.lastShareUrl); showToast('Recipient link copied.'); }
      catch { el.shareLinkOutput.select(); document.execCommand('copy'); showToast('Recipient link copied.'); }
    }

    function openShareEmailDraft(url = state.lastShareUrl, record = null) {
      if (!url) return;
      const email = record?.recipientEmail || el.shareRecipientEmail.value.trim();
      const subject = record?.title || el.shareRequestTitle.value.trim() || `Signature requested: ${state.file?.name || 'document'}`;
      const message = record?.message || el.shareMessage.value.trim() || 'Please open the link, complete the required fields, and download your signed copy.';
      const body = `${message}\n\nOpen and sign:\n${url}\n\nThis is a private bearer link. Please do not forward it.`;
      location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    }

    async function completeHostedEnvelope() {
      if (!state.recipientMode || !state.recipientToken || !state.signedBytes || !state.proofCapsule) return null;
      const form = new FormData();
      form.append('signedPdf', new Blob([state.signedBytes], { type: 'application/pdf' }), `${safeBaseName(state.file?.name)}-signed.pdf`);
      form.append('proofCapsule', new Blob([proofCapsuleBytes(state.proofCapsule)], { type: 'application/json' }), capsuleFileName());
      form.append('metadata', JSON.stringify({ signedHash: state.signedHash, verificationId: state.verificationId, completedAt: state.finalizedAt }));
      return apiJson('/api/recipient/complete', { method: 'POST', headers: recipientApiHeaders(), body: form });
    }

    async function loadRecipientEnvelope(token) {
      if (!token) return;
      state.recipientToken = token;
      sessionStorage.setItem('signtrail-recipient-token', token);
      setLoading(true, 'Opening signature request…');
      try {
        const envelope = await apiJson('/api/recipient', { headers: recipientApiHeaders() });
        const response = await fetch(envelope.documentEndpoint || '/api/recipient/document', {
          headers: recipientApiHeaders(),
          cache: 'no-store',
          credentials: 'same-origin'
        });
        if (!response.ok) throw new Error('The hosted PDF could not be downloaded.');
        const blob = await response.blob();
        const file = new File([blob], envelope.documentName || 'signature-request.pdf', { type: 'application/pdf' });
        await openPdf(file);
        state.recipientMode = true;
        state.recipientToken = token;
        state.recipientEnvelopeId = envelope.envelopeId;
        state.recipientEmail = '';
        state.recipientAuthenticatedEmail = envelope.viewer?.email || '';
        state.recipientAuthenticatedName = envelope.viewer?.name || '';
        state.recipientCompleted = envelope.status === 'completed';
        state.recipientSignedPdfUrl = envelope.signedPdfEndpoint || '';
        state.recipientProofCapsuleUrl = envelope.proofCapsuleEndpoint || '';
        state.originalHash = envelope.originalHash || state.originalHash;
        el.hashBox.textContent = state.originalHash;
        state.fields = (envelope.fields || []).map(raw => ({
          id: raw.id || makeId('field'),
          type: FIELD_DEFS[raw.type] ? raw.type : 'text',
          pageIndex: Number(raw.pageIndex) || 0,
          x: Number(raw.x) || 0,
          y: Number(raw.y) || 0,
          width: Number(raw.width) || FIELD_DEFS[raw.type]?.width || 0.25,
          height: Number(raw.height) || FIELD_DEFS[raw.type]?.height || 0.06,
          assignedTo: 'recipient',
          required: raw.required !== false,
          value: '',
          signatureDataUrl: null,
          completed: false
        }));
        el.documentTitle.textContent = envelope.title || envelope.documentName;
        const identity = state.recipientAuthenticatedEmail ? `Signed in as ${state.recipientAuthenticatedName || state.recipientAuthenticatedEmail}` : 'Anonymous recipient';
        el.documentSubtitle.textContent = `${state.pdf.numPages} page${state.pdf.numPages === 1 ? '' : 's'} · ${identity}`;
        const tracking = escapeHtml(envelope.trackingDisclosure || 'Opening this link records a link-open event; counts may include reloads, previews, scanners, or forwarded links.');
        if (state.recipientCompleted) {
          state.finalized = true;
          state.finalizedAt = envelope.completedAt || '';
          state.verificationId = envelope.verificationId || '';
          state.signedHash = envelope.signedHash || '';
          const identityNote = state.recipientAuthenticatedEmail ? `verified opener: <strong>${escapeHtml(state.recipientAuthenticatedEmail)}</strong>` : 'private recipient link';
          el.recipientBanner.innerHTML = `Completed request · ${identityNote} · <button type="button" class="recipient-inline-download" data-recipient-download="signed">Download signed PDF</button> · <button type="button" class="recipient-inline-download" data-recipient-download="proof">Integrity receipt</button><span class="recipient-message">${tracking}</span>${envelope.message ? `<span class="recipient-message">${escapeHtml(envelope.message)}</span>` : ''}`;
          el.recipientBanner.querySelector('[data-recipient-download="signed"]')?.addEventListener('click', () => downloadRecipientFile('signed'));
          el.recipientBanner.querySelector('[data-recipient-download="proof"]')?.addEventListener('click', () => downloadRecipientFile('proof'));
          addEvent('completed_request_reopened', 'Completed signature package reopened');
        } else if (state.recipientAuthenticatedEmail) {
          el.recipientBanner.innerHTML = `Signature request · verified link opener: <strong>${escapeHtml(state.recipientAuthenticatedEmail)}</strong> · <a href="/signout-with-chatgpt" target="_top">Sign out</a><span class="recipient-message">${tracking}</span>${envelope.message ? `<span class="recipient-message">${escapeHtml(envelope.message)}</span>` : ''}`;
          addEvent('recipient_link_opened', 'Hosted signature request opened');
        } else {
          el.recipientBanner.innerHTML = `Signature request · anonymous link open · <a href="/signin-with-chatgpt" target="_top">Sign in with ChatGPT to verify your email</a><span class="recipient-message">${tracking}</span>${envelope.message ? `<span class="recipient-message">${escapeHtml(envelope.message)}</span>` : ''}`;
          addEvent('recipient_link_opened', 'Hosted signature request opened');
        }
        renderAllFields();
        updateStatus();
      } catch (error) {
        console.error(error);
        sessionStorage.removeItem('signtrail-recipient-token');
        state.recipientToken = '';
        showError(error?.message || 'This signature request could not be opened.');
        el.landing.classList.remove('hidden');
        el.app.classList.add('hidden');
      } finally { setLoading(false); }
    }

    async function downloadRecipientFile(kind) {
      const isPdf = kind === 'signed';
      const endpoint = isPdf ? (state.recipientSignedPdfUrl || '/api/recipient/signed.pdf') : (state.recipientProofCapsuleUrl || '/api/recipient/proof.json');
      const base = safeBaseName(state.file?.name || 'document');
      const fileName = isPdf ? `${base}-signed.pdf` : `${base}-${state.verificationId || 'integrity'}-integrity-receipt.json`;
      try {
        await apiDownload(endpoint, recipientApiHeaders(), fileName, isPdf ? 'application/pdf' : 'application/json');
      } catch (error) {
        showToast(error?.message || 'The completed file could not be downloaded.');
      }
    }

    function escapeHtml(value) {
      return String(value || '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
    }

    function hostedStatusLabel(record) {
      if (record.status === 'completed') return ['completed', 'Completed'];
      if (record.openedCount > 0) return ['opened', `Opened ${record.openedCount}×`];
      return ['', 'Not opened'];
    }

    function renderHostedRequests(records) {
      state.hostedRequests = records;
      if (!records.length) {
        el.hostedList.innerHTML = '<div class="history-empty"><strong>No hosted links on this device.</strong><br />Prepare recipient fields and create a private link.</div>';
        return;
      }
      el.hostedList.replaceChildren(...records.map(record => {
        const item = document.createElement('article');
        item.className = 'history-item';
        const info = document.createElement('div');
        const title = document.createElement('h3');
        title.className = 'history-name';
        title.textContent = record.title || record.documentName || 'Signature request';
        const statusInfo = hostedStatusLabel(record);
        const meta = document.createElement('div');
        meta.className = 'history-meta';
        meta.textContent = `${record.recipientEmail || 'No recipient label'} · created ${formatDateTime(record.createdAt)}${record.openedAt ? ` · first opened ${formatDateTime(record.openedAt)}` : ''}`;
        const opener = document.createElement('div');
        opener.className = 'history-hash';
        opener.textContent = record.verifiedOpenerEmail ? `Verified opener: ${record.verifiedOpenerEmail}` : 'Verified opener: none (anonymous or not signed in)';
        const badge = document.createElement('span');
        badge.className = `hosted-status ${statusInfo[0]}`;
        badge.textContent = statusInfo[1];
        info.append(title, badge, meta, opener);

        const actions = document.createElement('div');
        actions.className = 'history-actions';
        const copy = document.createElement('button'); copy.className = 'secondary-btn'; copy.textContent = 'Copy link';
        copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(record.shareUrl); showToast('Recipient link copied.'); } catch { showToast('Copy was blocked by the browser.'); } });
        const email = document.createElement('button'); email.className = 'secondary-btn'; email.textContent = 'Email draft'; email.addEventListener('click', () => openShareEmailDraft(record.shareUrl, record));
        actions.append(copy, email);
        if (record.status === 'completed') {
          const pdf = document.createElement('button'); pdf.className = 'primary-btn'; pdf.textContent = 'Signed PDF'; pdf.addEventListener('click', async () => {
            try { await apiDownload('/api/manage/signed.pdf', managementApiHeaders(record.manageToken), `${safeBaseName(record.documentName)}-signed.pdf`, 'application/pdf'); }
            catch (error) { showToast(error?.message || 'The signed PDF could not be downloaded.'); }
          });
          const proof = document.createElement('button'); proof.className = 'secondary-btn'; proof.textContent = 'Integrity receipt'; proof.addEventListener('click', async () => {
            try { await apiDownload('/api/manage/proof.json', managementApiHeaders(record.manageToken), `${safeBaseName(record.documentName)}-${record.verificationId || 'integrity'}-integrity-receipt.json`, 'application/json'); }
            catch (error) { showToast(error?.message || 'The integrity receipt could not be downloaded.'); }
          });
          actions.append(pdf, proof);
        }
        const remove = document.createElement('button'); remove.className = 'danger-btn'; remove.textContent = 'Delete link';
        remove.addEventListener('click', async () => {
          if (!confirm('Delete this hosted signature request and its stored files?')) return;
          await apiJson('/api/manage', { method: 'DELETE', headers: managementApiHeaders(record.manageToken) });
          saveHostedRequestIndex(hostedRequestIndex().filter(item => item.manageToken !== record.manageToken));
          await refreshHostedRequests();
        });
        actions.append(remove);
        item.append(info, actions);
        return item;
      }));
    }

    async function refreshHostedRequests() {
      const index = hostedRequestIndex();
      if (!index.length) { renderHostedRequests([]); return; }
      el.hostedList.innerHTML = '<div class="history-empty">Refreshing hosted link status…</div>';
      const records = [];
      for (const local of index) {
        try {
          const remote = await apiJson('/api/manage', { headers: managementApiHeaders(local.manageToken) });
          records.push({ ...local, ...remote, manageToken: local.manageToken, shareUrl: remote.shareUrl || local.shareUrl });
        } catch (error) {
          records.push({ ...local, status: 'unavailable', openedCount: 0, error: error.message });
        }
      }
      renderHostedRequests(records);
    }

    function extractRecipientTokenFromLocation() {
      const hashes = [location.hash];
      try { if (window.top && window.top !== window) hashes.unshift(window.top.location.hash); } catch { /* cross-origin top */ }
      let token = '';
      for (const rawHash of hashes) {
        const params = new URLSearchParams(String(rawHash || '').replace(/^#/, ''));
        token = params.get('sign') || token;
      }
      if (token) {
        sessionStorage.setItem('signtrail-recipient-token', token);
        history.replaceState(null, '', `${location.pathname}${location.search}`);
        try {
          if (window.top && window.top !== window) window.top.history.replaceState(null, '', `${window.top.location.pathname}${window.top.location.search}`);
        } catch { /* cross-origin top */ }
      }
      return token || sessionStorage.getItem('signtrail-recipient-token') || '';
    }

    async function bootstrapFromUrl() {
      const token = extractRecipientTokenFromLocation();
      if (token) await loadRecipientEnvelope(token);
    }

    async function validateProofCapsule(capsule) {
      if (!capsule || typeof capsule !== 'object' || Array.isArray(capsule)) return { ok: false, reason: 'The receipt is not a JSON object.' };
      if (capsule.format !== 'signtrail-proof-capsule' || !['1.0', '1.1'].includes(capsule.version)) return { ok: false, reason: 'The receipt format or version is not supported.' };
      if (!/^ST-\d{8}-[A-F0-9]{10}$/.test(capsule.verificationId || '')) return { ok: false, reason: 'The verification ID is missing or malformed.' };
      if (!/^[a-f0-9]{64}$/i.test(capsule.originalHash || '') || !/^[a-f0-9]{64}$/i.test(capsule.signedHash || '')) return { ok: false, reason: 'The document fingerprints are missing or malformed.' };
      if (!Array.isArray(capsule.fields) || !Array.isArray(capsule.events)) return { ok: false, reason: 'The receipt field or event records are missing.' };
      if (!capsule.completedAt || Number.isNaN(new Date(capsule.completedAt).getTime())) return { ok: false, reason: 'The completion timestamp is invalid.' };
      if (capsule.identityAssurance !== 'none' || capsule.verificationScope !== 'byte-for-byte-document-match') return { ok: false, reason: 'The receipt declares an unsupported verification scope.' };
      if (capsule.version === '1.1' && (capsule.completionEvidence !== 'client-attested-field-state' || capsule.receiptMeaning !== 'byte-match-integrity-only')) return { ok: false, reason: 'The hosted integrity receipt declares unsupported evidence semantics.' };
      if (!capsule.integrity || capsule.integrity.algorithm !== 'SHA-256' || !/^[a-f0-9]{64}$/i.test(capsule.integrity.digest || '')) return { ok: false, reason: 'The receipt integrity record is missing or malformed.' };
      const rawText = JSON.stringify(capsule);
      if (/signatureDataUrl|data:image\/png;base64/i.test(rawText)) return { ok: false, reason: 'The receipt improperly contains signature image data.' };
      const { integrity, ...payload } = capsule;
      const actualDigest = await sha256Hex(new TextEncoder().encode(canonicalize(payload)));
      if (actualDigest.toLowerCase() !== integrity.digest.toLowerCase()) return { ok: false, reason: 'The integrity receipt digest does not match its contents.' };
      return { ok: true };
    }

    function setVerificationResult(kind, kicker, title, message, details = []) {
      el.verificationResult.className = `verification-result ${kind}`;
      el.verificationResultKicker.textContent = kicker;
      el.verificationResultTitle.textContent = title;
      el.verificationResultMessage.textContent = message;
      el.verificationResultDetails.replaceChildren(...details.map(([label, value]) => {
        const row = document.createElement('div');
        row.className = 'result-detail';
        const dt = document.createElement('dt');
        dt.textContent = label;
        const dd = document.createElement('dd');
        dd.textContent = value;
        row.append(dt, dd);
        return row;
      }));
      el.verificationResult.classList.remove('hidden');
    }

    function clearVerificationResult() {
      el.verificationResult.className = 'verification-result hidden';
      el.verificationResultDetails.replaceChildren();
    }

    function updateVerificationReady() {
      el.verifyPdfName.textContent = state.verifyPdfFile?.name || 'No PDF selected';
      el.verifyCapsuleName.textContent = state.verifyCapsuleFile?.name || 'No receipt selected';
      el.verifyPdfCard.classList.toggle('ready', Boolean(state.verifyPdfFile));
      el.verifyCapsuleCard.classList.toggle('ready', Boolean(state.verifyCapsuleFile));
      el.runVerificationButton.disabled = !(state.verifyPdfFile && state.verifyCapsuleFile);
      clearVerificationResult();
    }

    function setVerificationPdf(file) {
      const problem = validateFile(file);
      if (problem) {
        state.verifyPdfFile = null;
        updateVerificationReady();
        setVerificationResult('invalid', 'PDF rejected', 'Choose a valid signed PDF', problem);
        return;
      }
      state.verifyPdfFile = file;
      updateVerificationReady();
    }

    function setVerificationCapsule(file) {
      if (!file) return;
      if (file.size <= 0 || file.size > 2 * 1024 * 1024 || !(file.type === 'application/json' || file.name.toLowerCase().endsWith('.json'))) {
        state.verifyCapsuleFile = null;
        updateVerificationReady();
        setVerificationResult('invalid', 'Receipt rejected', 'Choose a valid Integrity receipt', 'The receipt must be a JSON file no larger than 2 MB.');
        return;
      }
      state.verifyCapsuleFile = file;
      updateVerificationReady();
    }

    function openVerifier({ useCurrentPackage = false } = {}) {
      window.clearTimeout(toastTimer);
      el.toast.classList.add('hidden');
      state.verifierReturn = state.file ? 'app' : 'landing';
      el.landing.classList.add('hidden');
      el.app.classList.add('hidden');
      el.verifier.classList.remove('hidden');
      closeCompletionModal();
      if (useCurrentPackage && state.signedBytes && state.proofCapsule) {
        const baseName = state.file.name.replace(/\.pdf$/i, '');
        state.verifyPdfFile = new File([state.signedBytes], `${baseName}-signed.pdf`, { type: 'application/pdf' });
        state.verifyCapsuleFile = new File([`${JSON.stringify(state.proofCapsule, null, 2)}\n`], capsuleFileName(), { type: 'application/json' });
      } else {
        state.verifyPdfFile = null;
        state.verifyCapsuleFile = null;
      }
      el.verifyPdfInput.value = '';
      el.verifyCapsuleInput.value = '';
      updateVerificationReady();
      window.scrollTo(0, 0);
    }

    function closeVerifier() {
      el.verifier.classList.add('hidden');
      if (state.verifierReturn === 'app' && state.file) el.app.classList.remove('hidden');
      else el.landing.classList.remove('hidden');
    }

    async function runVerification() {
      if (!state.verifyPdfFile || !state.verifyCapsuleFile) return;
      setLoading(true, 'Checking receipt and PDF fingerprint…');
      el.runVerificationButton.disabled = true;
      try {
        let capsule;
        try {
          capsule = JSON.parse(await state.verifyCapsuleFile.text());
        } catch {
          setVerificationResult('invalid', 'Invalid receipt', 'Integrity receipt could not be read', 'The selected JSON file is malformed.');
          return;
        }
        const receiptCheck = await validateProofCapsule(capsule);
        if (!receiptCheck.ok) {
          setVerificationResult('invalid', 'Invalid receipt', 'Integrity receipt failed validation', receiptCheck.reason, [
            ['Receipt file', state.verifyCapsuleFile.name]
          ]);
          return;
        }
        const actualHash = await sha256Hex(new Uint8Array(await state.verifyPdfFile.arrayBuffer()));
        const details = [
          ['Verification ID', capsule.verificationId],
          ['Completed', formatDateTime(capsule.completedAt)],
          ['Expected SHA-256', capsule.signedHash],
          ['Observed SHA-256', actualHash]
        ];
        if (actualHash.toLowerCase() === capsule.signedHash.toLowerCase()) {
          setVerificationResult('verified', 'Verified', 'The signed PDF matches exactly', 'The uploaded PDF is byte-for-byte identical to the file fingerprint recorded when this package was finalized.', details);
        } else {
          setVerificationResult('modified', 'Mismatch detected', 'This PDF does not match the receipt', 'The Integrity receipt is structurally valid, but the uploaded PDF has a different SHA-256 fingerprint. It may be a different export or may have changed.', details);
        }
      } catch (error) {
        console.error(error);
        setVerificationResult('invalid', 'Verification error', 'The package could not be checked', 'The browser could not complete the local verification process.');
      } finally {
        setLoading(false);
        updateVerificationReadyAfterRun();
      }
    }

    function updateVerificationReadyAfterRun() {
      el.runVerificationButton.disabled = !(state.verifyPdfFile && state.verifyCapsuleFile);
    }

    function setupVerificationDrop(card, setter) {
      for (const eventName of ['dragenter', 'dragover']) {
        card.addEventListener(eventName, event => {
          event.preventDefault();
          card.classList.add('dragover');
        });
      }
      for (const eventName of ['dragleave', 'drop']) {
        card.addEventListener(eventName, event => {
          event.preventDefault();
          card.classList.remove('dragover');
        });
      }
      card.addEventListener('drop', event => setter(event.dataTransfer?.files?.[0]));
    }

    function resetApp() {
      state.file = null;
      state.originalBytes = null;
      state.originalHash = '';
      state.pdf = null;
      state.pageSizes = [];
      state.fields = [];
      state.events = [];
      state.activeTool = null;
      state.selectedFieldId = null;
      state.finalized = false;
      state.preparedForRecipient = false;
      state.finalizedAt = '';
      state.verificationId = '';
      state.signedBytes = null;
      state.signedHash = '';
      state.proofCapsule = null;
      state.preparedBytes = null;
      state.preparedHash = '';
      state.workflowMode = 'self';
      state.recipientMode = false;
      state.recipientToken = '';
      state.recipientEnvelopeId = '';
      state.recipientEmail = '';
      state.recipientAuthenticatedEmail = '';
      state.recipientAuthenticatedName = '';
      state.fieldValueTargetId = null;
      state.lastShareUrl = '';
      state.lastManageToken = '';
      state.verifyPdfFile = null;
      state.verifyCapsuleFile = null;
      el.documentStack.replaceChildren();
      el.app.classList.add('hidden');
      el.verifier.classList.add('hidden');
      el.landing.classList.remove('hidden');
      clearError();
      cancelPlacement();
      setWorkflowMode('self');
      updateStatus();
    }

    el.openHistoryButton.addEventListener('click', openHistoryModal);
    el.historyTopButton.addEventListener('click', openHistoryModal);
    el.closeHistoryModal.addEventListener('click', closeHistoryModal);
    el.closeHistoryFooterButton.addEventListener('click', closeHistoryModal);
    el.historyModal.addEventListener('click', event => { if (event.target === el.historyModal) closeHistoryModal(); });
    el.clearHistoryButton.addEventListener('click', async () => {
      if (!window.confirm('Clear all locally saved signed document history? Downloaded files will not be affected.')) return;
      await historyClear();
      await refreshHistory();
      showToast('Local signed document history cleared.');
    });

    el.openVerifierButton.addEventListener('click', event => {
      event.stopPropagation();
      openVerifier();
    });
    el.backFromVerifierButton.addEventListener('click', closeVerifier);
    el.chooseVerifyPdfButton.addEventListener('click', () => el.verifyPdfInput.click());
    el.chooseVerifyCapsuleButton.addEventListener('click', () => el.verifyCapsuleInput.click());
    el.verifyPdfInput.addEventListener('change', () => setVerificationPdf(el.verifyPdfInput.files?.[0]));
    el.verifyCapsuleInput.addEventListener('change', () => setVerificationCapsule(el.verifyCapsuleInput.files?.[0]));
    el.runVerificationButton.addEventListener('click', runVerification);
    setupVerificationDrop(el.verifyPdfCard, setVerificationPdf);
    setupVerificationDrop(el.verifyCapsuleCard, setVerificationCapsule);

    el.chooseFileButton.addEventListener('click', event => {
      event.stopPropagation();
      el.fileInput.click();
    });
    el.uploadZone.addEventListener('click', event => {
      if (event.target !== el.chooseFileButton && event.target !== el.fileInput) el.fileInput.click();
    });
    el.uploadZone.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        el.fileInput.click();
      }
    });
    el.fileInput.addEventListener('change', () => openPdf(el.fileInput.files?.[0]));

    for (const eventName of ['dragenter', 'dragover']) {
      el.uploadZone.addEventListener(eventName, event => {
        event.preventDefault();
        el.uploadZone.classList.add('dragover');
      });
    }
    for (const eventName of ['dragleave', 'drop']) {
      el.uploadZone.addEventListener(eventName, event => {
        event.preventDefault();
        el.uploadZone.classList.remove('dragover');
      });
    }
    el.uploadZone.addEventListener('drop', event => openPdf(event.dataTransfer?.files?.[0]));

    for (const button of TOOL_ELEMENTS()) {
      button.addEventListener('click', () => setActiveTool(state.activeTool === button.dataset.tool ? null : button.dataset.tool));
    }
    el.selfModeButton.addEventListener('click', () => setWorkflowMode('self'));
    el.recipientModeButton.addEventListener('click', () => setWorkflowMode('recipient'));
    el.viewer.addEventListener('click', event => {
      if (state.finalized || state.recipientMode) {
        if (!state.activeTool) {
          state.selectedFieldId = null;
          renderAllFields();
        }
        return;
      }
      if (!state.activeTool) {
        state.selectedFieldId = null;
        renderAllFields();
        return;
      }
      const shell = event.target.closest('.page-shell');
      if (!shell) return;
      const rect = shell.getBoundingClientRect();
      const pageIndex = Number(shell.dataset.pageIndex);
      addField(pageIndex, (event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height, state.activeTool);
    });

    el.closeFieldValueModal.addEventListener('click', closeFieldValueModal);
    el.cancelFieldValueButton.addEventListener('click', closeFieldValueModal);
    el.clearFieldValueButton.addEventListener('click', clearFieldValue);
    el.applyFieldValueButton.addEventListener('click', applyFieldValue);
    el.fieldValueModal.addEventListener('click', event => { if (event.target === el.fieldValueModal) closeFieldValueModal(); });
    el.fieldValueInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); applyFieldValue(); } });

    el.closeShareModal.addEventListener('click', closeShareModal);
    el.cancelShareButton.addEventListener('click', closeShareModal);
    el.createShareLinkButton.addEventListener('click', createShareLink);
    el.copyShareLinkButton.addEventListener('click', copyShareLink);
    el.emailShareLinkButton.addEventListener('click', () => openShareEmailDraft());
    el.openShareLinkButton.addEventListener('click', () => { if (state.lastShareUrl) window.open(state.lastShareUrl, '_blank', 'noopener'); });
    el.shareModal.addEventListener('click', event => { if (event.target === el.shareModal) closeShareModal(); });
    el.refreshHostedButton.addEventListener('click', refreshHostedRequests);

    el.closeSignatureModal.addEventListener('click', closeSignatureModal);
    el.cancelSignatureButton.addEventListener('click', closeSignatureModal);
    el.clearSignatureButton.addEventListener('click', clearSignaturePad);
    el.undoSignatureButton.addEventListener('click', undoSignatureStroke);
    el.redoSignatureButton.addEventListener('click', redoSignatureStroke);
    el.applySignatureButton.addEventListener('click', applySignature);
    el.signatureModal.addEventListener('click', event => {
      if (event.target === el.signatureModal) closeSignatureModal();
    });

    el.signaturePad.addEventListener('pointerdown', startSignature);
    el.signaturePad.addEventListener('pointermove', drawSignature);
    el.signaturePad.addEventListener('pointerup', endSignature);
    el.signaturePad.addEventListener('pointercancel', endSignature);
    el.signaturePad.addEventListener('lostpointercapture', event => finishSignatureStroke(event, { releaseCapture: false }));
    el.signaturePad.addEventListener('contextmenu', event => event.preventDefault());

    el.exportButton.addEventListener('click', finalizeDocument);
    el.newDocumentButton.addEventListener('click', resetApp);
    el.closeCompletionModal.addEventListener('click', closeCompletionModal);
    el.completionModal.addEventListener('click', event => {
      if (event.target === el.completionModal) closeCompletionModal();
    });
    el.downloadSignedPdfButton.addEventListener('click', downloadCurrentSignedPdf);
    el.downloadProofCapsuleButton.addEventListener('click', downloadCurrentProofCapsule);
    el.exportHandoffButton.addEventListener('click', exportCurrentHandoff);
    el.verifyCurrentPackageButton.addEventListener('click', async () => {
      openVerifier({ useCurrentPackage: true });
      await runVerification();
    });

    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        if (!el.historyModal.classList.contains('hidden')) closeHistoryModal();
        else if (!el.shareModal.classList.contains('hidden')) closeShareModal();
        else if (!el.fieldValueModal.classList.contains('hidden')) closeFieldValueModal();
        else if (!el.completionModal.classList.contains('hidden')) closeCompletionModal();
        else if (!el.signatureModal.classList.contains('hidden')) closeSignatureModal();
        else cancelPlacement();
      }
      if (!state.finalized && (event.key === 'Delete' || event.key === 'Backspace') && state.selectedFieldId && el.signatureModal.classList.contains('hidden') && el.fieldValueModal.classList.contains('hidden')) {
        const tag = document.activeElement?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA') deleteField(state.selectedFieldId);
      }
    });

    window.addEventListener('resize', () => {
      window.clearTimeout(state.resizeTimer);
      state.resizeTimer = window.setTimeout(() => {
        if (state.pdf && el.signatureModal.classList.contains('hidden')) renderDocument().catch(console.error);
      }, 180);
    });

    bootstrapFromUrl().catch(error => {
      console.error(error);
      showError('The signature request could not be initialized.');
    });
