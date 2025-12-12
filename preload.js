// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Expõe APIs seguras para o renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),

  // Tickets
  getTickets: () => ipcRenderer.invoke('get-tickets'),
  saveTicket: (ticket) => ipcRenderer.invoke('save-ticket', ticket),
  deleteTicket: (ticketId) => ipcRenderer.invoke('delete-ticket', ticketId),

  // Schedules
  getSchedules: () => ipcRenderer.invoke('get-schedules'),
  saveSchedule: (schedule) => ipcRenderer.invoke('save-schedule', schedule),

  // Settings
  loadSettings: () => ipcRenderer.invoke('load-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings'),
  saveCustomStatuses: (statuses) => ipcRenderer.invoke('save-custom-statuses', statuses),

  // Excel operations
  exportToExcel: (tickets) => ipcRenderer.invoke('export-to-excel', tickets),
  importFromExcel: (arrayBuffer) => ipcRenderer.invoke('import-from-excel', arrayBuffer),
  processImportedTickets: (data) => ipcRenderer.invoke('process-imported-tickets', data),
  checkDuplicateTickets: (tickets) => ipcRenderer.invoke('check-duplicate-tickets', tickets)
});

// Handler para erros
window.addEventListener('error', (error) => {
  console.error('Erro no renderer:', error);
});