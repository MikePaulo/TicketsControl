const { app, BrowserWindow, ipcMain, shell, Menu, dialog, Notification, Tray, powerMonitor } = require('electron');
const path = require('path');
const mysql = require('mysql2/promise');
const ExcelJS = require('exceljs');
const fs = require('fs');
const os = require('os');
const { spawn, execSync } = require('child_process');
const config = require('./config');

// ===============================================================
// CONFIGURAÇÕES INICIAIS
// ===============================================================

app.commandLine.appendSwitch('lang', 'pt-BR');

// Prevenir recarregamento da página com F5/Ctrl+R
app.on('browser-window-created', (event, window) => {
  window.webContents.on('before-input-event', (event, input) => {
    const isReload = input.type === 'keyDown' &&
      (input.key === 'F5' || (input.control && input.key.toLowerCase() === 'r') || (input.meta && input.key.toLowerCase() === 'r'));

    if (isReload) {
      event.preventDefault();
      window.webContents.reload();
    }
  });
});

// Configurar nome do aplicativo para as notificações
app.setName('Tickets Control');
app.setAppUserModelId('TicketsControl');

// Prevenir que o app feche completamente quando todas as janelas são fechadas
let willQuitApp = false;
let tray = null;

// Prevenir múltiplas instâncias
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}

let dbConnection;
let mainWindow;
let isDatabaseConnected = false;

// Configuração do banco de dados MySQL
const dbConfig = config.database;


// ===============================================================
// CONTROLE DE INATIVIDADE E RECARREGAMENTO
// ===============================================================

let lastActivityTime = Date.now();
let inactivityCheckInterval;
let isUserActive = true;
const INACTIVITY_THRESHOLD = 5 * 60 * 1000; // 5 minutos em milissegundos
const INACTIVITY_CHECK_INTERVAL = 30 * 1000; // Verificar a cada 30 segundos

/**
 * Inicia o monitoramento de inatividade
 */
function startInactivityMonitoring() {
  console.log('🔍 Iniciando monitoramento de inatividade...');
  
  // Registrar eventos de atividade
  if (mainWindow) {
    // Monitorar eventos de mouse e teclado na janela principal
     mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' || input.type === 'keyUp') {
      resetInactivityTimer();
    }
  });

  // Adicionar listeners para movimento do mouse
  mainWindow.on('focus', () => {
    resetInactivityTimer();
  });


    // Monitorar movimento do mouse (via JavaScript no frontend)
    mainWindow.webContents.executeJavaScript(`
      document.addEventListener('mousemove', () => {
        require('electron').ipcRenderer.send('user-activity');
      });
      document.addEventListener('keydown', () => {
        require('electron').ipcRenderer.send('user-activity');
      });
      document.addEventListener('click', () => {
        require('electron').ipcRenderer.send('user-activity');
      });
      true;
    `).catch(console.error);
  }

  // Configurar verificação periódica de inatividade
  inactivityCheckInterval = setInterval(checkInactivity, INACTIVITY_CHECK_INTERVAL);
  
  console.log('✅ Monitoramento de inatividade iniciado');
}

/**
 * Para o monitoramento de inatividade
 */
function stopInactivityMonitoring() {
  if (inactivityCheckInterval) {
    clearInterval(inactivityCheckInterval);
    inactivityCheckInterval = null;
  }
  console.log('⏹️ Monitoramento de inatividade parado');
}

/**
 * Reseta o timer de inatividade
 */
function resetInactivityTimer() {
  lastActivityTime = Date.now();
  if (!isUserActive) {
    isUserActive = true;
    console.log('👤 Usuário ativo novamente');
  }
}

/**
 * Verifica se o usuário está inativo
 */
function checkInactivity() {
  const currentTime = Date.now();
  const timeSinceLastActivity = currentTime - lastActivityTime;
  
  if (timeSinceLastActivity >= INACTIVITY_THRESHOLD && isUserActive) {
    isUserActive = false;
    console.log(`⏰ Usuário inativo por ${Math.floor(timeSinceLastActivity / 60000)} minutos`);
    
    // Executar recarregamento dos dados
    reloadApplicationData();
  }
}

/**
 * Recarrega os dados do aplicativo quando o usuário está inativo
 */
async function reloadApplicationData() {
  try {
    console.log('🔄 Recarregando dados do sistema...');
    
    // Enviar comando para o frontend recarregar os dados
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('reload-data-inactive');
    }
    
    // Verificar agendamentos mesmo durante inatividade
    await checkSchedulesForNotifications();
    
    console.log('✅ Dados recarregados durante inatividade');
    
    // Mostrar notificação sutil (opcional)
    if (Notification.isSupported()) {
      const notification = new Notification({
        title: 'Tickets Control',
        body: 'Dados atualizados automaticamente',
        silent: true,
        icon: path.join(__dirname, 'icon.ico')
      });
      notification.show();
      setTimeout(() => notification.close(), 2000);
    }
  } catch (error) {
    console.error('Erro ao recarregar dados durante inatividade:', error);
  }
}

/**
 * Handler IPC para atividade do usuário
 */
function setupInactivityIpcHandlers() {
  ipcMain.on('user-activity', (event) => {
    resetInactivityTimer();
  });
  
  ipcMain.handle('get-inactivity-status', () => {
    const timeSinceLastActivity = Date.now() - lastActivityTime;
    const minutesInactive = Math.floor(timeSinceLastActivity / 60000);
    return {
      isActive: isUserActive,
      minutesInactive: minutesInactive,
      timeSinceLastActivity: timeSinceLastActivity,
      threshold: INACTIVITY_THRESHOLD
    };
  });
  
  ipcMain.handle('force-reload-data', async () => {
    await reloadApplicationData();
    return { success: true };
  });
  
  ipcMain.handle('reset-inactivity-timer', () => {
    resetInactivityTimer();
    return { success: true };
  });
}

// ===============================================================
// CONTROLE DE NOTIFICAÇÕES (código existente)
// ===============================================================

let notificationHistory = new Map();
const NOTIFICATION_COOLDOWN = 5 * 60 * 1000;

function hasNotificationBeenSentRecently(key) {
    const lastSent = notificationHistory.get(key);
    if (!lastSent) return false;
    
    const timeSinceLast = Date.now() - lastSent;
    return timeSinceLast < NOTIFICATION_COOLDOWN;
}

function markNotificationAsSent(key) {
    notificationHistory.set(key, Date.now());
}

function cleanupNotificationHistory() {
    const now = Date.now();
    for (const [key, timestamp] of notificationHistory.entries()) {
        if (now - timestamp > NOTIFICATION_COOLDOWN) {
            notificationHistory.delete(key);
        }
    }
}

function resetNotificationHistory() {
    notificationHistory.clear();
    console.log('Histórico de notificações resetado');
}

// ===============================================================
// FUNÇÕES DE ATUALIZAÇÃO
// ===============================================================

const instaladorAtualizadoPath = "Z:\\Temporario\\DocTools\\TicketsControl.exe";
const flagAtualizacaoPath = path.join(app.getPath('userData'), 'atualizacao_pendente.json');

function obterVersaoDoExecutavel(filePath) {
  try {
    const command = `powershell -Command "(Get-Item \\"${filePath}\\").VersionInfo.ProductVersion"`;
    return execSync(command).toString().trim();
  } catch (error) {
    console.error('Erro ao obter versão do instalador:', error);
    return null;
  }
}

