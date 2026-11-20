/* Single-glyph CNN and validation-selected geometry from glyph_cnn_benchmark. */
globalThis.GlyphOCR = (() => {
  const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let ready;
  async function load() {
    if (!ready) ready = (async () => {
      const responses = await Promise.all(['model.json', 'weights.bin'].map(
        name => fetch(new URL('vendor/glyph/' + name, location.href))));
      if (responses.some(response => !response.ok)) throw Error('单字符模型加载失败');
      const metadata = await responses[0].json();
      const binary = await responses[1].arrayBuffer();
      const weights = {};
      for (const [name, spec] of Object.entries(metadata.weights)) {
        weights[name] = new Float32Array(binary, spec.offset * 4, spec.length);
      }
      return {metadata, weights};
    })().catch(error => { ready = null; throw error; });
    return ready;
  }
  function infer(tile, weights) {
    let values = Float32Array.from(tile, value => 1 - value / 255);
    let side = 32, channels = 1;
    for (const [block, outputs] of [[0, 12], [4, 24], [8, 40]]) {
      const kernel = weights[block + '.weight'];
      const bias = weights[block + '.bias'];
      const gain = weights[(block + 1) + '.weight'];
      const shift = weights[(block + 1) + '.bias'];
      const mean = weights[(block + 1) + '.running_mean'];
      const variance = weights[(block + 1) + '.running_var'];
      const nextSide = side / 2;
      const next = new Float32Array(outputs * nextSide * nextSide);
      for (let output = 0; output < outputs; output++) {
        const multiplier = gain[output] / Math.sqrt(variance[output] + 1e-5);
        for (let y = 0; y < side; y++) {
          for (let x = 0; x < side; x++) {
            let sum = bias[output];
            for (let channel = 0; channel < channels; channel++) {
              for (let ky = 0; ky < 3; ky++) {
                const sy = y + ky - 1;
                if (sy < 0 || sy >= side) continue;
                for (let kx = 0; kx < 3; kx++) {
                  const sx = x + kx - 1;
                  if (sx < 0 || sx >= side) continue;
                  sum += values[(channel * side + sy) * side + sx] *
                    kernel[((output * channels + channel) * 3 + ky) * 3 + kx];
                }
              }
            }
            const index = (output * nextSide + Math.floor(y / 2)) * nextSide + Math.floor(x / 2);
            next[index] = Math.max(next[index], (sum - mean[output]) * multiplier + shift[output]);
          }
        }
      }
      values = next; side = nextSide; channels = outputs;
    }
    for (const [layer, outputs] of [[13, 80], [15, 36]]) {
      const next = new Float64Array(outputs);
      for (let output = 0; output < outputs; output++) {
        let sum = weights[layer + '.bias'][output];
        for (let input = 0; input < values.length; input++) {
          sum += values[input] * weights[layer + '.weight'][output * values.length + input];
        }
        next[output] = layer === 13 ? Math.max(0, sum) : sum;
      }
      values = next;
    }
    return Array.from(values);
  }
  function neighbors(index) {
    const result = [];
    if (index >= 32) result.push(index - 32);
    if (index < 992) result.push(index + 32);
    if (index % 32) result.push(index - 1);
    if (index % 32 < 31) result.push(index + 1);
    return result;
  }
  function holes(tile) {
    let ink = Uint8Array.from(tile, value => value < 160);
    const scale = Math.max(1, ink.reduce((sum, value) => sum + value, 0));
    const description = [];
    for (let level = 0; level < 3; level++) {
      const seen = new Uint8Array(1024), areas = [];
      for (let start = 0; start < 1024; start++) {
        if (ink[start] || seen[start]) continue;
        const queue = [start];
        seen[start] = 1;
        let border = false;
        for (let head = 0; head < queue.length; head++) {
          const index = queue[head];
          if (index < 32 || index >= 992 || index % 32 === 0 || index % 32 === 31) border = true;
          for (const neighbor of neighbors(index)) {
            if (!ink[neighbor] && !seen[neighbor]) {
              seen[neighbor] = 1;
              queue.push(neighbor);
            }
          }
        }
        if (!border) areas.push(queue.length);
      }
      areas.sort((a, b) => b - a);
      description.push(Math.min(4, areas.length), areas.reduce((a, b) => a + b, 0) / scale,
        (areas[1] || 0) / scale);
      ink = Uint8Array.from(ink, (value, index) =>
        value && neighbors(index).length === 4 && neighbors(index).every(i => ink[i]));
    }
    return description;
  }
  function top(scores) {
    return scores.map((score, index) => ({score, index}))
      .sort((a, b) => b.score - a.score || a.index - b.index);
  }
  function isPair(scores) {
    const pair = top(scores).slice(0, 2).map(item => item.index);
    return pair.includes(0) && pair.includes(24);
  }
  function adjust(scores, tile, size, metadata, mode) {
    const result = scores.slice();
    const clamp = value => Math.max(-4, Math.min(4, value));
    if (isPair(result)) {
      const p = metadata.aspect;
      const evidence = clamp(p.slope * (Math.log(size[0] / size[1]) - p.mean) / p.std + p.bias);
      result[24] += p.weight * evidence / 2;
      result[0] -= p.weight * evidence / 2;
    }
    if (mode === 'holes' && isPair(result)) {
      const p = metadata.holes, descriptor = holes(tile);
      const evidence = clamp(descriptor.reduce((sum, value, i) =>
        sum + (value - p.mean[i]) / p.scale[i] * p.coef[i], p.bias));
      result[24] += p.weight * evidence / 2;
      result[0] -= p.weight * evidence / 2;
    }
    return result;
  }
  function normalize(image) {
    const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
    if (!width || !height || width * height > 16000000) throw Error('请使用小于 1600 万像素的单字符图片');
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', {willReadFrequently: true});
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, width, height);
    let left = width, right = -1, upper = height, lower = -1;
    for (let i = 0; i < width * height; i++) {
      const offset = i * 4;
      const gray = Math.round(.299 * pixels.data[offset] + .587 * pixels.data[offset + 1] + .114 * pixels.data[offset + 2]);
      pixels.data[offset] = pixels.data[offset + 1] = pixels.data[offset + 2] = gray;
      if (gray < 160) {
        const x = i % width, y = Math.floor(i / width);
        left = Math.min(left, x); right = Math.max(right, x);
        upper = Math.min(upper, y); lower = Math.max(lower, y);
      }
    }
    if (right < left) throw Error('图片为空白，请框选一个浅底深色字符');
    ctx.putImageData(pixels, 0, 0);
    const size = [right - left + 1, lower - upper + 1];
    const scale = 28 / Math.max(...size);
    const target = size.map(value => Math.max(1, Math.round(value * scale)));
    const output = document.createElement('canvas');
    output.width = output.height = 32;
    const out = output.getContext('2d', {willReadFrequently: true});
    out.fillStyle = 'white'; out.fillRect(0, 0, 32, 32);
    out.imageSmoothingEnabled = true; out.imageSmoothingQuality = 'high';
    out.drawImage(canvas, left, upper, ...size, Math.floor((32 - target[0]) / 2),
      Math.floor((32 - target[1]) / 2), ...target);
    const data = out.getImageData(0, 0, 32, 32).data;
    return {tile: Uint8Array.from({length: 1024}, (_, i) => data[i * 4]), size};
  }
  async function recognize(image, mode) {
    const {weights, metadata} = await load();
    const {tile, size} = normalize(image);
    const scores = adjust(infer(tile, weights), tile, size, metadata, mode);
    const candidates = top(scores).slice(0, 3).map(item => alphabet[item.index]);
    return {text: candidates[0], candidates};
  }
  return {recognize, infer, adjust, holes, normalize};
})();
