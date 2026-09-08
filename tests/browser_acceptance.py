import asyncio
import json
import os
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path('/mnt/data/SignTrail_v0.3.3_POST_FINALIZE_SIGNEE_LINK')
BASE = 'https://signtrail.test'
EVIDENCE = ROOT / 'evidence'
EVIDENCE.mkdir(exist_ok=True)
PDF_PATH = ROOT / 'tests' / 'browser-sample.pdf'
PDF_PATH.write_bytes(b'%PDF-1.4\n% SignTrail browser acceptance\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')

PDF_JS_STUB = r'''
window.pdfjsLib = {
  GlobalWorkerOptions: {},
  getDocument({data}) {
    return {
      promise: Promise.resolve({
        numPages: 1,
        getPage: async () => ({
          getViewport: ({scale=1}) => ({width: 612*scale, height: 792*scale}),
          render: ({canvasContext}) => {
            try {
              const canvas = canvasContext.canvas;
              canvasContext.save();
              canvasContext.fillStyle = '#ffffff';
              canvasContext.fillRect(0, 0, canvas.width, canvas.height);
              canvasContext.fillStyle = '#23242c';
              canvasContext.font = `${Math.max(22, canvas.width/20)}px Arial`;
              canvasContext.fillText('SIGNTRAIL ACCEPTANCE AGREEMENT', 60, 100);
              canvasContext.font = `${Math.max(14, canvas.width/35)}px Arial`;
              canvasContext.fillText('Please complete the recipient fields below.', 60, 155);
              canvasContext.fillText('This rendered page is supplied by the browser acceptance harness.', 60, 205);
              canvasContext.strokeStyle = '#b8bac4';
              canvasContext.strokeRect(60, 260, Math.max(200, canvas.width-120), 1);
              canvasContext.restore();
            } catch {}
            return { promise: Promise.resolve() };
          }
        })
      })
    };
  }
};
'''

PDF_LIB_STUB = r'''
window.__signtrailPdfSaveCount = 0;
window.PDFLib = {
  StandardFonts: { Helvetica: 'Helvetica', HelveticaBold: 'HelveticaBold' },
  rgb: (r,g,b) => ({r,g,b}),
  PDFDocument: {
    async load(bytes) {
      const original = new Uint8Array(bytes);
      const font = { widthOfTextAtSize: (text, size) => String(text).length * size * 0.52 };
      const page = {
        getSize: () => ({width: 612, height: 792}),
        drawImage: () => {},
        drawText: () => {}
      };
      return {
        getPages: () => [page],
        embedFont: async () => font,
        embedPng: async () => ({width: 800, height: 240}),
        save: async () => {
          window.__signtrailPdfSaveCount += 1;
          const suffix = new TextEncoder().encode('\n% SignTrail fields embedded\n%%EOF');
          const out = new Uint8Array(original.length + suffix.length);
          out.set(original); out.set(suffix, original.length);
          return out;
        }
      };
    }
  }
};
'''

JSZIP_STUB = r'''
window.JSZip = class {
  constructor(){ this.files = {}; }
  file(name, content){ this.files[name] = content; return this; }
  async generateAsync(){ return new Blob([JSON.stringify(Object.keys(this.files))], {type:'application/zip'}); }
};
'''

ENVELOPE_FIELDS = [
    {"id":"recipient-name","type":"print_name","pageIndex":0,"x":0.12,"y":0.42,"width":0.3,"height":0.06,"required":True,"assignedTo":"recipient"},
    {"id":"recipient-date","type":"date","pageIndex":0,"x":0.58,"y":0.42,"width":0.23,"height":0.06,"required":True,"assignedTo":"recipient"},
    {"id":"recipient-address","type":"address","pageIndex":0,"x":0.12,"y":0.52,"width":0.38,"height":0.11,"required":True,"assignedTo":"recipient"},
    {"id":"recipient-signature","type":"signature","pageIndex":0,"x":0.12,"y":0.68,"width":0.34,"height":0.09,"required":True,"assignedTo":"recipient"},
    {"id":"recipient-checkbox","type":"checkbox","pageIndex":0,"x":0.62,"y":0.68,"width":0.1,"height":0.06,"required":True,"assignedTo":"recipient"},
]

