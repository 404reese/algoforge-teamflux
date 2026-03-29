const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  chatWithLlama: (messages) => ipcRenderer.invoke('chat:llama', messages),

  liveAssist: {
    start: () => ipcRenderer.invoke('live-assist:start'),
    stop: () => ipcRenderer.invoke('live-assist:stop'),
    sendAudio: (base64) => ipcRenderer.invoke('live-assist:audio-chunk', base64),

    onAudioResponse: (cb) => ipcRenderer.on('live-assist:audio-response', (_e, data) => cb(data)),
    onTranscript:    (cb) => ipcRenderer.on('live-assist:transcript',     (_e, data) => cb(data)),
    onStatus:        (cb) => ipcRenderer.on('live-assist:status',         (_e, s)    => cb(s)),
    onError:         (cb) => ipcRenderer.on('live-assist:error',          (_e, msg)  => cb(msg)),
    onToolCall:      (cb) => ipcRenderer.on('live-assist:tool-call',      (_e, data) => cb(data)),
    onToolResult:    (cb) => ipcRenderer.on('live-assist:tool-result',    (_e, data) => cb(data)),

    removeAllListeners: () => {
      ['live-assist:audio-response', 'live-assist:transcript',
       'live-assist:status', 'live-assist:error',
       'live-assist:tool-call', 'live-assist:tool-result'].forEach(ch => {
        ipcRenderer.removeAllListeners(ch);
      });
    }
  },

  // ─── Blinkit Grocery Ordering ───────────────────────────────────────────────
  blinkit: {
    getIngredients: (dish)     => ipcRenderer.invoke('blinkit:get-ingredients', dish),
    open:           ()         => ipcRenderer.invoke('blinkit:open'),
    addItem:        (itemName) => ipcRenderer.invoke('blinkit:add-item', itemName),
    close:          ()         => ipcRenderer.invoke('blinkit:close'),
    onShowModal:    (cb)       => ipcRenderer.on('blinkit:show-modal', (_e, d) => cb(d)),
  }
});
