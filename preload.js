// preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    readData: () => ipcRenderer.invoke('read-data'),
    writeData: (data) => ipcRenderer.invoke('write-data', data),
    openVcfDialog: () => ipcRenderer.invoke('open-vcf-dialog'),
    saveVcfFile: (content) => ipcRenderer.invoke('save-vcf-file', content),
    // السطر التالي يكمل ربط وظيفة فتح الرابط الخارجي
    openExternalLink: (url) => ipcRenderer.invoke('open-external-link', url),
});