async def install_routes(page, fail_create=False):
    async def handler(route):
        url = route.request.url
        if url.endswith('/signtrail.css'):
            await route.fulfill(status=200, content_type='text/css', body=(ROOT / 'public' / 'signtrail.css').read_text())
            return
        if url.endswith('/signtrail.js'):
            await route.fulfill(status=200, content_type='application/javascript', body=(ROOT / 'public' / 'signtrail.js').read_text())
            return
        if url.endswith('/pdf-loader.mjs'):
            await route.fulfill(status=200, content_type='application/javascript', body=PDF_JS_STUB + '\nwindow.signtrailPdfJsReady = Promise.resolve(window.pdfjsLib);')
            return
        if url.endswith('/vendor/pdf-lib.min.js'):
            await route.fulfill(status=200, content_type='application/javascript', body=PDF_LIB_STUB)
            return
        if url.endswith('/vendor/jszip.min.js'):
            await route.fulfill(status=200, content_type='application/javascript', body=JSZIP_STUB)
            return
        if url.endswith('/api/session') and route.request.method == 'GET':
            await route.fulfill(status=200, content_type='application/json', body=json.dumps({'authenticated':True,'email':'owner@example.com','name':'SignTrail Owner'}))
            return
        if url.endswith('/api/envelopes') and route.request.method == 'POST':
            if fail_create:
                await route.fulfill(status=503, content_type='application/json', body=json.dumps({'error':'Temporary hosted storage failure.'}))
                return
            await route.fulfill(status=201, content_type='application/json', body=json.dumps({
                'envelopeId':'env-browser-1',
                'shareUrl': f'{BASE}/#sign=recipient-token-browser',
                'manageToken':'manage-token-browser',
                'createdAt':'2026-07-30T02:30:00.000Z'
            }))
            return
        if url.endswith('/api/recipient/complete') and route.request.method == 'POST':
            proof = {
                'format':'signtrail-proof-capsule','version':'1.1','verificationId':'ST-20260730-ABCDEF1234',
                'documentName':'acceptance-agreement.pdf','originalHash':'b'*64,'signedHash':'a'*64,
                'createdAt':'2026-07-30T02:30:00.000Z','completedAt':'2026-07-30T02:40:00.000Z','pageCount':1,
                'fields':[],'events':[],'verificationScope':'byte-for-byte-document-match','identityAssurance':'none',
                'completionEvidence':'client-attested-field-state','receiptMeaning':'byte-match-integrity-only',
                'integrity':{'algorithm':'SHA-256','digest':'c'*64}
            }
            await route.fulfill(status=200, content_type='application/json', body=json.dumps({
                'envelopeId':'env-browser-1','status':'completed','completedAt':'2026-07-30T02:40:00.000Z',
                'verificationId':'ST-20260730-ABCDEF1234','signedHash':'a'*64,'proofCapsule':proof
            }))
            return
        if url.endswith('/api/recipient') and route.request.method == 'GET':
            await route.fulfill(status=200, content_type='application/json', body=json.dumps({
                'envelopeId':'env-browser-1',
                'documentName':'acceptance-agreement.pdf',
                'title':'Please sign the acceptance agreement',
                'message':'Complete your printed name, mailing address, and signature.',
                'createdAt':'2026-07-30T02:30:00.000Z','expiresAt':'2026-08-06T02:30:00.000Z',
                'status':'opened',
                'fields':ENVELOPE_FIELDS,
                'pageCount':1,
                'originalHash':'b'*64,
                'documentEndpoint':'/api/recipient/document','signedPdfEndpoint':'','proofCapsuleEndpoint':'',
                'viewer':{'authenticated':False,'email':'','name':''},
                'trackingDisclosure':'Opening this private link records a link-open event. Counts may include reloads, previews, scanners, or forwarded links.'
            }))
            return
        if url.endswith('/api/recipient/document'):
            await route.fulfill(status=200, content_type='application/pdf', body=PDF_PATH.read_bytes())
            return
        if url.endswith('/api/manage') and route.request.method == 'GET':
            await route.fulfill(status=200, content_type='application/json', body=json.dumps({
                'envelopeId':'env-browser-1','documentName':'acceptance-agreement.pdf','title':'Please sign the acceptance agreement',
                'recipientEmail':'recipient@example.com','createdAt':'2026-07-30T02:30:00.000Z','status':'opened',
                'openedAt':'2026-07-30T02:35:00.000Z','lastOpenedAt':'2026-07-30T02:35:00.000Z','openedCount':1,
                'verifiedOpenerEmail':'','verifiedOpenerName':'','completedAt':None,'signedHash':'','verificationId':'',
                'signedPdfAvailable':False,'proofCapsuleAvailable':False
            }))
            return
        await route.continue_()
    await page.route('**/*', handler)

