const $=id=>document.getElementById(id);
let currentImage=null,sourceTab=null,busy=false,generation=0;
function status(t){$('status').textContent=t;}
function buttons(){renderReview();const text=$('result').value.trim();$('copy').disabled=!text||busy;$('fill').disabled=!text||busy;$('retry').disabled=!currentImage||busy;$('select').disabled=busy;$('file').disabled=busy;$('charset').disabled=busy||$('engine').value!=='whole';$('engine').disabled=busy;}
const correctionHistory = [];
// Map the displayed prediction to characters the reader may want to check.
const reviewAlternatives = {'9': 'G', '3': 'B', 'C': 'G', '6': 'G', 'G': '6'};
const confusableGroups = ['0Oo', '1Il', '2Z', '5S', '8B'];
function renderReview() {
  const field = $('result');
  const choices = $('choices');
  const allowed = {upper: /^[A-Z0-9]$/, digits: /^[0-9]$/, latin: /^[A-Za-z0-9]$/, all: /^.$/u}[$('engine').value==='whole'?$('charset').value:'upper'];
  choices.replaceChildren();
  const letters = Array.from(field.value);
  if (!busy) letters.forEach((letter, index) => {
    const group = confusableGroups.find(group => group.includes(letter));
    const alternatives = new Set((reviewAlternatives[letter] || '') + (group || ''));
    for (const alternative of alternatives) {
      if (alternative === letter || !allowed.test(alternative)) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = `第 ${index + 1} 位：${letter} → ${alternative}`;
      button.onclick = () => {
        correctionHistory.push({text: field.value, index});
        const corrected = letters.slice();
        corrected[index] = alternative;
        field.value = corrected.join('');
        buttons();
        field.focus();
        const offset = corrected.slice(0, index).join('').length;
        field.setSelectionRange(offset, offset + alternative.length);
      };
      choices.append(button);
    }
  });
  $('undoCorrection').hidden = !correctionHistory.length || busy;
  $('review').hidden = !choices.childElementCount && $('undoCorrection').hidden;
}
$('undoCorrection').onclick = () => {
  const previous = correctionHistory.pop();
  if (!previous) return;
  const field = $('result');
  field.value = previous.text;
  buttons();
  field.focus();
  const chars = Array.from(previous.text);
  const offset = chars.slice(0, previous.index).join('').length;
  field.setSelectionRange(offset, offset + chars[previous.index].length);
};
function setZoom(enlarged) {
  const preview = $('preview');
  $('imageArea').classList.toggle('enlarged', enlarged);
  preview.style.width = enlarged ? (currentImage.naturalWidth * 2) + 'px' : '';
  $('zoom').setAttribute('aria-pressed', String(enlarged));
  $('zoom').textContent = enlarged ? '还原大小' : '放大原图';
}
$('zoom').onclick = () => setZoom($('zoom').getAttribute('aria-pressed') !== 'true');
async function imageFrom(url){const img=new Image();img.src=url;await img.decode();return img;}
async function recognize(){
  if(!currentImage||busy)return;correctionHistory.length=0;busy=true;$('result').value='';buttons();status('正在本机识别… 首次加载模型可能需要数秒。');
  const token=generation;
  try{const mode=$('engine').value;
    const prediction=mode==='whole'
      ? {text:await CaptchaOCR.recognize(currentImage,$('charset').value)}
      : await GlyphOCR.recognize(currentImage,mode);
    if(token===generation){
      $('result').value=prediction.text;
      status(prediction.candidates
        ? '单字符候选（按模型分数排序）：'+prediction.candidates.join('、')+'。请对照原图核对。'
        : prediction.text?'识别完成，请核对结果后填写。':'未识别出文字，请缩小框选范围或刷新验证码后重试。');
    }}
  catch(e){status('识别失败：'+e.message+'。可关闭侧栏后重开重试。');}
  finally{busy=false;buttons();}
}
async function setImage(url,tabId){
  generation++;sourceTab=tabId??null;currentImage=await imageFrom(url);$('preview').src=url;$('preview').hidden=false;$('empty').hidden=true;$('zoom').hidden=false;setZoom(false);await recognize();
}
async function acceptCapture(capture){
  if(!capture)return;
  try{
    if(busy){status('正在识别上一张图片，请稍后重新框选。');return;}
    const img=await imageFrom(capture.screenshot);const {rect:r,viewport:v}=capture;
    const sx=img.width/v.width,sy=img.height/v.height;
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(r.width*sx));canvas.height=Math.max(1,Math.round(r.height*sy));
    canvas.getContext('2d').drawImage(img,r.x*sx,r.y*sy,r.width*sx,r.height*sy,0,0,canvas.width,canvas.height);
    const url=canvas.toDataURL('image/png');await chrome.storage.session.remove('capture');await setImage(url,capture.tabId);
  }catch(e){status('处理截图失败：'+e.message);}
}
async function inject(tab){
  let url;
  try { url=new URL(tab.url); } catch { throw Error('无法读取当前网页地址，请重新加载插件后重试。'); }
  if(!['http:','https:'].includes(url.protocol))throw Error('请在 HTTP 或 HTTPS 登录网页上使用；Chrome 设置页和本地文件不支持框选。');
  if(url.hostname==='chromewebstore.google.com'||(url.hostname==='chrome.google.com'&&url.pathname.startsWith('/webstore')))throw Error('Chrome 扩展商店禁止网页注入，请切换到验证码所在网页。');
  const access={origins:[url.protocol+'//'+url.hostname+'/*']};
  if(!await chrome.permissions.contains(access)){
    status('请在 Chrome 弹窗中允许访问当前网站，然后继续框选或填写。');
    if(!await chrome.permissions.request(access))throw Error('未授予当前网站权限。请再次点击按钮，并在 Chrome 弹窗中选择允许。');
  }
  try { await chrome.scripting.executeScript({target:{tabId:tab.id},files:['content.js']}); }
  catch(e){
    if(/Cannot access|permission/i.test(e.message))throw Error('Chrome 仍限制访问此网站。请在插件详情的「网站访问权限」中允许当前网站，刷新网页后再试。');
    throw e;
  }
}
$('select').onclick=async()=>{
  try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id)throw Error('请先打开验证码网页');await inject(tab);await chrome.tabs.sendMessage(tab.id,{type:'captcha-select'});status('请在网页上拖动框选验证码图片。');}
  catch(e){status('无法框选：'+e.message);}
};
$('fill').onclick=async()=>{
  try{const [tab]=await chrome.tabs.query({active:true,currentWindow:true});if(!tab?.id)throw Error('请先打开验证码网页');if(sourceTab!==null&&tab.id!==sourceTab)throw Error('请切回刚才框选验证码的标签页');await inject(tab);await chrome.tabs.sendMessage(tab.id,{type:'captcha-fill',text:$('result').value.trim()});status('请点击网页中的验证码输入框。');}
  catch(e){status('填写失败：'+e.message+'。也可以复制结果后粘贴。');}
};
$('file').onchange=async()=>{
  const file=$('file').files[0];if(!file)return;
  if(file.size>8*1024*1024){status('请选择 8 MB 以内的验证码图片。');return;}
  const url=URL.createObjectURL(file);
  try{await setImage(url,null);}catch(e){status('打开图片失败：'+e.message);}finally{URL.revokeObjectURL(url);$('file').value='';}
};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('result').value.trim());status('已复制。');}catch{status('复制失败，请选中结果后按 Ctrl+C。');}};
$('engine').onchange=()=>{
  $('glyphHint').hidden=$('engine').value==='whole';
  buttons();
  recognize();
};
$('retry').onclick=recognize;$('charset').onchange=recognize;$('result').oninput=()=>{correctionHistory.length=0;buttons();};
chrome.storage.onChanged.addListener((changes,area)=>{if(area==='session'&&changes.capture?.newValue)acceptCapture(changes.capture.newValue);});
chrome.storage.session.get('capture').then(({capture})=>acceptCapture(capture));
buttons();