function compararVersoes(v1, v2) {
  const a = v1.split('.').map(Number);
  const b = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const num1 = a[i] || 0;
    const num2 = b[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

function checarAtualizacaoDisponivel() {
  if (!fs.existsSync(instaladorAtualizadoPath)) return null;

  const versaoAtual = app.getVersion();
  const versaoInstalador = obterVersaoDoExecutavel(instaladorAtualizadoPath);
  if (!versaoInstalador) return null;

  if (fs.existsSync(flagAtualizacaoPath)) {
    try {
      const flag = JSON.parse(fs.readFileSync(flagAtualizacaoPath, 'utf8'));
      if (flag.versaoAtualizada === versaoInstalador) {
        console.log("Atualização já solicitada anteriormente.");
        return null;
      }
    } catch (e) {
      console.warn("Erro ao ler flag de atualização:", e);
    }
  }

  if (compararVersoes(versaoInstalador, versaoAtual) > 0) {
    return versaoInstalador;
  }

  return null;
}

function executarAtualizacao(versaoInstalador) {
  willQuitApp = true;
  
  fs.writeFileSync(flagAtualizacaoPath, JSON.stringify({ versaoAtualizada: versaoInstalador }));

  const batPath = path.join(os.tmpdir(), 'atualizador_TicketsControl.bat');
  const batContent = `
@echo off
timeout /t 3 >nul
taskkill /IM TicketsControl.exe /F >nul 2>&1
start "" "${instaladorAtualizadoPath}"
  `;
  fs.writeFileSync(batPath, batContent, 'utf8');

  spawn('cmd.exe', ['/c', batPath], {
    detached: true,
    stdio: 'ignore'
  }).unref();

  app.quit();
}

// ===============================================================
// FUNÇÕES AUXILIARES
// ===============================================================

function sanitizeForMySQL(data) {
  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    sanitized[key] =
      value === undefined
        ? null
        : typeof value === 'object' && value !== null
        ? JSON.stringify(value)
        : value;
  }
  return sanitized;
}

function formatDateForFrontend(dateString) {
  if (!dateString) return '';
  try {
    if (typeof dateString === 'string' && dateString.match(/\d{2}\/\d{2}\/\d{4}/)) {
      return dateString;
    }
    
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    
    const dia = String(date.getDate()).padStart(2, '0');
    const mes = String(date.getMonth() + 1).padStart(2, '0');
    const ano = date.getFullYear();
    const hora = String(date.getHours()).padStart(2, '0');
    const minuto = String(date.getMinutes()).padStart(2, '0');
    
    return `${mes}/${dia}/${ano} ${hora}:${minuto}`;
  } catch {
    return dateString;
  }
}

function sanitizeTicket(ticket) {
  const safeTicket = {
      id: ticket.id || null,
      numero_chamado: ticket.numeroChamado || ticket.numero_chamado || '',
      url: ticket.url || '',
      cliente: ticket.cliente || 'Cliente não identificado',
      sistema: ticket.sistema || 'Sistema não identificado',
      assunto: ticket.assunto || ticket.descricao?.substring(0, 100) || 'Assunto não especificado',
      descricao: ticket.descricao || '',
      situacao: ticket.situacao || 'Ativo',
      inbox: ticket.inbox || 'Default',
      status: ticket.status || 'Aguardando Cliente',
      data_registro: ticket.dataRegistro || ticket.data_registro || formatDateForFrontend(new Date()),
      prioridade: ticket.prioridade || 'Média',
      data: ticket.data || formatDateForFrontend(new Date()),
      historico_status: ticket.historicoStatus ? JSON.stringify(ticket.historicoStatus) : JSON.stringify([{ status: ticket.status || 'Aguardando Cliente', data: formatDateForFrontend(new Date()) }]),
      observacoes_finalizado: ticket.observacoesFinalizado || null,
      deletion_date: ticket.deletionDate || null
  };
  
  return safeTicket;
}

// ===============================================================
// FUNÇÕES DE NOTIFICAÇÃO DO SISTEMA
// ===============================================================

/**
 * Solicitar permissão para notificações
 */
async function requestNotificationPermission() {
  if (Notification.isSupported()) {
    try {
      // No Windows, precisamos configurar corretamente o AppUserModelId
      if (process.platform === 'win32') {
        // Configurações específicas para Windows
        const { app } = require('electron');
        
        // Verificar se já temos permissão
        try {
          const settings = require('electron').systemPreferences.getNotificationSettings();
          if (settings && settings.status) {
            console.log('Status das notificações:', settings.status);
            
            if (settings.status === 'denied') {
              console.warn('Permissão para notificações negada pelo usuário');
              return false;
            }
          }
        } catch (error) {
          console.log('Não foi possível verificar configurações de notificação:', error);
        }
      }
      
      // Testar se podemos mostrar notificações
      const testNotification = new Notification({
        title: 'Tickets Control',
        body: 'Notificações ativadas com sucesso!',
        silent: true
      });
      
      testNotification.show();
      setTimeout(() => testNotification.close(), 100);
      
      console.log('Permissão para notificações obtida');
      return true;
    } catch (error) {
      console.error('Erro ao solicitar permissão para notificações:', error);
      return false;
    }
  }
  return false;
}

/**
 * Mostrar diálogo para solicitar permissão de notificação
 */
function showNotificationPermissionDialog() {
  return new Promise((resolve) => {
    dialog.showMessageBox({
      type: 'info',
      buttons: ['Permitir', 'Não Permitir'],
      defaultId: 0,
      cancelId: 1,
      title: 'Permissão de Notificações',
      message: 'Tickets Control gostaria de enviar notificações',
      detail: 'As notificações incluem lembretes de agendamentos e alertas importantes. Você pode alterar esta configuração a qualquer momento nas configurações do sistema.',
      noLink: true
    }).then((result) => {
      if (result.response === 0) {
        // Usuário permitiu
        requestNotificationPermission();
        resolve(true);
      } else {
        // Usuário negou
        console.log('Usuário negou permissão para notificações');
        resolve(false);
      }
    });
  });
}

/**
 * Verificar e configurar permissões de notificação
 */
function setupNotificationPermissions() {
  if (!Notification.isSupported()) {
    console.log('Notificações não são suportadas neste sistema');
    return;
  }

  // Verificar se já solicitamos permissão antes
  const notificationPermissionFile = path.join(app.getPath('userData'), 'notification_permission.json');
  let hasRequestedPermission = false;
  
  try {
    if (fs.existsSync(notificationPermissionFile)) {
      const data = JSON.parse(fs.readFileSync(notificationPermissionFile, 'utf8'));
      hasRequestedPermission = data.requested === true;
    }
  } catch (error) {
    console.log('Erro ao ler arquivo de permissão:', error);
  }

  // Se ainda não solicitamos, pedir permissão
  if (!hasRequestedPermission) {
    setTimeout(() => {
      showNotificationPermissionDialog().then((granted) => {
        // Salvar que já solicitamos
        try {
          fs.writeFileSync(notificationPermissionFile, JSON.stringify({
            requested: true,
            granted: granted,
            date: new Date().toISOString()
          }), 'utf8');
        } catch (error) {
          console.log('Erro ao salvar permissão:', error);
        }
      });
    }, 3000); // Esperar 3 segundos após iniciar
  }
}

/**
 * Exibe notificação do sistema fora do aplicativo
 * @param {Object} options - Opções da notificação
 * @param {string} options.title - Título da notificação
 * @param {string} options.body - Corpo da notificação
 * @param {string} options.icon - Ícone da notificação (opcional)
 * @param {string} options.sound - Som da notificação (opcional)
 * @param {number} options.timeout - Tempo para fechar automaticamente (ms)
 * @param {Array} options.actions - Ações rápidas (opcional)
 */
function showSystemNotification(options) {
    // Verificar se já existe uma notificação similar recentemente
    const notificationKey = `system_${options.title}_${options.body}`;
    if (hasNotificationBeenSentRecently(notificationKey)) {
        console.log('Notificação similar já enviada recentemente, ignorando...');
        return null;
    }

    // Verificar se as notificações estão suportadas
    if (!Notification.isSupported()) {
        console.log('Notificações do sistema não são suportadas neste ambiente');
        return null;
    }

    try {
        // Forçar título para "Tickets Control" para consistência
        const notificationTitle = 'Tickets Control';
        
        // Criar notificação do sistema
        const systemNotification = new Notification({
            title: notificationTitle,
            body: options.body,
            icon: options.icon || path.join(__dirname, 'icon.ico'),
            silent: !options.sound,
            timeoutType: options.timeout > 0 ? 'default' : 'never',
            actions: options.actions || []
        });

        // Evento quando a notificação é clicada
        systemNotification.on('click', () => {
            console.log('Notificação do sistema clicada');
            // Focar na janela principal
            if (mainWindow) {
                if (mainWindow.isMinimized()) {
                    mainWindow.restore();
                }
                mainWindow.focus();
            }
        });

        // Evento quando a notificação é fechada
        systemNotification.on('close', () => {
            console.log('Notificação do sistema fechada');
        });

        // Evento quando uma ação é clicada
        systemNotification.on('action', (event, index) => {
            console.log(`Ação da notificação clicada: ${index}`);
            handleNotificationAction(index, options);
        });

        // Mostrar notificação
        systemNotification.show();

        // Marcar como enviada
        markNotificationAsSent(notificationKey);

        return systemNotification;

    } catch (error) {
        console.error('Erro ao criar notificação do sistema:', error);
        return null;
    }
}

/**
 * Manipula ações das notificações do sistema
 * @param {number} actionIndex - Índice da ação clicada
 * @param {Object} notificationOptions - Opções originais da notificação
 */
function handleNotificationAction(actionIndex, notificationOptions) {
    const actions = notificationOptions.actions || [];
    
    if (actions.length > actionIndex) {
        const action = actions[actionIndex];
        console.log(`Executando ação: ${action.type}`);
        
        switch (action.type) {
            case 'open_app':
                if (mainWindow) {
                    if (mainWindow.isMinimized()) {
                        mainWindow.restore();
                    }
                    mainWindow.focus();
                }
                break;
                
            case 'open_url':
                if (action.url) {
                    shell.openExternal(action.url);
                }
                break;
                
            case 'dismiss':
                // Apenas fecha a notificação (já fechou automaticamente)
                break;
                
            case 'custom':
                if (action.handler) {
                    // Envia para o renderer process executar a ação customizada
                    if (mainWindow && mainWindow.webContents) {
                        mainWindow.webContents.send('notification-custom-action', {
                            actionId: action.id,
                            notificationId: notificationOptions.id
                        });
                    }
                }
                break;
        }
    }
}

/**
 * Notificação do sistema para agendamentos próximos
 * @param {Object} schedule - Agendamento
 * @param {Object} ticket - Ticket relacionado
 * @param {number} minutesLeft - Minutos restantes
 */
function showScheduleSystemNotification(schedule, ticket, minutesLeft) {
    const notificationKey = `schedule_reminder_${schedule.id}_${minutesLeft}`;
    
    if (hasNotificationBeenSentRecently(notificationKey)) {
        console.log(`Notificação de lembrete para ${schedule.id} já enviada recentemente`);
        return null;
    }
    
    const notificationOptions = {
        title: 'Tickets Control',
        body: `⏰ Lembrete de Agendamento\nChamado ${ticket.numeroChamado} - ${ticket.cliente}\nVence em ${minutesLeft} minutos`,
        icon: path.join(__dirname, 'icon.ico'),
        sound: true,
        timeout: 10000, // 10 segundos
        actions: [
            {
                type: 'open_app',
                text: 'Abrir App'
            },
            {
                type: 'open_url',
                text: 'Abrir Chamado',
                url: ticket.url
            }
        ]
    };

    const notification = showSystemNotification(notificationOptions);
    if (notification) {
        markNotificationAsSent(notificationKey);
    }
    
    return notification;
}

/**
 * Notificação do sistema para agendamentos vencidos
 * @param {Object} schedule - Agendamento vencido
 * @param {Object} ticket - Ticket relacionado
 */
function showExpiredScheduleSystemNotification(schedule, ticket) {
    const notificationKey = `schedule_expired_${schedule.id}`;
    
    if (hasNotificationBeenSentRecently(notificationKey)) {
        console.log(`Notificação de vencimento para ${schedule.id} já enviada recentemente`);
        return null;
    }
    
    const notificationOptions = {
        title: 'Tickets Control',
        body: `⚠️ Agendamento Vencido\nChamado ${ticket.numeroChamado} - ${ticket.cliente}\nO agendamento já venceu!`,
        icon: path.join(__dirname, 'icon.ico'),
        sound: true,
        timeout: 10000, // 10 segundos
        actions: [
            {
                type: 'open_app',
                text: 'Alterar Status'
            },
            {
                type: 'open_url',
                text: 'Ver Chamado',
                url: ticket.url
            }
        ]
    };

    const notification = showSystemNotification(notificationOptions);
    if (notification) {
        markNotificationAsSent(notificationKey);
    }
    
    return notification;
}

/**
 * Notificação genérica do sistema
 * @param {string} type - Tipo de notificação
 * @param {string} message - Mensagem
 * @param {Object} extra - Dados extras
 */
function showGenericSystemNotification(type, message, extra = {}) {
    const icons = {
        success: '✅',
        warning: '⚠️',
        error: '❌',
        info: 'ℹ️'
    };

    const titles = {
        success: 'Sucesso',
        warning: 'Atenção',
        error: 'Erro',
        info: 'Informação'
    };

    const notificationOptions = {
        title: 'Tickets Control',
        body: `${icons[type] || '📢'} ${titles[type] || ''}: ${message}`,
        icon: path.join(__dirname, 'icon.ico'),
        sound: type === 'error' || type === 'warning',
        timeout: type === 'error' ? 8000 : 5000,
        actions: [
            {
                type: 'open_app',
                text: 'Abrir App'
            }
        ]
    };

    return showSystemNotification(notificationOptions);
}

// ===============================================================
// VERIFICAÇÃO DE AGENDAMENTOS EM SEGUNDO PLANO
// ===============================================================

async function checkSchedulesForNotifications() {
  try {
    if (!isDatabaseConnected) {
      console.log('Banco não conectado, tentando reconectar...');
      const connected = await checkDatabaseConnection();
      if (!connected) {
        console.log('Não foi possível conectar ao banco');
        return;
      }
    }

    console.log('🔍 Verificando agendamentos para notificações...');
    
    // Buscar agendamentos que estão próximos (30 minutos ou menos) OU vencidos
    const [schedules] = await dbConnection.execute(`
      SELECT s.*, t.numero_chamado, t.cliente, t.url, t.assunto 
      FROM schedules s 
      LEFT JOIN tickets t ON s.ticket_id = t.id 
      WHERE s.data IS NOT NULL
      ORDER BY s.data ASC
    `);

    console.log(`Encontrados ${schedules.length} agendamentos para verificar`);

    for (const schedule of schedules) {
      try {
        const scheduleTime = new Date(schedule.data);
        const now = new Date();
        const timeDiff = scheduleTime - now;
        const minutesDiff = Math.floor(timeDiff / (1000 * 60));
        
        // Criar chave única para este agendamento + tipo de notificação
        const reminderKey = `reminder_${schedule.id}`;
        const expiredKey = `expired_${schedule.id}`;

        // Verificar se está entre 1 e 30 minutos para expirar
        if (minutesDiff > 0 && minutesDiff <= 30) {
          // Verificar se já notificamos recentemente
          if (!hasNotificationBeenSentRecently(reminderKey) && !schedule.notified) {
            console.log(`📢 Agendamento próximo: ${schedule.numero_chamado} em ${minutesDiff} minutos`);
            
            showScheduleSystemNotification(schedule, {
              numeroChamado: schedule.numero_chamado,
              cliente: schedule.cliente,
              url: schedule.url || '#'
            }, minutesDiff);

            // Marcar como notificado no histórico e no banco
            markNotificationAsSent(reminderKey);
            
            // Atualizar no banco apenas se não foi marcado antes
            if (!schedule.notified) {
              await dbConnection.execute(
                'UPDATE schedules SET notified = TRUE WHERE id = ?',
                [schedule.id]
              );
            }
          }
        }
        
        // Verificar se já expirou (até 24 horas atrás)
        if (minutesDiff <= 0 && minutesDiff > -1440 && !schedule.status_changed) {
          // Verificar se já notificamos recentemente
          if (!hasNotificationBeenSentRecently(expiredKey)) {
            console.log(`⚠️ Agendamento vencido: ${schedule.numero_chamado}`);
            
            showExpiredScheduleSystemNotification(schedule, {
              numeroChamado: schedule.numero_chamado,
              cliente: schedule.cliente,
              url: schedule.url || '#'
            });

            // Marcar como notificado no histórico
            markNotificationAsSent(expiredKey);
            
            // Marcar no banco como status_changed apenas uma vez
            await dbConnection.execute(
              'UPDATE schedules SET status_changed = TRUE WHERE id = ?',
              [schedule.id]
            );
          }
        }
      } catch (error) {
        console.error(`Erro ao processar agendamento ${schedule.id}:`, error);
      }
    }
  } catch (error) {
    console.error('Erro ao verificar agendamentos:', error);
  }
}


// ===============================================================
// FUNÇÕES DO BANCO DE DADOS
// ===============================================================

function validateDatabaseConfig() {
  const required = ['host', 'user', 'password', 'database'];
  const missing = required.filter(field => dbConfig[field] === undefined);
  
  if (missing.length > 0) {
    console.error('Configuração do banco incompleta. Campos faltantes:', missing);
    return false;
  }
  
  console.log('Configuração do banco validada:', {
    host: dbConfig.host,
    user: dbConfig.user,
    database: dbConfig.database,
    port: dbConfig.port || 3306
  });
  
  return true;
}

async function connectToDatabase() {
  try {
    console.log('Tentando conectar ao MySQL...', {
      host: dbConfig.host,
      user: dbConfig.user,
      database: dbConfig.database,
      port: dbConfig.port
    });
    
    const tempConnection = await mysql.createConnection({
      host: dbConfig.host,
      user: dbConfig.user,
      password: dbConfig.password,
      port: dbConfig.port
    });
    
    await tempConnection.execute(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\``);
    console.log('✅ Banco de dados verificado/criado:', dbConfig.database);
    
    await tempConnection.end();
    
    dbConnection = await mysql.createConnection(dbConfig);
    isDatabaseConnected = true;
    
    await createTables();
    await updateTableStructure();
    return true;
  } catch (error) {
    console.error('Erro detalhado ao conectar ao MySQL:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      sqlState: error.sqlState,
      sqlMessage: error.sqlMessage
    });
    
    dialog.showErrorBox(
      'Erro de Banco de Dados', 
      `Não foi possível conectar ao MySQL:\n\nHost: ${dbConfig.host}\nUsuário: ${dbConfig.user}\nBanco: ${dbConfig.database}\n\nErro: ${error.message}`
    );
    
    isDatabaseConnected = false;
    return false;
  }
}

