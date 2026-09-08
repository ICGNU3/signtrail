# Third-Party Runtime Components

The build copies these exact npm packages into same-origin static assets:

- `pdfjs-dist` 6.1.200 — Apache-2.0
- `pdf-lib` 1.17.1 — MIT
- `jszip` 3.10.1 — MIT or GPLv3 dual license; SignTrail uses it under MIT

The deployment build must obtain these packages from the configured npm registry and copy only the runtime assets listed in `build/copy-signtrail-vendor.mjs`.

No third-party runtime script CDN is used by `public/signtrail.html`.
