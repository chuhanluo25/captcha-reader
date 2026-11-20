// Open through the action event so the toolbar click grants activeTab.
chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: false});
chrome.action.onClicked.addListener(tab => {
  chrome.sidePanel.open({windowId: tab.windowId}).catch(console.error);
});
chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (msg.type !== 'captcha-capture' || !sender.tab) return;
  (async () => {
    const [active] = await chrome.tabs.query({active: true, windowId: sender.tab.windowId});
    if (active?.id !== sender.tab.id) throw new Error('请保持验证码页面处于当前标签页。');
    let screenshot;
    try {
      screenshot = await chrome.tabs.captureVisibleTab(sender.tab.windowId, {format: 'png'});
    } catch (error) {
      if (/permission|activeTab|all_urls/i.test(error.message)) {
        throw new Error('截图权限尚未生效：请在当前网页点击工具栏的插件图标，再重新框选。');
      }
      throw error;
    }
    await chrome.storage.session.set({capture: {
      screenshot, rect: msg.rect, viewport: msg.viewport,
      tabId: sender.tab.id, token: crypto.randomUUID()
    }});
    reply({ok: true});
  })().catch(error => reply({error: error.message}));
  return true;
});
