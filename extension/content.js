(() => {
  if (globalThis.__captchaReaderInstalled) return;
  globalThis.__captchaReaderInstalled = true;
  let cleanup = null;
  const editable = el => el instanceof HTMLInputElement && ['text','search','tel','number',''].includes(el.type) && !el.disabled && !el.readOnly;
  chrome.runtime.onMessage.addListener((msg, sender, reply) => {
    if (msg.type !== 'captcha-select' && msg.type !== 'captcha-fill') return;
    cleanup?.();
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;pointer-events:none';
    const shadow = host.attachShadow({mode:'closed'});
    const hint = document.createElement('div');
    hint.style.cssText = 'position:absolute;left:50%;top:16px;transform:translateX(-50%);background:#143d62;color:white;padding:12px 20px;border-radius:10px;font:15px sans-serif;box-shadow:0 4px 20px #0004';
    hint.textContent = msg.type === 'captcha-select' ? '拖动框选验证码文字区域 · Esc 取消' : '点击验证码输入框填写 · Esc 取消';
    shadow.append(hint);document.documentElement.append(host);
    let down,move,up,click;
    const finish = () => {
      host.remove();document.removeEventListener('keydown',key,true);
      if(down)document.removeEventListener('pointerdown',down,true);
      if(move)document.removeEventListener('pointermove',move,true);
      if(up)document.removeEventListener('pointerup',up,true);
      if(click)document.removeEventListener('click',click,true);
      cleanup=null;
    };
    const key = e => {if(e.key==='Escape'){e.preventDefault();finish();}};
    document.addEventListener('keydown',key,true);cleanup=finish;
    if(msg.type==='captcha-fill') {
      click = e => {
        const el=e.composedPath().find(editable);
        if(!el){hint.textContent='请点击验证码输入框（不能选择密码框）· Esc 取消';return;}
        e.preventDefault();e.stopImmediatePropagation();
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,msg.text);
        el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));el.focus();finish();
      };
      document.addEventListener('click',click,true);reply({ok:true});return;
    }
    const layer=document.createElement('div');
    layer.style.cssText='position:absolute;inset:0;pointer-events:auto;cursor:crosshair;background:#0000000a';
    const box=document.createElement('div');box.style.cssText='position:absolute;border:2px solid #2376de;background:#2376de1a;box-sizing:border-box;pointer-events:none';
    layer.append(box);shadow.prepend(layer);
    let start=null, rect;
    const point=e=>({x:Math.max(0,Math.min(innerWidth,e.clientX)),y:Math.max(0,Math.min(innerHeight,e.clientY))});
    down=e=>{if(e.button!==0)return;e.preventDefault();e.stopImmediatePropagation();start=point(e);};
    move=e=>{
      if(!start)return;e.preventDefault();e.stopImmediatePropagation();const p=point(e);
      rect={x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),width:Math.abs(start.x-p.x),height:Math.abs(start.y-p.y)};
      Object.assign(box.style,{left:rect.x+'px',top:rect.y+'px',width:rect.width+'px',height:rect.height+'px'});
    };
    up=async e=>{
      if(!start)return;move(e);e.preventDefault();e.stopImmediatePropagation();
      if(!rect||rect.width<12||rect.height<12){start=null;hint.textContent='范围太小，请重新拖动框选 · Esc 取消';return;}
      const viewport={width:innerWidth,height:innerHeight};finish();
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      try {const r=await chrome.runtime.sendMessage({type:'captcha-capture',rect,viewport});if(r?.error)alert(r.error);}catch(e){alert('截图失败：'+e.message);}
    };
    document.addEventListener('pointerdown',down,true);document.addEventListener('pointermove',move,true);document.addEventListener('pointerup',up,true);
    reply({ok:true});
  });
})();