async function checkDatabaseConnection() {
  if (!isDatabaseConnected || !dbConnection) {
    return await connectToDatabase();
  }
  
  try {
    await dbConnection.execute('SELECT 1');
    return true;
  } catch (error) {
    console.log('Conexão perdida, tentando reconectar...');
    isDatabaseConnected = false;
    return await connectToDatabase();
  }
}

async function createTables() {
  if (!isDatabaseConnected) return;

  try {
    await dbConnection.execute(`
      CREATE TABLE IF NOT EXISTS tickets (
        id VARCHAR(50) PRIMARY KEY,
        numero_chamado VARCHAR(100),
        url TEXT,
        cliente VARCHAR(255),
        sistema VARCHAR(255),
        assunto VARCHAR(500),
        descricao TEXT,
        situacao VARCHAR(100),
        inbox VARCHAR(100),
        status VARCHAR(100),
        data_registro VARCHAR(100),
        prioridade VARCHAR(50),
        data VARCHAR(100),
        historico_status JSON,
        deletion_date DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await dbConnection.execute(`
      CREATE TABLE IF NOT EXISTS schedules (
        id VARCHAR(50) PRIMARY KEY,
        ticket_id VARCHAR(50),
        cliente VARCHAR(255),
        data DATETIME,
        responsavel VARCHAR(255),
        observacoes TEXT,
        notified BOOLEAN DEFAULT FALSE,
        status_changed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await dbConnection.execute(`
      CREATE TABLE IF NOT EXISTS settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        key_name VARCHAR(100) UNIQUE,
        value JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    console.log('Tabelas verificadas/criadas com sucesso!');
  } catch (error) {
    console.error('Erro ao criar tabelas:', error);
  }
}

async function updateTableStructure() {
  if (!isDatabaseConnected) return;

  try {
    const [columns] = await dbConnection.execute(`
      SHOW COLUMNS FROM tickets LIKE 'historico_status'
    `);

    if (columns.length === 0) {
      console.log('Adicionando coluna historico_status à tabela tickets...');
      
      await dbConnection.execute(`
        ALTER TABLE tickets 
        ADD COLUMN historico_status JSON AFTER data
      `);
      
      console.log('Coluna historico_status adicionada com sucesso!');
    }

    // VERIFICAR E ADICIONAR COLUNA DE OBSERVAÇÕES PARA CHAMADOS FINALIZADOS
    const [obsColumns] = await dbConnection.execute(`
      SHOW COLUMNS FROM tickets LIKE 'observacoes_finalizado'
    `);

    if (obsColumns.length === 0) {
      console.log('Adicionando coluna observacoes_finalizado à tabela tickets...');
      
      await dbConnection.execute(`
        ALTER TABLE tickets 
        ADD COLUMN observacoes_finalizado TEXT AFTER historico_status
      `);
      
      console.log('Coluna observacoes_finalizado adicionada com sucesso!');
    }

    const requiredColumns = [
      'deletion_date', 
      'data_registro', 
      'situacao', 
      'inbox',
      'numero_chamado',
      'url',
      'sistema',
      'prioridade'
    ];
    
    for (const column of requiredColumns) {
      const [col] = await dbConnection.execute(`
        SHOW COLUMNS FROM tickets LIKE '${column}'
      `);
      
      if (col.length === 0) {
        console.log(`Adicionando coluna ${column} à tabela tickets...`);
        
        let columnType = 'VARCHAR(100)';
        if (column === 'deletion_date') columnType = 'DATETIME';
        if (column === 'data_registro') columnType = 'VARCHAR(100)';
        if (column === 'descricao') columnType = 'TEXT';
        if (column === 'url') columnType = 'TEXT';
        if (column === 'assunto') columnType = 'VARCHAR(500)';
        if (column === 'cliente') columnType = 'VARCHAR(255)';
        
        await dbConnection.execute(`
          ALTER TABLE tickets 
          ADD COLUMN ${column} ${columnType}
        `);
        
        console.log(`Coluna ${column} adicionada com sucesso!`);
      }
    }

    const [ticketColumns] = await dbConnection.execute('DESCRIBE tickets');
    console.log('Colunas da tabela tickets:', ticketColumns.map(col => col.Field));

  } catch (error) {
    console.error('Erro ao atualizar estrutura da tabela:', error);
  }
}

// ===============================================================
// INICIAR XAMPP (APACHE + MYSQL) DE FORMA SILENCIOSA
// ===============================================================

async function startXamppServices() {
  return new Promise((resolve, reject) => {
    console.log('🔄 Iniciando serviços do XAMPP...');

    const xamppPath = 'C:\\xampp';
    const apacheExe = path.join(xamppPath, 'apache', 'bin', 'httpd.exe');
    const mysqlExe = path.join(xamppPath, 'mysql', 'bin', 'mysqld.exe');

    if (!fs.existsSync(apacheExe) || !fs.existsSync(mysqlExe)) {
      reject(new Error('Não foi possível encontrar o Apache ou MySQL do XAMPP em C:\\xampp.'));
      return;
    }

    // Inicia Apache de forma silenciosa
    try {
      spawn(apacheExe, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }).unref();
      console.log('✅ Apache iniciado silenciosamente.');
    } catch (err) {
      console.error('Erro ao iniciar Apache:', err.message);
    }

    // Inicia MySQL de forma silenciosa
    try {
      spawn(mysqlExe, {
        detached: true,
        stdio: 'ignore',
        windowsHide: true
      }).unref();
      console.log('✅ MySQL iniciado silenciosamente.');
    } catch (err) {
      console.error('Erro ao iniciar MySQL:', err.message);
    }

    // Espera o MySQL responder antes de continuar
    setTimeout(async () => {
      console.log('⏳ Aguardando conexão ao MySQL...');
      let connected = false;
      const maxAttempts = 10;

      for (let i = 0; i < maxAttempts; i++) {
        const success = await connectToDatabase();
        if (success) {
          connected = true;
          console.log('✅ Conectado ao MySQL.');
          resolve(true);
          return;
        }
        console.log(`Tentando conexão... (${i + 1}/${maxAttempts})`);
        await new Promise(r => setTimeout(r, 8000));
      }

      if (!connected) {
        reject(new Error('Não foi possível conectar ao MySQL após iniciar o XAMPP.'));
      }
    }, 6000);
  });
}

// ===============================================================
// FUNÇÕES DE EXPORTAÇÃO/IMPORTAÇÃO EXCEL
// ===============================================================

async function handleExportToExcel(tickets) {
  try {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Chamados');

    worksheet.columns = [
      { header: 'Número', key: 'numero', width: 15 },
      { header: 'Cliente', key: 'cliente', width: 25 },
      { header: 'Sistema', key: 'sistema', width: 20 },
      { header: 'Assunto', key: 'assunto', width: 40 },
      { header: 'Descrição', key: 'descricao', width: 50 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Prioridade', key: 'prioridade', width: 12 },
      { header: 'Data', key: 'data', width: 12 },
      { header: 'Data Registro', key: 'dataRegistro', width: 20 },
      { header: 'URL', key: 'url', width: 30 },
      { header: 'Situação', key: 'situacao', width: 20 },
      { header: 'Inbox', key: 'inbox', width: 15 }
    ];

    tickets.forEach(ticket => {
      worksheet.addRow({
        numero: ticket.numeroChamado || '',
        cliente: ticket.cliente || '',
        sistema: ticket.sistema || '',
        assunto: ticket.assunto || '',
        descricao: ticket.descricao || '',
        status: ticket.status || '',
        prioridade: ticket.prioridade || '',
        data: ticket.data || '',
        dataRegistro: ticket.dataRegistro || '',
        url: ticket.url || '',
        situacao: ticket.situacao || '',
        inbox: ticket.inbox || ''
      });
    });

    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE6E6FA' }
    };

    const downloadsPath = app.getPath('downloads');
    const fileName = `chamados_${Date.now()}.xlsx`;
    const filePath = path.join(downloadsPath, fileName);
    
    await workbook.xlsx.writeFile(filePath);
    
    return { success: true, filePath };
  } catch (error) {
    console.error('Erro na exportação Excel:', error);
    return { success: false, error: error.message };
  }
}

async function handleImportFromExcel(arrayBuffer) {
  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(arrayBuffer);
    
    const worksheet = workbook.getWorksheet(1);
    const jsonData = [];
    
    worksheet.eachRow((row, rowNumber) => {
      if (rowNumber > 1) {
        const rowData = row.values;
        jsonData.push({
          'Número': rowData[1] || '',
          'Cliente': rowData[2] || '',
          'Sistema': rowData[3] || '',
          'Assunto': rowData[4] || '',
          'Descrição': rowData[5] || '',
          'Status': rowData[6] || '',
          'Prioridade': rowData[7] || '',
          'Data': rowData[8] || '',
          'Data Registro': rowData[9] || '',
          'URL': rowData[10] || '',
          'Situação': rowData[11] || '',
          'Inbox': rowData[12] || ''
        });
      }
    });
    
    return { success: true, data: jsonData };
  } catch (error) {
    console.error('Erro na importação Excel:', error);
    return { success: false, error: error.message };
  }
}

async function processImportedTickets(jsonData) {
  const importedTickets = [];
  const errors = [];

  for (const [index, item] of jsonData.entries()) {
    try {
      if (!item.Número && !item.Assunto) {
        errors.push(`Linha ${index + 2}: Número ou Assunto são obrigatórios`);
        continue;
      }

      const newId = 'IMP-' + Date.now() + '-' + index;
      
      const newTicket = {
        id: newId,
        numeroChamado: item.Número || `IMP-${index + 1}`,
        url: item.URL || '',
        cliente: item.Cliente || 'Cliente não identificado',
        sistema: item.Sistema || 'Sistema não identificado',
        assunto: item.Assunto || 'Assunto não especificado',
        descricao: item.Descrição || 'Descrição não disponível',
        situacao: item.Situação || 'Importado',
        inbox: item.Inbox || 'Importado',
        status: item.Status || 'Aberto',
        dataRegistro: item['Data Registro'] || '',
        prioridade: item.Prioridade || 'Média',
        data: item.Data || '',
        historicoStatus: [
          { 
            status: item.Status || 'Aberto', 
            data: ''
          }
        ],
        deletionDate: null
      };

      importedTickets.push(newTicket);
    } catch (error) {
      errors.push(`Linha ${index + 2}: ${error.message}`);
    }
  }

  return { importedTickets, errors };
}

// ===============================================================
// IPC HANDLERS
// ===============================================================

function setupIpcHandlers() {
  // Adicionar handlers de inatividade
  setupInactivityIpcHandlers();
  ipcMain.handle('export-to-excel', async (event, tickets) => {
    try {
      const result = await handleExportToExcel(tickets);
      return result;
    } catch (error) {
      console.error('Erro no handler de exportação:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler para importação Excel
  ipcMain.handle('import-from-excel', async (event, arrayBuffer) => {
    try {
      const result = await handleImportFromExcel(arrayBuffer);
      return result;
    } catch (error) {
      console.error('Erro no handler de importação:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler para processar tickets importados
  ipcMain.handle('process-imported-tickets', async (event, { jsonData, tickets }) => {
    try {
      const result = await processImportedTickets(jsonData);
      
      let savedCount = 0;
      const saveErrors = [];
      
      for (const ticket of result.importedTickets) {
        try {
          const existingTicket = tickets.find(t => 
            t.numeroChamado === ticket.numeroChamado || 
            (ticket.url && t.url === ticket.url)
          );
          
          if (!existingTicket) {
            const sanitizedTicket = sanitizeTicket(ticket);
            
            await dbConnection.execute(
              `INSERT INTO tickets 
               (id, numero_chamado, url, cliente, sistema, assunto, descricao, 
                situacao, inbox, status, data_registro, prioridade, data, historico_status, observacoes_finalizado, deletion_date) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                sanitizedTicket.id,
                sanitizedTicket.numero_chamado,
                sanitizedTicket.url,
                sanitizedTicket.cliente,
                sanitizedTicket.sistema,
                sanitizedTicket.assunto,
                sanitizedTicket.descricao,
                sanitizedTicket.situacao,
                sanitizedTicket.inbox,
                sanitizedTicket.status,
                sanitizedTicket.data_registro,
                sanitizedTicket.prioridade,
                sanitizedTicket.data,
                sanitizedTicket.historico_status,
                sanitizedTicket.observacoes_finalizado,
                sanitizedTicket.deletion_date
              ]
            );

            savedCount++;
          } else {
            saveErrors.push(`Chamado ${ticket.numeroChamado} já existe`);
          }
        } catch (saveError) {
          saveErrors.push(`Erro ao salvar ${ticket.numeroChamado}: ${saveError.message}`);
        }
      }
      
      return { 
        success: true, 
        savedCount, 
        totalImported: result.importedTickets.length,
        errors: [...result.errors, ...saveErrors]
      };
      
    } catch (error) {
      console.error('Erro ao processar tickets importados:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler para obter tickets
 // Handler para obter tickets com suporte a inatividade
  ipcMain.handle('get-tickets', async (event, forceRefresh = false) => {
    try {
      // Verificar se é um recarregamento por inatividade
      const isInactivityReload = event && event.sender && event.sender.send;
      
      if (!isDatabaseConnected) {
        throw new Error('Banco de dados não conectado');
      }
      
      const [rows] = await dbConnection.execute('SELECT * FROM tickets ORDER BY created_at DESC');
      
      // Converter dados do MySQL para o formato esperado pelo frontend
      const tickets = rows.map(row => {
        const ticket = {
          ...row,
          observacoesFinalizado: row.observacoes_finalizado || '',
          historicoStatus: row.historico_status ? JSON.parse(row.historico_status) : [],
          numeroChamado: row.numero_chamado,
          dataRegistro: formatDateForFrontend(row.data_registro),
          data: formatDateForFrontend(row.data),
          deletionDate: row.deletion_date
        };
        
        return ticket;
      });
      
      // Log apenas se for recarregamento por inatividade
      if (forceRefresh || isInactivityReload) {
        console.log(`📊 Dados recarregados ${isInactivityReload ? 'por inatividade' : 'forçado'}: ${tickets.length} tickets`);
      }
      
      return { success: true, data: tickets };
    } catch (error) {
      console.error('Erro ao buscar tickets, usando fallback:', error);
      try {
        const dataPath = path.join(app.getPath('userData'), 'tickets.json');
        if (fs.existsSync(dataPath)) {
          const savedTickets = fs.readFileSync(dataPath, 'utf8');
          return { 
            success: true, 
            data: savedTickets ? JSON.parse(savedTickets) : [],
            fallback: true 
          };
        }
        return { success: true, data: [], fallback: true };
      } catch (fallbackError) {
        return { success: false, error: error.message, data: [] };
      }
    }
  });

  // Handler para salvar ticket
  ipcMain.handle('save-ticket', async (event, ticket) => {
    console.log('💾 [MAIN] Recebendo ticket para salvar:', ticket.id);    

    try {
      if (!isDatabaseConnected) {
        throw new Error('Banco de dados não conectado');
      }

      const sanitizedTicket = sanitizeTicket(ticket);

      const [existing] = await dbConnection.execute(
        'SELECT id FROM tickets WHERE id = ?', 
        [sanitizedTicket.id]
      );

      if (existing.length > 0) {
        await dbConnection.execute(
          `UPDATE tickets SET 
           numero_chamado = ?, url = ?, cliente = ?, sistema = ?, assunto = ?, 
           descricao = ?, situacao = ?, inbox = ?, status = ?, data_registro = ?, 
           prioridade = ?, data = ?, historico_status = ?, observacoes_finalizado = ?, deletion_date = ?
           WHERE id = ?`,
          [
            sanitizedTicket.numero_chamado,
            sanitizedTicket.url,
            sanitizedTicket.cliente,
            sanitizedTicket.sistema,
            sanitizedTicket.assunto,
            sanitizedTicket.descricao,
            sanitizedTicket.situacao,
            sanitizedTicket.inbox,
            sanitizedTicket.status,
            sanitizedTicket.data_registro,
            sanitizedTicket.prioridade,
            sanitizedTicket.data,
            sanitizedTicket.historico_status,
            sanitizedTicket.observacoes_finalizado,
            sanitizedTicket.deletion_date,
            sanitizedTicket.id
          ]
        );

      } else {
        await dbConnection.execute(
          `INSERT INTO tickets 
           (id, numero_chamado, url, cliente, sistema, assunto, descricao, 
            situacao, inbox, status, data_registro, prioridade, data, historico_status, observacoes_finalizado, deletion_date) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            sanitizedTicket.id,
            sanitizedTicket.numero_chamado,
            sanitizedTicket.url,
            sanitizedTicket.cliente,
            sanitizedTicket.sistema,
            sanitizedTicket.assunto,
            sanitizedTicket.descricao,
            sanitizedTicket.situacao,
            sanitizedTicket.inbox,
            sanitizedTicket.status,
            sanitizedTicket.data_registro,
            sanitizedTicket.prioridade,
            sanitizedTicket.data,
            sanitizedTicket.historico_status,
            sanitizedTicket.observacoes_finalizado,
            sanitizedTicket.deletion_date
          ]
        );
      }

      return { success: true };
    } catch (error) {
      console.error('Erro ao salvar ticket:', error);
      
      try {
        const dataPath = path.join(app.getPath('userData'), 'tickets.json');
        let tickets = [];
        if (fs.existsSync(dataPath)) {
          tickets = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        }
        
        const existingIndex = tickets.findIndex(t => t.id === ticket.id);
        
        if (existingIndex >= 0) {
          tickets[existingIndex] = ticket;
        } else {
          tickets.push(ticket);
        }
        
        fs.writeFileSync(dataPath, JSON.stringify(tickets));
        return { success: true, fallback: true };
      } catch (fallbackError) {
        return { success: false, error: error.message };
      }
    }
  });

  // Handler para deletar ticket
  ipcMain.handle('delete-ticket', async (event, ticketId) => {
    try {
      if (!isDatabaseConnected) {
        throw new Error('Banco de dados não conectado');
      }

      await dbConnection.execute('DELETE FROM tickets WHERE id = ?', [ticketId]);
      return { success: true };
    } catch (error) {
      console.error('Erro ao deletar ticket, usando fallback:', error);
      
      try {
        const dataPath = path.join(app.getPath('userData'), 'tickets.json');
        let tickets = [];
        if (fs.existsSync(dataPath)) {
          tickets = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        }
        tickets = tickets.filter(t => t.id !== ticketId);
        fs.writeFileSync(dataPath, JSON.stringify(tickets));
        return { success: true, fallback: true };
      } catch (fallbackError) {
        return { success: false, error: error.message };
      }
    }
  });

  // Handler para obter agendamentos
  ipcMain.handle('get-schedules', async () => {
    try {
      if (!isDatabaseConnected) {
        throw new Error('Banco de dados não conectado');
      }

      const [rows] = await dbConnection.execute(`
        SELECT s.*, t.assunto, t.numero_chamado, t.url 
        FROM schedules s 
        LEFT JOIN tickets t ON s.ticket_id = t.id 
        ORDER BY s.data ASC
      `);
      
      // Formatar datas para o frontend
      const schedules = rows.map(row => ({
        id: row.id,
        ticketId: row.ticket_id,
        cliente: row.cliente,
        data: formatDateForFrontend(row.data),
        responsavel: row.responsavel,
        observacoes: row.observacoes,
        notified: row.notified,
        statusChanged: row.status_changed
      }));
      
      return { success: true, data: schedules };
    } catch (error) {
      console.error('Erro ao buscar agendamentos, usando fallback:', error);
      
      try {
        const dataPath = path.join(app.getPath('userData'), 'schedules.json');
        if (fs.existsSync(dataPath)) {
          const savedSchedules = fs.readFileSync(dataPath, 'utf8');
          return { 
            success: true, 
            data: savedSchedules ? JSON.parse(savedSchedules) : [],
            fallback: true 
          };
        }
        return { success: true, data: [], fallback: true };
      } catch (fallbackError) {
        return { success: false, error: error.message, data: [] };
      }
    }
  });

  // Handler para salvar agendamento
  ipcMain.handle('save-schedule', async (event, schedule) => {
    try {
      if (!isDatabaseConnected) {
        throw new Error('Banco de dados não conectado');
      }

      const safeValue = (value) => value === undefined ? null : value;

      const [existing] = await dbConnection.execute(
        'SELECT id FROM schedules WHERE id = ?', 
        [schedule.id]
      );

      if (existing.length > 0) {
        await dbConnection.execute(
          `UPDATE schedules SET 
           ticket_id = ?, cliente = ?, data = ?, responsavel = ?, observacoes = ?,
           notified = ?, status_changed = ?
           WHERE id = ?`,
          [
            safeValue(schedule.ticketId), 
            safeValue(schedule.cliente), 
            safeValue(schedule.data), 
            safeValue(schedule.responsavel), 
            safeValue(schedule.observacoes),
            safeValue(schedule.notified || false), 
            safeValue(schedule.statusChanged || false),
            schedule.id
          ]
        );
      } else {
        await dbConnection.execute(
          `INSERT INTO schedules 
           (id, ticket_id, cliente, data, responsavel, observacoes, notified, status_changed) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            schedule.id, 
            safeValue(schedule.ticketId), 
            safeValue(schedule.cliente), 
            safeValue(schedule.data),
            safeValue(schedule.responsavel), 
            safeValue(schedule.observacoes),
            safeValue(schedule.notified || false), 
            safeValue(schedule.statusChanged || false)
          ]
        );
      }

      return { success: true };
    } catch (error) {
      console.error('Erro ao salvar agendamento, usando fallback:', error);
      
      try {
        const dataPath = path.join(app.getPath('userData'), 'schedules.json');
        let schedules = [];
        if (fs.existsSync(dataPath)) {
          schedules = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        }
        
        const existingIndex = schedules.findIndex(s => s.id === schedule.id);
        
        if (existingIndex >= 0) {
          schedules[existingIndex] = schedule;
        } else {
          schedules.push(schedule);
        }
        
        fs.writeFileSync(dataPath, JSON.stringify(schedules));
        return { success: true, fallback: true };
      } catch (fallbackError) {
        return { success: false, error: error.message };
      }
    }
  });

  // Handler para deletar agendamento
  ipcMain.handle('delete-schedule', async (event, scheduleId) => {
    try {
      if (!isDatabaseConnected) {
        throw new Error('Banco de dados não conectado');
      }

      console.log('Excluindo agendamento ID:', scheduleId);
      await dbConnection.execute('DELETE FROM schedules WHERE id = ?', [scheduleId]);
      
      console.log('Agendamento excluído com sucesso');
      return { success: true };
    } catch (error) {
      console.error('Erro ao deletar agendamento no MySQL:', error);
      
      // Fallback para localStorage
      try {
        console.log('Tentando fallback para localStorage...');
        const dataPath = path.join(app.getPath('userData'), 'schedules.json');
        let schedules = [];
        
        if (fs.existsSync(dataPath)) {
          const data = fs.readFileSync(dataPath, 'utf8');
          if (data.trim()) {
            schedules = JSON.parse(data);
          }
        }
        
        const initialLength = schedules.length;
        schedules = schedules.filter(s => s.id !== scheduleId);
        
        if (schedules.length < initialLength) {
          fs.writeFileSync(dataPath, JSON.stringify(schedules));
          console.log('Agendamento excluído via fallback');
          return { success: true, fallback: true };
        } else {
          console.log('Agendamento não encontrado para exclusão');
          return { success: false, error: 'Agendamento não encontrado' };
        }
      } catch (fallbackError) {
        console.error('Erro no fallback:', fallbackError);
        return { success: false, error: error.message };
      }
    }
  });

  // Handler para carregar configurações
  ipcMain.handle('load-settings', async () => {
    try {
      if (!isDatabaseConnected) {
        throw new Error('Banco de dados não conectado');
      }

      const [systemSettings] = await dbConnection.execute(
        'SELECT value FROM settings WHERE key_name = "systemSettings"'
      );
      const [customStatuses] = await dbConnection.execute(
        'SELECT value FROM settings WHERE key_name = "customStatuses"'
      );
      const [dashboardStatusSettings] = await dbConnection.execute(
        'SELECT value FROM settings WHERE key_name = "dashboardStatusSettings"'
      );

      const result = {};
      
      if (systemSettings.length > 0) {
        result.systemSettings = JSON.parse(systemSettings[0].value);
      }
      
      if (customStatuses.length > 0) {
        result.customStatuses = JSON.parse(customStatuses[0].value);
      }

      if (dashboardStatusSettings.length > 0) {
        result.dashboardStatusSettings = JSON.parse(dashboardStatusSettings[0].value);
      }

      return { success: true, data: result };
    } catch (error) {
      console.error('Erro ao carregar configurações, usando fallback:', error);
      
      try {
        const dataPath = path.join(app.getPath('userData'), 'settings.json');
        if (fs.existsSync(dataPath)) {
          const savedSettings = fs.readFileSync(dataPath, 'utf8');
          return { 
            success: true, 
            data: savedSettings ? JSON.parse(savedSettings) : {},
            fallback: true 
          };
        }
        return { success: true, data: {}, fallback: true };
      } catch (fallbackError) {
        return { success: false, error: error.message, data: {} };
      }
    }
  });

  // Handler para salvar configurações
  ipcMain.handle('save-settings', async (event, settings) => {
    try {
      if (!isDatabaseConnected) {
        throw new Error('Banco de dados não conectado');
      }

      await dbConnection.execute(
        `INSERT INTO settings (key_name, value) 
         VALUES ("systemSettings", ?) 
         ON DUPLICATE KEY UPDATE value = ?`,
        [JSON.stringify(settings.systemSettings), JSON.stringify(settings.systemSettings)]
      );

      await dbConnection.execute(
        `INSERT INTO settings (key_name, value) 
         VALUES ("customStatuses", ?) 
         ON DUPLICATE KEY UPDATE value = ?`,
        [JSON.stringify(settings.customStatuses), JSON.stringify(settings.customStatuses)]
      );

      if (settings.dashboardStatusSettings) {
        await dbConnection.execute(
          `INSERT INTO settings (key_name, value) 
           VALUES ("dashboardStatusSettings", ?) 
           ON DUPLICATE KEY UPDATE value = ?`,
          [JSON.stringify(settings.dashboardStatusSettings), JSON.stringify(settings.dashboardStatusSettings)]
        );
      }

      return { success: true };
    } catch (error) {
      console.error('Erro ao salvar configurações, usando fallback:', error);
      
      try {
        const dataPath = path.join(app.getPath('userData'), 'settings.json');
        fs.writeFileSync(dataPath, JSON.stringify(settings));
        return { success: true, fallback: true };
      } catch (fallbackError) {
        return { success: false, error: error.message };
      }
    }
  });

  // Handler para salvar status personalizados
  ipcMain.handle('save-custom-statuses', async (event, statuses) => {
    try {
      if (!isDatabaseConnected) {
        throw new Error('Banco de dados não conectado');
      }

      await dbConnection.execute(
        `INSERT INTO settings (key_name, value) 
         VALUES ("customStatuses", ?) 
         ON DUPLICATE KEY UPDATE value = ?`,
        [JSON.stringify(statuses), JSON.stringify(statuses)]
      );

      return { success: true };
    } catch (error) {
      console.error('Erro ao salvar status personalizados:', error);
      
      try {
        const dataPath = path.join(app.getPath('userData'), 'settings.json');
        let currentSettings = {};
        if (fs.existsSync(dataPath)) {
          currentSettings = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        }
        currentSettings.customStatuses = statuses;
        fs.writeFileSync(dataPath, JSON.stringify(currentSettings));
        return { success: true, fallback: true };
      } catch (fallbackError) {
        return { success: false, error: error.message };
      }
    }
  });

  // Handler para salvar configurações de status do dashboard
  ipcMain.handle('save-dashboard-status-settings', async (event, statusSettings) => {
    try {
      if (!isDatabaseConnected) {
        throw new Error('Banco de dados não conectado');
      }

      await dbConnection.execute(
        `INSERT INTO settings (key_name, value) 
         VALUES ("dashboardStatusSettings", ?) 
         ON DUPLICATE KEY UPDATE value = ?`,
        [JSON.stringify(statusSettings), JSON.stringify(statusSettings)]
      );

      return { success: true };
    } catch (error) {
      console.error('Erro ao salvar configurações do dashboard:', error);
      
      try {
        const dataPath = path.join(app.getPath('userData'), 'settings.json');
        let currentSettings = {};
        if (fs.existsSync(dataPath)) {
          currentSettings = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
        }
        currentSettings.dashboardStatusSettings = statusSettings;
        fs.writeFileSync(dataPath, JSON.stringify(currentSettings));
        return { success: true, fallback: true };
      } catch (fallbackError) {
        return { success: false, error: error.message };
      }
    }
  });

  // Handler para carregar configurações de status do dashboard
  ipcMain.handle('load-dashboard-status-settings', async () => {
    try {
      if (!isDatabaseConnected) {
        throw new Error('Banco de dados não conectado');
      }

      const [dashboardStatusSettings] = await dbConnection.execute(
        'SELECT value FROM settings WHERE key_name = "dashboardStatusSettings"'
      );

      const result = {};
      
      if (dashboardStatusSettings.length > 0) {
        result.dashboardStatusSettings = JSON.parse(dashboardStatusSettings[0].value);
      }

      return { success: true, data: result };
    } catch (error) {
      console.error('Erro ao carregar configurações do dashboard, usando fallback:', error);
      
      try {
        const dataPath = path.join(app.getPath('userData'), 'settings.json');
        if (fs.existsSync(dataPath)) {
          const savedSettings = fs.readFileSync(dataPath, 'utf8');
          return { 
            success: true, 
            data: savedSettings ? JSON.parse(savedSettings) : {},
            fallback: true 
          };
        }
        return { success: true, data: {}, fallback: true };
      } catch (fallbackError) {
        return { success: false, error: error.message, data: {} };
      }
    }
  });

  // Handler para verificar tickets duplicados
  ipcMain.handle('check-duplicate-tickets', async (event, importedTickets) => {
    try {
      if (!isDatabaseConnected) {
        return { success: true, duplicates: [] };
      }

      const duplicates = [];
      
      for (const importedTicket of importedTickets) {
        const [existing] = await dbConnection.execute(
          'SELECT id, numero_chamado FROM tickets WHERE numero_chamado = ? OR url = ?',
          [importedTicket.numeroChamado, importedTicket.url]
        );
        
        if (existing.length > 0) {
          duplicates.push({
            imported: importedTicket,
            existing: existing[0]
          });
        }
      }
      
      return { success: true, duplicates };
    } catch (error) {
      console.error('Erro ao verificar duplicatas:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler para testar conexão com banco de dados
  ipcMain.handle('test-database-connection', async () => {
    try {
      const result = await checkDatabaseConnection();
      return {
        connected: result,
        config: {
          host: dbConfig.host,
          user: dbConfig.user,
          database: dbConfig.database
        }
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  });

  // ============ IPC HANDLERS PARA NOTIFICAÇÕES DO SISTEMA ============

  // Handler para exibir notificação do sistema
  ipcMain.handle('show-system-notification', async (event, options) => {
    try {
      const notification = showSystemNotification(options);
      return { success: true, notificationId: notification ? notification.id : null };
    } catch (error) {
      console.error('Erro no handler de notificação do sistema:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler para notificação de agendamento
  ipcMain.handle('show-schedule-system-notification', async (event, { schedule, ticket, minutesLeft }) => {
    try {
      const notification = showScheduleSystemNotification(schedule, ticket, minutesLeft);
      return { success: true, notificationId: notification ? notification.id : null };
    } catch (error) {
      console.error('Erro no handler de notificação de agendamento:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler para notificação de agendamento vencido
  ipcMain.handle('show-expired-schedule-system-notification', async (event, { schedule, ticket }) => {
    try {
      const notification = showExpiredScheduleSystemNotification(schedule, ticket);
      return { success: true, notificationId: notification ? notification.id : null };
    } catch (error) {
      console.error('Erro no handler de notificação vencida:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler para notificação genérica
  ipcMain.handle('show-generic-system-notification', async (event, { type, message, extra }) => {
    try {
      const notification = showGenericSystemNotification(type, message, extra);
      return { success: true, notificationId: notification ? notification.id : null };
    } catch (error) {
      console.error('Erro no handler de notificação genérica:', error);
      return { success: false, error: error.message };
    }
  });

  // Handler para solicitar permissão de notificações
  ipcMain.handle('request-notification-permission', async () => {
    try {
      const result = await showNotificationPermissionDialog();
      return { success: true, granted: result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Handler para verificar status de notificações
  ipcMain.handle('check-notification-support', async () => {
    try {
      const supported = Notification.isSupported();
      return { success: true, supported };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Handler para testar notificação
  ipcMain.handle('test-notification', async () => {
    try {
      const notification = showSystemNotification({
        title: 'Tickets Control',
        body: 'Esta é uma notificação de teste do sistema!',
        sound: true,
        timeout: 5000
      });
      return { success: true, notificationId: notification ? notification.id : null };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Handler para limpar notificações de agendamento
  ipcMain.handle('clear-schedule-notification', async (event, scheduleId) => {
    try {
      // Remover do histórico
      notificationHistory.delete(`reminder_${scheduleId}`);
      notificationHistory.delete(`expired_${scheduleId}`);
      notificationHistory.delete(`schedule_reminder_${scheduleId}_30`);
      notificationHistory.delete(`schedule_reminder_${scheduleId}_15`);
      notificationHistory.delete(`schedule_reminder_${scheduleId}_5`);
      notificationHistory.delete(`schedule_expired_${scheduleId}`);
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Handler para resetar histórico de notificações
  ipcMain.handle('reset-notification-history', async () => {
    try {
      resetNotificationHistory();
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

// ===============================================================
// JANELA PRINCIPAL E TRAY
// ===============================================================
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    icon: path.join(__dirname, 'icon.ico'),
    show: false,
    title: 'Tickets Control'
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.webContents.setZoomFactor(0.69);
    mainWindow.show();
    
    // Iniciar monitoramento de inatividade após a janela estar pronta
    setTimeout(() => {
      startInactivityMonitoring();
    }, 2000);
  });


  // Configurar abertura de links externos
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.webContents.on('new-window', (event, url) => {
    event.preventDefault();
    shell.openExternal(url);
  });

  // Configurar menu de contexto
  mainWindow.webContents.on('context-menu', (event, params) => {
    const menu = [];

    if (params.misspelledWord && params.dictionarySuggestions.length > 0) {
      for (const suggestion of params.dictionarySuggestions) {
        menu.push({
          label: suggestion,
          click: () => {
            mainWindow.webContents.replaceMisspelling(suggestion);
          }
        });
      }
      menu.push({ type: 'separator' });
    }

    menu.push(
      { label: 'Copiar', role: 'copy', enabled: params.editFlags.canCopy },
      { label: 'Colar', role: 'paste', enabled: params.editFlags.canPaste },
      { label: 'Cortar', role: 'cut', enabled: params.editFlags.canCut },
      { type: 'separator' },
      { label: 'Selecionar tudo', role: 'selectAll' }
    );

    Menu.buildFromTemplate(menu).popup();
  });

   // Configurar CSP
  const { session } = require('electron');
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self' 'unsafe-inline' data:; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com; " +
          "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; " +
          "font-src 'self' https://cdnjs.cloudflare.com; " +
          "img-src 'self' data: https:; " +
          "connect-src 'self' * data: blob: filesystem:;"
        ]
      }
    });
  });

  mainWindow.loadFile('index.html');

  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Tratamento de erros de carregamento
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Falha ao carregar a página:', errorCode, errorDescription);
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    console.error('Processo de renderização falhou:', details);
  });

  // Evento de fechamento da janela
  mainWindow.on('close', (event) => {
    if (!willQuitApp) {
      event.preventDefault();
      mainWindow.hide();
      
      // Parar monitoramento de inatividade quando minimizado
      stopInactivityMonitoring();
      
      // Mostrar notificação informando que o app está em segundo plano
      showSystemNotification({
        title: 'Tickets Control',
        body: 'O aplicativo continua rodando em segundo plano. Notificações de agendamento serão exibidas normalmente.',
        sound: false,
        timeout: 5000
      });
    } else {
      // Parar monitoramento de inatividade ao sair
      stopInactivityMonitoring();
    }
  });

  // Quando a janela é restaurada (deixar de estar minimizada)
  mainWindow.on('restore', () => {
    resetInactivityTimer();
    startInactivityMonitoring();
  });
}

function createTrayIcon() {
  const iconPath = path.join(__dirname, 'icon.ico');
  
  tray = new Tray(iconPath);
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Abrir Tickets Control',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          if (mainWindow.isMinimized()) {
            mainWindow.restore();
          }
          mainWindow.focus();
        } else {
          createWindow();
        }
      }
    },
       { type: 'separator' },
    {
      label: 'Sair',
      click: () => {
        willQuitApp = true;
        app.quit();
      }
    }
  ]);
  
  tray.setToolTip('Tickets Control (Rodando em segundo plano)');
  tray.setContextMenu(contextMenu);
  
  // Clique duplo no ícone para abrir a janela
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });
}

// ===============================================================
// REGISTRO DE ACESSO
// ===============================================================

function registrarAcessoEVerificarAtualizacao() {
  try {
    const acessoPath = "Z:\\Temporario\\DocTools\\Acessos.csv";
    const usuario = os.userInfo().username;
    const dataHora = new Date().toLocaleString('pt-BR');
    const versaoInstalador = obterVersaoDoExecutavel(instaladorAtualizadoPath) || 'Não existe versão disponível';
    const versaoInstalada = app.getVersion() || 'Desconhecida';

    // Comparar versões
    const comparacao = compararVersoes(versaoInstalador, versaoInstalada);
    const status = comparacao === 0 ? 'Atualizado' : 'Desatualizado';

    // Linha a ser gravada no arquivo
    const linhaLog = `${dataHora}| Versão Instalada:${versaoInstalada} | Status: ${status} | Chamados de ${usuario}${os.EOL}${os.EOL}`;

    fs.appendFileSync(acessoPath, linhaLog, 'utf8');
    console.log("Acesso registrado com sucesso.");
 
    // Exibe mensagem repetitiva se estiver desatualizado
    if (status === 'Desatualizado' && fs.existsSync(instaladorAtualizadoPath)) {
      const versaoInstalador = obterVersaoDoExecutavel(instaladorAtualizadoPath);
      if (versaoInstalador) {
        setInterval(() => {
          dialog.showMessageBox({
            type: 'warning',
            buttons: ['Atualizar agora', 'Lembrar depois'],
            defaultId: 0,
            cancelId: 1,
            title: 'Atualização disponível',
            message: `Olá ${usuario}, temos uma nova versão ${versaoInstalador} do app para você!`,
            detail: 'Atualize agora para aproveitar melhorias e correções importantes. É rapidinho :)'
          }).then(result => {
            if (result.response === 0) {
              executarAtualizacao(versaoInstalador);
            }
          });
        }, 120000);
      }
    }
  } catch (err) {
    console.error("Erro ao registrar acesso:", err);
  }
}

// ===============================================================
// INICIALIZAÇÃO DO APP
// ===============================================================

async function inicializarAplicacao() {
  try {
    console.log('🚀 Iniciando aplicação...');
    
    // Resetar histórico de notificações ao iniciar
    resetNotificationHistory();
    
    // Iniciar limpeza periódica do histórico (a cada hora)
    setInterval(cleanupNotificationHistory, 60 * 60 * 1000);
    
    // Configurar permissões de notificação
    setupNotificationPermissions();
    
    // Registrar acesso e verificar atualização
    registrarAcessoEVerificarAtualizacao();
    
    if (!validateDatabaseConfig()) {
      throw new Error('Configuração do banco de dados inválida');
    }

    // Inicia serviços XAMPP silenciosamente
    await startXamppServices();
    
    setupIpcHandlers();
    createWindow();
    createTrayIcon();

    // Verifica conexão com banco periodicamente
    setInterval(() => {
      checkDatabaseConnection();
    }, 1 * 60 * 1000);

    // Verificar agendamentos periodicamente (a cada 5 minutos)
    setInterval(() => {
      checkSchedulesForNotifications();
    }, 5 * 60 * 1000);

    // Verificar imediatamente ao iniciar
    setTimeout(() => {
      checkSchedulesForNotifications();
    }, 1000);

    console.log('✅ Aplicação iniciada com sucesso!');
    
    // Mostrar notificação de inicialização
    setTimeout(() => {
      showSystemNotification({
        title: 'Tickets Control',
        body: 'Aplicativo iniciado. Notificações de agendamento serão exibidas automaticamente a cada 5 minutos.',
        sound: true,
        timeout: 5000
      });
    }, 2000);
  } catch (error) {
    console.error('❌ Erro ao iniciar aplicação:', error);
    dialog.showErrorBox('Erro de Inicialização', error.message);
  }
}

// ===============================================================
// EVENTOS E ERROS GLOBAIS
// ===============================================================

app.on('activate', function () {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
    resetNotificationHistory();
  } else {
    resetNotificationHistory();
  }
});

app.on('before-quit', async () => {
  console.log('Fechando aplicação...');
  
  // Mostrar notificação de encerramento
  showSystemNotification({
    title: 'Tickets Control',
    body: 'Aplicativo está sendo encerrado...',
    sound: false,
    timeout: 3000
  });
  
  if (dbConnection && isDatabaseConnected) {
    await dbConnection.end();
    console.log('Conexão com MySQL fechada.');
  }
  
  // Limpar histórico de notificações
  notificationHistory.clear();
  
  // Remover ícone da bandeja
  if (tray) {
    tray.destroy();
  }
});

process.on('uncaughtException', (error) => {
  console.error('Erro não capturado:', error);
  showSystemNotification({
    title: 'Tickets Control - Erro',
    body: `Ocorreu um erro não esperado: ${error.message}`,
    sound: true,
    timeout: 10000
  });
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Promise rejeitada não tratada:', reason);
});

// Configurar diretório de dados do usuário
app.setPath('userData', path.join(app.getPath('userData'), 'TicketsControl'));

try {
  if (!fs.existsSync(app.getPath('userData'))) {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
  }
} catch (error) {
  console.error('Erro ao criar diretório de dados:', error);
}

// ===============================================================
// INICIALIZAÇÃO PRINCIPAL
// ===============================================================

app.whenReady().then(() => {
  console.log("App iniciado.");

  try {
    // Limpar flag de atualização se existir
    if (fs.existsSync(flagAtualizacaoPath)) {
      const flag = JSON.parse(fs.readFileSync(flagAtualizacaoPath, 'utf8'));
      if (flag.versaoAtualizada === app.getVersion()) {
        fs.unlinkSync(flagAtualizacaoPath);
        console.log("Flag de atualização removida.");
      }
    }
  } catch (e) {
    console.warn("Erro ao limpar flag de atualização:", e);
  }

  // Verificar atualização
  const novaVersao = checarAtualizacaoDisponivel();

  if (novaVersao) {
    dialog.showMessageBox({
      type: 'info',
      buttons: ['Atualizar agora', 'Cancelar'],
      defaultId: 0,
      cancelId: 1,
      title: 'Atualização disponível',
      message: `Uma nova versão ${novaVersao} do Controle de Chamados está disponível.`,
      detail: 'Deseja instalar a atualização agora?',
    }).then(result => {
      if (result.response === 0) {
        executarAtualizacao(novaVersao);
      } else {
        inicializarAplicacao();
      }
    });
  } else {
    inicializarAplicacao();
  }
});