async def install_runtime(page, pending_token=''):
    await page.evaluate("""(pendingToken) => {
      const store = new Map();
      Object.defineProperty(window, 'localStorage', {
        configurable: true,
        value: {
          getItem: key => store.has(String(key)) ? store.get(String(key)) : null,
          setItem: (key, value) => store.set(String(key), String(value)),
          removeItem: key => store.delete(String(key)),
          clear: () => store.clear(),
          key: index => [...store.keys()][index] || null,
          get length() { return store.size; }
        }
      });
      const sessionStore = new Map();
      if (pendingToken) sessionStore.set('signtrail-recipient-token', pendingToken);
      Object.defineProperty(window, 'sessionStorage', {
        configurable: true,
        value: {
          getItem: key => sessionStore.has(String(key)) ? sessionStore.get(String(key)) : null,
          setItem: (key, value) => sessionStore.set(String(key), String(value)),
          removeItem: key => sessionStore.delete(String(key)),
          clear: () => sessionStore.clear(),
          key: index => [...sessionStore.keys()][index] || null,
          get length() { return sessionStore.size; }
        }
      });
      let counter = 0;
      Object.defineProperty(window, 'crypto', {
        configurable: true,
        value: {
          randomUUID: () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`,
          getRandomValues: array => { for (let i = 0; i < array.length; i += 1) array[i] = (i * 31 + counter * 17 + 13) & 255; counter += 1; return array; },
          subtle: {
            digest: async (_algorithm, input) => {
              const bytes = new Uint8Array(input);
              const out = new Uint8Array(32);
              let h = 2166136261 >>> 0;
              for (const byte of bytes) { h ^= byte; h = Math.imul(h, 16777619) >>> 0; }
              for (let i = 0; i < 32; i += 1) { h ^= (i + bytes.length); h = Math.imul(h, 16777619) >>> 0; out[i] = (h >>> ((i % 4) * 8)) & 255; }
              return out.buffer;
            }
          }
        }
      });
    }""", pending_token)

async def load_app(page, pending_token=''):
    await install_runtime(page, pending_token)
    html = (ROOT / 'public' / 'signtrail.html').read_text()
    html = html.replace('<head>', f'<head><base href="{BASE}/">', 1)
    await page.set_content(html, wait_until='load')

async def click_page_at(page, x_ratio, y_ratio):
    shell = page.locator('.page-shell')
    box = await shell.bounding_box()
    await page.mouse.click(box['x'] + box['width'] * x_ratio, box['y'] + box['height'] * y_ratio)

