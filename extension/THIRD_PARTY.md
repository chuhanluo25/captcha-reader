# Third-party components

- ddddocr 1.5.6, MIT, https://github.com/sml2h3/ddddocr
  - `vendor/model.onnx` is the unmodified `common_old.onnx` from the official PyPI wheel.
  - `vendor/charset.json` is the corresponding charset extracted from that same wheel.
  - License: `vendor/LICENSE-ddddocr.txt`.
- ONNX Runtime Web 1.20.1, MIT, https://github.com/microsoft/onnxruntime
  - Original npm distribution: https://registry.npmjs.org/onnxruntime-web/-/onnxruntime-web-1.20.1.tgz
  - `vendor/ort.min.js` is the package's `dist/ort.wasm.min.js` (renamed).
  - `ort-wasm-simd-threaded.mjs` and `.wasm` are unmodified distribution files.
  - Thread count is set to 1; inference uses the WASM CPU backend.

Everything needed for inference is bundled. Extension code never fetches third-party URLs.
