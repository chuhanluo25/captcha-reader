/* ddddocr 1.5.6 common_old model, ONNX Runtime Web 1.20.1. See THIRD_PARTY.md. */
globalThis.CaptchaOCR = (() => {
  let ready;
  const base = new URL('./vendor/', location.href).href;
  async function init() {
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = base;
    const [session, chars] = await Promise.all([
      ort.InferenceSession.create(base+'model.onnx',{executionProviders:['wasm'],graphOptimizationLevel:'all'}),
      fetch(base+'charset.json').then(r=>{if(!r.ok)throw Error('字符表加载失败');return r.json();})
    ]);
    return {session,chars};
  }
  function decode(data,dims,chars,range) {
    const classes=dims[dims.length-1];
    if(classes!==chars.length)throw Error('模型与字符表不匹配');
    const regex=range==='digits'?/^[0-9]$/:range==='upper'?/^[A-Z0-9]$/:range==='latin'?/^[A-Za-z0-9]$/:null;
    const allowed=chars.map((c,i)=>i===0||!regex||regex.test(c));
    let result='',last=0;
    for(let offset=0;offset<data.length;offset+=classes){
      let best=0;
      for(let j=1;j<classes;j++)if(allowed[j]&&data[offset+j]>data[offset+best])best=j;
      if(best!==last&&best!==0)result+=chars[best];
      last=best;
    }
    return result;
  }
  async function recognize(img,range='upper') {
    if(!ready)ready=init().catch(e=>{ready=null;throw e;});
    const {session,chars}=await ready;
    const width=Math.max(8,Math.min(2048,Math.floor(img.width*64/img.height)));
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=64;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.fillStyle='white';ctx.fillRect(0,0,width,64);
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(img,0,0,width,64);
    const pixels=ctx.getImageData(0,0,width,64).data;const values=new Float32Array(width*64);
    for(let i=0;i<values.length;i++)values[i]=(Math.round(pixels[i*4]*.299+pixels[i*4+1]*.587+pixels[i*4+2]*.114)/255-.5)/.5;
    const out=await session.run({[session.inputNames[0]]:new ort.Tensor('float32',values,[1,1,64,width])});
    const logits=out[session.outputNames[0]];
    return decode(logits.data,logits.dims,chars,range);
  }
  return {recognize,decode};
})();