async def run():
    results = {'sender':{}, 'recipient':{}, 'exceptions':[], 'consoleErrors':[]}
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, executable_path='/usr/bin/chromium', args=['--no-sandbox'])
        context = await browser.new_context(viewport={'width':1440,'height':1000}, accept_downloads=True)
        page = await context.new_page()
        page.on('pageerror', lambda exc: results['exceptions'].append(str(exc)))
        page.on('console', lambda msg: results['consoleErrors'].append(msg.text) if msg.type == 'error' else None)
        await install_routes(page)
        await load_app(page)
        await page.set_input_files('#fileInput', str(PDF_PATH))
        await page.wait_for_selector('.page-shell', timeout=10000)

        await page.click('#recipientModeButton')
        placements = [
            ('#printNameTool', .34, .46),
            ('#addressTool', .38, .58),
            ('#dateTool', .68, .46),
            ('#signatureTool', .38, .73),
            ('#checkboxTool', .70, .73),
        ]
        for selector, xr, yr in placements:
            await page.click(selector)
            await click_page_at(page, xr, yr)
        results['sender']['fieldCount'] = int(await page.locator('#fieldCount').inner_text())
        results['sender']['recipientFields'] = await page.locator('.recipient-field').count()
        results['sender']['blankFields'] = await page.locator('.recipient-field:not(.signed)').count()
        results['sender']['senderCannotFillRecipient'] = await page.locator('.recipient-field .field-main:disabled').count() == 5
        await page.screenshot(path=str(EVIDENCE / 'gate-6-sender-blank-recipient-fields.png'), full_page=True)

        results['sender']['sidebarLinkButtonRemoved'] = await page.locator('#openShareModalButton').count() == 0
        results['sender']['finalizeLabelBefore'] = await page.locator('#exportButton').inner_text()
        await page.click('#exportButton')
        await page.wait_for_selector('#shareModal:not(.hidden)')
        results['sender']['postFinalizeModalShown'] = 'Finalized' in (await page.locator('#shareModalTitle').inner_text())
        results['sender']['documentStateAfterFinalize'] = await page.locator('#documentState').inner_text()
        results['sender']['linkActionAfterFinalize'] = await page.locator('#exportButton').inner_text()
        results['sender']['editorLockedBeforeLink'] = await page.locator('[data-tool]:disabled').count() == 8
        results['sender']['noLinkBeforeCreate'] = await page.locator('#shareResult').evaluate("el => el.classList.contains('hidden')")
        results['sender']['pdfBuildsAfterFinalize'] = await page.evaluate('window.__signtrailPdfSaveCount')
        await page.wait_for_function("document.querySelector('#shareAuthStatus')?.textContent.includes('owner@example.com')")
        results['sender']['ownerSessionConfirmed'] = 'owner@example.com' in (await page.locator('#shareAuthStatus').inner_text())
        await page.fill('#shareRecipientEmail', 'recipient@example.com')
        await page.fill('#shareRequestTitle', 'Please sign the acceptance agreement')
        await page.fill('#shareMessage', 'Complete your printed name, mailing address, and signature.')
        await page.click('#createShareLinkButton')
        await page.wait_for_selector('#shareResult:not(.hidden)')
        results['sender']['shareUrl'] = await page.input_value('#shareLinkOutput')
        results['sender']['pdfBuildsAfterLinkCreation'] = await page.evaluate('window.__signtrailPdfSaveCount')
        results['sender']['linkReusedFinalizedBytes'] = results['sender']['pdfBuildsAfterFinalize'] == 1 and results['sender']['pdfBuildsAfterLinkCreation'] == 1
        results['sender']['mailtoAvailable'] = await page.locator('#emailShareLinkButton').is_enabled()
        results['sender']['documentStateAfter'] = await page.locator('#documentState').inner_text()
        results['sender']['finalizeLabelAfter'] = await page.locator('#exportButton').inner_text()
        results['sender']['editorLockedAfterLink'] = await page.locator('[data-tool]:disabled').count() == 8
        results['sender']['createButtonHiddenAfter'] = await page.locator('#createShareLinkButton').evaluate("el => el.classList.contains('hidden')")
        results['sender']['finalizationMetadataLocked'] = all([
            await page.locator('#shareRecipientEmail').is_disabled(),
            await page.locator('#shareRequestTitle').is_disabled(),
            await page.locator('#shareMessage').is_disabled(),
        ])
        await page.click('#cancelShareButton')
        await page.click('#exportButton')
        await page.wait_for_selector('#shareResult:not(.hidden)')
        results['sender']['linkReopensFromFinalize'] = (await page.input_value('#shareLinkOutput')) == results['sender']['shareUrl']
        await page.screenshot(path=str(EVIDENCE / 'gate-7-post-finalize-signee-link.png'), full_page=True)

        failed = await context.new_page()
        failed.on('pageerror', lambda exc: results['exceptions'].append(str(exc)))
        failed.on('console', lambda msg: results['consoleErrors'].append(msg.text) if msg.type == 'error' and 'Temporary hosted storage failure' not in msg.text and '503 (Service Unavailable)' not in msg.text else None)
        await install_routes(failed, fail_create=True)
        await load_app(failed)
        await failed.set_input_files('#fileInput', str(PDF_PATH))
        await failed.wait_for_selector('.page-shell', timeout=10000)
        await failed.click('#recipientModeButton')
        await failed.click('#signatureTool')
        failed_shell = failed.locator('.page-shell')
        failed_box = await failed_shell.bounding_box()
        await failed.mouse.click(failed_box['x'] + failed_box['width'] * .4, failed_box['y'] + failed_box['height'] * .7)
        await failed.click('#exportButton')
        await failed.wait_for_selector('#shareModal:not(.hidden)')
        await failed.fill('#shareRequestTitle', 'Failure path request')
        await failed.click('#createShareLinkButton')
        await failed.wait_for_function("document.querySelector('#toast')?.textContent.includes('Temporary hosted storage failure')")
        results['sender']['failedCreateKeepsFinalizedLock'] = await failed.locator('[data-tool]:disabled').count() == 8
        results['sender']['failedCreateKeepsLinkPendingState'] = (await failed.locator('#documentState').inner_text()) == 'Finalized · link pending'
        results['sender']['failedCreateCanRetry'] = (await failed.locator('#exportButton').inner_text()) == 'Create signee link'
        results['sender']['failedCreateHasNoLink'] = await failed.locator('#shareResult').evaluate("el => el.classList.contains('hidden')")
        await failed.close()

        mobile = await browser.new_context(viewport={'width':390,'height':844}, accept_downloads=True)
        frame_source = (ROOT / 'app' / 'signtrail-frame.tsx').read_text()
        results['recipient']['frameForwardsRootFragment'] = 'window.location.hash' in frame_source and '/signtrail.html${window.location.search}${window.location.hash}' in frame_source
        recipient = await mobile.new_page()
        recipient.on('pageerror', lambda exc: results['exceptions'].append(str(exc)))
        recipient.on('console', lambda msg: results['consoleErrors'].append(msg.text) if msg.type == 'error' else None)
        await install_routes(recipient)
        await load_app(recipient, 'recipient-token-browser')
        await recipient.wait_for_selector('[data-field-id="recipient-name"]', timeout=10000)
        results['recipient']['bannerHasMessage'] = 'mailing address' in (await recipient.locator('#recipientBanner').inner_text()).lower()
        results['recipient']['fieldsLoaded'] = await recipient.locator('.recipient-field').count()

        await recipient.click('[data-field-id="recipient-name"] .field-main')
        await recipient.fill('#fieldValueInput', 'Rooke Poole')
        await recipient.click('#applyFieldValueButton')
        await recipient.click('[data-field-id="recipient-date"] .field-main')
        await recipient.click('#applyFieldValueButton')
        await recipient.click('[data-field-id="recipient-address"] .field-main')
        await recipient.fill('#fieldValueTextarea', '123 Example Street\nSully, IA 50251')
        await recipient.click('#applyFieldValueButton')
        await recipient.click('[data-field-id="recipient-checkbox"] .field-main')
        await recipient.click('[data-field-id="recipient-signature"] .field-main')
        pad = recipient.locator('#signaturePad')
        box = await pad.bounding_box()
        await recipient.mouse.move(box['x']+35, box['y']+110)
        await recipient.mouse.down()
        for i in range(1, 14):
            await recipient.mouse.move(box['x']+35+i*19, box['y']+110-(i%4)*11)
        await recipient.mouse.up()
        await recipient.click('#applySignatureButton')
        results['recipient']['completedBeforeFinish'] = int(await recipient.locator('#signedCount').inner_text())
        results['recipient']['requiredLeftBeforeFinish'] = int(await recipient.locator('#requiredCount').inner_text())
        await recipient.click('#exportButton')
        await recipient.wait_for_selector('#completionModal:not(.hidden)')
        results['recipient']['completionShown'] = True
        results['recipient']['signedPdfExportAvailable'] = await recipient.locator('#downloadSignedPdfButton').is_enabled()
        results['recipient']['handoffExportAvailable'] = await recipient.locator('#exportHandoffButton').is_enabled()
        results['recipient']['noHorizontalOverflow'] = await recipient.evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth')
        await recipient.screenshot(path=str(EVIDENCE / 'gate-7-recipient-mobile-completion.png'), full_page=True)

        await mobile.close()
        await context.close()
        await browser.close()
    results['status'] = 'PASS' if (
        results['sender'].get('fieldCount') == 5 and
        results['sender'].get('senderCannotFillRecipient') and
        results['sender'].get('sidebarLinkButtonRemoved') and
        results['sender'].get('postFinalizeModalShown') and
        results['sender'].get('documentStateAfterFinalize') == 'Finalized · link pending' and
        results['sender'].get('linkActionAfterFinalize') == 'Create signee link' and
        results['sender'].get('editorLockedBeforeLink') and
        results['sender'].get('noLinkBeforeCreate') and
        results['sender'].get('linkReusedFinalizedBytes') and
        results['sender'].get('ownerSessionConfirmed') and
        results['sender'].get('documentStateAfter') == 'Awaiting recipient' and
        results['sender'].get('finalizeLabelAfter') == 'View signee link' and
        results['sender'].get('editorLockedAfterLink') and
        results['sender'].get('createButtonHiddenAfter') and
        results['sender'].get('finalizationMetadataLocked') and
        results['sender'].get('linkReopensFromFinalize') and
        results['sender'].get('failedCreateKeepsFinalizedLock') and
        results['sender'].get('failedCreateKeepsLinkPendingState') and
        results['sender'].get('failedCreateCanRetry') and
        results['sender'].get('failedCreateHasNoLink') and
        results['sender'].get('shareUrl', '').endswith('recipient-token-browser') and
        results['recipient'].get('frameForwardsRootFragment') and
        results['recipient'].get('fieldsLoaded') == 5 and
        results['recipient'].get('completionShown') and
        results['recipient'].get('signedPdfExportAvailable') and
        results['recipient'].get('noHorizontalOverflow') and
        not results['exceptions'] and not results['consoleErrors']
    ) else 'FAIL'
    (EVIDENCE / 'gate-7-browser-results.json').write_text(json.dumps(results, indent=2))
    print(json.dumps(results, indent=2))
    if results['status'] != 'PASS':
        raise SystemExit(1)

if __name__ == '__main__':
    asyncio.run(run())
