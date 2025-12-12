// Dados iniciais vazios
   let tickets = [];
    let schedules = [];
  let customStatuses = ["Aguardando Cliente", "Retomar Atendimento", "Em Atendimento", "Pré-Finalizado", "Finalizado"];
    
  // ============ CONFIGURAÇÕES DO SISTEMA ============
let systemSettings = {
    theme: 'claro',
    autoDeleteFinalized: true,
    deleteAfterDays: 3,
    notificationsEnabled: true,
    statusColors: {
        "Aguardando Cliente": "#ccc",
        "Retomar Atendimento": "#ccc", 
        "Em Analise": "#ccc",
        "Pré-Finalizado": "#ccc",
        "Em Atendimento": "#ccc",
        "Finalizado": "#ccc"
    }
};

    // Integração com Electron e MySQL
    let ipcRenderer;
    try {
        if (typeof require !== 'undefined') {
            ipcRenderer = require('electron').ipcRenderer;
        } else if (window.require) {
            ipcRenderer = window.require('electron').ipcRenderer;
        }
    } catch (error) {
        console.log('Executando em ambiente web, IPC não disponível');
        ipcRenderer = {
            invoke: async (channel, data) => {
                console.log(`IPC simulando: ${channel}`, data);
                return await handleWebFallback(channel, data);
            }
        };
    }

    // ============ FUNÇÕES AUXILIARES ============

    // Função para gerar IDs únicos
    function gerarId() {
        return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

 
// ============ FUNÇÕES DE FORMATAÇÃO DE DATA ============

// Função para formatar data para exibição (formato brasileiro)
function formatarDataParaExibicao(data) {
    if (!data) {
        return formatarDataParaExibicao(new Date());
    }
    
    const dataObj = new Date(data);
    
    if (isNaN(dataObj.getTime())) {
        console.warn('Data inválida, usando data atual');
        return formatarDataParaExibicao(new Date());
    }
    
    const dia = String(dataObj.getDate()).padStart(2, '0');
    const mes = String(dataObj.getMonth() + 1).padStart(2, '0');
    const ano = dataObj.getFullYear();
    const hora = String(dataObj.getHours()).padStart(2, '0');
    const minuto = String(dataObj.getMinutes()).padStart(2, '0');
    const segundo = String(dataObj.getSeconds()).padStart(2, '0');
    
    return `${dia}/${mes}/${ano} ${hora}:${minuto}:${segundo}`;
}

// Função para formatar data para MySQL (YYYY-MM-DD HH:MM:SS)
function formatarDataParaMySQL(data) {
    if (!data) {
        return formatarDataParaMySQL(new Date());
    }
    
    const dataObj = new Date(data);
    
    if (isNaN(dataObj.getTime())) {
        console.warn('Data inválida, usando data atual');
        return formatarDataParaMySQL(new Date());
    }
    
    const ano = dataObj.getFullYear();
    const mes = String(dataObj.getMonth() + 1).padStart(2, '0');
    const dia = String(dataObj.getDate()).padStart(2, '0');
    const hora = String(dataObj.getHours()).padStart(2, '0');
    const minuto = String(dataObj.getMinutes()).padStart(2, '0');
    const segundo = String(dataObj.getSeconds()).padStart(2, '0');
    
    return `${ano}-${mes}-${dia} ${hora}:${minuto}:${segundo}`;
}

// CORREÇÃO: Função para converter data MySQL para input datetime-local
function converterDataMySQLParaInput(dataMySQL) {
    if (!dataMySQL) return '';
    
    try {
        // Se já estiver no formato do input, retornar como está
        if (dataMySQL.includes('T')) {
            return dataMySQL;
        }
        
        // Converter de MySQL (YYYY-MM-DD HH:MM:SS) para input (YYYY-MM-DDTHH:MM)
        const [datePart, timePart] = dataMySQL.split(' ');
        if (!datePart || !timePart) {
            throw new Error('Formato de data inválido');
        }
        
        const [hours, minutes] = timePart.split(':');
        // Garantir formato correto para o input
        return `${datePart}T${hours}:${minutes}`;
        
    } catch (error) {
        console.error('Erro ao converter data MySQL para input:', error);
        return '';
    }
}


// CORREÇÃO: Função melhorada para formatar data para input
function formatarDataParaInput(data) {
    if (!data) {
        const now = new Date();
        return now.toISOString().slice(0, 16);
    }
    
    // Se for uma data MySQL, converter
    if (typeof data === 'string' && data.includes('-') && data.includes(':')) {
        return converterDataMySQLParaInput(data);
    }
    
    const dataObj = new Date(data);
    
    if (isNaN(dataObj.getTime())) {
        console.warn('Data inválida, usando data atual');
        const now = new Date();
        return now.toISOString().slice(0, 16);
    }
    
    // Formatar para YYYY-MM-DDTHH:MM (formato do input datetime-local)
    const ano = dataObj.getFullYear();
    const mes = String(dataObj.getMonth() + 1).padStart(2, '0');
    const dia = String(dataObj.getDate()).padStart(2, '0');
    const hora = String(dataObj.getHours()).padStart(2, '0');
    const minuto = String(dataObj.getMinutes()).padStart(2, '0');
    
    return `${ano}-${mes}-${dia}T${hora}:${minuto}`;
}

// CORREÇÃO: Função de validação de data mais flexível
function validarDataAgendamento(dataInput) {
    if (!dataInput) {
        return {
            valido: false,
            mensagem: 'Data do agendamento é obrigatória.'
        };
    }
    
    const dataAgendamento = new Date(dataInput);
    const agora = new Date();
    
    // Remover milissegundos para comparação precisa
    agora.setMilliseconds(0);
    dataAgendamento.setMilliseconds(0);
    
    if (dataAgendamento <= agora) {
        return {
            valido: false,
            mensagem: 'A data do agendamento deve ser futura.'
        };
    }
    
    // Permitir agendamentos até 2 anos no futuro
    const doisAnosDepois = new Date();
    doisAnosDepois.setFullYear(doisAnosDepois.getFullYear() + 2);
    
    if (dataAgendamento > doisAnosDepois) {
        return {
            valido: false,
            mensagem: 'A data do agendamento não pode ser superior a 2 anos.'
        };
    }
    
    return {
        valido: true,
        mensagem: 'Data válida'
    };
}

// MODIFICAÇÃO: Adicionar validação em tempo real no campo de data
document.getElementById('schedule-date').addEventListener('change', function() {
    const dataInput = this.value;
    
    if (!dataInput) return;
    
    const validacao = validarDataAgendamento(dataInput);
    
    if (!validacao.valido) {
        this.setCustomValidity(validacao.mensagem);
        this.reportValidity();
        
        showPushNotification({
            title: 'Data Inválida',
            message: validacao.mensagem,
            type: 'warning',
            duration: 4000
        });
    } else {
        this.setCustomValidity('');
    }
});


// Event listener para o botão de reset (se você adicionou)
document.getElementById('reset-dashboard-status')?.addEventListener('click', async function() {
  if (confirm('Restaurar todas as configurações de status do dashboard para os padrões?\n\nIsso ativará todos os status básicos.')) {
    dashboardStatusSettings.enabledStatuses = ["Aguardando Cliente", "Retomar Atendimento", "Em Analise", "Finalizado", "Pré-Finalizado", "Em Atendimento"];
    
    const success = await saveDashboardStatusSettings();
    if (success) {
      renderStatusList();
      updateDashboard();
      showPushNotification({
        title: 'Configurações Restauradas',
        message: 'Todos os status básicos foram ativados no dashboard!',
        type: 'success',
        duration: 3000
      });
    }
  }
});
    // Função de fallback para ambiente web
    async function handleWebFallback(channel, data) {
        switch (channel) {
            case 'get-tickets':
                const savedTickets = localStorage.getItem('tickets');
                return { success: true, data: savedTickets ? JSON.parse(savedTickets) : [] };
            
            case 'save-ticket':
                let tickets = JSON.parse(localStorage.getItem('tickets') || '[]');
                const existingIndex = tickets.findIndex(t => t.id === data.id);
                
                if (existingIndex >= 0) {
                    tickets[existingIndex] = data;
                } else {
                    tickets.push(data);
                }
                
                localStorage.setItem('tickets', JSON.stringify(tickets));
                return { success: true };
            
            case 'delete-ticket':
                let allTickets = JSON.parse(localStorage.getItem('tickets') || '[]');
                allTickets = allTickets.filter(t => t.id !== data);
                localStorage.setItem('tickets', JSON.stringify(allTickets));
                return { success: true };
            
            case 'get-schedules':
                const savedSchedules = localStorage.getItem('schedules');
                return { success: true, data: savedSchedules ? JSON.parse(savedSchedules) : [] };
            
            case 'save-schedule':
                let schedules = JSON.parse(localStorage.getItem('schedules') || '[]');
                const scheduleIndex = schedules.findIndex(s => s.id === data.id);
                
                if (scheduleIndex >= 0) {
                    schedules[scheduleIndex] = data;
                } else {
                    schedules.push(data);
                }
                
                localStorage.setItem('schedules', JSON.stringify(schedules));
                return { success: true };
            
            case 'load-settings':
                const savedSettings = localStorage.getItem('ticketsControlSettings');
                return { success: true, data: savedSettings ? JSON.parse(savedSettings) : {} };
            
            case 'save-settings':
                localStorage.setItem('ticketsControlSettings', JSON.stringify(data));
                return { success: true };
            
            case 'save-custom-statuses':
                const currentSettings = JSON.parse(localStorage.getItem('ticketsControlSettings') || '{}');
                currentSettings.customStatuses = data;
                localStorage.setItem('ticketsControlSettings', JSON.stringify(currentSettings));
                return { success: true };
            
            case 'export-to-excel':
                exportToExcelWeb();
                return { success: true };
            
            case 'import-from-excel':
                return { success: true, data: data };
            
            default:
                return { success: false, error: 'Channel not supported in web environment' };
        }
    }

    // ============ BANCO DE DADOS ============

    class DatabaseManager {



// ============ NOVAS FUNÇÕES DE BACKUP E RESTAURAÇÃO ============
    
    async createBackup() {
        try {
            const backupData = {
                version: '1.0.0',
                timestamp: new Date().toISOString(),
                tickets: tickets,
                schedules: schedules,
                systemSettings: systemSettings,
                customStatuses: customStatuses
            };
            
            return {
                success: true,
                data: backupData
            };
        } catch (error) {
            console.error('Erro ao criar backup:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

 async restoreBackup(backupData) {
    try {
        console.log('Restaurando backup...', backupData);
        
        if (!backupData || !backupData.tickets || !backupData.schedules || !backupData.systemSettings) {
            throw new Error('Arquivo de backup inválido ou corrompido');
        }

        // CORREÇÃO: Limpar dados atuais de forma mais eficiente
        await this.clearAllData();

        // CORREÇÃO: Restaurar tickets
        console.log('Restaurando tickets...', backupData.tickets.length);
        for (const ticket of backupData.tickets) {
            await this.saveTicket(ticket);
        }

        // CORREÇÃO: Restaurar agendamentos
        console.log('Restaurando agendamentos...', backupData.schedules.length);
        for (const schedule of backupData.schedules) {
            await this.saveSchedule(schedule);
        }

        // CORREÇÃO: Restaurar configurações do sistema
        systemSettings = { ...systemSettings, ...backupData.systemSettings };
        
        // Garantir que statusColors existe
        if (!systemSettings.statusColors) {
            systemSettings.statusColors = {};
        }

        // CORREÇÃO: Restaurar status personalizados se existirem
        if (backupData.customStatuses) {
            customStatuses = [...backupData.customStatuses];
        }

        // CORREÇÃO: Restaurar configurações do dashboard se existirem
        if (backupData.dashboardStatusSettings) {
            dashboardStatusSettings = { ...dashboardStatusSettings, ...backupData.dashboardStatusSettings };
        }

        // CORREÇÃO: Salvar configurações
        await this.saveSettings();
        
        // CORREÇÃO: Salvar status personalizados
        await this.saveCustomStatuses(customStatuses);

        // CORREÇÃO: Atualizar arrays locais após a restauração
        tickets = [...backupData.tickets];
        schedules = [...backupData.schedules];

        console.log('Backup restaurado com sucesso!');
        return { success: true };
        
    } catch (error) {
        console.error('Erro ao restaurar backup:', error);
        return { success: false, error: error.message };
    }
}


// CORREÇÃO: Método clearAllData melhorado
async clearAllData() {
    try {
        console.log('Limpando todos os dados...');
        
        // CORREÇÃO: Limpar arrays locais primeiro
        const ticketsParaExcluir = [...tickets];
        const schedulesParaExcluir = [...schedules];
        
        tickets.length = 0;
        schedules.length = 0;

        // CORREÇÃO: Excluir cada item individualmente
        for (const ticket of ticketsParaExcluir) {
            await this.deleteTicket(ticket.id);
        }

        for (const schedule of schedulesParaExcluir) {
            await this.deleteSchedule(schedule.id);
        }

        // CORREÇÃO: Limpar localStorage se estiver no ambiente web
        if (typeof ipcRenderer === 'undefined' || !ipcRenderer.invoke) {
            try {
                localStorage.removeItem('tickets');
                localStorage.removeItem('schedules');
                console.log('Dados limpos do localStorage');
            } catch (webError) {
                console.warn('Não foi possível limpar localStorage:', webError);
            }
        }

        console.log('Todos os dados foram limpos com sucesso');
        return { success: true };
        
    } catch (error) {
        console.error('Erro ao limpar dados:', error);
        return { success: false, error: error.message };
    }
}




        constructor() {
            this.initialized = false;
            this.init();
        }

        async init() {
            try {
                await this.loadTickets();
                await this.loadSchedules();
                await this.loadSettings();
                this.initialized = true;
                console.log('DatabaseManager inicializado');
            } catch (error) {
                console.error('Erro ao inicializar DatabaseManager:', error);
            }
        }

      async loadTickets() {
    try {
        let result;
        
        if (typeof ipcRenderer !== 'undefined' && ipcRenderer.invoke) {
            result = await ipcRenderer.invoke('get-tickets');
        } else {
            result = await this.loadTicketsWeb();
        }
        
        if (result.success) {
            tickets = result.data;
            
            // CORREÇÃO: Disparar evento de tickets atualizados
            window.dispatchEvent(new CustomEvent('ticketsUpdated'));
            
            // Renderizar todas as interfaces que dependem dos tickets
            this.renderAllTicketInterfaces();
            
            return true;
        } else {
            throw new Error(result.error || 'Falha ao carregar tickets');
        }
    } catch (error) {
        console.error('Erro ao carregar tickets:', error);
        
        // Tentar fallback web
        try {
            console.log('Tentando carregar tickets via fallback web...');
            const webResult = await this.loadTicketsWeb();
            if (webResult.success) {
                tickets = webResult.data;
                
                // CORREÇÃO: Disparar evento de tickets atualizados
                window.dispatchEvent(new CustomEvent('ticketsUpdated'));
                
                this.renderAllTicketInterfaces();
                return true;
            }
        } catch (webError) {
            console.error('Erro no fallback web:', webError);
        }
        
        return false;
    }
}

// Função para carregar tickets no ambiente web
async loadTicketsWeb() {
    return new Promise((resolve) => {
        try {
            const savedTickets = localStorage.getItem('tickets');
            const ticketsData = savedTickets ? JSON.parse(savedTickets) : [];
            
            resolve({
                success: true,
                data: ticketsData
            });
        } catch (error) {
            console.error('Erro ao carregar tickets do localStorage:', error);
            resolve({
                success: false,
                error: error.message
            });
        }
    });
}

// Função para renderizar todas as interfaces de tickets
renderAllTicketInterfaces() {
    // Atualizar tabela principal de chamados (excluindo finalizados)
    if (typeof renderTicketsTable === 'function') {
        renderTicketsTable();
    }
    
    // Atualizar tabela de chamados finalizados
    if (typeof renderFinishedTicketsTable === 'function') {
        renderFinishedTicketsTable();
    }
    
    // Atualizar chamados recentes no dashboard
    if (typeof renderRecentTickets === 'function') {
        renderRecentTickets();
    }
    
    // Atualizar dashboard
    if (typeof updateDashboard === 'function') {
        updateDashboard();
    }
    
    // Atualizar gráficos
    if (typeof updateCharts === 'function') {
        updateCharts();
    }
    
    // Atualizar contador de filtros se estiver na página de chamados
    if (document.getElementById('chamados-page').classList.contains('active')) {
        const totalAtivos = tickets.filter(ticket => ticket.status !== 'Finalizado').length;
        atualizarContadorFiltros(totalAtivos);
    }
}

       async saveTicket(ticket) {
    try {
        if (typeof ipcRenderer !== 'undefined' && ipcRenderer.invoke) {
            const result = await ipcRenderer.invoke('save-ticket', ticket);
            
            if (result.success) {
                const existingIndex = tickets.findIndex(t => t.id === ticket.id);
                if (existingIndex >= 0) {
                    tickets[existingIndex] = ticket;
                } else {
                    tickets.push(ticket);
                }
                
                // Se o ticket foi marcado como Finalizado, atualizar as interfaces
                if (ticket.status === 'Finalizado') {
                    // Disparar evento para notificar sobre ticket finalizado
                    window.dispatchEvent(new CustomEvent('ticketFinalizado', {
                        detail: { ticket: ticket }
                    }));
                    
                    // Remover da lista principal imediatamente
                    if (document.getElementById('chamados-page').classList.contains('active')) {
                        renderTicketsTable();
                    }
                }
                
                return true;
            } else {
                throw new Error(result.error || 'Falha ao salvar no banco de dados');
            }
        } else {
            return await this.saveTicketWeb(ticket);
        }
    } catch (error) {
        console.error('Erro ao salvar ticket:', error);
        try {
            return await this.saveTicketWeb(ticket);
        } catch (webError) {
            console.error('Erro no fallback web:', webError);
            return false;
        }
    }
}

// Função para salvar ticket no ambiente web (localStorage)
async saveTicketWeb(ticket) {
    return new Promise((resolve, reject) => {
        try {
            let savedTickets = JSON.parse(localStorage.getItem('tickets') || '[]');
            const existingIndex = savedTickets.findIndex(t => t.id === ticket.id);
            
            if (existingIndex >= 0) {
                savedTickets[existingIndex] = ticket;
            } else {
                savedTickets.push(ticket);
            }
            
            localStorage.setItem('tickets', JSON.stringify(savedTickets));
            
            // Atualizar a lista local
            tickets = savedTickets;
            
            // Se o ticket foi marcado como Finalizado, notificar
            if (ticket.status === 'Finalizado') {
                window.dispatchEvent(new CustomEvent('ticketStatusChanged', {
                    detail: { ticket: ticket }
                }));
            }
            
            resolve(true);
        } catch (error) {
            console.error('Erro ao salvar ticket no ambiente web:', error);
            reject(error);
        }
    });
}

        async deleteTicket(ticketId) {
            try {
                const result = await ipcRenderer.invoke('delete-ticket', ticketId);
                return result.success;
            } catch (error) {
                console.error('Erro ao deletar ticket:', error);
                return false;
            }
        }

        async loadSchedules() {
            try {
                const result = await ipcRenderer.invoke('get-schedules');
                if (result.success) {
                    schedules = result.data;
                    renderSchedulesTable();
                }
            } catch (error) {
                console.error('Erro ao carregar agendamentos:', error);
            }
        }
       
        async deleteAllSchedules() {
    try {
        if (typeof ipcRenderer !== 'undefined' && ipcRenderer.invoke) {
            // No Electron
            const result = await ipcRenderer.invoke('delete-all-schedules');
            return result.success;
        } else {
            // Fallback para ambiente web
            return await this.deleteAllSchedulesWeb();
        }
    } catch (error) {
        console.error('Erro ao excluir todos os agendamentos:', error);
        return false;
    }
}

// Função para exclusão em lote no ambiente web
async deleteAllSchedulesWeb() {
    try {
        localStorage.removeItem('schedules');
        return true;
    } catch (error) {
        console.error('Erro ao excluir todos os agendamentos (web):', error);
        return false;
    }
}

// ============ CORREÇÃO NO DATABASE MANAGER ============

// Adicione estas funções à classe DatabaseManager

async deleteSchedule(scheduleId) {
    try {
        if (typeof ipcRenderer !== 'undefined' && ipcRenderer.invoke) {
            const result = await ipcRenderer.invoke('delete-schedule', scheduleId);
            return result.success;
        } else {
            // Fallback para ambiente web
            return await this.deleteScheduleWeb(scheduleId);
        }
    } catch (error) {
        console.error('Erro ao deletar agendamento:', error);
        return false;
    }
}

async deleteScheduleWeb(scheduleId) {
    try {
        let savedSchedules = JSON.parse(localStorage.getItem('schedules') || '[]');
        savedSchedules = savedSchedules.filter(s => s.id !== scheduleId);
        localStorage.setItem('schedules', JSON.stringify(savedSchedules));
        
        // Atualizar array local
        const index = schedules.findIndex(s => s.id === scheduleId);
        if (index > -1) {
            schedules.splice(index, 1);
        }
        
        return true;
    } catch (error) {
        console.error('Erro ao excluir agendamento (web):', error);
        return false;
    }
}

async deleteTicketWeb(ticketId) {
    try {
        let savedTickets = JSON.parse(localStorage.getItem('tickets') || '[]');
        savedTickets = savedTickets.filter(t => t.id !== ticketId);
        localStorage.setItem('tickets', JSON.stringify(savedTickets));
        
        // Atualizar array local
        const index = tickets.findIndex(t => t.id === ticketId);
        if (index > -1) {
            tickets.splice(index, 1);
        }
        
        return true;
    } catch (error) {
        console.error('Erro ao excluir ticket (web):', error);
        return false;
    }
}

async saveCustomStatusesWeb(statuses) {
    try {
        const currentSettings = JSON.parse(localStorage.getItem('ticketsControlSettings') || '{}');
        currentSettings.customStatuses = statuses;
        localStorage.setItem('ticketsControlSettings', JSON.stringify(currentSettings));
        return true;
    } catch (error) {
        console.error('Erro ao salvar status personalizados (web):', error);
        return false;
    }
}

async clearAllDataWeb() {
    try {
        // Limpar localStorage
        localStorage.removeItem('tickets');
        localStorage.removeItem('schedules');
        
        // Limpar arrays locais
        tickets.length = 0;
        schedules.length = 0;
        
        console.log('Dados limpos do localStorage');
        return { success: true };
    } catch (error) {
        console.error('Erro ao limpar dados (web):', error);
        return { success: false, error: error.message };
    }
}

        async saveSchedule(schedule) {
            try {
                const result = await ipcRenderer.invoke('save-schedule', schedule);
                return result.success;
            } catch (error) {
                console.error('Erro ao salvar agendamento:', error);
                return false;
            }
        }

        // ============ INICIALIZAÇÃO ATUALIZADA ============

// Modifique a função loadSettings no DatabaseManager:
async loadSettings() {
    try {
        const result = await ipcRenderer.invoke('load-settings');
        if (result.success && result.data) {
            console.log('Configurações carregadas:', result.data);
            
            // Mesclar configurações do sistema
            if (result.data.systemSettings) {
                systemSettings = { 
                    ...systemSettings, 
                    ...result.data.systemSettings 
                };
                
                // Garantir que statusColors existe e tem valores padrão
                if (!systemSettings.statusColors) {
                    systemSettings.statusColors = {};
                }
                
                // Preencher cores faltantes com valores padrão
                const coresPadrao = {
                    "Aguardando Cliente": "#ccc",
                    "Retomar Atendimento": "#ccc",
                    "Em Analise": "#ccc", 
                    "Finalizado": "#ccc"
                };
                
                Object.keys(coresPadrao).forEach(status => {
                    if (!systemSettings.statusColors[status]) {
                        systemSettings.statusColors[status] = coresPadrao[status];
                    }
                });
                
                // Aplicar tema
                applyTheme(systemSettings.theme);
            }
            
            // Carregar status personalizados
            if (result.data.customStatuses) {
                customStatuses = result.data.customStatuses;
            }
            
            // Carregar configurações do dashboard
            if (result.data.dashboardStatusSettings) {
                dashboardStatusSettings = result.data.dashboardStatusSettings;
            }
            
            console.log('Configurações finais do sistema:', systemSettings);
            
            // Atualizar interfaces
            renderStatusList();
            updateStatusSelects();
            aplicarCoresNosSelectsStatus();
            
        } else {
            console.log('Nenhuma configuração salva encontrada, usando padrões');
            aplicarCoresNosSelectsStatus();
        }
    } catch (error) {
        console.error('Erro ao carregar configurações:', error);
        // Usar configurações padrão e aplicar cores
        aplicarCoresNosSelectsStatus();
    }
}
// E também modifique a função saveSettings:
async saveSettings() {
    try {
        const settings = {
            systemSettings: {
                theme: systemSettings.theme || 'claro',
                autoDeleteFinalized: systemSettings.autoDeleteFinalized !== undefined ? systemSettings.autoDeleteFinalized : true,
                deleteAfterDays: systemSettings.deleteAfterDays || 3,
                notificationsEnabled: systemSettings.notificationsEnabled !== undefined ? systemSettings.notificationsEnabled : true,
                statusColors: systemSettings.statusColors || {}
            },
            customStatuses: customStatuses || [],
            dashboardStatusSettings: dashboardStatusSettings || { 
                enabledStatuses: ["Aguardando Cliente", "Retomar Atendimento", "Em Analise", "Finalizado"] 
            }
        };
        
        console.log('Salvando configurações:', settings);
        
        const result = await ipcRenderer.invoke('save-settings', settings);
        
        if (result.success) {
            console.log('Configurações salvas com sucesso!');
            return true;
        } else {
            throw new Error('Falha ao salvar no banco de dados');
        }
    } catch (error) {
        console.error('Erro ao salvar configurações:', error);
        return false;
    }
}
async saveCustomStatuses(statuses) {
    try {
        if (typeof ipcRenderer !== 'undefined' && ipcRenderer.invoke) {
            const result = await ipcRenderer.invoke('save-custom-statuses', statuses);
            return result && result.success;
        } else {
            // Fallback para ambiente web
            return await this.saveCustomStatusesWeb(statuses);
        }            } catch (error) {
                console.error('Erro ao salvar status personalizados:', error);
                return false;
            }
        }
    }

    const dbManager = new DatabaseManager();

    // ============ FUNÇÕES DE NAVEGAÇÃO E UI ============
// CORREÇÃO: Função melhorada de navegação
function navigateToPage(pageId) {
    console.log('Navegando para página:', pageId);
    
    // Remover classe ativa de todos os itens do menu
    document.querySelectorAll('.nav-item').forEach(nav => {
        nav.classList.remove('active');
        if (nav.getAttribute('data-page') === pageId) {
            nav.classList.add('active');
        }
    });
if (pageId === 'capturar') {
    setTimeout(() => {
        // Limpar dados anteriores
        document.getElementById('conteudo-pagina').value = '';
        document.getElementById('extracted-data').innerHTML = '';
        document.getElementById('save-ticket-btn').classList.add('hidden');
        document.getElementById('extracted-summary').classList.add('hidden');
    }, 100);
}
    
    // Atualizar título da página
    const pageTitleElement = document.getElementById('page-title');
    const activeNavItem = document.querySelector(`.nav-item[data-page="${pageId}"] .nav-text`);
    if (pageTitleElement && activeNavItem) {
        pageTitleElement.textContent = activeNavItem.textContent;
    }
    
    // Esconder todas as páginas
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
        page.style.display = 'none';
    });
    
    // Mostrar a página selecionada
    const targetPage = document.getElementById(`${pageId}-page`);
    if (targetPage) {
        targetPage.classList.add('active');
        targetPage.style.display = 'block';
        console.log('Página ativada:', targetPage.id);
        
        // CORREÇÃO: Ações específicas para cada página
        if (pageId === 'relatorios') {
            setTimeout(() => {
                gerarRelatorio();
            }, 100);
        } else if (pageId === 'dashboard') {
            setTimeout(() => {
                // CORREÇÃO: Forçar atualização completa do dashboard
                updateDashboard();
                inicializarEventListenersDashboard();
                
                // CORREÇÃO: Se havia filtro ativo, restaurá-lo
                if (filtroStatusAtivo) {
                    console.log('Restaurando filtro ao navegar para dashboard:', filtroStatusAtivo);
                    setTimeout(() => {
                        filtrarChamadosPorStatus(filtroStatusAtivo);
                    }, 200);
                }
            }, 100);
        } else if (pageId === 'chamados-finalizados') {
            setTimeout(() => {
                renderFinishedTicketsTable();
            }, 100);
        } else if (pageId === 'chamados') {
            setTimeout(() => {
                renderTicketsTable();
            }, 100);
        }
    } else {
        console.error('Página não encontrada:', `${pageId}-page`);
    }
    
    // Fechar sidebar em mobile
    if (window.innerWidth <= 768) {
        document.getElementById('sidebar').classList.remove('active');
        document.querySelector('.main-content').classList.remove('sidebar-active');
    }

    // Se for a página de relatórios, gerar relatório automaticamente
    if (pageId === 'relatorios') {
        setTimeout(() => {
            gerarRelatorio();
        }, 100);
    }
    
    // Se for o dashboard, atualizar estatísticas
   if (pageId === 'dashboard') {
        setTimeout(() => {
            inicializarEventListenersDashboard();
            updateDashboard(); // Garantir que os dados estejam atualizados
        }, 200);
    }
}
// Função para obter tickets (se não existir)
function getTickets() {
    return tickets || [];
}


// Função para calcular chamados mensais
function calcularChamadosMensais(tickets, periodo) {
    const agora = new Date();
    const periodoMs = periodo * 24 * 60 * 60 * 1000;
    const dataLimite = new Date(agora.getTime() - periodoMs);

    // Filtrar tickets do período
    const ticketsPeriodo = tickets.filter(ticket => {
        try {
            const dataRegistro = new Date(ticket.dataRegistro);
            return dataRegistro >= dataLimite;
        } catch (error) {
            console.warn('Erro ao processar data do ticket:', ticket.dataRegistro);
            return false;
        }
    });

    // Agrupar por mês
    const meses = {};
    const mesesNomes = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    ticketsPeriodo.forEach(ticket => {
        try {
            const data = new Date(ticket.dataRegistro);
            const chaveMes = `${data.getFullYear()}-${data.getMonth()}`;
            
            if (!meses[chaveMes]) {
                meses[chaveMes] = {
                    mes: mesesNomes[data.getMonth()],
                    ano: data.getFullYear(),
                    total: 0,
                    finalizados: 0,
                    abertos: 0
                };
            }

            meses[chaveMes].total++;
            
            if (ticket.status === 'Finalizado') {
                meses[chaveMes].finalizados++;
            } else {
                meses[chaveMes].abertos++;
            }
        } catch (error) {
            console.warn('Erro ao processar ticket para agrupamento mensal:', ticket);
        }
    });

    // Converter para array e ordenar
    return Object.values(meses).sort((a, b) => {
        return new Date(b.ano, mesesNomes.indexOf(b.mes)) - new Date(a.ano, mesesNomes.indexOf(a.mes));
    });
}
    // Aplicar tema
function applyTheme(theme) {
    const body = document.body;
    
    // Remover classes de tema anteriores
    body.classList.remove('dark-theme');
    
    // Aplicar tema selecionado
    if (theme === 'escuro') {
        body.classList.add('dark-theme');
    } else if (theme === 'auto') {
        // Verificar preferência do sistema
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            body.classList.add('dark-theme');
        }
    }
    
    // Atualizar select
    const temaSelect = document.getElementById('tema');
    if (temaSelect) temaSelect.value = theme;
    
    // Atualizar configurações e salvar
    systemSettings.theme = theme;
    dbManager.saveSettings();
}

    // ============ FUNÇÕES DE NOTIFICAÇÃO ============

    // Função para exibir push notifications
    function showPushNotification(options) {
        // Verificar se as notificações estão habilitadas
        if (!systemSettings.notificationsEnabled) {
            return;
        }
        
        const {
            title = 'Notificação',
            message = '',
            type = 'info',
            duration = 1000,
            action = null
        } = options;
        
        // Criar elemento de notificação
        const notification = document.createElement('div');
        notification.className = `push-notification ${type}`;
        
        // Definir ícone baseado no tipo
        let icon = 'info-circle';
        switch (type) {
            case 'success':
                icon = 'check-circle';
                break;
            case 'warning':
                icon = 'exclamation-triangle';
                break;
            case 'error':
                icon = 'exclamation-circle';
                break;
            default:
                icon = 'info-circle';
        }
        
        // Gerar ID único para a notificação
        const notificationId = 'notification-' + Date.now();
        notification.id = notificationId;
        
        // Construir conteúdo da notificação
        let actionButton = '';
        if (action) {
            actionButton = `<button class="push-notification-action" onclick="${action.handler}">${action.text}</button>`;
        }
        
        notification.innerHTML = `
            <div class="push-notification-icon">
                <i class="fas fa-${icon}"></i>
            </div>
            <div class="push-notification-content">
                <div class="push-notification-title">${title}</div>
                <div class="push-notification-message">${message}</div>
                ${actionButton}
            </div>
            <button class="push-notification-close" onclick="closeNotification('${notificationId}')">
                <i class="fas fa-times"></i>
            </button>
        `;
        
        // Adicionar ao container
        const container = document.getElementById('push-notification-container');
        if (container) {
            container.appendChild(notification);
            
            // Mostrar notificação com animação
            setTimeout(() => {
                notification.classList.add('show');
            }, 100);
            
            // Fechar automaticamente após o tempo especificado
            if (duration > 0) {
                setTimeout(() => {
                    closeNotification(notificationId);
                }, duration);
            }
            
            return notificationId;
        }
    }

    // Função para fechar notificação
 function closeNotification(notificationId) {
    const notification = document.getElementById(notificationId);
    if (notification) {
        notification.classList.remove('show');
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 300); // Tempo para animação de saída
    }
}

    // ============ RENDERIZAÇÃO DA INTERFACE ============

function renderTicketsTable() {
    const tbody = document.getElementById('tickets-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    // CORREÇÃO: Filtrar apenas tickets NÃO finalizados por padrão
    const activeTickets = tickets.filter(ticket => ticket.status !== 'Finalizado');
    
    console.log('Chamados ativos encontrados:', activeTickets.length);
    
    if (activeTickets.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="placeholder-text">Nenhum chamado ativo encontrado</td>
            </tr>
        `;
        return;
    }
    
     activeTickets.forEach(ticket => {
        const tr = document.createElement('tr');
        tr.setAttribute('data-ticket-id', ticket.id);
        
        let priorityClass = '';
        if (ticket.prioridade === 'Alta') priorityClass = 'priority-high';
        else if (ticket.prioridade === 'Média') priorityClass = 'priority-medium';
        else if (ticket.prioridade === 'Baixa') priorityClass = 'priority-low';
        
        const dataExibicao = ticket.dataRegistroExibicao || 
                           (ticket.dataRegistro ? formatarDataParaExibicao(ticket.dataRegistro) : 
                           formatarDataParaExibicao(new Date()));
        
        tr.innerHTML = `
            <td><a href="${ticket.url}" target="_blank">${ticket.numeroChamado}</a></td>
            <td>${ticket.cliente}</td>
            <td class="${priorityClass}">${ticket.prioridade}</td>
            <td>
                <select class="status-select" data-ticket-id="${ticket.id}">
                    ${customStatuses.map(status => `
                        <option value="${status}" ${ticket.status === status ? 'selected' : ''}>${status}</option>
                    `).join('')}
                </select>
            </td>
            <td>${dataExibicao}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-secondary btn-sm edit-ticket" data-id="${ticket.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-warning btn-sm history-ticket" data-id="${ticket.id}">
                        <i class="fas fa-history"></i>
                    </button>
                    <button class="btn btn-danger btn-sm delete-ticket" data-id="${ticket.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        
        tbody.appendChild(tr);
    });


    // APLICAR CORES NOS SELECTS APÓS RENDERIZAR A TABELA
    setTimeout(() => {
        aplicarCoresNosSelectsStatus();
    }, 100);

    // Event listener para alteração de status
    document.querySelectorAll('.status-select').forEach(select => {
        select.addEventListener('change', function() {
            const ticketId = this.getAttribute('data-ticket-id');
            const novoStatus = this.value;
            alterarStatusTicket(ticketId, novoStatus);
        });
    });

        // Adicionar eventos aos botões
        document.querySelectorAll('.edit-ticket').forEach(btn => {
            btn.addEventListener('click', function() {
                const ticketId = this.getAttribute('data-id');
                abrirModalEdicao(ticketId);
            });
        });
        
        document.querySelectorAll('.history-ticket').forEach(btn => {
            btn.addEventListener('click', function() {
                const ticketId = this.getAttribute('data-id');
                const ticket = tickets.find(t => t.id === ticketId);
                
                if (ticket) {
                    let historyHTML = '<h4>Histórico de Status</h4>';
                    
                    if (ticket.historicoStatus && ticket.historicoStatus.length > 0) {
                        ticket.historicoStatus.forEach(item => {
                            historyHTML += `
                                <div class="history-item">
                                    <div class="history-status">${item.status}</div>
                                    <div class="history-date">${item.data}</div>
                                </div>
                            `;
                        });
                    } else {
                        historyHTML += '<p>Nenhum histórico disponível</p>';
                    }
                    
                    document.getElementById('history-content').innerHTML = historyHTML;
                    document.getElementById('history-modal').classList.add('active');
                }
            });
        });
        

// Event listener para quando um ticket é finalizado
window.addEventListener('ticketFinalizado', function(event) {
    const ticket = event.detail.ticket;
    
    console.log(`Ticket ${ticket.numeroChamado} finalizado - removendo da lista principal`);
    
    // Atualizar a tabela de chamados ativos se estiver visível
    if (document.getElementById('chamados-page').classList.contains('active')) {
        renderTicketsTable();
    }
    
    // Atualizar a tabela de chamados finalizados se estiver visível
    if (document.getElementById('chamados-finalizados-page').classList.contains('active')) {
        renderFinishedTicketsTable();
    }
    
    // Atualizar dashboard
    updateDashboard();
});

        document.querySelectorAll('.delete-ticket').forEach(btn => {
            btn.addEventListener('click', async function() {
                const ticketId = this.getAttribute('data-id');
                
                if (confirm('Tem certeza que deseja excluir este chamado?')) {
                    try {
                        const success = await dbManager.deleteTicket(ticketId);
                        
                        if (success) {
                            await dbManager.loadTickets();
                            showPushNotification({
                                title: 'Chamado Excluído',
                                message: 'Chamado excluído com sucesso!',
                                type: 'success',
                                duration: 3000
                            });
                        } else {
                            throw new Error('Falha ao excluir do banco');
                        }
                    } catch (error) {
                        console.error('Erro ao excluir chamado:', error);
                        showPushNotification({
                            title: 'Erro',
                            message: 'Não foi possível excluir o chamado do banco de dados.',
                            type: 'error',
                            duration: 5000
                        });
                    }
                }
            });
        });
    }


// CORREÇÃO: Função para abrir modal de edição preenchendo a data correta
function abrirModalEdicaoAgendamento(scheduleId) {
    const schedule = schedules.find(s => s.id === scheduleId);
    
    if (!schedule) {
        showPushNotification({
            title: 'Erro',
            message: 'Agendamento não encontrado.',
            type: 'error',
            duration: 3000
        });
        return;
    }
    
    console.log('Editando agendamento:', schedule);
    
    // Preencher select de chamados
    const scheduleTicketSelect = document.getElementById('schedule-ticket');
    scheduleTicketSelect.innerHTML = '';
    
    // CORREÇÃO: Filtrar apenas tickets NÃO finalizados
    const activeTickets = tickets.filter(ticket => ticket.status !== 'Finalizado');
    
    // Adicionar também o ticket atual do agendamento (mesmo que esteja finalizado)
    const currentTicket = tickets.find(t => t.id === schedule.ticketId);
    if (currentTicket && currentTicket.status === 'Finalizado') {
        activeTickets.push(currentTicket);
    }
    
    console.log('Chamados disponíveis para edição:', activeTickets.length);
    
    if (activeTickets.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Nenhum chamado disponível';
        option.disabled = true;
        scheduleTicketSelect.appendChild(option);
    } else {
        activeTickets.forEach(ticket => {
            const option = document.createElement('option');
            option.value = ticket.id;
            option.textContent = `${ticket.numeroChamado} - ${ticket.cliente}`;
            if (ticket.id === schedule.ticketId) {
                option.selected = true;
            }
            scheduleTicketSelect.appendChild(option);
        });
    }
    
    // CORREÇÃO: Preencher a data do agendamento no formato correto
    const dataFormatada = formatarDataParaInput(schedule.data);
    console.log('Data formatada para input:', dataFormatada);
    
    document.getElementById('schedule-date').value = dataFormatada;
    document.getElementById('schedule-responsible').value = schedule.responsavel;
    document.getElementById('schedule-notes').value = schedule.observacoes || '';
    
    // Adicionar ID do agendamento para edição
    document.getElementById('schedule-modal').setAttribute('data-edit-id', scheduleId);
    document.getElementById('schedule-modal').classList.add('active');
}


// ============ SISTEMA DE NOTIFICAÇÃO DE AGENDAMENTOS ============

let notificacoesAtivas = new Map();
let intervaloVerificacao = null;
let intervalosNotificacao = new Map(); // Novo mapa para controlar intervalos por agendamento

// Função para iniciar verificação de agendamentos
function iniciarVerificacaoAgendamentos() {
    if (intervaloVerificacao) {
        clearInterval(intervaloVerificacao);
    }
    
    intervaloVerificacao = setInterval(() => {
        verificarAgendamentosProximos();
        verificarAgendamentosVencidos();
    }, 30000); // Verificar a cada 30 segundos para maior precisão
    
    // Verificar imediatamente ao iniciar
    verificarAgendamentosProximos();
    verificarAgendamentosVencidos();
}

// Função para verificar agendamentos próximos (30 minutos ANTES)
function verificarAgendamentosProximos() {
    const agora = new Date();
    const limite30Min = new Date(agora.getTime() + 30 * 60000);
    
    schedules.forEach(schedule => {
        const dataAgendamento = new Date(schedule.data);
        const ticket = tickets.find(t => t.id === schedule.ticketId);
        
        if (!ticket) return;

        // Verificar se está dentro dos próximos 30 minutos
        // Mas APENAS se ainda não venceu
        if (dataAgendamento > agora && dataAgendamento <= limite30Min) {
            // Se não tem intervalo de notificação ativo para este agendamento, iniciar
            if (!intervalosNotificacao.has(schedule.id)) {
                iniciarNotificacaoRecorrente(schedule, ticket);
            }
        } else {
            // Se está fora da janela de 30 minutos, parar notificações recorrentes
            pararNotificacaoRecorrente(schedule.id);
        }
    });
}

// Nova função para iniciar notificações recorrentes a cada 5 minutos
function iniciarNotificacaoRecorrente(schedule, ticket) {
    // Parar qualquer intervalo existente para este agendamento
    pararNotificacaoRecorrente(schedule.id);
    
    // Exibir notificação imediatamente
    const minutosRestantes = Math.max(1, Math.round((new Date(schedule.data) - new Date()) / 60000));
    exibirNotificacaoAgendamento(schedule, ticket, minutosRestantes);
    
    // Iniciar intervalo para exibir a cada 5 minutos
    const intervalo = setInterval(() => {
        const agora = new Date();
        const dataAgendamento = new Date(schedule.data);
        
        // Verificar se ainda está dentro da janela de 30 minutos
        if (dataAgendamento > agora && (dataAgendamento - agora) <= 30 * 60000) {
            const minutosRestantes = Math.max(1, Math.round((dataAgendamento - agora) / 60000));
            exibirNotificacaoAgendamento(schedule, ticket, minutosRestantes);
        } else {
            // Se saiu da janela, parar as notificações
            pararNotificacaoRecorrente(schedule.id);
        }
    }, 5 * 60000); // A cada 5 minutos
    
    // Armazenar o intervalo no mapa
    intervalosNotificacao.set(schedule.id, {
        intervalo: intervalo,
        schedule: schedule,
        ticket: ticket
    });
}

// Nova função para parar notificações recorrentes
function pararNotificacaoRecorrente(scheduleId) {
    if (intervalosNotificacao.has(scheduleId)) {
        const dados = intervalosNotificacao.get(scheduleId);
        clearInterval(dados.intervalo);
        intervalosNotificacao.delete(scheduleId);
        
        // Remover notificação visual se existir
        const notificationId = 'agendamento-' + scheduleId;
        fecharNotificacao(notificationId);
    }
}

// Modificar a função exibirNotificacaoAgendamento para aceitar minutosRestantes
function exibirNotificacaoAgendamento(schedule, ticket, minutosRestantes) {
    const notificationId = 'agendamento-' + schedule.id;
    
    // Remover notificação anterior se existir
    const notificacaoExistente = document.getElementById(notificationId);
    if (notificacaoExistente) {
        notificacaoExistente.remove();
    }
    
    const notification = document.createElement('div');
    notification.id = notificationId;
    notification.className = 'notification permanent show';
    
    notification.innerHTML = `
        <div class="notification-icon">
            <i class="fas fa-clock"></i>
        </div>
        <div class="notification-content">
            <div class="notification-title">Agendamento Próximo</div>
            <div class="notification-message">
                Chamado ${ticket.numeroChamado} - ${ticket.cliente} 
                vence em ${minutosRestantes} minutos
            </div>
            <button class="notification-action" onclick="irParaChamado('${ticket.id}')">
                Ver Chamado
            </button>
        </div>
        <button class="notification-close" onclick="fecharNotificacao('${notificationId}')">
            <i class="fas fa-times"></i>
        </button>
    `;
    
    document.getElementById('notification-container').appendChild(notification);
    notificacoesAtivas.set(notificationId, schedule.id);

    // Notificação do sistema (fora do app)
    if (typeof ipcRenderer !== 'undefined' && ipcRenderer.invoke) {
        ipcRenderer.invoke('show-schedule-system-notification', {
            schedule: schedule,
            ticket: ticket,
            minutesLeft: minutosRestantes
        }).then(result => {
            if (result.success) {
                console.log('Notificação do sistema exibida com sucesso');
            }
        }).catch(error => {
            console.error('Erro ao exibir notificação do sistema:', error);
        });
    }
}

// Nova função para parar notificações para um agendamento específico
function pararNotificacoesParaAgendamento(scheduleId) {
    pararNotificacaoRecorrente(scheduleId);
    
    // Atualizar o schedule para marcar como notificado (opcional, se quiser persistir)
    const schedule = schedules.find(s => s.id === scheduleId);
    if (schedule) {
        schedule.notificado = true;
        dbManager.saveSchedule(schedule);
    }
}

// MODIFICADO: Função para verificar agendamentos vencidos
function verificarAgendamentosVencidos() {
    const agora = new Date();
    
    schedules.forEach(schedule => {
        const dataAgendamento = new Date(schedule.data);
        const ticket = tickets.find(t => t.id === schedule.ticketId);
        
        if (!ticket) return;
        
        // Verificar se o agendamento JÁ VENCEU (passou da data)
        // E se ainda não foi processado
        if (dataAgendamento < agora && !schedule.processado) {
            // Parar notificações recorrentes
            pararNotificacaoRecorrente(schedule.id);
            
            // Exibir modal de status vencido
            exibirModalStatusVencido(schedule, ticket);
        }
    });
}

// MODIFICADO: Função para exibir modal de status vencido (MANTENDO FORMATAÇÃO ORIGINAL)
function exibirModalStatusVencido(schedule, ticket) {
    // Verificar se já existe um modal aberto para este agendamento
    const modalAberto = document.querySelector('#status-change-modal.active');
    if (modalAberto) {
        // Se já tem um modal aberto, vamos adicionar este agendamento a uma fila
        // para ser exibido depois que o atual for fechado
        adicionarAFilaDeAgendamentosVencidos(schedule, ticket);
        return;
    }
    
    // NOTA: NÃO marcamos como processado aqui! Só quando o usuário realmente alterar o status
    // schedule.processado = true;
    // dbManager.saveSchedule(schedule);
    
    // Notificação do sistema para agendamento vencido
    if (typeof ipcRenderer !== 'undefined' && ipcRenderer.invoke) {
        ipcRenderer.invoke('show-expired-schedule-system-notification', {
            schedule: schedule,
            ticket: ticket
        }).then(result => {
            if (result.success) {
                console.log('Notificação de agendamento vencido exibida');
            }
        }).catch(error => {
            console.error('Erro ao exibir notificação vencida:', error);
        });
    }

    // Preencher select de status (MANTENDO FORMATAÇÃO ORIGINAL)
    const statusSelect = document.getElementById('new-status-select');
    statusSelect.innerHTML = '';
    
    customStatuses.forEach(status => {
        const option = document.createElement('option');
        option.value = status;
        option.textContent = status;
        if (status === 'Aguardando Cliente') {
            option.selected = true;
        }
        statusSelect.appendChild(option);
    });

    // Mensagem mais clara indicando que o agendamento VENCEU (MANTENDO FORMATAÇÃO ORIGINAL)
    document.getElementById('status-change-message').innerHTML = 
        `<strong>Agendamento Vencido</strong><br>
         O chamado <strong>${ticket.numeroChamado} - ${ticket.cliente}</strong> tinha um agendamento que já venceu.<br>
         Para qual status você deseja alterar?`;
    
    document.getElementById('expired-ticket-id').value = ticket.id;
    document.getElementById('expired-schedule-id').value = schedule.id;
    
    // Armazenar o schedule atual no modal para referência
    document.getElementById('status-change-modal').dataset.scheduleId = schedule.id;
    
    // Mostrar modal
    document.getElementById('status-change-modal').classList.add('active');
}

// NOVA FUNÇÃO: Adicionar agendamento vencido à fila
let filaAgendamentosVencidos = [];

function adicionarAFilaDeAgendamentosVencidos(schedule, ticket) {
    // Verificar se já está na fila
    const jaNaFila = filaAgendamentosVencidos.some(item => 
        item.schedule.id === schedule.id
    );
    
    if (!jaNaFila) {
        filaAgendamentosVencidos.push({ schedule, ticket });
        console.log(`Agendamento ${schedule.id} adicionado à fila. Fila atual:`, filaAgendamentosVencidos.length);
    }
}

// MODIFICADO: Event listener para salvar alteração de status (após vencimento)
document.getElementById('save-status-change').addEventListener('click', async function() {
    const ticketId = document.getElementById('expired-ticket-id').value;
    const scheduleId = document.getElementById('expired-schedule-id').value;
    const novoStatus = document.getElementById('new-status-select').value;
    
    const ticket = tickets.find(t => t.id === ticketId);
    const schedule = schedules.find(s => s.id === scheduleId);
    
    if (ticket && schedule) {
        const statusAnterior = ticket.status;
        ticket.status = novoStatus;
        
        // Adicionar ao histórico
        if (!ticket.historicoStatus) {
            ticket.historicoStatus = [];
        }
        
        ticket.historicoStatus.push({
            status: novoStatus,
            data: formatarDataParaMySQL(new Date()),
            dataExibicao: formatarDataParaExibicao(new Date()),
            observacao: `Status alterado automaticamente após vencimento do agendamento`
        });

        // AGORA sim marcamos como processado
        schedule.processado = true;
        
        // Salvar ticket e schedule
        const ticketSaved = await dbManager.saveTicket(ticket);
        const scheduleSaved = await dbManager.saveSchedule(schedule);
        
        if (ticketSaved && scheduleSaved) {
            // Remover agendamento vencido após a alteração de status
            await dbManager.deleteSchedule(scheduleId);
            await dbManager.loadSchedules();
            await dbManager.loadTickets(); // Recarregar tickets para atualizar a interface
            
            // Fechar modal
            document.getElementById('status-change-modal').classList.remove('active');
            
            showPushNotification({
                title: 'Status Atualizado',
                message: `Status alterado de "${statusAnterior}" para "${novoStatus}" após vencimento do agendamento`,
                type: 'success',
                duration: 5000
            });
            
            // Atualizar a interface
            renderTicketsTable();
            updateDashboard();
            
            // Verificar se há mais agendamentos vencidos na fila
            setTimeout(() => {
                processarProximoDaFila();
            }, 1000);
        }
    }
});

// MODIFICADO: Cancelar alteração de status
document.getElementById('cancel-status-change').addEventListener('click', function() {
    document.getElementById('status-change-modal').classList.remove('active');
    
    // Verificar se há mais agendamentos vencidos na fila
    setTimeout(() => {
        processarProximoDaFila();
    }, 500);
});

// MODIFICADO: Fechar modal com X
document.querySelector('#status-change-modal .modal-close').addEventListener('click', function() {
    document.getElementById('status-change-modal').classList.remove('active');
    
    // Verificar se há mais agendamentos vencidos na fila
    setTimeout(() => {
        processarProximoDaFila();
    }, 500);
});

// NOVA FUNÇÃO: Processar próximo agendamento da fila
function processarProximoDaFila() {
    if (filaAgendamentosVencidos.length > 0) {
        const proximo = filaAgendamentosVencidos.shift();
        console.log(`Processando próximo da fila: ${proximo.schedule.id}`);
        
        // Dar um pequeno delay para o modal anterior fechar completamente
        setTimeout(() => {
            exibirModalStatusVencido(proximo.schedule, proximo.ticket);
        }, 300);
    }
}

// Função para limpar todos os intervalos quando necessário
function limparTodosIntervalosNotificacao() {
    for (const [scheduleId, dados] of intervalosNotificacao) {
        clearInterval(dados.intervalo);
    }
    intervalosNotificacao.clear();
    
    for (const [notificationId, scheduleId] of notificacoesAtivas) {
        const notification = document.getElementById(notificationId);
        if (notification) {
            notification.remove();
        }
    }
    notificacoesAtivas.clear();
}

// Adicionar evento para limpar intervalos quando a página for descarregada
window.addEventListener('beforeunload', function() {
    limparTodosIntervalosNotificacao();
    if (intervaloVerificacao) {
        clearInterval(intervaloVerificacao);
    }
});

// Função para ir para o chamado (mantida igual)
function irParaChamado(ticketId) {
    navigateToPage('chamados');
    
    setTimeout(() => {
        const ticketRow = document.querySelector(`tr[data-ticket-id="${ticketId}"]`);
        if (ticketRow) {
            ticketRow.style.backgroundColor = 'red';
            ticketRow.style.transition = 'background-color 0.3s ease';
            ticketRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            setTimeout(() => {
                ticketRow.style.backgroundColor = '';
            }, 1000);
        }
    }, 500);
}

// Função para fechar notificação
function fecharNotificacao(notificationId) {
    const notification = document.getElementById(notificationId);
    if (notification) {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
            notificacoesAtivas.delete(notificationId);
        }, 300);
    }
}

// Funções auxiliares (mantidas da versão anterior)
async function showSystemNotificationFromFrontend(options) {
    if (typeof ipcRenderer !== 'undefined' && ipcRenderer.invoke) {
        try {
            const result = await ipcRenderer.invoke('show-system-notification', options);
            return result.success;
        } catch (error) {
            console.error('Erro ao chamar notificação do sistema:', error);
            return false;
        }
    }
    return false;
}

async function showGenericSystemNotificationFromFrontend(type, message) {
    if (typeof ipcRenderer !== 'undefined' && ipcRenderer.invoke) {
        try {
            const result = await ipcRenderer.invoke('show-generic-system-notification', {
                type: type,
                message: message
            });
            return result.success;
        } catch (error) {
            console.error('Erro ao chamar notificação genérica:', error);
            return false;
        }
    }
    return false;
}

// Atualizar selects de status
function updateStatusSelects() {
    const statusSelects = document.querySelectorAll('#ticket-status, #new-status-select');
    
    statusSelects.forEach(select => {
        const currentValue = select.value;
        select.innerHTML = '';
        
        customStatuses.forEach(status => {
            const option = document.createElement('option');
            option.value = status;
            option.textContent = status;
            select.appendChild(option);
        });
        
        if (customStatuses.includes(currentValue)) {
            select.value = currentValue;
        }
    });
}

 
    // ============ FUNÇÕES DE DASHBOARD E RELATÓRIOS ============


let statusChartInstance = null;
let priorityChartInstance = null;


function updateCharts() {
  // Só atualiza os gráficos se estiver na página do dashboard
  if (document.getElementById('dashboard-page').classList.contains('active')) {
    updateStatusChart();
    updatePriorityChart();
    renderRecentTickets();
}
}

function updatePriorityChart() {
    const ctx = document.getElementById('priority-chart');
    if (!ctx) return;

    // Destruir gráfico anterior se existir
    if (priorityChartInstance) {
        priorityChartInstance.destroy();
    }

    const priorityCount = {
        'Alta': 0,
        'Média': 0,
        'Baixa': 0
    };

    tickets.forEach(ticket => {
        if (priorityCount.hasOwnProperty(ticket.prioridade)) {
            priorityCount[ticket.prioridade]++;
        }
    });

    // CORREÇÃO: Cores consistentes com o tema
    const priorityColors = {
        'Alta': '#ef4444',    // Vermelho
        'Média': '#f59e0b',   // Amarelo/Laranja
        'Baixa': '#10b981'    // Verde
    };

    priorityChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Alta', 'Média', 'Baixa'],
            datasets: [{
                label: 'Chamados por Prioridade',
                data: [priorityCount.Alta, priorityCount.Média, priorityCount.Baixa],
                backgroundColor: [
                    priorityColors.Alta,
                    priorityColors.Média,
                    priorityColors.Baixa
                ],
                borderColor: [
                    priorityColors.Alta,
                    priorityColors.Média,
                    priorityColors.Baixa
                ],
                borderWidth: 2,
                borderRadius: 6,
                borderSkipped: false,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `Chamados: ${context.raw}`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        font: {
                            family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
                        }
                    },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                },
                x: {
                    ticks: {
                        font: {
                            family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
                            weight: '600'
                        }
                    },
                    grid: {
                        display: false
                    }
                }
            },
            animation: {
                duration: 1000,
                easing: 'easeInOutQuart'
            }
        }
    });
}



// Função para ajustar o brilho de uma cor (para hover effects)
function adjustColor(color, amount) {
    return '#' + color.replace(/^#/, '').replace(/../g, color => 
        ('0' + Math.min(255, Math.max(0, parseInt(color, 16) + amount)).toString(16)).substr(-2)
    );
}

    // ============ FUNÇÕES DE RELATÓRIOS ============

function gerarRelatorio() {
    const tipo = document.getElementById('relatorio-tipo').value;
    const periodo = parseInt(document.getElementById('periodo').value);
    const ticketsData = getTickets();
    
    let html = '';
    let titulo = '';

    console.log('Gerando relatório:', tipo, 'Período:', periodo, 'Tickets:', ticketsData.length);

    switch (tipo) {
       // Na função gerarRelatorio(), atualize o caso 'tempo-resolucao':
case 'tempo-resolucao':
    titulo = 'Tempo Médio de Resolução (Em Atendimento → Pré-Finalizado)';
    const tempoData = calcularTempoMedioResolucao(ticketsData, periodo);
    
    html = `
        <div class="report-section">
            <h4>⏱️ Tempo de Resolução: Em Atendimento → Pré-Finalizado</h4>
            <p><strong>Meta estabelecida:</strong> 40 minutos</p>
            
            <div class="stats-grid">
                <div class="stat-card">
                    <div class="stat-value">${tempoData.media} min</div>
                    <div class="stat-label">Tempo Médio</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value">${tempoData.total}</div>
                    <div class="stat-label">Chamados Analisados</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" style="color: #28a745;">${tempoData.excelentes}</div>
                    <div class="stat-label">Excelentes (≤40min)</div>
                </div>
                <div class="stat-card">
                    <div class="stat-value" style="color: #dc3545;">${tempoData.ruins}</div>
                    <div class="stat-label">Ruins (>40min)</div>
                </div>
            </div>
            
            ${tempoData.total > 0 ? `
            <div class="performance-metrics">
                <h4>📊 Métricas de Performance</h4>
                <div class="metric-bar">
                    <div class="metric-label">Excelentes (≤40min)</div>
                    <div class="metric-value">${tempoData.percentualExcelentes}%</div>
                    <div class="metric-bar-container">
                        <div class="metric-bar-fill excelente" style="width: ${tempoData.percentualExcelentes}%"></div>
                    </div>
                </div>
                <div class="metric-bar">
                    <div class="metric-label">Ruins (>40min)</div>
                    <div class="metric-value">${tempoData.percentualRuins}%</div>
                    <div class="metric-bar-container">
                        <div class="metric-bar-fill ruim" style="width: ${tempoData.percentualRuins}%"></div>
                    </div>
                </div>
            </div>
            
            <div class="tempo-distribuicao">
                <h4>📋 Detalhamento por Chamado</h4>
                <table class="tickets-table">
                    <thead>
                        <tr>
                            <th>Chamado</th>
                            <th>Cliente</th>
                            <th>Tempo Resolução</th>
                            <th>Classificação</th>
                            <th>Data Início Atendimento</th>
                            <th>Data Pré-Finalização</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tempoData.ticketsComTempo.map(item => `
                            <tr>
                                <td><a href="${item.ticket.url}" target="_blank">${item.ticket.numeroChamado}</a></td>
                                <td>${item.ticket.cliente}</td>
                                <td><strong>${item.tempo} min</strong></td>
                                <td>
                                    <span class="status-badge ${item.classificacao === 'excelente' ? 'status-success' : 'status-danger'}">
                                        ${item.classificacao === 'excelente' ? '✅ Excelente' : '❌ Ruim'}
                                    </span>
                                </td>
                                <td>${formatarDataParaExibicao(item.dataEmAtendimento)}</td>
                                <td>${formatarDataParaExibicao(item.dataPreFinalizado)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            ` : `
            <div class="alert alert-info">
                <i class="fas fa-info-circle"></i>
                <strong>Nenhum dado disponível:</strong> Não foram encontrados chamados com histórico de "Em Atendimento" para "Pré-Finalizado" no período selecionado.
            </div>
            `}
        </div>
    `;
    break;


        case 'chamados-mensal':
            titulo = 'Chamados Mensais';
            const mensalData = calcularChamadosMensais(ticketsData, periodo);
            
            if (mensalData.length > 0) {
                html = `
                    <div class="report-section">
                        <h4>Estatísticas Mensais</h4>
                        <table class="tickets-table">
                            <thead>
                                <tr>
                                    <th>Mês/Ano</th>
                                    <th>Total</th>
                                    <th>Finalizados</th>
                                    <th>Em Aberto</th>
                                    <th>Taxa de Conclusão</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${mensalData.map(mes => `
                                    <tr>
                                        <td>${mes.mes}/${mes.ano}</td>
                                        <td>${mes.total}</td>
                                        <td>${mes.finalizados}</td>
                                        <td>${mes.abertos}</td>
                                        <td>${mes.total > 0 ? ((mes.finalizados / mes.total) * 100).toFixed(1) + '%' : '0%'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                        <div class="chart-container">
                            <canvas id="chamados-mensais-chart"></canvas>
                        </div>
                    </div>
                `;
            } else {
                html = '<p>Não há dados para o período selecionado.</p>';
            }
            break;

        case 'chamados-por-status':
            titulo = 'Chamados por Status';
            html = gerarRelatorioStatus(ticketsData);
            break;

        case 'chamados-por-cliente':
            titulo = 'Chamados por Cliente';
            html = gerarRelatorioCliente(ticketsData);
            break;

        default:
            html = '<p>Selecione um tipo de relatório válido.</p>';
    }
    
    document.getElementById('report-title').textContent = titulo;
    document.getElementById('report-content').innerHTML = html;

    // Renderizar gráficos se houver dados
    setTimeout(() => {
        if (tipo === 'tempo-resolucao' && tempoData.total > 0) {
            renderizarGraficoTempoResolucao(tempoData);
        } else if (tipo === 'chamados-mensal' && mensalData.length > 0) {
            renderizarGraficoChamadosMensais(mensalData);
        }
    }, 100);
}

function renderizarGraficoChamadosMensais(data) {
    const ctx = document.getElementById('chamados-mensais-chart');
    if (!ctx) return;
    
    // Destruir gráfico anterior se existir
    if (window.chamadosMensaisChart) {
        window.chamadosMensaisChart.destroy();
    }
    
    const labels = data.map(mes => `${mes.mes.substring(0, 3)}/${mes.ano}`);
    
    window.chamadosMensaisChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Total de Chamados',
                    data: data.map(mes => mes.total),
                    borderColor: 'rgba(54, 162, 235, 1)',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Chamados Finalizados',
                    data: data.map(mes => mes.finalizados),
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Quantidade de Chamados'
                    }
                }
            }
        }
    });
}

// Funções para renderizar gráficos
function renderizarGraficoTempoResolucao(data) {
    const ctx = document.getElementById('tempo-resolucao-chart');
    if (!ctx) return;
    
    // Destruir gráfico anterior se existir
    if (window.tempoResolucaoChart) {
        window.tempoResolucaoChart.destroy();
    }
    
    // Preparar dados para o gráfico
    const labels = ['Excelentes (≤40min)', 'Ruins (>40min)'];
    const chartData = [data.excelentes, data.ruins];
    const backgroundColors = ['#28a745', '#dc3545'];
    
    window.tempoResolucaoChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: chartData,
                backgroundColor: backgroundColors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            font: {
                family: 'Arial, sans-serif'
            },
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        font: {
                            family: 'Arial, sans-serif',
                            size: 12,
                            weight: 'normal'
                        },
                        padding: 20
                    }
                },
                tooltip: {
                    titleFont: {
                        family: 'Arial, sans-serif',
                        size: 12
                    },
                    bodyFont: {
                        family: 'Arial, sans-serif',
                        size: 11
                    },
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = Math.round((value / total) * 100);
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

function renderizarGraficoChamadosMensais(data) {
    const ctx = document.getElementById('chamados-mensais-chart').getContext('2d');
    const labels = data.map(mes => `${mes.mes.substring(0, 3)}/${mes.ano}`);
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Total de Chamados',
                    data: data.map(mes => mes.total),
                    borderColor: 'rgba(54, 162, 235, 1)',
                    backgroundColor: 'rgba(54, 162, 235, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Chamados Finalizados',
                    data: data.map(mes => mes.finalizados),
                    borderColor: 'rgba(75, 192, 192, 1)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            scales: {
                y: {
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Quantidade de Chamados'
                    }
                }
            }
        }
    });
}


// Função para relatório por status
function gerarRelatorioStatus(tickets) {
    if (tickets.length === 0) {
        return '<p class="placeholder-text">Nenhum chamado encontrado para o período selecionado.</p>';
    }
    
    const statusCount = {};
    tickets.forEach(ticket => {
        statusCount[ticket.status] = (statusCount[ticket.status] || 0) + 1;
    });
    
    const total = tickets.length;
    let html = `
        <div class="report-stats">
            <div class="report-stat">
                <div class="report-stat-value">${total}</div>
                <div class="report-stat-label">Total de Chamados</div>
            </div>
    `;
    
    Object.keys(statusCount).forEach(status => {
        const count = statusCount[status];
        const percentage = ((count / total) * 100).toFixed(1);
        html += `
            <div class="report-stat">
                <div class="report-stat-value">${count}</div>
                <div class="report-stat-label">${status} (${percentage}%)</div>
            </div>
        `;
    });
    
    html += '</div>';
    return html;
}

// Função para relatório por cliente
function gerarRelatorioCliente(tickets) {
    if (tickets.length === 0) {
        return '<p class="placeholder-text">Nenhum chamado encontrado para o período selecionado.</p>';
    }
    
    const clienteCount = {};
    tickets.forEach(ticket => {
        clienteCount[ticket.cliente] = (clienteCount[ticket.cliente] || 0) + 1;
    });
    
    const clientesOrdenados = Object.keys(clienteCount).sort((a, b) => clienteCount[b] - clienteCount[a]);
    
    let html = '<h4>Top 10 Clientes com Mais Chamados</h4>';
    html += '<table class="tickets-table">';
    html += '<thead><tr><th>Cliente</th><th>Quantidade</th><th>Porcentagem</th></tr></thead>';
    html += '<tbody>';
    
    const total = tickets.length;
    const topClientes = clientesOrdenados.slice(0, 10);
    
    topClientes.forEach(cliente => {
        const count = clienteCount[cliente];
        const percentage = ((count / total) * 100).toFixed(1);
        html += `<tr><td>${cliente}</td><td>${count}</td><td>${percentage}%</td></tr>`;
    });
    
    html += '</tbody></table>';
    return html;
}
// ============ FUNÇÃO PARA CALCULAR TEMPO DE RESOLUÇÃO ============

function calcularTempoResolucao(ticket) {
    // Verificar se temos dados de histórico de status
    if (!ticket.historicoStatus || !Array.isArray(ticket.historicoStatus)) {
        return null;
    }

    // Encontrar o timestamp de "Em Analise"
    const analiseEntry = ticket.historicoStatus.find(entry => 
        entry.status === 'Em Analise' || entry.status === 'Em Análise'
    );
    
    // Encontrar o timestamp de "Finalizado"
    const finalizadoEntry = ticket.historicoStatus.find(entry => 
        entry.status === 'Finalizado'
    );

    if (!analiseEntry || !finalizadoEntry || !analiseEntry.timestamp || !finalizadoEntry.timestamp) {
        return null;
    }

    try {
        // Converter timestamps para Date objects
        const dataAnalise = new Date(analiseEntry.timestamp);
        const dataFinalizado = new Date(finalizadoEntry.timestamp);

        // Calcular diferença em minutos
        const diffMs = dataFinalizado - dataAnalise;
        const diffMinutos = Math.floor(diffMs / (1000 * 60));

        return diffMinutos;
    } catch (error) {
        console.warn('Erro ao calcular tempo de resolução:', error);
        return null;
    }
}


// ============ FUNÇÃO ATUALIZADA PARA PDF ============

function adicionarRelatorioTempoResolucaoPDF(doc, tickets, margin, y, contentWidth, pageHeight) {
    if (tickets.length === 0) {
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'italic');
        doc.text('Nenhum chamado encontrado para o período selecionado.', margin, y);
        return y + 20;
    }
    
    // Calcular tempos de resolução
    const temposResolucao = [];
    tickets.forEach(ticket => {
        if (ticket.status === 'Finalizado') {
            const tempo = calcularTempoResolucao(ticket);
            if (tempo !== null && tempo >= 0) {
                temposResolucao.push(tempo);
            }
        }
    });
    
    if (temposResolucao.length === 0) {
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'italic');
        doc.text('Nenhum chamado finalizado com dados de tempo de resolução disponível.', margin, y);
        return y + 20;
    }
    
    const tempoMedio = temposResolucao.reduce((sum, tempo) => sum + tempo, 0) / temposResolucao.length;
    const excelentes = temposResolucao.filter(tempo => tempo <= 40).length;
    const ruins = temposResolucao.filter(tempo => tempo > 40).length;
    const percentualExcelentes = (excelentes / temposResolucao.length * 100).toFixed(1);
    const percentualRuins = (ruins / temposResolucao.length * 100).toFixed(1);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    
    doc.text(`• Total de chamados analisados: ${temposResolucao.length}`, margin, y);
    y += 8;
    doc.text(`• Tempo médio de resolução: ${tempoMedio.toFixed(1)} minutos`, margin, y);
    y += 8;
    doc.text(`• Meta estabelecida: 40 minutos`, margin, y);
    y += 8;
    doc.text(`• Chamados excelentes (≤40min): ${excelentes} (${percentualExcelentes}%)`, margin, y);
    y += 8;
    doc.text(`• Chamados ruins (>40min): ${ruins} (${percentualRuins}%)`, margin, y);
    y += 12;
    
    // Adicionar análise de performance
    doc.setFont('helvetica', 'bold');
    doc.text('ANÁLISE DE PERFORMANCE:', margin, y);
    y += 8;
    doc.setFont('helvetica', 'normal');
    
    if (percentualExcelentes >= 80) {
        doc.text('✓ Performance EXCELENTE - Meta amplamente atingida', margin, y);
    } else if (percentualExcelentes >= 60) {
        doc.text('✓ Performance BOA - Meta sendo atingida', margin, y);
    } else {
        doc.text('✗ Performance precisa de MELHORIAS - Meta não atingida', margin, y);
    }
    y += 8;
    
    return y + 15;
}


 // ============ FUNÇÃO ATUALIZADA PARA RELATÓRIO DE TEMPO DE RESOLUÇÃO ============

function gerarRelatorioTempoResolucao(tickets) {
    if (tickets.length === 0) {
        return '<p class="placeholder-text">Nenhum chamado encontrado para o período selecionado.</p>';
    }
    
    // Filtrar apenas tickets finalizados e calcular tempos
    const temposResolucao = [];
    const ticketsComTempo = [];
    
    tickets.forEach(ticket => {
        if (ticket.status === 'Finalizado') {
            const tempo = calcularTempoResolucao(ticket);
            if (tempo !== null && tempo >= 0) {
                temposResolucao.push(tempo);
                ticketsComTempo.push({
                    ticket: ticket,
                    tempo: tempo,
                    classificacao: tempo <= 40 ? 'excelente' : 'ruim'
                });
            }
        }
    });
    
    if (temposResolucao.length === 0) {
        return '<p class="placeholder-text">Nenhum chamado finalizado com dados de tempo de resolução disponível.</p>';
    }
    
    // Calcular estatísticas
    const tempoMedio = temposResolucao.reduce((sum, tempo) => sum + tempo, 0) / temposResolucao.length;
    const tempoMin = Math.min(...temposResolucao);
    const tempoMax = Math.max(...temposResolucao);
    
    // Classificar resultados
    const excelentes = ticketsComTempo.filter(t => t.classificacao === 'excelente');
    const ruins = ticketsComTempo.filter(t => t.classificacao === 'ruim');
    
    const percentualExcelentes = (excelentes.length / ticketsComTempo.length * 100).toFixed(1);
    const percentualRuins = (ruins.length / ticketsComTempo.length * 100).toFixed(1);
    
    let html = `
        <div class="report-stats">
            <div class="report-stat">
                <div class="report-stat-value">${ticketsComTempo.length}</div>
                <div class="report-stat-label">Chamados Analisados</div>
            </div>
            <div class="report-stat">
                <div class="report-stat-value ${tempoMedio <= 40 ? 'excelente' : 'ruim'}">${tempoMedio.toFixed(1)} min</div>
                <div class="report-stat-label">Tempo Médio</div>
            </div>
            <div class="report-stat">
                <div class="report-stat-value excelente">${excelentes.length}</div>
                <div class="report-stat-label">Excelentes (≤40min)</div>
            </div>
            <div class="report-stat">
                <div class="report-stat-value ruim">${ruins.length}</div>
                <div class="report-stat-label">Ruins (>40min)</div>
            </div>
        </div>
        
        <div class="performance-metrics">
            <h4>Métricas de Performance</h4>
            <div class="metric-bar">
                <div class="metric-label">Excelentes (≤40min)</div>
                <div class="metric-value">${percentualExcelentes}%</div>
                <div class="metric-bar-container">
                    <div class="metric-bar-fill excelente" style="width: ${percentualExcelentes}%"></div>
                </div>
            </div>
            <div class="metric-bar">
                <div class="metric-label">Ruins (>40min)</div>
                <div class="metric-value">${percentualRuins}%</div>
                <div class="metric-bar-container">
                    <div class="metric-bar-fill ruim" style="width: ${percentualRuins}%"></div>
                </div>
            </div>
        </div>
        
        <div class="tempo-distribuicao">
            <h4>Distribuição dos Tempos</h4>
            <table class="tickets-table">
                <thead>
                    <tr>
                        <th>Ticket ID</th>
                        <th>Cliente</th>
                        <th>Tempo Resolução</th>
                        <th>Classificação</th>
                    </tr>
                </thead>
                <tbody>
    `;
    
    // Ordenar por tempo (maiores primeiro para identificar problemas)
    ticketsComTempo.sort((a, b) => b.tempo - a.tempo);
    
    // Mostrar os 10 piores casos
    ticketsComTempo.slice(0, 10).forEach(item => {
        const classificacaoClass = item.classificacao === 'excelente' ? 'excelente' : 'ruim';
        html += `
            <tr>
                <td>${item.ticket.id}</td>
                <td>${item.ticket.cliente}</td>
                <td>${item.tempo} min</td>
                <td><span class="status-badge ${classificacaoClass}">${item.classificacao.toUpperCase()}</span></td>
            </tr>
        `;
    });
    
    html += `
                </tbody>
            </table>
            ${ticketsComTempo.length > 10 ? `<p style="text-align: center; margin-top: 8px; font-size: 12px;">Mostrando os 10 piores casos de ${ticketsComTempo.length} tickets analisados</p>` : ''}
        </div>
    `;
    
    return html;
}


async function generateReportPDF() {
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        // Título do relatório
        const titulo = document.getElementById('report-title').textContent;
        const tipoRelatorio = document.getElementById('relatorio-tipo').value;
        const periodo = parseInt(document.getElementById('periodo').value);
        const ticketsData = getTickets();
        
        // Configurações
        const margin = 20;
        let yPosition = margin;
        const pageWidth = doc.internal.pageSize.width;
        const contentWidth = pageWidth - (margin * 2);
        
        // Cabeçalho
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(titulo, margin, yPosition);
        yPosition += 10;
        
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');
        doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} | Período: Últimos ${periodo} dias`, margin, yPosition);
        yPosition += 15;
        
        // Conteúdo específico para cada tipo de relatório
        if (tipoRelatorio === 'tempo-resolucao') {
            const tempoData = calcularTempoMedioResolucao(ticketsData, periodo);
            
            if (tempoData.total === 0) {
                doc.setFontSize(12);
                doc.setTextColor(100, 100, 100);
                doc.text('Nenhum dado disponível para o período selecionado.', margin, yPosition);
            } else {
                doc.setFontSize(12);
                doc.setFont('helvetica', 'bold');
                doc.text('Resumo Estatístico:', margin, yPosition);
                yPosition += 10;
                
                doc.setFontSize(11);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(0, 0, 0);
                
                doc.text(`• Tempo Médio de Resolução: ${tempoData.media} minutos`, margin, yPosition);
                yPosition += 7;
                doc.text(`• Total de Chamados Analisados: ${tempoData.total}`, margin, yPosition);
                yPosition += 7;
                doc.text(`• Meta Estabelecida: 40 minutos`, margin, yPosition);
                yPosition += 7;
                
                // Excelentes em verde
                doc.setTextColor(40, 167, 69);
                doc.text(`• Excelentes (≤40min): ${tempoData.excelentes} (${tempoData.percentualExcelentes}%)`, margin, yPosition);
                yPosition += 7;
                
                // Ruins em vermelho
                doc.setTextColor(220, 53, 69);
                doc.text(`• Ruins (>40min): ${tempoData.ruins} (${tempoData.percentualRuins}%)`, margin, yPosition);
                yPosition += 7;
                
                doc.setTextColor(0, 0, 0);
                doc.text(`• Período de Análise: Últimos ${periodo} dias`, margin, yPosition);
                yPosition += 15;
                
                // Análise de performance
                doc.setFont('helvetica', 'bold');
                doc.text('ANÁLISE DE PERFORMANCE:', margin, yPosition);
                yPosition += 8;
                doc.setFont('helvetica', 'normal');
                
                if (parseFloat(tempoData.percentualExcelentes) >= 80) {
                    doc.setTextColor(40, 167, 69);
                    doc.text('✓ Performance EXCELENTE - Meta amplamente atingida', margin, yPosition);
                } else if (parseFloat(tempoData.percentualExcelentes) >= 60) {
                    doc.setTextColor(255, 193, 7);
                    doc.text('✓ Performance BOA - Meta sendo atingida', margin, yPosition);
                } else {
                    doc.setTextColor(220, 53, 69);
                    doc.text('✗ Performance precisa de MELHORIAS - Meta não atingida', margin, yPosition);
                }
                yPosition += 10;
                
                // Tabela de detalhamento (apenas os 10 primeiros)
                if (tempoData.ticketsComTempo.length > 0) {
                    doc.setFont('helvetica', 'bold');
                    doc.setTextColor(0, 0, 0);
                    doc.text('DETALHAMENTO (amostra):', margin, yPosition);
                    yPosition += 8;
                    
                    // Cabeçalho da tabela
                    doc.setFontSize(8);
                    doc.text('Chamado', margin, yPosition);
                    doc.text('Cliente', margin + 40, yPosition);
                    doc.text('Tempo', margin + 100, yPosition);
                    doc.text('Classif.', margin + 130, yPosition);
                    yPosition += 5;
                    
                    // Linha separadora
                    doc.line(margin, yPosition, pageWidth - margin, yPosition);
                    yPosition += 5;
                    
                    // Dados (máximo 10 registros)
                    const amostra = tempoData.ticketsComTempo.slice(0, 10);
                    amostra.forEach(item => {
                        if (yPosition > 250) {
                            doc.addPage();
                            yPosition = margin;
                        }
                        
                        doc.setFontSize(7);
                        doc.text(item.ticket.numeroChamado, margin, yPosition);
                        doc.text(item.ticket.cliente.substring(0, 20), margin + 40, yPosition);
                        doc.text(`${item.tempo} min`, margin + 100, yPosition);
                        
                        if (item.classificacao === 'excelente') {
                            doc.setTextColor(40, 167, 69);
                            doc.text('EXCELENTE', margin + 130, yPosition);
                        } else {
                            doc.setTextColor(220, 53, 69);
                            doc.text('RUIM', margin + 130, yPosition);
                        }
                        
                        doc.setTextColor(0, 0, 0);
                        yPosition += 5;
                    });
                }
            }
            
        } else if (tipoRelatorio === 'chamados-mensal') {
            // ... (mantenha o código existente)
        } else {
            // Para outros relatórios, capture o conteúdo HTML
            const element = document.getElementById('report-content');
            if (element) {
                const canvas = await html2canvas(element, {
                    scale: 2,
                    useCORS: true,
                    logging: false
                });
                
                const imgData = canvas.toDataURL('image/png');
                const imgWidth = doc.internal.pageSize.getWidth() - 40;
                const imgHeight = (canvas.height * imgWidth) / canvas.width;
                
                doc.addImage(imgData, 'PNG', 20, yPosition, imgWidth, imgHeight);
            }
        }
        
        // Número da página
        const totalPages = doc.internal.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(
                `Página ${i} de ${totalPages}`, 
                pageWidth - margin, 
                doc.internal.pageSize.height - 10,
                { align: 'right' }
            );
        }
        
        // Salvar o PDF
        doc.save(`relatorio-${tipoRelatorio}-${new Date().toISOString().split('T')[0]}.pdf`);
        
        showPushNotification({
            title: 'PDF Gerado',
            message: `Relatório "${titulo}" exportado com sucesso!`,
            type: 'success',
            duration: 3000
        });
        
    } catch (error) {
        console.error('Erro ao gerar PDF:', error);
        showPushNotification({
            title: 'Erro',
            message: 'Não foi possível gerar o PDF. Verifique o console para mais detalhes.',
            type: 'error',
            duration: 5000
        });
    }
}

// Função auxiliar para formatar data de forma resumida no PDF
function formatarDataResumidaPDF(data) {
    if (!data) return 'N/A';
    
    try {
        const dataObj = new Date(data);
        if (isNaN(dataObj.getTime())) return 'N/A';
        
        const dia = String(dataObj.getDate()).padStart(2, '0');
        const mes = String(dataObj.getMonth() + 1).padStart(2, '0');
        const ano = dataObj.getFullYear();
        
        return `${dia}/${mes}/${ano}`;
    } catch (error) {
        return 'N/A';
    }
}

function calcularEstatisticasPDF(tickets) {
    const total = tickets.length;
    const abertos = tickets.filter(t => t.status === 'Aguardando Cliente').length;
    const emAndamento = tickets.filter(t => t.status === 'Em Analise').length;
    const aguardandoRetorno = tickets.filter(t => t.status === 'Aguardando Retorno').length;
    const finalizados = tickets.filter(t => t.status === 'Finalizado').length;
    const outros = total - (abertos + emAndamento + aguardandoRetorno + finalizados);
    
    return {
        total,
        abertos,
        emAndamento,
        aguardandoRetorno,
        finalizados,
        outros,
        percentAbertos: total > 0 ? ((abertos / total) * 100).toFixed(1) : 0,
        percentFinalizados: total > 0 ? ((finalizados / total) * 100).toFixed(1) : 0,
        percentEmAndamento: total > 0 ? ((emAndamento / total) * 100).toFixed(1) : 0
    };
}

function adicionarCardsResumoPDF(doc, estatisticas, margin, y, contentWidth) {
    const colors = {
        primary: [41, 128, 185],
        success: [39, 174, 96],
        warning: [243, 156, 18],
        danger: [231, 76, 60],
        accent: [155, 89, 182]
    };
    
    const cardWidth = (contentWidth - 15) / 3;
    const cardHeight = 25;
    
    // Título da seção
    doc.setTextColor(44, 62, 80);
    doc.setFontSize(5);
    doc.setFont('helvetica', 'bold');
    doc.text('RESUMO EXECUTIVO', margin, y);
    y += 15;
    
    // Card 1: Total
    doc.setFillColor(...colors.primary);
    doc.roundedRect(margin, y, cardWidth, cardHeight, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.text('TOTAL', margin + 5, y + 8);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(estatisticas.total.toString(), margin + 5, y + 17);
    doc.setFontSize(7);
    doc.text(`Filtrados`, margin + 5, y + 22);
    
    // Card 2: Em Andamento
    doc.setFillColor(...colors.warning);
    doc.roundedRect(margin + cardWidth + 5, y, cardWidth, cardHeight, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.text('EM ANDAMENTO', margin + cardWidth + 10, y + 8);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(estatisticas.emAndamento.toString(), margin + cardWidth + 10, y + 17);
    doc.setFontSize(7);
    doc.text(`${estatisticas.percentEmAndamento}% do total`, margin + cardWidth + 10, y + 22);
    
    // Card 3: Finalizados
    doc.setFillColor(...colors.success);
    doc.roundedRect(margin + (cardWidth * 2) + 10, y, cardWidth, cardHeight, 3, 3, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.text('FINALIZADOS', margin + (cardWidth * 2) + 15, y + 8);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(estatisticas.finalizados.toString(), margin + (cardWidth * 2) + 15, y + 17);
    doc.setFontSize(7);
    doc.text(`${estatisticas.percentFinalizados}% do total`, margin + (cardWidth * 2) + 15, y + 22);
    
    return y + cardHeight + 20;
}

function adicionarConteudoRelatorioPDF(doc, tipoRelatorio, tickets, margin, y, contentWidth, pageHeight) {
    // Título do conteúdo específico
    doc.setTextColor(44, 62, 80);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    
    switch (tipoRelatorio) {
        case 'chamados-por-status':
            doc.text('DISTRIBUIÇÃO POR STATUS', margin, y);
            y += 10;
            y = adicionarRelatorioStatusPDF(doc, tickets, margin, y, contentWidth, pageHeight);
            break;
            
        case 'chamados-por-cliente':
            doc.text('TOP CLIENTES', margin, y);
            y += 10;
            y = adicionarRelatorioClientePDF(doc, tickets, margin, y, contentWidth, pageHeight);
            break;
            
        case 'tempo-resolucao':
            doc.text('TEMPO DE RESOLUÇÃO', margin, y);
            y += 10;
            y = adicionarRelatorioTempoResolucaoPDF(doc, tickets, margin, y, contentWidth, pageHeight);
            break;
            
        case 'chamados-mensal':
            doc.text('EVOLUÇÃO MENSAL', margin, y);
            y += 10;
            y = adicionarRelatorioMensalPDF(doc, tickets, margin, y, contentWidth, pageHeight);
            break;
            
           }
    
    return y;
}

// ============ FUNÇÃO ATUALIZADA PARA PDF ============

function adicionarRelatorioTempoResolucaoPDF(doc, tickets, margin, y, contentWidth, pageHeight) {
    if (tickets.length === 0) {
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'italic');
        doc.text('Nenhum chamado encontrado para o período selecionado.', margin, y);
        return y + 20;
    }
    
    // Calcular tempos de resolução
    const temposResolucao = [];
    tickets.forEach(ticket => {
        if (ticket.status === 'Finalizado') {
            const tempo = calcularTempoResolucao(ticket);
            if (tempo !== null && tempo >= 0) {
                temposResolucao.push(tempo);
            }
        }
    });
    
    if (temposResolucao.length === 0) {
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'italic');
        doc.text('Nenhum chamado finalizado com dados de tempo de resolução disponível.', margin, y);
        return y + 20;
    }
    
    const tempoMedio = temposResolucao.reduce((sum, tempo) => sum + tempo, 0) / temposResolucao.length;
    const excelentes = temposResolucao.filter(tempo => tempo <= 40).length;
    const ruins = temposResolucao.filter(tempo => tempo > 40).length;
    const percentualExcelentes = (excelentes / temposResolucao.length * 100).toFixed(1);
    const percentualRuins = (ruins / temposResolucao.length * 100).toFixed(1);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    
    doc.text(`• Total de chamados analisados: ${temposResolucao.length}`, margin, y);
    y += 8;
    doc.text(`• Tempo médio de resolução: ${tempoMedio.toFixed(1)} minutos`, margin, y);
    y += 8;
    doc.text(`• Meta estabelecida: 40 minutos`, margin, y);
    y += 8;
    doc.text(`• Chamados excelentes (≤40min): ${excelentes} (${percentualExcelentes}%)`, margin, y);
    y += 8;
    doc.text(`• Chamados ruins (>40min): ${ruins} (${percentualRuins}%)`, margin, y);
    y += 12;
    
    // Adicionar análise de performance
    doc.setFont('helvetica', 'bold');
    doc.text('ANÁLISE DE PERFORMANCE:', margin, y);
    y += 8;
    doc.setFont('helvetica', 'normal');
    
    if (percentualExcelentes >= 80) {
        doc.text('✓ Performance EXCELENTE - Meta amplamente atingida', margin, y);
    } else if (percentualExcelentes >= 60) {
        doc.text('✓ Performance BOA - Meta sendo atingida', margin, y);
    } else {
        doc.text('✗ Performance precisa de MELHORIAS - Meta não atingida', margin, y);
    }
    y += 8;
    
    return y + 15;
}
function adicionarRelatorioClientePDF(doc, tickets, margin, y, contentWidth, pageHeight) {
    if (tickets.length === 0) {
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'italic');
        doc.text('Nenhum chamado encontrado para o período selecionado.', margin, y);
        return y + 20;
    }
    
    // Contar por cliente
    const clienteCount = {};
    tickets.forEach(ticket => {
        clienteCount[ticket.cliente] = (clienteCount[ticket.cliente] || 0) + 1;
    });
    
    const clientesOrdenados = Object.keys(clienteCount).sort((a, b) => clienteCount[b] - clienteCount[a]);
    const topClientes = clientesOrdenados.slice(0, 10);
    const total = tickets.length;
    
    // Cabeçalho da tabela
    doc.setFillColor(41, 128, 185);
    doc.rect(margin, y, contentWidth, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('CLIENTE', margin + 5, y + 6);
    doc.text('QUANTIDADE', margin + contentWidth - 40, y + 6, { align: 'right' });
    doc.text('PERCENTUAL', margin + contentWidth - 5, y + 6, { align: 'right' });
    
    y += 12;
    
    // Dados da tabela
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    
    topClientes.forEach(cliente => {
        if (y > pageHeight - 20) {
            doc.addPage();
            y = margin;
            // Redesenhar cabeçalho
            doc.setFillColor(41, 128, 185);
            doc.rect(margin, y, contentWidth, 10, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('CLIENTE', margin + 5, y + 6);
            doc.text('QUANTIDADE', margin + contentWidth - 40, y + 6, { align: 'right' });
            doc.text('PERCENTUAL', margin + contentWidth - 5, y + 6, { align: 'right' });
            y += 12;
        }
        
        const count = clienteCount[cliente];
        const percentage = ((count / total) * 100).toFixed(1);
        
        doc.setTextColor(44, 62, 80);
        doc.text(cliente, margin + 5, y + 5);
        doc.text(count.toString(), margin + contentWidth - 40, y + 5, { align: 'right' });
        doc.text(percentage + '%', margin + contentWidth - 5, y + 5, { align: 'right' });
        
        y += 8;
    });
    
    return y + 10;
}

function adicionarRelatorioTempoResolucaoPDF(doc, tickets, margin, y, contentWidth, pageHeight) {
    if (tickets.length === 0) {
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'italic');
        doc.text('Nenhum chamado encontrado para o período selecionado.', margin, y);
        return y + 20;
    }
    
    const ticketsFinalizados = tickets.filter(t => t.status === 'Finalizado');
    
    if (ticketsFinalizados.length === 0) {
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'italic');
        doc.text('Nenhum chamado finalizado encontrado para o período selecionado.', margin, y);
        return y + 20;
    }
    
    // Calcular métricas (exemplo simplificado)
    const tempoMedio = 24; // Horas - em uma implementação real, calcular com base nas datas
    const taxaResolucao = ((ticketsFinalizados.length / tickets.length) * 100).toFixed(1);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    
    doc.text(`• Total de chamados analisados: ${tickets.length}`, margin, y);
    y += 8;
    doc.text(`• Chamados finalizados: ${ticketsFinalizados.length}`, margin, y);
    y += 8;
    doc.text(`• Taxa de resolução: ${taxaResolucao}%`, margin, y);
    y += 8;
    doc.text(`• Tempo médio de resolução: ${tempoMedio} horas`, margin, y);
    y += 8;
    doc.text(`• Chamados em aberto: ${tickets.length - ticketsFinalizados.length}`, margin, y);
    
    return y + 15;
}

function adicionarRelatorioMensalPDF(doc, tickets, margin, y, contentWidth, pageHeight) {
    if (tickets.length === 0) {
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'italic');
        doc.text('Nenhum chamado encontrado para o período selecionado.', margin, y);
        return y + 20;
    }
    
    // Agrupar por mês
    const monthlyCount = {};
    tickets.forEach(ticket => {
        try {
            const data = new Date(ticket.dataRegistro);
            const mesAno = `${(data.getMonth() + 1).toString().padStart(2, '0')}/${data.getFullYear()}`;
            monthlyCount[mesAno] = (monthlyCount[mesAno] || 0) + 1;
        } catch (error) {
            console.warn('Erro ao processar data do ticket:', ticket.dataRegistro);
        }
    });
    
    const mesesOrdenados = Object.keys(monthlyCount).sort();
    
    // Cabeçalho da tabela
    doc.setFillColor(41, 128, 185);
    doc.rect(margin, y, contentWidth, 10, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('MÊS/ANO', margin + 5, y + 6);
    doc.text('QUANTIDADE', margin + contentWidth - 5, y + 6, { align: 'right' });
    
    y += 12;
    
    // Dados da tabela
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    
    mesesOrdenados.forEach(mesAno => {
        if (y > pageHeight - 20) {
            doc.addPage();
            y = margin;
            // Redesenhar cabeçalho
            doc.setFillColor(41, 128, 185);
            doc.rect(margin, y, contentWidth, 10, 'F');
            doc.setTextColor(255, 255, 255);
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.text('MÊS/ANO', margin + 5, y + 6);
            doc.text('QUANTIDADE', margin + contentWidth - 5, y + 6, { align: 'right' });
            y += 12;
        }
        
        const count = monthlyCount[mesAno];
        doc.setTextColor(44, 62, 80);
        doc.text(mesAno, margin + 5, y + 5);
        doc.text(count.toString(), margin + contentWidth - 5, y + 5, { align: 'right' });
        
        y += 8;
    });
    
    return y + 10;
}

function adicionarRelatorioPerformancePDF(doc, tickets, margin, y, contentWidth, pageHeight) {
    if (tickets.length === 0) {
        doc.setTextColor(100, 100, 100);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'italic');
        doc.text('Nenhum chamado encontrado para o período selecionado.', margin, y);
        return y + 20;
    }
    
    const estatisticas = calcularEstatisticasPDF(tickets);
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    
    doc.text(`• Total de chamados: ${estatisticas.total}`, margin, y);
    y += 8;
    doc.text(`• Aguardando Cliente: ${estatisticas.abertos} (${estatisticas.percentAbertos}%)`, margin, y);
    y += 8;
    doc.text(`• Em Análise: ${estatisticas.emAndamento} (${estatisticas.percentEmAndamento}%)`, margin, y);
    y += 8;
    doc.text(`• Aguardando Retorno: ${estatisticas.aguardandoRetorno}`, margin, y);
    y += 8;
    doc.text(`• Finalizados: ${estatisticas.finalizados} (${estatisticas.percentFinalizados}%)`, margin, y);
    y += 8;
    doc.text(`• Outros status: ${estatisticas.outros}`, margin, y);
    y += 12;
    
    // Indicadores de performance
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('INDICADORES DE PERFORMANCE', margin, y);
    y += 10;
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    
    const eficiencia = ((estatisticas.finalizados / estatisticas.total) * 100).toFixed(1);
    const backlog = estatisticas.abertos + estatisticas.emAndamento;
    
    doc.text(`• Eficiência de resolução: ${eficiencia}%`, margin, y);
    y += 8;
    doc.text(`• Backlog atual: ${backlog} chamados`, margin, y);
    y += 8;
    doc.text(`• Taxa de conversão: ${estatisticas.percentFinalizados}%`, margin, y);
    
    return y + 15;
}

function adicionarRecomendacoesPDF(doc, estatisticas, margin, y, contentWidth) {
    const recomendacoes = gerarRecomendacoesPDF(estatisticas);
    
    if (recomendacoes.length === 0) return y;
    
    // Verificar se precisa de nova página
    if (y > doc.internal.pageSize.height - 80) {
        doc.addPage();
        y = margin;
    }
    
    doc.setTextColor(44, 62, 80);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('RECOMENDAÇÕES', margin, y);
    y += 10;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    recomendacoes.forEach((recomendacao, index) => {
        if (y > doc.internal.pageSize.height - 30) {
            doc.addPage();
            y = margin;
        }
        
        doc.text(`${index + 1}. ${recomendacao}`, margin, y);
        y += 8;
    });
    
    return y + 10;
}

function adicionarRodapePDF(doc, pageWidth, pageHeight, margin) {
    const totalPages = doc.internal.getNumberOfPages();
    
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        
        // Linha separadora
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.line(margin, pageHeight - 25, pageWidth - margin, pageHeight - 25);
        
        // Texto do rodapé
        doc.setTextColor(150, 150, 150);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        
        // Número da página
        doc.text(`Página ${i} de ${totalPages}`, margin, pageHeight - 15);
        
        // Data e hora
        doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, pageHeight - 15, { align: 'center' });
        
        // Informações do sistema
        doc.text('Tickets Control - Sistema de Gestão de Chamados', pageWidth - margin, pageHeight - 15, { align: 'right' });
    }
}   

// MÉTODO WEB PARA EXPORTAÇÃO (FALLBACK)
       function exportToExcelWeb(ticketsToExport = tickets, fileName = 'chamados') {
            try {
                // Verificar se a biblioteca XLSX está disponível
                if (typeof XLSX === 'undefined') {
                    throw new Error('Biblioteca XLSX não carregada. Verifique a conexão com a internet.');
                }
                
                // Preparar dados para exportação
                const data = tickets.map(ticket => ({
                    'Número': ticket.numeroChamado || '',
                    'Cliente': ticket.cliente || '',
                    'Sistema': ticket.sistema || '',
                    'Descrição': ticket.descricao || '',
                    'Status': ticket.status || '',
                    'Prioridade': ticket.prioridade || '',
                    'Data de Registro': ticket.dataRegistro || '',
                    'URL': ticket.url || '',
                    'Situação': ticket.situacao || '',
                    'Inbox': ticket.inbox || ''
                }));
                
                // Criar planilha
                const ws = XLSX.utils.json_to_sheet(data);
                
                // Ajustar largura das colunas
                const colWidths = [
                    { wch: 15 }, { wch: 25 }, { wch: 20 }, { wch: 50 },
                    { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 20 },
                    { wch: 30 }, { wch: 20 }, { wch: 15 }
                ];
                ws['!cols'] = colWidths;
                
                // Criar workbook
                const wb = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(wb, ws, 'Chamados');
                
                // Exportar arquivo
        XLSX.writeFile(wb, `${fileName}_${new Date().toISOString().split('T')[0]}.xlsx`);
                
                showPushNotification({
                    title: 'Exportação Concluída',
                    message: `${tickets.length} chamado(s) exportado(s) com sucesso!`,
                    type: 'success',
                    duration: 3000
                });
            } catch (error) {
                console.error('Erro no método web de exportação:', error);
                
                let errorMessage = 'Erro ao exportar para Excel. ';
                if (error.message.includes('não carregada')) {
                    errorMessage += 'Biblioteca XLSX não disponível.';
                } else {
                    errorMessage += 'Verifique o console para mais detalhes.';
                }
                
                showPushNotification({
                    title: 'Erro na Exportação',
                    message: errorMessage,
                    type: 'error',
                    duration: 5000
                });
            }
        }



// Adicionar eventos para atualizar relatório automaticamente
function initializeReportsPage() {
    document.getElementById('relatorio-tipo').addEventListener('change', gerarRelatorio);
    document.getElementById('periodo').addEventListener('change', gerarRelatorio);
    
    // Gerar relatório automaticamente ao carregar a página
    if (document.getElementById('relatorios-page').classList.contains('active')) {
        setTimeout(gerarRelatorio, 100);
    }
}

// Modificar a função navigateToPage para inicializar relatórios
function navigateToPage(pageId) {
    // ... código existente ...
    
    // Se for a página de relatórios, inicializar
    if (pageId === 'relatorios') {
        setTimeout(() => {
            initializeReportsPage();
        }, 100);
    }
}


     // MÉTODO WEB PARA IMPORTAR (FALLBACK)
        function importFromExcelWeb(file) {
            const reader = new FileReader();
            
            reader.onload = async function(e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });
                    
                    // Obter primeira planilha
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    
                    // Converter para JSON
                    const jsonData = XLSX.utils.sheet_to_json(worksheet);
                    
                    if (jsonData.length === 0) {
                        showPushNotification({
                            title: 'Arquivo Vazio',
                            message: 'O arquivo está vazio ou não contém dados válidos.',
                            type: 'warning',
                            duration: 4000
                        });
                        return;
                    }
                    
                    await processImportedData(jsonData);
                    
                } catch (error) {
                    console.error('Erro ao importar do Excel (web):', error);
                    showPushNotification({
                        title: 'Erro na Importação',
                        message: 'Erro ao importar do Excel. Verifique se o arquivo está no formato correto.',
                        type: 'error',
                        duration: 5000
                    });
                }
            };
            
            reader.onerror = function() {
                showPushNotification({
                    title: 'Erro de Leitura',
                    message: 'Erro ao ler o arquivo.',
                    type: 'error',
                    duration: 4000
                });
            };
            
            reader.readAsArrayBuffer(file);
        }



     // ============ FUNÇÕES DE EXTRACTION ============

function extrairDados(conteudo) {
    const dados = {};
    
    console.log("Conteúdo recebido:", conteudo);
    
    // Extrair número do chamado do conteúdo
    const numeroMatch = conteudo.match(/Chamado\s+(\d+)/);
    if (numeroMatch) {
        dados.numeroChamado = numeroMatch[1];
        dados.url = `https://meuespaco.mastermaq.com.br/crm/atendimento?k=${numeroMatch[1]}`;
    }
    
    // CORREÇÃO: Extrair data e hora de registro da primeira ocorrência de "Registrado em:"
    const dataRegistroMatch = conteudo.match(/Registrado em:\s*([^\n]+)/i);
    if (dataRegistroMatch && dataRegistroMatch[1]) {
        dados.dataRegistro = dataRegistroMatch[1].trim();
        console.log("Data de registro extraída:", dados.dataRegistro);
        
        // Converter para formato MySQL se necessário
        try {
            const [data, hora] = dados.dataRegistro.split(' ');
            const [dia, mes, ano] = data.split('/');
            dados.dataRegistroMySQL = `${ano}-${mes}-${dia} ${hora}`;
        } catch (error) {
            console.warn("Não foi possível converter a data de registro:", error);
            dados.dataRegistroMySQL = dados.dataRegistro;
        }
    }
    
    // Padrões básicos
    const patterns = {
        cliente: /Cliente:\s*([^\n]+)/i,
        tipo: /Tipo:\s*([^\n]+)/i,
        classificacao: /Classificação:\s*([^\n]+)/i,
        inbox: /Inbox:\s*([^\n]+)/i,
        sistema: /Sistema:\s*([^\n]+)/i
    };
    
    for (const [campo, pattern] of Object.entries(patterns)) {
        const match = conteudo.match(pattern);
        if (match && match[1]) {
            dados[campo] = match[1].trim();
        }
    }
    
    // EXTRAIR STATUS (segunda ocorrência)
    const statusMatches = conteudo.matchAll(/Status:\s*([^\n]+)/gi);
    const statusArray = Array.from(statusMatches);
    
    if (statusArray.length >= 2) {
        dados.status = statusArray[1][1].trim();
    } else if (statusArray.length === 1) {
        dados.status = '';
    }
    
    // CORREÇÃO: Extrair SEGUNDA DESCRIÇÃO completa de "Descrição:" até "Histórico de interações"
    console.log("=== BUSCANDO SEGUNDA DESCRIÇÃO ATÉ HISTÓRICO ===");
    
    // Encontrar todas as ocorrências de "Descrição:"
    const descricaoMatches = conteudo.matchAll(/Descrição:/gi);
    const descricaoIndices = [];
    for (const match of descricaoMatches) {
        descricaoIndices.push(match.index);
    }
    
    console.log("Índices de 'Descrição:':", descricaoIndices);
    
    if (descricaoIndices.length >= 2) {
        // Pegar a SEGUNDA ocorrência de "Descrição:"
        const startIndex = descricaoIndices[1];
        
        // Encontrar o início do "Histórico de interações" após a segunda descrição
        const historicoIndex = conteudo.indexOf("Histórico de interações", startIndex);
        
        if (historicoIndex !== -1) {
            // Extrair todo o conteúdo da segunda descrição até o histórico
            const descricaoCompleta = conteudo.substring(startIndex, historicoIndex).trim();
            
            // Remover a palavra "Descrição:" do início, se presente
            dados.descricao = descricaoCompleta.replace(/^Descrição:\s*/, '').trim();
            console.log("Descrição completa extraída (segunda até histórico):", dados.descricao);
        } else {
            // Se não encontrar histórico, pegar até o final
            const descricaoCompleta = conteudo.substring(startIndex).trim();
            dados.descricao = descricaoCompleta.replace(/^Descrição:\s*/, '').trim();
            console.log("Descrição extraída (segunda até o final):", dados.descricao);
        }
    } else if (descricaoIndices.length === 1) {
        // Se só tem uma descrição, usar ela
        const startIndex = descricaoIndices[0];
        const historicoIndex = conteudo.indexOf("Histórico de interações", startIndex);
        
        if (historicoIndex !== -1) {
            const descricaoCompleta = conteudo.substring(startIndex, historicoIndex).trim();
            dados.descricao = descricaoCompleta.replace(/^Descrição:\s*/, '').trim();
            console.log("Descrição extraída (primeira até histórico):", dados.descricao);
        } else {
            const descricaoCompleta = conteudo.substring(startIndex).trim();
            dados.descricao = descricaoCompleta.replace(/^Descrição:\s*/, '').trim();
            console.log("Descrição extraída (primeira até o final):", dados.descricao);
        }
    } else {
        // Fallback: buscar por padrões alternativos
        console.log("Nenhuma ocorrência de 'Descrição:' encontrada");
        
        // Tentar encontrar qualquer texto entre a última ocorrência de algum padrão e "Histórico de interações"
        const ultimoPadrao = conteudo.lastIndexOf("Outras informações:");
        const historicoIndex = conteudo.indexOf("Histórico de interações");
        
        if (ultimoPadrao !== -1 && historicoIndex !== -1 && ultimoPadrao < historicoIndex) {
            dados.descricao = conteudo.substring(ultimoPadrao, historicoIndex).trim();
            console.log("Descrição extraída (fallback):", dados.descricao);
        } else {
            dados.descricao = '';
        }
    }
    
    // CORREÇÃO: Limpeza final da descrição
    if (dados.descricao) {
        // Remover múltiplas quebras de linha consecutivas
        dados.descricao = dados.descricao.replace(/\n\s*\n\s*\n/g, '\n\n');
        
        // Remover espaços em branco excessivos no início/fim
        dados.descricao = dados.descricao.trim();
    }
    
    console.log("=== RESULTADO FINAL ===");
    console.log("Número do chamado:", dados.numeroChamado);
    console.log("Data de registro:", dados.dataRegistro);
    console.log("Data de registro (MySQL):", dados.dataRegistroMySQL);
    console.log("Status:", dados.status);
    console.log("Descrição (tamanho):", dados.descricao ? dados.descricao.length : 0);
    console.log("Descrição (início):", dados.descricao ? dados.descricao.substring(0, 100) + "..." : "N/A");
    
    return dados;
}


// Função auxiliar para extrair número do chamado do conteúdo (como fallback)
function extrairNumeroChamadoDoConteudo(conteudo) {
    if (!conteudo) return null;
    const match = conteudo.match(/Chamado\s+(\d+)/);
    if (match && match[1]) {
        return match[1];
    }
    return null;
}

function abrirModalEdicao(ticketId) {
    const ticket = tickets.find(t => t.id === ticketId);
    
    if (!ticket) {
        showPushNotification({
            title: 'Erro',
            message: 'Chamado não encontrado.',
            type: 'error',
            duration: 3000
        });
        return;
    }
    
    console.log('Editando chamado:', ticket);
    
    // Preencher todos os campos do formulário
    document.getElementById('modal-title').textContent = 'Editar Chamado';
    document.getElementById('ticket-id').value = ticket.id;
    document.getElementById('ticket-numero-chamado').value = ticket.numeroChamado || '';
    document.getElementById('ticket-url').value = ticket.url || '';
    document.getElementById('ticket-cliente').value = ticket.cliente || '';
    document.getElementById('ticket-sistema').value = ticket.sistema || '';
    
    // Corrigir a data de registro
    if (ticket.dataRegistro) {
        document.getElementById('ticket-data-registro').value = formatarDataParaInput(ticket.dataRegistro);
    } else {
        document.getElementById('ticket-data-registro').value = formatarDataParaInput(new Date());
    }
    
    document.getElementById('ticket-descricao').value = ticket.descricao || '';
    document.getElementById('ticket-prioridade').value = ticket.prioridade || 'Média';
    document.getElementById('ticket-status').value = ticket.status || 'Aguardando Cliente';
    
    // Preencher observações se existirem
    const observacoesValue = ticket.observacoesFinalizado || '';
    document.getElementById('ticket-observacoes').value = observacoesValue;
    
    // Mostrar/ocultar campo de observações baseado no status atual
    const observacoesGroup = document.getElementById('ticket-observacoes').closest('.form-group');
    observacoesGroup.style.display = ticket.status === 'Finalizado' ? 'block' : 'none';
    
    // Aplicar cores nos selects
    setTimeout(() => {
        aplicarCoresNosSelectsStatus();
    }, 100);
    
    // Mostrar modal
    document.getElementById('ticket-modal').classList.add('active');
}

  // Função de extração simples (alternativa)
function extrairDadosSimples(conteudo) {
    const dados = {};
    
    // Extrair número do chamado do conteúdo
    const numeroMatch = conteudo.match(/Chamado\s+(\d+)/);
    if (numeroMatch) {
        dados.numeroChamado = numeroMatch[1];
        dados.url = `https://meuespaco.mastermaq.com.br/crm/atendimento?k=${numeroMatch[1]}`;
    }
        
        const descricoes = [];
        const linhas = conteudo.split('\n');
        
        for (let i = 0; i < linhas.length; i++) {
            const linha = linhas[i].trim();
            
            if (linha.startsWith('Descrição:')) {
                const textoDescricao = linha.substring(10).trim();
                if (textoDescricao) {
                    descricoes.push(textoDescricao);
                }
                
                if (i + 1 < linhas.length) {
                    const proximaLinha = linhas[i + 1].trim();
                    if (proximaLinha && !proximaLinha.includes(':') && proximaLinha.length > 5) {
                        descricoes.push(proximaLinha);
                    }
                }
            }
        }
        
        console.log("Descrições encontradas (simples):", descricoes);
        
        if (descricoes.length >= 2) {
            dados.descricao = descricoes[1];
        } else {
            dados.descricao = '';
        }
        
        const statusMatches = conteudo.matchAll(/Status:\s*([^\n]+)/gi);
        const statusArray = Array.from(statusMatches);
        
        if (statusArray.length >= 2) {
            dados.status = statusArray[1][1].trim();
        } else {
            dados.status = '';
        }
        
        const clienteMatch = conteudo.match(/Cliente:\s*([^\n]+)/i);
        if (clienteMatch) dados.cliente = clienteMatch[1].trim();
        
        const sistemaMatch = conteudo.match(/Sistema:\s*([^\n]+)/i);
        if (sistemaMatch) dados.sistema = sistemaMatch[1].trim();
        
        const dataMatch = conteudo.match(/Registrado em:\s*([^\n]+)/i);
        if (dataMatch) dados.dataRegistro = dataMatch[1].trim();
        
        return dados;
    }


 // ============ NOVAS FUNÇÕES DE BACKUP E RESTAURAÇÃO ============

        // Função para criar backup do sistema
        async function criarBackupSistema() {
            try {
                const result = await dbManager.createBackup();
                
                if (result.success) {
                    // Criar arquivo JSON para download
                    const backupData = JSON.stringify(result.data, null, 2);
                    const blob = new Blob([backupData], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    
                    // Criar link para download
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `backup_tickets_control_${new Date().toISOString().split('T')[0]}.json`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    
                    // Liberar URL
                    URL.revokeObjectURL(url);
                    
                    showPushNotification({
                        title: 'Backup Criado',
                        message: 'Backup do sistema criado com sucesso!',
                        type: 'success',
                        duration: 5000
                    });
                } else {
                    throw new Error(result.error);
                }
            } catch (error) {
                console.error('Erro ao criar backup:', error);
                showPushNotification({
                    title: 'Erro ao Criar Backup',
                    message: 'Não foi possível criar o backup do sistema.',
                    type: 'error',
                    duration: 5000
                });
            }
        }

        // Função para restaurar sistema a partir de backup
  async function restaurarSistema(backupFile) {
    try {
        const reader = new FileReader();
        
        reader.onload = async function(e) {
            try {
                const backupData = JSON.parse(e.target.result);
                
                // Validar dados do backup
                if (!backupData || !backupData.tickets || !backupData.schedules || !backupData.systemSettings) {
                    throw new Error('Arquivo de backup inválido ou corrompido');
                }

                // Confirmar restauração
                const confirmacao = confirm(
                    'ATENÇÃO: A restauração substituirá todos os dados atuais do sistema.\n\n' +
                    `- ${backupData.tickets.length} chamados serão restaurados\n` +
                    `- ${backupData.schedules.length} agendamentos serão restaurados\n` +
                    `- Todas as configurações atuais serão substituídas\n\n` +
                    'Deseja continuar?'
                );

                if (!confirmacao) {
                    const button = document.getElementById('restore-system-btn');
                    button.innerHTML = '<i class="fas fa-upload"></i><span class="btn-text">Restaurar Sistema</span>';
                    button.disabled = false;
                    return;
                }

                // Mostrar loading
                const button = document.getElementById('restore-system-btn');
                const originalText = button.innerHTML;
                button.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span class="btn-text">Restaurando...</span>';
                button.disabled = true;

                console.log('Iniciando restauração do backup...');

                // CORREÇÃO: Método SIMPLES para ambiente web - substituir diretamente no localStorage
                if (typeof ipcRenderer === 'undefined' || !ipcRenderer.invoke) {
                    console.log('Restaurando no ambiente web (localStorage)...');
                    
                    // 1. Limpar dados atuais
                    localStorage.removeItem('tickets');
                    localStorage.removeItem('schedules');
                    localStorage.removeItem('ticketsControlSettings');
                    
                    // 2. Restaurar dados do backup diretamente no localStorage
                    localStorage.setItem('tickets', JSON.stringify(backupData.tickets));
                    localStorage.setItem('schedules', JSON.stringify(backupData.schedules));
                    
                    // 3. Restaurar configurações
                    const settingsToSave = {
                        systemSettings: backupData.systemSettings,
                        customStatuses: backupData.customStatuses || [],
                        dashboardStatusSettings: backupData.dashboardStatusSettings || { enabledStatuses: ["Aguardando Cliente", "Retomar Atendimento", "Em Analise", "Finalizado"] }
                    };
                    localStorage.setItem('ticketsControlSettings', JSON.stringify(settingsToSave));
                    
                    // 4. Atualizar variáveis globais imediatamente
                    tickets = backupData.tickets;
                    schedules = backupData.schedules;
                    systemSettings = { ...systemSettings, ...backupData.systemSettings };
                    
                    if (backupData.customStatuses) {
                        customStatuses = backupData.customStatuses;
                    }
                    
                    if (backupData.dashboardStatusSettings) {
                        dashboardStatusSettings = backupData.dashboardStatusSettings;
                    }
                    
                    console.log('Dados restaurados no localStorage:', {
                        tickets: tickets.length,
                        schedules: schedules.length,
                        systemSettings: systemSettings
                    });
                    
                } else {
                    // CORREÇÃO: Para Electron, usar método simplificado
                    console.log('Restaurando no Electron...');
                    
                    // Limpar dados atuais
                    await dbManager.clearAllData();
                    
                    // Restaurar dados
                    tickets = backupData.tickets;
                    schedules = backupData.schedules;
                    systemSettings = { ...systemSettings, ...backupData.systemSettings };
                    
                    if (backupData.customStatuses) {
                        customStatuses = backupData.customStatuses;
                    }
                    
                    // Salvar cada ticket individualmente
                    for (const ticket of backupData.tickets) {
                        await dbManager.saveTicket(ticket);
                    }
                    
                    // Salvar cada agendamento individualmente
                    for (const schedule of backupData.schedules) {
                        await dbManager.saveSchedule(schedule);
                    }
                    
                    // Salvar configurações
                    await dbManager.saveSettings();
                }

                // CORREÇÃO: Recarregar dados e atualizar interface
                console.log('Recarregando dados e atualizando interface...');
                
                // Forçar recarregamento dos dados
                await dbManager.loadTickets();
                await dbManager.loadSchedules();
                await dbManager.loadSettings();
                
               // Atualizar todas as interfaces
           renderTicketsTable();
           renderFinishedTicketsTable();
           renderSchedulesTable();
           renderStatusList();
           updateDashboard(); // Esta função agora chama renderRecentTickets internamente
           updateCharts();
                
                // Navegar para dashboard para visualizar resultado
                navigateToPage('dashboard');
                
                showPushNotification({
                    title: '✅ Sistema Restaurado!',
                    message: `Backup restaurado com sucesso! ${backupData.tickets.length} chamados e ${backupData.schedules.length} agendamentos carregados.`,
                    type: 'success',
                    duration: 6000
                });
                
                console.log('✅ Backup restaurado com sucesso!');
                
            } catch (error) {
                console.error('❌ Erro ao processar arquivo de backup:', error);
                showPushNotification({
                    title: '❌ Erro na Restauração',
                    message: 'Não foi possível restaurar o backup: ' + error.message,
                    type: 'error',
                    duration: 6000
                });
            } finally {
                // Restaurar botão
                const button = document.getElementById('restore-system-btn');
                if (button) {
                    button.innerHTML = '<i class="fas fa-upload"></i><span class="btn-text">Restaurar Sistema</span>';
                    button.disabled = false;
                }
            }
        };
        
        reader.onerror = function() {
            console.error('❌ Erro ao ler arquivo de backup');
            showPushNotification({
                title: '❌ Erro de Leitura',
                message: 'Erro ao ler o arquivo de backup. O arquivo pode estar corrompido.',
                type: 'error',
                duration: 5000
            });
            
            const button = document.getElementById('restore-system-btn');
            if (button) {
                button.innerHTML = '<i class="fas fa-upload"></i><span class="btn-text">Restaurar Sistema</span>';
                button.disabled = false;
            }
        };
        
        reader.readAsText(backupFile);
        
    } catch (error) {
        console.error('❌ Erro na restauração:', error);
        showPushNotification({
            title: '❌ Erro na Restauração',
            message: 'Erro ao processar arquivo de restauração: ' + error.message,
            type: 'error',
            duration: 6000
        });
        
        const button = document.getElementById('restore-system-btn');
        if (button) {
            button.innerHTML = '<i class="fas fa-upload"></i><span class="btn-text">Restaurar Sistema</span>';
            button.disabled = false;
        }
    }
}

// Função de emergência para restaurar backup manualmente (executar no console do navegador)
function restaurarBackupManual(backupData) {
    try {
        // Salvar no localStorage
        localStorage.setItem('tickets', JSON.stringify(backupData.tickets));
        localStorage.setItem('schedules', JSON.stringify(backupData.schedules));
        
        const settingsToSave = {
            systemSettings: backupData.systemSettings,
            customStatuses: backupData.customStatuses || [],
            dashboardStatusSettings: backupData.dashboardStatusSettings || { enabledStatuses: ["Aguardando Cliente", "Retomar Atendimento", "Em Analise", "Finalizado", "Pré-Finalizado", "Em Atendimento"] }
        };
        localStorage.setItem('ticketsControlSettings', JSON.stringify(settingsToSave));
        
        // Recarregar a página
        location.reload();
        
        return '✅ Backup restaurado manualmente! Recarregando página...';
    } catch (error) {
        return '❌ Erro: ' + error.message;
    }
}

// Função para renderizar chamados recentes no dashboard
function renderRecentTickets() {
    const tbody = document.getElementById('recent-tickets-body');
    if (!tbody) return;

    // Ordenar tickets por data (mais recentes primeiro) e pegar os últimos 5
    const recentTickets = [...tickets]
        .sort((a, b) => new Date(b.dataRegistro) - new Date(a.dataRegistro))
        .slice(0, 5); // Apenas 5 por padrão

    tbody.innerHTML = '';

    if (recentTickets.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="placeholder-text">Nenhum chamado encontrado</td>
            </tr>
        `;
        return;
    }

    recentTickets.forEach(ticket => {
        const tr = document.createElement('tr');
        
        let statusClass = '';
        if (ticket.status === 'Aguardando Cliente') statusClass = 'status-open';
        else if (ticket.status === 'Em Analise') statusClass = 'status-in-progress';
        else if (ticket.status === 'Retomar Atendimento') statusClass = 'status-pending';
        else if (ticket.status === 'Finalizado') statusClass = 'status-finished';
        else statusClass = 'status-open';
        
        const dataExibicao = ticket.dataRegistroExibicao || 
                           (ticket.dataRegistro ? formatarDataParaExibicao(ticket.dataRegistro) : 
                           formatarDataParaExibicao(new Date()));
        
        tr.innerHTML = `
            <td><a href="${ticket.url}" target="_blank">${ticket.numeroChamado}</a></td>
            <td>${ticket.cliente}</td>
            <td><span class="status-badge ${statusClass}">${ticket.status}</span></td>
            <td>${dataExibicao}</td>
        `;
        
        tbody.appendChild(tr);
    });
}

// Função para verificar se o backup está correto
function verificarBackup(backupData) {
    console.log('=== VERIFICAÇÃO DO BACKUP ===');
    console.log('Tickets:', backupData.tickets?.length || 0);
    console.log('Schedules:', backupData.schedules?.length || 0);
    console.log('SystemSettings:', backupData.systemSettings ? 'OK' : 'FALTANDO');
    console.log('CustomStatuses:', backupData.customStatuses?.length || 0);
    console.log('============================');
    
    if (!backupData.tickets || !Array.isArray(backupData.tickets)) {
        throw new Error('Backup inválido: tickets não encontrados ou formato incorreto');
    }
    
    if (!backupData.schedules || !Array.isArray(backupData.schedules)) {
        throw new Error('Backup inválido: schedules não encontrados ou formato incorreto');
    }
    
    if (!backupData.systemSettings) {
        throw new Error('Backup inválido: systemSettings não encontrado');
    }
    
    return true;
}

    
          // ============ INICIALIZAÇÃO ============

// CORREÇÃO: Inicialização melhorada
document.addEventListener('DOMContentLoaded', function() {
    console.log('Inicializando sistema completo...');
    
    // Inicializar funcionalidades específicas de cada página
    initializeReportsPage();

    // Forçar carregamento inicial
    setTimeout(async () => {
        try {
            await dbManager.loadTickets();
            await dbManager.loadSchedules();
            await loadDashboardStatusSettings();
            await migrarStatusExistente();
            
            // CORREÇÃO: Ordem correta de inicialização
            updateDashboard();
            renderTicketsTable();
            renderRecentTickets();
            renderSchedulesTable();
            renderStatusList();
            updateStatusSelects();
            aplicarCoresNosSelectsStatus();
            iniciarVerificacaoAgendamentos();
            verificarChamadosAguardandoCliente();

            // CORREÇÃO: Inicializar event listeners do dashboard
            inicializarEventListenersDashboard();
            
            console.log('Sistema inicializado com sucesso');
            
        } catch (error) {
            console.error('Erro na inicialização:', error);
        }
    }, 1000);


// ============ EXECUTAR VERIFICAÇÃO PERIÓDICA ============

// Executar a verificação a cada 6 horas (21600000 ms)
setInterval(verificarChamadosAguardandoCliente, 21600000);

// Executar também quando o sistema inicia
setTimeout(verificarChamadosAguardandoCliente, 15000);


    
        // Event listeners de navegação
       document.querySelectorAll('.nav-item[data-page]').forEach(item => {
    item.addEventListener('click', function(e) {
        e.preventDefault();
        const pageId = this.getAttribute('data-page');
        console.log('Clicou no menu:', pageId);
        navigateToPage(pageId);
    });
});

// CORREÇÃO: Navegação inicial forçada para dashboard
setTimeout(() => {
    navigateToPage('dashboard');
}, 500);

        // Toggle sidebar
        document.getElementById('sidebar-toggle').addEventListener('click', function() {
            document.getElementById('sidebar').classList.toggle('active');
            document.querySelector('.main-content').classList.toggle('sidebar-active');
        });

        
       
        // Eventos do modal de chamado
        document.getElementById('cancel-ticket').addEventListener('click', function() {
            document.getElementById('ticket-modal').classList.remove('active');
            document.getElementById('ticket-form').reset();
            document.getElementById('ticket-id').value = '';
            document.getElementById('ticket-numero-chamado').value = '';
             document.getElementById('export-finished-tickets-btn').addEventListener('click', function() {
    exportFinishedTickets();
});
        });

        // Fechar modal com X
        document.querySelectorAll('.modal-close').forEach(btn => {
            btn.addEventListener('click', function() {
                this.closest('.modal').classList.remove('active');
            });
        });

// ============ MODIFICAÇÃO NO EVENT LISTENER DO BOTÃO SALVAR ============
// Atualize a parte do código onde processa o número do chamado:
document.getElementById('save-ticket-modal').addEventListener('click', async function() {
    const form = document.getElementById('ticket-form');
    
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    // Obter valores do formulário
    const ticketId = document.getElementById('ticket-id').value;
    let numeroChamado = document.getElementById('ticket-numero-chamado').value.trim();
    const url = document.getElementById('ticket-url').value.trim();
    const cliente = document.getElementById('ticket-cliente').value.trim();
    const sistema = document.getElementById('ticket-sistema').value.trim();
    const dataRegistroInput = document.getElementById('ticket-data-registro').value;
    const descricao = document.getElementById('ticket-descricao').value.trim();
    const prioridade = document.getElementById('ticket-prioridade').value;
    const status = document.getElementById('ticket-status').value;
    const observacoes = document.getElementById('ticket-observacoes').value.trim();
    
    // CORREÇÃO: Tentar extrair número da URL se estiver vazio
    if (!numeroChamado && url) {
        const numeroExtraido = extrairNumeroChamadoDaURL(url);
        if (numeroExtraido) {
            numeroChamado = numeroExtraido;
            document.getElementById('ticket-numero-chamado').value = numeroChamado;
            
            showPushNotification({
                title: 'Número Extraído',
                message: `Número ${numeroChamado} extraído da URL automaticamente`,
                type: 'info',
                duration: 3000
            });
        }
    }

document.getElementById('ticket-url').addEventListener('blur', function() {
    setTimeout(() => {
        atualizarNumeroChamadoDaURL();
    }, 100);
});

    
    // Se ainda não tem número, gerar um manual
    if (!numeroChamado) {
        numeroChamado = `MANUAL-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        document.getElementById('ticket-numero-chamado').value = numeroChamado;
        
        showPushNotification({
            title: 'Número Gerado Automaticamente',
            message: `Número do chamado: ${numeroChamado}`,
            type: 'info',
            duration: 3000
        });
    }

    
    // Validações
    if (!cliente) {
        showPushNotification({
            title: 'Campo Obrigatório',
            message: 'Por favor, informe o cliente.',
            type: 'error',
            duration: 4000
        });
        document.getElementById('ticket-cliente').focus();
        return;
    }
    
    if (!descricao) {
        showPushNotification({
            title: 'Campo Obrigatório',
            message: 'Por favor, informe a descrição.',
            type: 'error',
            duration: 4000
        });
        document.getElementById('ticket-descricao').focus();
        return;
    }
    
    // Processar data
    let dataRegistroMySQL;
    let dataRegistroExibicao;
    
    if (dataRegistroInput) {
        try {
            const dataObj = new Date(dataRegistroInput);
            dataRegistroMySQL = formatarDataParaMySQL(dataObj);
            dataRegistroExibicao = formatarDataParaExibicao(dataObj);
        } catch (error) {
            console.error('Erro ao processar data:', error);
            const now = new Date();
            dataRegistroMySQL = formatarDataParaMySQL(now);
            dataRegistroExibicao = formatarDataParaExibicao(now);
        }
    } else {
        const now = new Date();
        dataRegistroMySQL = formatarDataParaMySQL(now);
        dataRegistroExibicao = formatarDataParaExibicao(now);
    }
    
    // Determinar URL final
let urlFinal = url;
    if (!urlFinal && numeroChamado && !numeroChamado.startsWith('MANUAL-')) {
        urlFinal = `https://meuespaco.mastermaq.com.br/crm/atendimento?k=${numeroChamado}`;
    }
    
    // Obter ticket existente ou criar novo
    let ticket;
    const dataAtual = new Date();
    const dataAtualMySQL = formatarDataParaMySQL(dataAtual);
    const dataAtualExibicao = formatarDataParaExibicao(dataAtual);
    
    if (ticketId) {
        // Edição de ticket existente
        ticket = tickets.find(t => t.id === ticketId);
        if (!ticket) {
            showPushNotification({
                title: 'Erro',
                message: 'Chamado não encontrado para edição.',
                type: 'error',
                duration: 4000
            });
            return;
        }
        
        const statusAnterior = ticket.status;
        
        // Atualizar propriedades do ticket mantendo os dados existentes
        ticket.numeroChamado = numeroChamado || ticket.numeroChamado;
        ticket.url = urlFinal || ticket.url;
        ticket.cliente = cliente;
        ticket.sistema = sistema || ticket.sistema;
        ticket.dataRegistro = dataRegistroMySQL;
        ticket.dataRegistroExibicao = dataRegistroExibicao;
        ticket.descricao = descricao;
        ticket.prioridade = prioridade;
        ticket.status = status;
        
        // Gerenciar observações
        if (status === 'Finalizado') {
            ticket.observacoesFinalizado = observacoes;
        } else if (statusAnterior === 'Finalizado' && status !== 'Finalizado') {
            // Mantém observações existentes se estava finalizado e está reabrindo
            // Não altera observacoesFinalizado
        }
        
        // Adicionar ao histórico se o status mudou
        if (statusAnterior !== status) {
            if (!ticket.historicoStatus) {
                ticket.historicoStatus = [];
            }
            ticket.historicoStatus.push({
                status: status,
                data: dataAtualMySQL,
                dataExibicao: dataAtualExibicao,
                observacao: `Status alterado de "${statusAnterior}" para "${status}"`
            });
        }
        
    } else {
        // Novo ticket
        const newId = gerarId();
        
        ticket = {
            id: newId,
            numeroChamado: numeroChamado,
            url: urlFinal,
            cliente: cliente,
            sistema: sistema,
            dataRegistro: dataRegistroMySQL,
            dataRegistroExibicao: dataRegistroExibicao,
            descricao: descricao,
            situacao: 'Não especificada',
            inbox: 'Não especificado',
            status: status,
            prioridade: prioridade,
            data: dataAtualMySQL,
            dataExibicao: dataAtualExibicao,
            historicoStatus: [
                { 
                    status: status, 
                    data: dataAtualMySQL,
                    dataExibicao: dataAtualExibicao,
                    observacao: 'Ticket criado manualmente'
                }
            ],
            observacoesFinalizado: status === 'Finalizado' ? observacoes : '',
            deletionDate: null
        };
    }
    
    try {
        // Mostrar loading
        const button = this;
        const originalText = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span class="btn-text">Salvando...</span>';
        button.disabled = true;
        
        // Salvar no banco de dados
        const success = await dbManager.saveTicket(ticket);
        
        if (success) {
            // Recarregar tickets do banco
            await dbManager.loadTickets();
            
            // Fechar modal e limpar formulário
            document.getElementById('ticket-modal').classList.remove('active');
            form.reset();
            document.getElementById('ticket-id').value = '';
            
            // Mostrar notificação
            const acao = ticketId ? 'atualizado' : 'criado';
            showPushNotification({
                title: 'Sucesso',
                message: `Chamado ${acao} com sucesso!`,
                type: 'success',
                duration: 3000
            });
            
            // Navegar para página apropriada
            if (status === 'Finalizado' && document.getElementById('chamados-page').classList.contains('active')) {
                setTimeout(() => {
                    navigateToPage('chamados-finalizados');
                }, 1000);
            }
            
        } else {
            throw new Error('Falha ao salvar no banco de dados');
        }
        
    } catch (error) {
        console.error('Erro ao salvar chamado:', error);
        showPushNotification({
            title: 'Erro ao Salvar',
            message: 'Não foi possível salvar o chamado: ' + error.message,
            type: 'error',
            duration: 5000
        });
    } finally {
        // Restaurar botão
        const button = document.getElementById('save-ticket-modal');
        button.innerHTML = '<i class="fas fa-save"></i><span class="btn-text">Salvar</span>';
        button.disabled = false;
    }
});

// Adicionar animação de shake no CSS
const style = document.createElement('style');
style.textContent = `
    @keyframes shake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-5px); }
        75% { transform: translateX(5px); }
    }
`;
document.head.appendChild(style);

// Event listener para salvar chamado extraído
document.getElementById('save-ticket-btn').addEventListener('click', async function() {
    const dados = window.dadosExtraidosAtuais;
    
    if (!dados || !dados.numeroChamado) {
        showPushNotification({
            title: 'Erro',
            message: 'Nenhum dado extraído para salvar. Por favor, extraia os dados primeiro.',
            type: 'error',
            duration: 3000
        });
        return;
    }
    
    // Verificar se já existe chamado com esse número
    const chamadoExistente = tickets.find(t => t.numeroChamado === dados.numeroChamado);
    if (chamadoExistente) {
        if (!confirm(`Já existe um chamado com o número ${dados.numeroChamado}. Deseja sobrescrevê-lo?`)) {
            return;
        }
    }
    
    try {
        const newId = gerarId();
        const dataAtual = new Date();
        
        const novoChamado = {
            id: newId,
            numeroChamado: dados.numeroChamado,
            url: dados.url || `https://meuespaco.mastermaq.com.br/crm/atendimento?k=${dados.numeroChamado}`,
            cliente: dados.cliente || 'Cliente não identificado',
            sistema: dados.sistema || 'Sistema não identificado',
            dataRegistro: dados.dataRegistroMySQL || formatarDataParaMySQL(dataAtual),
            dataRegistroExibicao: dados.dataRegistro || formatarDataParaExibicao(dataAtual),
            descricao: dados.descricao || 'Descrição não disponível',
            situacao: 'Extraído automaticamente',
            inbox: 'MQ360º',
            status: dados.status || 'Aguardando Cliente',
            prioridade: 'Média',
            data: formatarDataParaMySQL(dataAtual),
            dataExibicao: formatarDataParaExibicao(dataAtual),
            historicoStatus: [{
                status: dados.status || 'Aguardando Cliente',
                data: formatarDataParaMySQL(dataAtual),
                dataExibicao: formatarDataParaExibicao(dataAtual),
                observacao: 'Chamado extraído automaticamente do MQ360º'
            }],
            observacoesFinalizado: '',
            deletionDate: null
        };
        
        const success = await dbManager.saveTicket(novoChamado);
        
        if (success) {
            await dbManager.loadTickets();
            
            // Limpar formulário
            document.getElementById('conteudo-pagina').value = '';
            document.getElementById('extracted-data').innerHTML = '';
            document.getElementById('save-ticket-btn').classList.add('hidden');
            document.getElementById('extracted-summary').classList.add('hidden');
            
            showPushNotification({
                title: 'Sucesso!',
                message: `Chamado ${dados.numeroChamado} salvo com sucesso!`,
                type: 'success',
                duration: 3000
            });
            
            // Navegar para a página de chamados
            setTimeout(() => navigateToPage('chamados'), 1000);
        } else {
            throw new Error('Falha ao salvar no banco de dados');
        }
    } catch (error) {
        console.error('Erro ao salvar chamado extraído:', error);
        showPushNotification({
            title: 'Erro',
            message: 'Erro ao salvar chamado: ' + error.message,
            type: 'error',
            duration: 5000
        });
    }
});

        // Exportar chamados
        document.getElementById('export-tickets-btn').addEventListener('click', function() {
            exportToExcel();
        });

        // Importar chamados
        document.getElementById('import-tickets-btn').addEventListener('click', function() {
            document.getElementById('file-import').click();
        });

        // Processar importação de arquivo
            document.getElementById('file-import').addEventListener('change', function(e) {
                const file = e.target.files[0];
                if (file) {
                    importFromExcel(file);
                }
                // Limpar o input
                e.target.value = '';
            });



        // Excluir todos os chamados
        document.getElementById('delete-all-tickets').addEventListener('click', async function() {
            if (tickets.length === 0) {
                showPushNotification({
                    title: 'Atenção',
                    message: 'Não há chamados para excluir.',
                    type: 'warning',
                    duration: 3000
                });
                return;
            }
            
            if (confirm('Tem certeza que deseja excluir TODOS os chamados? Esta ação não pode ser desfeita.')) {
                try {
                    // Excluir cada ticket do banco
                    for (const ticket of tickets) {
                        await dbManager.deleteTicket(ticket.id);
                    }
                    
                    // Recarregar dados do banco
                    await dbManager.loadTickets();
                    
                    showPushNotification({
                        title: 'Chamados Excluídos',
                        message: 'Todos os chamados foram excluídos com sucesso!',
                        type: 'success',
                        duration: 3000
                    });
                } catch (error) {
                    console.error('Erro ao excluir chamados:', error);
                    showPushNotification({
                        title: 'Erro',
                        message: 'Não foi possível excluir os chamados do banco de dados.',
                        type: 'error',
                        duration: 5000
                    });
                }
            }
        });

        // Ver todos os chamados
        document.getElementById('view-all-tickets').addEventListener('click', function() {
            navigateToPage('chamados');
        });

        // Atualizar dashboard
       document.getElementById('refresh-dashboard').addEventListener('click', function() {
    if(confirm('Deseja realmente recarregar a página?')) {
        window.location.reload();
    }
            
            showPushNotification({
                title: 'Dashboard Atualizado',
                message: 'Dashboard atualizado com sucesso!',
                type: 'success',
                duration: 2000
            });
        });

        // Salvar preferências de usuário
       document.getElementById('save-user-preferences').addEventListener('click', async function() {
    const tema = document.getElementById('tema').value;
    const notificationsEnabled = document.getElementById('notifications-enabled').value === 'true';
    
    systemSettings.theme = tema;
    systemSettings.notificationsEnabled = notificationsEnabled;
    
    applyTheme(tema);
    
    const success = await dbManager.saveSettings();
    
    if (success) {
        showPushNotification({
            title: 'Preferências Salvas',
            message: 'Preferências de usuário salvas com sucesso!',
            type: 'success',
            duration: 3000
        });
    } else {
        showPushNotification({
            title: 'Erro',
            message: 'Não foi possível salvar as preferências.',
            type: 'error',
            duration: 3000
        });
    }
});

// Função para inicializar e aplicar cores ao carregar a página
function inicializarCoresAoTocar() {
    console.log('Inicializando cores dos status...');
    
    // Aguardar um pouco para garantir que tudo foi carregado
    setTimeout(() => {
        aplicarCoresNosSelectsStatus();
        renderStatusList();
        
        // Aplicar cores novamente após um tempo para garantir
        setTimeout(() => {
            aplicarCoresNosSelectsStatus();
        }, 2000);
    }, 1000);
}

// Chamar quando a página carregar
document.addEventListener('DOMContentLoaded', function() {
    inicializarCoresAoTocar();
});


        // Adicionar novo status
   document.getElementById('add-status-btn').addEventListener('click', async function() {
    const novoStatus = document.getElementById('novo-status').value.trim();
    
    if (!novoStatus) {
        showPushNotification({
            title: 'Atenção',
            message: 'Por favor, digite um nome para o novo status',
            type: 'warning',
            duration: 3000
        });
        return;
    }
    
    if (customStatuses.includes(novoStatus)) {
        showPushNotification({
            title: 'Atenção',
            message: 'Este status já existe!',
            type: 'warning',
            duration: 3000
        });
        return;
    }
    
    customStatuses.push(novoStatus);
    
    try {
        // CORREÇÃO: Adicionar cor padrão para o novo status
        if (!systemSettings.statusColors) {
            systemSettings.statusColors = {};
        }
        systemSettings.statusColors[novoStatus] = '#6b7280'; // Cor padrão cinza
        
        // CORREÇÃO: Salvar tanto os status personalizados quanto as configurações
        const successCustom = await dbManager.saveCustomStatuses(customStatuses);
        const successSettings = await dbManager.saveSettings();
        
        if (successCustom && successSettings) {
            renderStatusList();
            updateStatusSelects();
            document.getElementById('novo-status').value = '';
            
            showPushNotification({
                title: 'Status Adicionado',
                message: `Status "${novoStatus}" adicionado com sucesso!`,
                type: 'success',
                duration: 3000
            });
        } else {
            throw new Error('Falha ao salvar no banco');
        }
    } catch (error) {
        console.error('Erro ao salvar status:', error);
        // Reverter em caso de erro
        customStatuses = customStatuses.filter(s => s !== novoStatus);
        if (systemSettings.statusColors && systemSettings.statusColors[novoStatus]) {
            delete systemSettings.statusColors[novoStatus];
        }
        showPushNotification({
            title: 'Erro',
            message: 'Não foi possível salvar o status no banco de dados.',
            type: 'error',
            duration: 3000
        });
    }
});



        // Fechar modal de histórico
        document.getElementById('close-history').addEventListener('click', function() {
            document.getElementById('history-modal').classList.remove('active');
        });

        // Abrir MasterMaq
        document.getElementById('open-mastermaq-btn').addEventListener('click', function() {
            window.open('https://meuespaco.mastermaq.com.br', '_blank');
        });

        // Gerar relatório
        document.getElementById('gerar-relatorio-btn').addEventListener('click', function() {
            gerarRelatorio();
        });

        // Exportar relatório PDF
        document.getElementById('generate-report-pdf').addEventListener('click', function() {
            exportarRelatorioPDF();
        });

         // NOVOS EVENTOS: Backup e Restauração
            document.getElementById('backup-system-btn').addEventListener('click', function() {
                criarBackupSistema();
            });

           document.getElementById('restore-system-btn').addEventListener('click', function() {
    document.getElementById('backup-restore-input').click();
});

            document.getElementById('backup-restore-input').addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (file) {
        // Verificar se é um arquivo JSON
        if (!file.name.endsWith('.json')) {
            showPushNotification({
                title: 'Arquivo Inválido',
                message: 'Por favor, selecione um arquivo JSON de backup.',
                type: 'error',
                duration: 4000
            });
            return;
        }
        
        restaurarSistema(file);
    }
                // Limpar o input
                e.target.value = '';
            });

      
        // Novo agendamento
            // NOVO: Event listener corrigido para novo agendamento
document.getElementById('new-schedule-btn').addEventListener('click', function() {
    const modal = document.getElementById('schedule-modal');
    modal.removeAttribute('data-edit-id');
    
    const scheduleTicketSelect = document.getElementById('schedule-ticket');
    scheduleTicketSelect.innerHTML = '';
    
    // CORREÇÃO: Filtrar apenas tickets NÃO finalizados
    const activeTickets = tickets.filter(ticket => ticket.status !== 'Finalizado');
    
    console.log('Chamados ativos para agendamento:', activeTickets.length);
    
    if (activeTickets.length === 0) {
        const option = document.createElement('option');
        option.value = '';
        option.textContent = 'Nenhum chamado ativo disponível, ou estão todos Finalizados';
        option.disabled = true;
        option.selected = true;
        scheduleTicketSelect.appendChild(option);
        
        showPushNotification({
            title: 'Sem Chamados Ativos',
            message: 'Não há chamados ativos disponíveis para agendamento.',
            type: 'warning',
            duration: 3000
        });
    } else {
        activeTickets.forEach(ticket => {
            const option = document.createElement('option');
            option.value = ticket.id;
            option.textContent = `${ticket.numeroChamado} - ${ticket.cliente}`;
            scheduleTicketSelect.appendChild(option);
        });
    }
    
    // Limpar outros campos do formulário
    document.getElementById('schedule-date').value = '';
    document.getElementById('schedule-responsible').value = '';
    document.getElementById('schedule-notes').value = '';
    
    document.getElementById('schedule-modal').classList.add('active');
});


            // Cancelar agendamento
            document.getElementById('cancel-schedule').addEventListener('click', function() {
                document.getElementById('schedule-modal').classList.remove('active');
                document.getElementById('schedule-form').reset();
            });

            // Salvar alteração de status
            document.getElementById('save-status-change').addEventListener('click', async function() {
                const ticketId = document.getElementById('expired-ticket-id').value;
                const scheduleId = document.getElementById('expired-schedule-id').value;
                const novoStatus = document.getElementById('new-status-select').value;
                
                const ticket = tickets.find(t => t.id === ticketId);
                
                if (ticket) {
                    const statusAnterior = ticket.status;
                    ticket.status = novoStatus;
                    
                    if (!ticket.historicoStatus) {
                        ticket.historicoStatus = [];
                    }
                    
                    ticket.historicoStatus.push({
                        status: novoStatus,
                        data: formatarDataParaMySQL(new Date()),
                        dataExibicao: formatarDataParaExibicao(new Date())
                    });
                    
                    const success = await dbManager.saveTicket(ticket);
                    
                    if (success) {
                        await dbManager.deleteSchedule(scheduleId);
                        document.getElementById('status-change-modal').classList.remove('active');
                        
                        showPushNotification({
                            title: 'Status Atualizado',
                            message: `Status alterado de "${statusAnterior}" para "${novoStatus}"`,
                            type: 'success',
                            duration: 4000
                        });
                    }
                }
            });

           // MODIFICAÇÃO: Cancelar alteração de status - apenas fecha o modal
document.getElementById('cancel-status-change').addEventListener('click', function() {
    document.getElementById('status-change-modal').classList.remove('active');
});

            // Navegação inicial
            setTimeout(() => {
                navigateToPage('dashboard');
            }, 500);

            // Inicializar verificações de agendamento
            setTimeout(() => {
                iniciarVerificacaoAgendamentos();
                
            }, 1000);
        });


// ============ FUNÇÃO ATUALIZADA PARA CALCULAR TEMPO DE RESOLUÇÃO ============
function calcularTempoMedioResolucao(tickets, periodo) {
    const agora = new Date();
    const periodoMs = periodo * 24 * 60 * 60 * 1000;
    const dataLimite = new Date(agora.getTime() - periodoMs);

    console.log('Calculando tempo de resolução (Em Atendimento → Pré-Finalizado) para período:', periodo, 'dias');

    // Array para armazenar os tempos de resolução
    const temposResolucao = [];
    const ticketsComTempo = [];

    tickets.forEach(ticket => {
        // Verificar se o ticket está com status "Pré-Finalizado" ou "Finalizado"
        if (ticket.status === 'Pré-Finalizado' || ticket.status === 'Finalizado') {
            // Buscar histórico de status para encontrar as datas
            if (ticket.historicoStatus && Array.isArray(ticket.historicoStatus)) {
                let dataEmAtendimento = null;
                let dataPreFinalizado = null;

                // Procurar pelos status "Em Atendimento" e "Pré-Finalizado" no histórico
                for (const historico of ticket.historicoStatus) {
                    if (historico.status === 'Em Atendimento' && !dataEmAtendimento) {
                        dataEmAtendimento = new Date(historico.data);
                    } else if (historico.status === 'Pré-Finalizado' && !dataPreFinalizado) {
                        dataPreFinalizado = new Date(historico.data);
                    }
                }

                // Se encontrou ambas as datas, calcular o tempo
                if (dataEmAtendimento && dataPreFinalizado && 
                    !isNaN(dataEmAtendimento.getTime()) && !isNaN(dataPreFinalizado.getTime())) {
                    
                    // Verificar se está dentro do período (usando a data de pré-finalização)
                    if (dataPreFinalizado >= dataLimite) {
                        const diffMs = dataPreFinalizado - dataEmAtendimento;
                        const diffMinutos = Math.floor(diffMs / (1000 * 60)); // Converter para minutos
                        
                        if (diffMinutos >= 0) { // Tempo válido
                            temposResolucao.push(diffMinutos);
                            
                            ticketsComTempo.push({
                                ticket: ticket,
                                tempo: diffMinutos,
                                dataEmAtendimento: dataEmAtendimento,
                                dataPreFinalizado: dataPreFinalizado,
                                classificacao: diffMinutos <= 40 ? 'excelente' : 'ruim'
                            });
                        }
                    }
                }
            }
        }
    });

    console.log('Tickets com tempo calculado (Em Atendimento → Pré-Finalizado):', ticketsComTempo.length);

    if (temposResolucao.length === 0) {
        return {
            media: 0,
            total: 0,
            excelentes: 0,
            ruins: 0,
            percentualExcelentes: 0,
            percentualRuins: 0,
            ticketsComTempo: []
        };
    }

    // Calcular estatísticas
    const tempoMedio = temposResolucao.reduce((sum, tempo) => sum + tempo, 0) / temposResolucao.length;
    const excelentes = ticketsComTempo.filter(t => t.classificacao === 'excelente').length;
    const ruins = ticketsComTempo.filter(t => t.classificacao === 'ruim').length;
    const percentualExcelentes = (excelentes / ticketsComTempo.length * 100).toFixed(1);
    const percentualRuins = (ruins / ticketsComTempo.length * 100).toFixed(1);

    return {
        media: tempoMedio.toFixed(1),
        total: ticketsComTempo.length,
        excelentes: excelentes,
        ruins: ruins,
        percentualExcelentes: percentualExcelentes,
        percentualRuins: percentualRuins,
        ticketsComTempo: ticketsComTempo,
        tempos: temposResolucao
    };
}

function calcularChamadosMensais(tickets, periodo) {
    const agora = new Date();
    const periodoMs = periodo * 24 * 60 * 60 * 1000;
    const dataLimite = new Date(agora.getTime() - periodoMs);

    // Filtrar tickets do período
    const ticketsPeriodo = tickets.filter(ticket => {
        const dataRegistro = new Date(ticket.dataRegistro);
        return dataRegistro >= dataLimite;
    });

    // Agrupar por mês
    const meses = {};
    const mesesNomes = [
        'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    ticketsPeriodo.forEach(ticket => {
        const data = new Date(ticket.dataRegistro);
        const chaveMes = `${data.getFullYear()}-${data.getMonth()}`;
        
        if (!meses[chaveMes]) {
            meses[chaveMes] = {
                mes: mesesNomes[data.getMonth()],
                ano: data.getFullYear(),
                total: 0,
                finalizados: 0,
                abertos: 0
            };
        }

        meses[chaveMes].total++;
        
        if (ticket.status === 'Finalizado') {
            meses[chaveMes].finalizados++;
        } else {
            meses[chaveMes].abertos++;
        }
    });

    // Converter para array e ordenar
    return Object.values(meses).sort((a, b) => {
        return new Date(b.ano, mesesNomes.indexOf(b.mes)) - new Date(a.ano, mesesNomes.indexOf(a.mes));
    });
}


// Função para adicionar tooltips nos gráficos do PDF
function adicionarTooltipGraficoPDF(doc, x, y, texto) {
    // Em um PDF real, tooltips não são possíveis, mas podemos adicionar notas
    doc.setFontSize(6);
    doc.setTextColor(100, 100, 100);
    doc.text(texto, x, y - 2);
}

// Função para criar um layout de duas colunas no PDF
function criarLayoutDuasColunasPDF(doc, margin, y, contentWidth, alturaColuna) {
    const colunaWidth = (contentWidth - 10) / 2;
    
    return {
        coluna1: { x: margin, y: y, width: colunaWidth, height: alturaColuna },
        coluna2: { x: margin + colunaWidth + 10, y: y, width: colunaWidth, height: alturaColuna }
    };
}

// Função para adicionar métricas-chave em destaque
function adicionarMetricasChavePDF(doc, metricas, margin, y, contentWidth) {
    const numMetricas = metricas.length;
    const metricaWidth = contentWidth / numMetricas;
    
    metricas.forEach((metrica, index) => {
        const x = margin + (index * metricaWidth);
        
        // Fundo colorido
        doc.setFillColor(...metrica.cor);
        doc.roundedRect(x, y, metricaWidth - 5, 25, 3, 3, 'F');
        
        // Valor
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(metrica.valor, x + (metricaWidth - 5) / 2, y + 10, { align: 'center' });
        
        // Label
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.text(metrica.label, x + (metricaWidth - 5) / 2, y + 17, { align: 'center' });
        
        // Variação (se houver)
        if (metrica.variacao) {
            doc.setFontSize(6);
            const corVariacao = metrica.variacao > 0 ? [39, 174, 96] : [231, 76, 60];
            doc.setTextColor(...corVariacao);
            doc.text(`${metrica.variacao > 0 ? '+' : ''}${metrica.variacao}%`, x + (metricaWidth - 5) / 2, y + 22, { align: 'center' });
        }
    });
    
    return y + 30;
}
// ============ FUNÇÕES DE FORMATAÇÃO DE DATA ============

// CORREÇÃO: Adicionar função formatarData que estava faltando
function formatarData(data) {
    if (!data) {
        return formatarDataParaExibicao(new Date());
    }
    
    const dataObj = new Date(data);
    
    if (isNaN(dataObj.getTime())) {
        console.warn('Data inválida, usando data atual');
        return formatarDataParaExibicao(new Date());
    }
    
    const dia = String(dataObj.getDate()).padStart(2, '0');
    const mes = String(dataObj.getMonth() + 1).padStart(2, '0');
    const ano = dataObj.getFullYear();
    const hora = String(dataObj.getHours()).padStart(2, '0');
    const minuto = String(dataObj.getMinutes()).padStart(2, '0');
    const segundo = String(dataObj.getSeconds()).padStart(2, '0');
    
    return `${dia}/${mes}/${ano} ${hora}:${minuto}:${segundo}`;
}

// ============ VALIDAÇÃO DE DADOS IMPORTADOS ============

// Função auxiliar para validar dados importados
function validarDadosImportados(item, index) {
    const errors = [];
    
    // Validar número do chamado
    if (!item.Número && !item['Número do Chamado']) {
        errors.push('Número do chamado é obrigatório');
    }
    
    // Validar cliente
    if (!item.Cliente) {
        errors.push('Cliente é obrigatório');
    }
    
    // Validar status
    if (item.Status && !customStatuses.includes(item.Status)) {
        errors.push(`Status "${item.Status}" não é válido`);
    }
    
    // Validar prioridade
    if (item.Prioridade && !['Baixa', 'Média', 'Alta'].includes(item.Prioridade)) {
        errors.push(`Prioridade "${item.Prioridade}" não é válida`);
    }
    
    // Validar data
    if (item['Data de Registro']) {
        const data = new Date(item['Data de Registro']);
        if (isNaN(data.getTime())) {
            errors.push('Data de registro inválida');
        }
    }
    
    return {
        isValid: errors.length === 0,
        errors: errors
    };
}

// ============ FUNÇÕES FALTANTES ============

// Função para salvar ticket no banco de dados (usada na importação)
async function saveTicketToDatabase(ticket) {
    try {
        const result = await dbManager.saveTicket(ticket);
        return result;
    } catch (error) {
        console.error('Erro ao salvar ticket:', error);
        return false;
    }
}

// Função para formatar data simples (DD/MM/AAAA)
function formatarDataSimples(data) {
    if (!data) {
        data = new Date();
    }
    
    const dataObj = new Date(data);
    
    if (isNaN(dataObj.getTime())) {
        console.warn('Data inválida, usando data atual');
        dataObj = new Date();
    }
    
    const dia = String(dataObj.getDate()).padStart(2, '0');
    const mes = String(dataObj.getMonth() + 1).padStart(2, '0');
    const ano = dataObj.getFullYear();
    
    return `${dia}/${mes}/${ano}`;
}

// Função para formatar data e hora simples (DD/MM/AAAA HH:MM:SS)
function formatarDataHoraSimples(data) {
    if (!data) {
        data = new Date();
    }
    
    const dataObj = new Date(data);
    
    if (isNaN(dataObj.getTime())) {
        console.warn('Data inválida, usando data atual');
        dataObj = new Date();
    }
    
    const dia = String(dataObj.getDate()).padStart(2, '0');
    const mes = String(dataObj.getMonth() + 1).padStart(2, '0');
    const ano = dataObj.getFullYear();
    const hora = String(dataObj.getHours()).padStart(2, '0');
    const minuto = String(dataObj.getMinutes()).padStart(2, '0');
    const segundo = String(dataObj.getSeconds()).padStart(2, '0');
    
    return `${dia}/${mes}/${ano} ${hora}:${minuto}:${segundo}`;
}
// ============ CORREÇÕES PARA IMPORT/EXPORT ============

 // EXPORTAR PARA EXCEL - VERSÃO CORRIGIDA
        async function exportToExcel() {
            if (tickets.length === 0) {
                showPushNotification({
                    title: 'Atenção',
                    message: 'Não há chamados para exportar.',
                    type: 'warning',
                    duration: 3000
                });
                return;
            }
            
            try {
                // Verificar se estamos no Electron
                if (typeof ipcRenderer !== 'undefined' && ipcRenderer.invoke) {
                    // No Electron - usar método nativo
                    const result = await ipcRenderer.invoke('export-to-excel', tickets);
                    
                    if (result.success) {
                        showPushNotification({
                            title: 'Exportação Concluída',
                            message: `${tickets.length} chamado(s) exportado(s) com sucesso!`,
                            type: 'success',
                            duration: 3000
                        });
                    } else {
                        throw new Error(result.error);
                    }
                } else {
                    // No navegador - usar método web
                    exportToExcelWeb();
                }
            } catch (error) {
                console.error('Erro ao exportar:', error);
                // Fallback para método web
                exportToExcelWeb();
            }
        }


   // IMPORTAR DE EXCEL - VERSÃO CORRIGIDA
         async function importFromExcel(file) {
            // Verificar extensão do arquivo
            if (!file.name.match(/\.(xlsx|xls)$/)) {
                showPushNotification({
                    title: 'Formato inválido',
                    message: 'Por favor, selecione um arquivo Excel (.xlsx ou .xls)',
                    type: 'error',
                    duration: 4000
                });
                return;
            }

            try {
                // Verificar se estamos no Electron
                if (typeof ipcRenderer !== 'undefined' && ipcRenderer.invoke) {
                    // No Electron - usar método nativo
                    const reader = new FileReader();
                    
                    reader.onload = async function(e) {
                        try {
                            const arrayBuffer = e.target.result;
                            const result = await ipcRenderer.invoke('import-from-excel', Array.from(new Uint8Array(arrayBuffer)));
                            
                            if (result.success) {
                                await processImportedData(result.data);
                            } else {
                                throw new Error(result.error);
                            }
                        } catch (error) {
                            console.error('Erro ao importar no Electron:', error);
                            // Fallback para método web
                            importFromExcelWeb(file);
                        }
                    };
                    
                    reader.onerror = function() {
                        showPushNotification({
                            title: 'Erro de Leitura',
                            message: 'Erro ao ler o arquivo.',
                            type: 'error',
                            duration: 4000
                        });
                    };
                    
                    reader.readAsArrayBuffer(file);
                } else {
                    // No navegador - usar método web
                    importFromExcelWeb(file);
                }
            } catch (error) {
                console.error('Erro na importação:', error);
                showPushNotification({
                    title: 'Erro na Importação',
                    message: 'Erro ao processar arquivo de importação.',
                    type: 'error',
                    duration: 5000
                });
            }
        }


// Atualizar o event listener do botão de exportação
document.getElementById('export-tickets-btn').addEventListener('click', function() {
    exportarChamadosXLSX();
});

    // PROCESSAR DADOS IMPORTADOS - VERSÃO CORRIGIDA
        async function processImportedData(jsonData) {
            let importedCount = 0;
            let updatedCount = 0;
            let errors = [];
            
            // Primeiro, carregar os tickets atuais para verificar duplicatas
            await dbManager.loadTickets();
            
            for (const [index, item] of jsonData.entries()) {
                try {
                    // Verificar dados mínimos necessários
                    if (!item.Número && !item.Descrição) {
                        errors.push(`Linha ${index + 2}: Número ou Descrição são obrigatórios`);
                        continue;
                    }
                    
                    // Verificar se o chamado já existe (por número ou URL)
                    const existingTicket = tickets.find(t => 
                        t.numeroChamado === String(item.Número) || 
                        (item.URL && t.url === item.URL)
                    );
                    
                    if (existingTicket) {
                        // ATUALIZAR chamado existente
                        existingTicket.cliente = item.Cliente || existingTicket.cliente;
                        existingTicket.sistema = item.Sistema || existingTicket.sistema;
                        existingTicket.descricao = item.Descrição || existingTicket.descricao;
                        existingTicket.status = item.Status || existingTicket.status;
                        existingTicket.prioridade = item.Prioridade || existingTicket.prioridade;
                        
                        // Formatar data de registro se existir no Excel
                        if (item['Data de Registro']) {
                            existingTicket.dataRegistro = formatarDataSimples(new Date(item['Data de Registro']));
                        }
                        
                        // Salvar atualização no banco
                        const success = await saveTicketToDatabase(existingTicket);
                        if (success) {
                            updatedCount++;
                        } else {
                            errors.push(`Linha ${index + 2}: Falha ao atualizar chamado existente`);
                        }
                    } else {
                        // CRIAR novo chamado
                        const newId = 'IMP-' + Date.now() + '-' + index;
                        
                        // Formatar data de registro
                        let dataRegistroFormatada;
                        if (item['Data de Registro']) {
                            dataRegistroFormatada = formatarDataSimples(new Date(item['Data de Registro']));
                        } else {
                            dataRegistroFormatada = formatarDataSimples(new Date());
                        }
                        
                        const newTicket = {
                            id: newId,
                            numeroChamado: item.Número ? String(item.Número) : `IMP-${index + 1}`,
                            url: item.URL || '',
                            cliente: item.Cliente || 'Cliente não identificado',
                            sistema: item.Sistema || 'Sistema não identificado',
                            dataRegistro: dataRegistroFormatada,
                            descricao: item.Descrição || 'Descrição não disponível',
                            situacao: item.Situação || 'Importado',
                            inbox: item.Inbox || 'Importado',
                            status: item.Status || 'Aberto',
                            prioridade: item.Prioridade || 'Média',
                            data: formatarDataSimples(new Date()),
                            historicoStatus: [
                                { status: item.Status || 'Aberto', data: formatarDataSimples(new Date()) }
                            ],
                            deletionDate: null
                        };
                        
                        // Salvar no banco
                        const success = await saveTicketToDatabase(newTicket);
                        if (success) {
                            importedCount++;
                        } else {
                            errors.push(`Linha ${index + 2}: Falha ao salvar novo chamado`);
                        }
                    }
                } catch (error) {
                    errors.push(`Linha ${index + 2}: ${error.message}`);
                }
            }
            
            // Recarregar dados do banco para atualizar a interface
            await dbManager.loadTickets();
            
            // Mostrar resultado completo
            let message = '';
            if (importedCount > 0) {
                message += `${importedCount} novo(s) chamado(s) importado(s). `;
            }
            if (updatedCount > 0) {
                message += `${updatedCount} chamado(s) atualizado(s). `;
            }
            if (errors.length > 0) {
                message += `${errors.length} erro(s) encontrado(s).`;
            }
            if (!message) {
                message = 'Nenhum dado foi processado.';
            }
            
            showPushNotification({
                title: 'Importação Concluída',
                message: message,
                type: errors.length > 0 ? 'warning' : 'success',
                duration: 6000
            });
            
            // Log de erros detalhado no console
            if (errors.length > 0) {
                console.error('Erros detalhados na importação:', errors);
            }
            
            // Navegar automaticamente para a página de chamados se houve alterações
            if (importedCount > 0 || updatedCount > 0) {
                setTimeout(() => {
                    navigateToPage('chamados');
                }, 1000);
            }
        }


// ============ FUNÇÃO PARA EXCLUIR TODOS OS AGENDAMENTOS ============

// Adicionar evento ao botão de excluir todos os agendamentos
document.getElementById('delete-all-schedules').addEventListener('click', async function() {
    await deleteAllSchedules();
});

// Função principal para excluir todos os agendamentos
async function deleteAllSchedules() {
    // Verificar se há agendamentos para excluir
    if (schedules.length === 0) {
        showPushNotification({
            title: 'Atenção',
            message: 'Não há agendamentos para excluir.',
            type: 'warning',
            duration: 3000
        });
        return;
    }

    // Confirmação antes de excluir
    const confirmation = confirm(`Tem certeza que deseja excluir TODOS os ${schedules.length} agendamentos? Esta ação não pode ser desfeita.`);
    
    if (!confirmation) {
        return;
    }

    try {
        // Mostrar loading ou feedback visual
        const button = document.getElementById('delete-all-schedules');
        const originalHTML = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span class="btn-text">Excluindo...</span>';
        button.disabled = true;

        // Excluir cada agendamento individualmente
        let deletedCount = 0;
        let errors = [];

        for (const schedule of schedules) {
            try {
                const success = await dbManager.deleteSchedule(schedule.id);
                if (success) {
                    deletedCount++;
                } else {
                    errors.push(`Falha ao excluir agendamento: ${schedule.cliente}`);
                }
            } catch (error) {
                console.error(`Erro ao excluir agendamento ${schedule.id}:`, error);
                errors.push(`Erro ao excluir: ${schedule.cliente}`);
            }
        }

        // Recarregar os agendamentos do banco
        await dbManager.loadSchedules();

        // Restaurar o botão ao estado original
        button.innerHTML = originalHTML;
        button.disabled = false;

        // Mostrar resultado
        if (errors.length === 0) {
            showPushNotification({
                title: 'Sucesso!',
                message: `Todos os ${deletedCount} agendamentos foram excluídos com sucesso!`,
                type: 'success',
                duration: 5000
            });
        } else {
            showPushNotification({
                title: 'Concluído com erros',
                message: `${deletedCount} agendamentos excluídos, ${errors.length} falhas. Verifique o console.`,
                type: 'warning',
                duration: 6000
            });
            
            // Log detalhado dos erros
            console.error('Erros na exclusão em lote:', errors);
        }

    } catch (error) {
        console.error('Erro geral ao excluir agendamentos:', error);
        
        // Restaurar o botão em caso de erro
        const button = document.getElementById('delete-all-schedules');
        button.innerHTML = '<i class="fas fa-trash"></i><span class="btn-text">Excluir Todos</span>';
        button.disabled = false;
        
        showPushNotification({
            title: 'Erro',
            message: 'Ocorreu um erro ao tentar excluir os agendamentos.',
            type: 'error',
            duration: 5000
        });
    }
}


// CORREÇÃO: Verificar se a navegação está funcionando
function checkNavigation() {
    console.log('Verificando navegação...');
    console.log('Páginas encontradas:', document.querySelectorAll('.page').length);
    console.log('Itens de menu:', document.querySelectorAll('.nav-item[data-page]').length);
    
    // Testar navegação programática
    setTimeout(() => {
        navigateToPage('dashboard');
    }, 1000);
}

// Chamar a verificação após o carregamento
document.addEventListener('DOMContentLoaded', function() {
    checkNavigation();
});

// SOLUÇÃO RÁPIDA: Debug e correção de navegação
console.log('=== INICIANDO SISTEMA DE NAVEGAÇÃO ===');

// Sobrescrever a função navigateToPage com versão corrigida
window.navigateToPage = function(pageId) {
    console.log('🔄 Navegando para:', pageId);
    
    // 1. Atualizar menu
    document.querySelectorAll('.nav-item').forEach(nav => {
        nav.classList.remove('active');
    });
    document.querySelector(`.nav-item[data-page="${pageId}"]`)?.classList.add('active');
    
    // 2. Atualizar título
    const titleElement = document.getElementById('page-title');
    const menuText = document.querySelector(`.nav-item[data-page="${pageId}"] .nav-text`);
    if (titleElement && menuText) {
        titleElement.textContent = menuText.textContent;
    }
    
    // 3. Ocultar todas as páginas
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active');
        page.style.display = 'none';
    });
    
    // 4. Mostrar página alvo
    const targetPage = document.getElementById(`${pageId}-page`);
    if (targetPage) {
        targetPage.classList.add('active');
        targetPage.style.display = 'block';
        console.log('✅ Página ativada:', targetPage.id);
    } else {
        console.error('❌ Página não encontrada:', `${pageId}-page`);
    }
    
    // 5. Ações específicas por página
    if (pageId === 'relatorios') setTimeout(gerarRelatorio, 200);
    if (pageId === 'dashboard') setTimeout(updateDashboard, 200);
};

// Reatribuir event listeners
setTimeout(() => {
    document.querySelectorAll('.nav-item[data-page]').forEach(item => {
        item.onclick = function(e) {
            e.preventDefault();
            navigateToPage(this.getAttribute('data-page'));
        };
    });
    
    // Forçar navegação inicial
    navigateToPage('dashboard');
}, 1000);

console.log('=== SISTEMA DE NAVEGAÇÃO INICIADO ===');

// ============ INICIALIZAÇÃO DO SISTEMA ============

document.addEventListener('DOMContentLoaded', function() {
    console.log('Inicializando sistema completo...');
    
    // Iniciar o sistema de verificação de agendamentos
    setTimeout(() => {
        iniciarVerificacaoAgendamentos();
    }, 3000);
    
    // Verificar a cada 30 segundos
    setInterval(() => {
        iniciarVerificacaoAgendamentos();
    }, 30000);
});



// Iniciar o sistema quando a página carregar
window.addEventListener('load', function() {
    console.log('Sistema totalmente carregado');
    iniciarVerificacaoAgendamentos();
});

// ============ CORREÇÃO PARA DUPLICAÇÃO DE AGENDAMENTOS ============

// Função para verificar se já existe agendamento para um ticket
function verificarAgendamentoExistente(ticketId) {
    return schedules.find(schedule => schedule.ticketId === ticketId);
}

// Função para atualizar agendamento existente
async function atualizarAgendamentoExistente(agendamentoExistente, novoAgendamento) {
    try {
        // Remover o agendamento antigo
        await dbManager.deleteSchedule(agendamentoExistente.id);
        
        // Adicionar o novo agendamento
        const success = await dbManager.saveSchedule(novoAgendamento);
        return success;
    } catch (error) {
        console.error('Erro ao atualizar agendamento:', error);
        return false;
    }
}

// ============ CORREÇÃO DA DATA DO AGENDAMENTO ============

// MODIFICAÇÃO: Função corrigida para salvar agendamento com a data correta
// CORREÇÃO: Função corrigida para salvar agendamento
async function salvarAgendamentoCorrigido(ticketId, dataInput, responsavel, observacoes) {
    console.log('Salvando agendamento com data:', dataInput);
    
    // Validar data
    const validacao = validarDataAgendamento(dataInput);
    if (!validacao.valido) {
        showPushNotification({
            title: 'Data Inválida',
            message: validacao.mensagem,
            type: 'error',
            duration: 4000
        });
        return false;
    }
    
    // CORREÇÃO: Converter a data do input para os formatos corretos
    let dataAgendamentoMySQL;
    let dataAgendamentoExibicao;
    
    try {
        if (dataInput) {
            // Criar objeto Date a partir do input (formato: YYYY-MM-DDTHH:MM)
            const dataObj = new Date(dataInput);
            
            if (isNaN(dataObj.getTime())) {
                throw new Error('Data inválida');
            }
            
            // CORREÇÃO: Usar a data EXATA do input, não a atual
            dataAgendamentoMySQL = formatarDataParaMySQL(dataObj);
            dataAgendamentoExibicao = formatarDataParaExibicao(dataObj);
            
            console.log('Data convertida - MySQL:', dataAgendamentoMySQL);
            console.log('Data convertida - Exibição:', dataAgendamentoExibicao);
        } else {
            throw new Error('Data não informada');
        }
    } catch (error) {
        console.error('Erro ao processar data do agendamento:', error);
        showPushNotification({
            title: 'Erro',
            message: 'Data do agendamento inválida. Verifique o formato.',
            type: 'error',
            duration: 4000
        });
        return false;
    }
    
    // Verificar se já existe agendamento para este ticket
    const agendamentoExistente = verificarAgendamentoExistente(ticketId);
    
    if (agendamentoExistente) {
        const confirmacao = confirm(`Já existe chamado agendado para esse cliente. Deseja substituí-lo?`);
        if (!confirmacao) {
            return false;
        }
        
        // Atualizar agendamento existente
        const ticket = tickets.find(t => t.id === ticketId);
        
        const novoAgendamento = {
            id: agendamentoExistente.id,
            ticketId: ticketId,
            cliente: ticket.cliente,
            data: dataAgendamentoMySQL, // CORREÇÃO: Usar a data convertida do input
            dataExibicao: dataAgendamentoExibicao,
            responsavel: responsavel,
            observacoes: observacoes,
            notificado: true,
            processado: false
        };
        
        return await atualizarAgendamentoExistente(agendamentoExistente, novoAgendamento);
    } else {
        // Criar novo agendamento
        const ticket = tickets.find(t => t.id === ticketId);
        
        if (!ticket) {
            showPushNotification({
                title: 'Erro',
                message: 'Chamado não encontrado.',
                type: 'error',
                duration: 3000
            });
            return false;
        }
        
        const newId = gerarId();
        
        const novoAgendamento = {
            id: newId,
            ticketId: ticketId,
            cliente: ticket.cliente,
            data: dataAgendamentoMySQL, // CORREÇÃO: Usar a data convertida do input
            dataExibicao: dataAgendamentoExibicao,
            responsavel: responsavel,
            observacoes: observacoes,
            notificado: false,
            processado: false
        };
        
        console.log('Novo agendamento a ser salvo:', novoAgendamento);
        
        const success = await dbManager.saveSchedule(novoAgendamento);
        return success;
    }
}

// CORREÇÃO: Função para debug de datas
function debugDatas(dataInput) {
    console.log('=== DEBUG DE DATAS ===');
    console.log('Input original:', dataInput);
    console.log('Tipo do input:', typeof dataInput);
    
    const dataObj = new Date(dataInput);
    console.log('Objeto Date criado:', dataObj);
    console.log('Timestamp:', dataObj.getTime());
    console.log('É data válida?', !isNaN(dataObj.getTime()));
    
    const mysqlFormat = formatarDataParaMySQL(dataObj);
    const exibicaoFormat = formatarDataParaExibicao(dataObj);
    
    console.log('Formato MySQL:', mysqlFormat);
    console.log('Formato Exibição:', exibicaoFormat);
    console.log('=== FIM DEBUG ===');
}
// ============ ATUALIZAR O EVENT LISTENER DO BOTÃO SALVAR ============

document.getElementById('save-schedule').addEventListener('click', async function() {
    const form = document.getElementById('schedule-form');
    
    if (!form.checkValidity()) {
        form.reportValidity();
        return;
    }
    
    const ticketId = document.getElementById('schedule-ticket').value;
    const dataInput = document.getElementById('schedule-date').value;
    const responsavel = document.getElementById('schedule-responsible').value;
    const observacoes = document.getElementById('schedule-notes').value;
    
    if (!ticketId) {
        showPushNotification({
            title: 'Erro',
            message: 'Por favor, selecione um chamado.',
            type: 'error',
            duration: 3000
        });
        return;
    }
    
    // CORREÇÃO: Verificar se o ticket selecionado está finalizado
    const ticketSelecionado = tickets.find(t => t.id === ticketId);
    if (ticketSelecionado && ticketSelecionado.status === 'Finalizado') {
        const confirmacao = confirm(
            'ATENÇÃO: O chamado selecionado está com status FINALIZADO.\n\n' +
            'Deseja realmente agendar um chamado finalizado?'
        );
        
        if (!confirmacao) {
            return;
        }
    }
    
    if (!dataInput) {
        showPushNotification({
            title: 'Erro',
            message: 'Por favor, informe a data do agendamento.',
            type: 'error',
            duration: 3000
        });
        return;
    }
    
    // CORREÇÃO: Debug para verificar a data
    debugDatas(dataInput);
    
    try {
        // Mostrar loading
        const button = this;
        const originalText = button.innerHTML;
        button.innerHTML = '<i class="fas fa-spinner fa-spin"></i><span class="btn-text">Salvando...</span>';
        button.disabled = true;

        // CORREÇÃO: Usar a função corrigida
        const success = await salvarAgendamentoCorrigido(ticketId, dataInput, responsavel, observacoes);
        
        if (success) {
            // Recarregar agendamentos
            await dbManager.loadSchedules();
            
            // Fechar modal e limpar formulário
            document.getElementById('schedule-modal').classList.remove('active');
            form.reset();
            
            showPushNotification({
                title: 'Agendamento Salvo',
                message: `Agendamento salvo para ${formatarDataParaExibicao(new Date(dataInput))}`,
                type: 'success',
                duration: 3000
            });
            
            // Reiniciar verificação de agendamentos
            iniciarVerificacaoAgendamentos();
        } else {
            throw new Error('Falha ao salvar agendamento');
        }
        
    } catch (error) {
        console.error('Erro ao salvar agendamento:', error);
        showPushNotification({
            title: 'Erro',
            message: 'Não foi possível salvar o agendamento: ' + error.message,
            type: 'error',
            duration: 5000
        });
    } finally {
        // Restaurar botão
        const button = document.getElementById('save-schedule');
        button.innerHTML = '<i class="fas fa-save"></i><span class="btn-text">Salvar</span>';
        button.disabled = false;
    }
});

// ============ MELHORIA NA RENDERIZAÇÃO DA TABELA ============

// MODIFICAÇÃO: Atualizar a renderização da tabela para mostrar a data correta
function renderSchedulesTable() {
    const tbody = document.getElementById('schedules-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (schedules.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="placeholder-text">Nenhum agendamento encontrado</td>
            </tr>
        `;
        return;
    }
    
    // Filtrar agendamentos únicos por ticketId (evitar duplicatas)
    const agendamentosUnicos = [];
    const ticketsAgendados = new Set();
    
    schedules.forEach(schedule => {
        if (!ticketsAgendados.has(schedule.ticketId)) {
            ticketsAgendados.add(schedule.ticketId);
            agendamentosUnicos.push(schedule);
        } else {
            console.warn(`Agendamento duplicado removido para ticket: ${schedule.ticketId}`);
            // Remover agendamento duplicado do banco
            dbManager.deleteSchedule(schedule.id);
        }
    });
    
    // Ordenar agendamentos por data
    const schedulesOrdenados = agendamentosUnicos.sort((a, b) => new Date(a.data) - new Date(b.data));
    
    schedulesOrdenados.forEach(schedule => {
        const tr = document.createElement('tr');
        const ticket = tickets.find(t => t.id === schedule.ticketId);
        
        if (ticket) {
            // CORREÇÃO: Garantir que a data exibida seja a do agendamento
            const dataExibicao = schedule.dataExibicao || formatarDataParaExibicao(schedule.data);
            
            // CORREÇÃO: Adicionar indicador visual se o ticket está finalizado
            const isFinalizado = ticket.status === 'Finalizado';
            const statusIndicator = isFinalizado ? 
                '<span class="status-badge status-finished" style="margin-left: 8px; font-size: 10px;">FINALIZADO</span>' : 
                '';
            
            tr.innerHTML = `
                <td>
                    <a href="${ticket.url}" target="_blank">${ticket.numeroChamado}</a>
                    ${statusIndicator}
                </td>
                <td>${schedule.cliente}</td>
                <td>${dataExibicao}</td>
                <td>${schedule.responsavel}</td>
                <td>${schedule.observacoes || '-'}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn btn-secondary btn-sm edit-schedule" data-id="${schedule.id}">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-danger btn-sm delete-schedule" data-id="${schedule.id}">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            `;
            
            // CORREÇÃO: Adicionar estilo visual para agendamentos de tickets finalizados
            if (isFinalizado) {
                tr.style.opacity = '0.7';
                tr.style.backgroundColor = '#f8f9fa';
            }
            
            tbody.appendChild(tr);
        }
    });
    
    // Adicionar eventos aos botões
    document.querySelectorAll('.edit-schedule').forEach(btn => {
        btn.addEventListener('click', function() {
            const scheduleId = this.getAttribute('data-id');
            abrirModalEdicaoAgendamento(scheduleId);
        });
    });
    
    document.querySelectorAll('.delete-schedule').forEach(btn => {
        btn.addEventListener('click', async function() {
            const scheduleId = this.getAttribute('data-id');
            const schedule = schedules.find(s => s.id === scheduleId);
            const ticket = schedule ? tickets.find(t => t.id === schedule.ticketId) : null;
            
            let mensagemConfirmacao = 'Tem certeza que deseja excluir este agendamento?';
            if (ticket && ticket.status === 'Finalizado') {
                mensagemConfirmacao = 'ATENÇÃO: Este agendamento está vinculado a um chamado FINALIZADO. Tem certeza que deseja excluí-lo?';
            }
            
            if (confirm(mensagemConfirmacao)) {
                try {
                    const success = await dbManager.deleteSchedule(scheduleId);
                    
                    if (success) {
                        await dbManager.loadSchedules();
                        showPushNotification({
                            title: 'Agendamento Excluído',
                            message: 'Agendamento excluído com sucesso!',
                            type: 'success',
                            duration: 3000
                        });
                    }
                } catch (error) {
                    console.error('Erro ao excluir agendamento:', error);
                    showPushNotification({
                        title: 'Erro',
                        message: 'Não foi possível excluir o agendamento.',
                        type: 'error',
                        duration: 5000
                    });
                }
            }
        });
    });
}
// ============ FUNÇÃO PARA LIMPAR AGENDAMENTOS DUPLICADOS ============

// Adicione esta função para limpar agendamentos duplicados existentes
async function limparAgendamentosDuplicados() {
    try {
        const ticketsAgendados = new Set();
        const agendamentosParaManter = [];
        const agendamentosParaExcluir = [];
        
        // Identificar duplicatas
        schedules.forEach(schedule => {
            if (!ticketsAgendados.has(schedule.ticketId)) {
                ticketsAgendados.add(schedule.ticketId);
                agendamentosParaManter.push(schedule);
            } else {
                agendamentosParaExcluir.push(schedule);
            }
        });
        
        // Excluir agendamentos duplicados
        for (const schedule of agendamentosParaExcluir) {
            await dbManager.deleteSchedule(schedule.id);
            console.log(`Agendamento duplicado excluído: ${schedule.id}`);
        }
        
        if (agendamentosParaExcluir.length > 0) {
            showPushNotification({
                title: 'Limpeza Concluída',
                message: `${agendamentosParaExcluir.length} agendamento(s) duplicado(s) removido(s).`,
                type: 'info',
                duration: 4000
            });
            
            // Recarregar agendamentos
            await dbManager.loadSchedules();
        }
        
        return agendamentosParaExcluir.length;
    } catch (error) {
        console.error('Erro ao limpar agendamentos duplicados:', error);
        return 0;
    }
}

// ============ INICIALIZAÇÃO CORRIGIDA ============

document.addEventListener('DOMContentLoaded', function() {
    console.log('Inicializando sistema completo...');
    
    // Inicializar funcionalidades específicas de cada página
    initializeReportsPage();

    // Forçar carregamento inicial
    setTimeout(async () => {
        try {
            await dbManager.loadTickets();
            await dbManager.loadSchedules();
            await loadDashboardStatusSettings();
            
            // Executar migração de status
            await migrarStatusExistente();
            
            // Iniciar verificações automáticas
            iniciarVerificacaoAgendamentos();
            verificarChamadosAguardandoCliente();
            
            // CORREÇÃO: Ordem correta de inicialização
            updateDashboard();
            renderTicketsTable();
            renderRecentTickets();
            renderSchedulesTable();
            renderStatusList();
            updateStatusSelects();
            aplicarCoresNosSelectsStatus();
            
            // CORREÇÃO: Inicializar event listeners do dashboard
            inicializarEventListenersDashboard();
            
            console.log('Sistema inicializado com sucesso');
            
        } catch (error) {
            console.error('Erro na inicialização:', error);
        }
    }, 1000);
});

// ============ SISTEMA DE FILTRO DE CHAMADOS ============

// Variáveis para controle do filtro
let filtroAtivo = false;
let filtrosAplicados = {
    status: '',
    prioridade: '',
    cliente: '',
    dataInicio: '',
    dataFim: '',
    numeroChamado: '' // Nova propriedade
};


// Na função aplicarFiltros(), adicione a captura do valor do novo campo
function aplicarFiltros() {
    const status = document.getElementById('filtro-status').value;
    const prioridade = document.getElementById('filtro-prioridade').value;
    const cliente = document.getElementById('filtro-cliente').value;
    const dataInicio = document.getElementById('filtro-data-inicio').value;
    const dataFim = document.getElementById('filtro-data-fim').value;
    const numeroChamado = document.getElementById('filtro-numero-chamado').value; // Novo campo
    
    // Salvar filtros
    filtrosAplicados = {
        status,
        prioridade,
        cliente,
        dataInicio,
        dataFim,
        numeroChamado // Novo campo
    };
    
    filtroAtivo = status || prioridade || cliente || dataInicio || dataFim || numeroChamado;
    
    // Aplicar filtros na tabela
    filtrarTickets();
    
    // Fechar modal
    document.getElementById('filtro-modal').classList.remove('active');
    
    // Mostrar feedback
    showPushNotification({
        title: 'Filtros Aplicados',
        message: 'Os filtros foram aplicados com sucesso!',
        type: 'success',
        duration: 3000
    });
}

// Na função abrirModalFiltro(), adicione o preenchimento do novo campo
function abrirModalFiltro() {
    // Preencher os selects com os valores atuais
    document.getElementById('filtro-status').value = filtrosAplicados.status;
    document.getElementById('filtro-prioridade').value = filtrosAplicados.prioridade;
    document.getElementById('filtro-cliente').value = filtrosAplicados.cliente;
    document.getElementById('filtro-data-inicio').value = filtrosAplicados.dataInicio;
    document.getElementById('filtro-data-fim').value = filtrosAplicados.dataFim;
    document.getElementById('filtro-numero-chamado').value = filtrosAplicados.numeroChamado; // Novo campo
    
    // Mostrar modal de filtro
    document.getElementById('filtro-modal').classList.add('active');
}

// Na função limparFiltros(), adicione a limpeza do novo campo
function limparFiltros() {
    // Limpar filtros
    filtrosAplicados = {
        status: '',
        prioridade: '',
        cliente: '',
        dataInicio: '',
        dataFim: '',
        numeroChamado: ''
    };
    
    filtroAtivo = false;
    
    // Limpar inputs do modal
    document.getElementById('filtro-status').value = '';
    document.getElementById('filtro-prioridade').value = '';
    document.getElementById('filtro-cliente').value = '';
    document.getElementById('filtro-data-inicio').value = '';
    document.getElementById('filtro-data-fim').value = '';
    document.getElementById('filtro-numero-chamado').value = '';
    
    // CORREÇÃO: Recarregar tabela SEM chamados finalizados
    renderTicketsTable();
    
    // Fechar modal
    document.getElementById('filtro-modal').classList.remove('active');
    
    }


// Na função filtrarTickets(), adicione a lógica de filtro por número do chamado
function filtrarTickets() {
    // CORREÇÃO: Incluir chamados finalizados apenas quando o filtro for especificamente por "Finalizado"
    let ticketsParaFiltrar = tickets;

    // Se não há filtro de status ou o filtro não é "Finalizado", excluir finalizados
    if (!filtrosAplicados.status || filtrosAplicados.status !== 'Finalizado') {
        ticketsParaFiltrar = tickets.filter(ticket => ticket.status !== 'Finalizado');
    }

    // Aplicar os demais filtros
    const ticketsFiltrados = ticketsParaFiltrar.filter(ticket => {
        // Filtro por status (já tratado acima, mas mantemos para outros status)
        if (filtrosAplicados.status && filtrosAplicados.status !== 'Finalizado' && ticket.status !== filtrosAplicados.status) {
            return false;
        }

        // Filtro por prioridade
        if (filtrosAplicados.prioridade && ticket.prioridade !== filtrosAplicados.prioridade) {
            return false;
        }

        // Filtro por cliente
        if (filtrosAplicados.cliente) {
            const clienteLower = filtrosAplicados.cliente.toLowerCase();
            const ticketClienteLower = (ticket.cliente || '').toLowerCase();
            if (!ticketClienteLower.includes(clienteLower)) {
                return false;
            }
        }

        // Filtro por número do chamado
        if (filtrosAplicados.numeroChamado) {
            const numeroChamadoLower = filtrosAplicados.numeroChamado.toLowerCase();
            const ticketNumeroChamadoLower = (ticket.numeroChamado || '').toLowerCase();
            if (!ticketNumeroChamadoLower.includes(numeroChamadoLower)) {
                return false;
            }
        }

        // Filtro por data
        if (filtrosAplicados.dataInicio || filtrosAplicados.dataFim) {
            let dataTicket;

            try {
                // Tentar converter a data do ticket
                if (ticket.dataRegistroExibicao) {
                    // Formato DD/MM/AAAA HH:MM:SS
                    const [dataPart, tempoPart] = ticket.dataRegistroExibicao.split(' ');
                    const [dia, mes, ano] = dataPart.split('/');
                    const [hora, minuto, segundo] = (tempoPart || '00:00:00').split(':');
                    dataTicket = new Date(ano, mes - 1, dia, hora || 0, minuto || 0, segundo || 0);
                } else if (ticket.dataRegistro) {
                    // Tentar formato MySQL ou outro
                    dataTicket = new Date(ticket.dataRegistro);
                } else {
                    dataTicket = new Date(ticket.data || ticket.createdAt || new Date());
                }

                if (isNaN(dataTicket.getTime())) {
                    console.warn('Data inválida do ticket:', ticket.dataRegistroExibicao || ticket.dataRegistro);
                    return true; // Incluir se não conseguiu converter a data
                }

                // Filtro data início
                if (filtrosAplicados.dataInicio) {
                    const dataInicio = new Date(filtrosAplicados.dataInicio + 'T00:00:00');
                    if (dataTicket < dataInicio) {
                        return false;
                    }
                }

                // Filtro data fim
                if (filtrosAplicados.dataFim) {
                    const dataFim = new Date(filtrosAplicados.dataFim + 'T23:59:59');
                    if (dataTicket > dataFim) {
                        return false;
                    }
                }

            } catch (error) {
                console.warn('Erro ao filtrar por data:', error);
                // Em caso de erro, incluir o ticket
                return true;
            }
        }

        return true;
    });

    // Renderizar tabela com tickets filtrados
    renderTicketsTableFiltrada(ticketsFiltrados);
}



// Função para renderizar a tabela com tickets filtrados
function renderTicketsTableFiltrada(ticketsFiltrados) {
    const tbody = document.getElementById('tickets-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    if (ticketsFiltrados.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="placeholder-text">
                    ${filtroAtivo ? 'Nenhum chamado encontrado com os filtros aplicados' : 'Nenhum chamado encontrado'}
                </td>
            </tr>
        `;
        return;
    }
    
    ticketsFiltrados.forEach(ticket => {
        const tr = document.createElement('tr');
        
        let priorityClass = '';
        if (ticket.prioridade === 'Alta') priorityClass = 'priority-high';
        else if (ticket.prioridade === 'Média') priorityClass = 'priority-medium';
        else if (ticket.prioridade === 'Baixa') priorityClass = 'priority-low';
        
        let statusClass = '';
        if (ticket.status === 'Aguardando Cliente') statusClass = 'status-open';
        else if (ticket.status === 'Finalizado') statusClass = 'status-finished';
        else if (ticket.status === 'Retomar Atendimento') statusClass = 'status-pending';
        else if (ticket.status === 'Em Analise') statusClass = 'status-progress';
        else statusClass = 'status-open';
        
        const dataExibicao = ticket.dataRegistroExibicao || 
                           (ticket.dataRegistro ? formatarDataParaExibicao(ticket.dataRegistro) : 
                           formatarDataParaExibicao(new Date()));
        
        tr.innerHTML = `
            <td><a href="${ticket.url}" target="_blank">${ticket.numeroChamado}</a></td>
            <td>${ticket.cliente}</td>
            <td class="${priorityClass}">${ticket.prioridade}</td>
            <td><span class="status-badge ${statusClass}">${ticket.status}</span></td>
            <td>${dataExibicao}</td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-secondary btn-sm edit-ticket" data-id="${ticket.id}">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-warning btn-sm history-ticket" data-id="${ticket.id}">
                        <i class="fas fa-history"></i>
                    </button>
                    <button class="btn btn-danger btn-sm delete-ticket" data-id="${ticket.id}">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        `;
        
        tbody.appendChild(tr);
    });
    
    // Atualizar eventos dos botões
    atualizarEventosBotoesTickets();
    
    // Atualizar contador de resultados
    atualizarContadorFiltros(ticketsFiltrados.length);
}

function atualizarContadorFiltros(quantidade) {
    let contadorElement = document.getElementById('filtro-contador');
    
    if (!contadorElement) {
        const cardHeader = document.querySelector('#chamados-page .card-header');
        if (cardHeader) {
            contadorElement = document.createElement('div');
            contadorElement.id = 'filtro-contador';
            contadorElement.style.marginLeft = 'auto';
            contadorElement.style.marginRight = '15px';
            contadorElement.style.fontSize = '14px';
            contadorElement.style.color = '#64748b';
            cardHeader.insertBefore(contadorElement, cardHeader.querySelector('.header-actions'));
        }
    }
    
    if (contadorElement) {
        const totalAtivos = tickets.filter(ticket => ticket.status !== 'Finalizado').length;
        const totalFinalizados = tickets.filter(ticket => ticket.status === 'Finalizado').length;
        
        if (filtroAtivo) {
            contadorElement.innerHTML = `
                <span style="color: #3b82f6;">
                    <i class="fas fa-filter"></i>
                    ${quantidade} de ${totalAtivos} chamados ativos
                </span>
                <br>
                <small style="color: #10b981;">
                    <i class="fas fa-check-circle"></i>
                    ${totalFinalizados} chamados finalizados
                </small>
            `;
        } else {
            contadorElement.innerHTML = `
                <span>Ativos: ${totalAtivos} | </span>
                <span style="color: #10b981;">Finalizados: ${totalFinalizados}</span>
            `;
        }
    }
}
// Função para obter lista única de clientes
function obterClientesUnicos() {
    const clientes = tickets.map(ticket => ticket.cliente).filter(Boolean);
    return [...new Set(clientes)].sort();
}


// ============ EVENT LISTENERS DO FILTRO ============

// Event listener para o botão de filtrar
document.getElementById('filter-tickets').addEventListener('click', abrirModalFiltro);

// Event listeners do modal de filtro
document.getElementById('aplicar-filtros').addEventListener('click', aplicarFiltros);
document.getElementById('limpar-filtros').addEventListener('click', limparFiltros);

// Fechar modal de filtro com ESC
document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
        document.getElementById('filtro-modal').classList.remove('active');
    }
});

// Atualizar contador quando a página de chamados for carregada
function initializeChamadosPage() {
    if (document.getElementById('chamados-page').classList.contains('active')) {
        setTimeout(() => {
            const quantidade = filtroAtivo ? 
                tickets.filter(ticket => filtrarTicket(ticket)).length : 
                tickets.length;
            atualizarContadorFiltros(quantidade);

        }, 100);
    }
}

// Adicionar event listener para detectar quando tickets são atualizados
window.addEventListener('ticketsUpdated', function() {
    console.log('Tickets atualizados - recarregando interfaces');
    
    // Atualizar todas as interfaces que dependem dos tickets
    if (document.getElementById('chamados-page').classList.contains('active')) {
        renderTicketsTable();
    }
    
    if (document.getElementById('chamados-finalizados-page').classList.contains('active')) {
        renderFinishedTicketsTable();
    }
    
    updateDashboard();
});

// Modificar a função navigateToPage para inicializar o contador
const originalNavigateToPage = navigateToPage;
navigateToPage = function(pageId) {
    originalNavigateToPage(pageId);
    
    if (pageId === 'dashboard') {
        // Remover filtro ativo ao navegar para o dashboard
        setTimeout(() => {
            if (filtroStatusAtivo) {
                removerFiltroStatusDashboard();
            }
        }, 100);
    }
};
// Função auxiliar para filtrar um ticket individual
function filtrarTicket(ticket) {
    if (filtrosAplicados.status && ticket.status !== filtrosAplicados.status) {
        return false;
    }
    
    if (filtrosAplicados.prioridade && ticket.prioridade !== filtrosAplicados.prioridade) {
        return false;
    }
    
    if (filtrosAplicados.cliente) {
        const clienteLower = filtrosAplicados.cliente.toLowerCase();
        const ticketClienteLower = (ticket.cliente || '').toLowerCase();
        if (!ticketClienteLower.includes(clienteLower)) {
            return false;
        }
    }
    
    return true;
}

// Função para atualizar eventos dos botões (reutilizada)
function atualizarEventosBotoesTickets() {
    document.querySelectorAll('.edit-ticket').forEach(btn => {
        btn.addEventListener('click', function() {
            const ticketId = this.getAttribute('data-id');
            abrirModalEdicao(ticketId);
        });
    });
    
    document.querySelectorAll('.history-ticket').forEach(btn => {
        btn.addEventListener('click', function() {
            const ticketId = this.getAttribute('data-id');
            const ticket = tickets.find(t => t.id === ticketId);
            
            if (ticket) {
                let historyHTML = '<h4>Histórico de Status</h4>';
                
                if (ticket.historicoStatus && ticket.historicoStatus.length > 0) {
                    ticket.historicoStatus.forEach(item => {
                        historyHTML += `
                            <div class="history-item">
                                <div class="history-status">${item.status}</div>
                                <div class="history-date">${item.dataExibicao || item.data}</div>
                            </div>
                        `;
                    });
                } else {
                    historyHTML += '<p>Nenhum histórico disponível</p>';
                }
                
                document.getElementById('history-content').innerHTML = historyHTML;
                document.getElementById('history-modal').classList.add('active');
            }
        });
    });
    
    document.querySelectorAll('.delete-ticket').forEach(btn => {
        btn.addEventListener('click', async function() {
            const ticketId = this.getAttribute('data-id');
            
            if (confirm('Tem certeza que deseja excluir este chamado?')) {
                try {
                    const success = await dbManager.deleteTicket(ticketId);
                    
                    if (success) {
                        await dbManager.loadTickets();
                        showPushNotification({
                            title: 'Chamado Excluído',
                            message: 'Chamado excluído com sucesso!',
                            type: 'success',
                            duration: 3000
                        });
                    } else {
                        throw new Error('Falha ao excluir do banco');
                    }
                } catch (error) {
                    console.error('Erro ao excluir chamado:', error);
                    showPushNotification({
                        title: 'Erro',
                        message: 'Não foi possível excluir o chamado do banco de dados.',
                        type: 'error',
                        duration: 5000
                    });
                }
            }
        });
    });
}

console.log('Sistema de filtro carregado com sucesso!');

function renderFinishedTicketsTable() {
    const tbody = document.getElementById('finished-tickets-table-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    // Filtrar apenas tickets finalizados
    const finishedTickets = tickets.filter(ticket => ticket.status === 'Finalizado');
    
    console.log('Chamados finalizados encontrados:', finishedTickets.length);
    
    if (finishedTickets.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="8" class="placeholder-text">Nenhum chamado finalizado encontrado</td>
            </tr>
        `;
        return;
    }
    
    finishedTickets.forEach(ticket => {
        const tr = document.createElement('tr');
        tr.setAttribute('data-ticket-id', ticket.id);
        
        let priorityClass = '';
        if (ticket.prioridade === 'Alta') priorityClass = 'priority-high';
        else if (ticket.prioridade === 'Média') priorityClass = 'priority-medium';
        else if (ticket.prioridade === 'Baixa') priorityClass = 'priority-low';
        
        // Aplicar cor dinâmica ao badge de status
        const corFundo = getStatusColor(ticket.status);
        const corTexto = getContrastColor(corFundo);
        
        // Encontrar data de finalização no histórico
        let dataFinalizacao = 'N/A';
        if (ticket.historicoStatus && Array.isArray(ticket.historicoStatus)) {
            const finalizadoEntries = ticket.historicoStatus
                .filter(entry => entry.status === 'Finalizado')
                .sort((a, b) => new Date(b.data) - new Date(a.data))[0];
            
            if (finalizadoEntries) {
                dataFinalizacao = finalizadoEntries.dataExibicao || finalizadoEntries.data;
            }
        }
        
        const dataExibicao = ticket.dataRegistroExibicao || 
                           (ticket.dataRegistro ? formatarDataParaExibicao(ticket.dataRegistro) : 
                           formatarDataParaExibicao(new Date()));
        
        const hasObservacoes = ticket.observacoesFinalizado && ticket.observacoesFinalizado.trim() !== '';
        const observacoesText = ticket.observacoesFinalizado || 'Nenhuma observação registrada';
        
        // Determinar ícone baseado no tema
        const isDarkTheme = document.body.classList.contains('dark-theme');
        const eyeIcon = hasObservacoes ? 
            (isDarkTheme ? 'fa-eye' : 'fa-eye') : 
            (isDarkTheme ? 'fa-eye-slash' : 'fa-eye-slash');
        
        const eyeTitle = hasObservacoes ? 
            'Mostrar/ocultar observações' : 
            'Sem observações para mostrar';
        
        const observacoesId = `observacoes-${ticket.id}`;
        
        // Adicionar classes CSS para tema
        const buttonClasses = ['btn', 'btn-sm', 'toggle-observacoes'];
        if (hasObservacoes) buttonClasses.push('has-observations');
        if (isDarkTheme) buttonClasses.push('dark-theme');
        
        // HTML do botão
        const buttonHTML = `
            <button class="${buttonClasses.join(' ')}" 
                    data-ticket-id="${ticket.id}" 
                    data-observacoes-id="${observacoesId}"
                    title="${eyeTitle}"
                    ${!hasObservacoes ? 'disabled' : ''}>
                <i class="fas ${eyeIcon}"></i>
            </button>
        `;
        
              
   // Na função renderFinishedTicketsTable(), ajuste a célula de observações:
tr.innerHTML = `
    <td><a href="${ticket.url}" target="_blank">${ticket.numeroChamado}</a></td>
    <td>${ticket.cliente}</td>
    <td class="${priorityClass}">${ticket.prioridade}</td>
    <td>
        <span class="status-badge" style="background-color: ${corFundo}; color: ${corTexto};">
            ${ticket.status}
        </span>
    </td>
    <td>${dataExibicao}</td>
    <td>${dataFinalizacao}</td>
    <td>
        <!-- DIV de observações agora fora da tabela de ações -->
        <div id="${observacoesId}" class="observacoes-content" style="display: none;">
            ${observacoesText}
        </div>
    </td>
    <td>
        <div class="action-buttons">
            ${buttonHTML}
            <button class="btn btn-secondary btn-sm edit-ticket" data-id="${ticket.id}" title="Editar chamado">
                <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-warning btn-sm history-ticket" data-id="${ticket.id}" title="Histórico">
                <i class="fas fa-history"></i>
            </button>
            <button class="btn btn-danger btn-sm delete-ticket" data-id="${ticket.id}" title="Excluir">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    </td>
`;

        
        tbody.appendChild(tr);
    });
    
    // Adicionar event listeners para os botões de toggle de observações
    document.querySelectorAll('#finished-tickets-table-body .toggle-observacoes').forEach(btn => {
        btn.addEventListener('click', function() {
            const ticketId = this.getAttribute('data-ticket-id');
            const observacoesId = this.getAttribute('data-observacoes-id');
            const observacoesElement = document.getElementById(observacoesId);
            const eyeIcon = this.querySelector('i');
            
            if (observacoesElement) {
                if (observacoesElement.style.display === 'none') {
                    // Mostrar observações
                    observacoesElement.style.display = 'block';
                    eyeIcon.classList.remove('fa-eye');
                    eyeIcon.classList.add('fa-eye-slash');
                    this.title = 'Ocultar observações';
                } else {
                    // Ocultar observações
                    observacoesElement.style.display = 'none';
                    eyeIcon.classList.remove('fa-eye-slash');
                    eyeIcon.classList.add('fa-eye');
                    this.title = 'Mostrar observações';
                }
            }
        });
    });

 // Atualizar estilos dos botões após renderizar
    setTimeout(() => {
        document.querySelectorAll('.toggle-observacoes').forEach(btn => {
            atualizarEstiloBotaoObservacoes(btn);
        });
    }, 100);


    
    // Event listeners para os outros botões...
    document.querySelectorAll('#finished-tickets-table-body .edit-ticket').forEach(btn => {
        btn.addEventListener('click', function() {
            const ticketId = this.getAttribute('data-id');
            abrirModalEdicao(ticketId);
        });
    });
    
    document.querySelectorAll('#finished-tickets-table-body .history-ticket').forEach(btn => {
        btn.addEventListener('click', function() {
            const ticketId = this.getAttribute('data-id');
            const ticket = tickets.find(t => t.id === ticketId);
            
            if (ticket) {
                let historyHTML = '<h4>Histórico de Status</h4>';
                
                if (ticket.historicoStatus && ticket.historicoStatus.length > 0) {
                    const historicoOrdenado = ticket.historicoStatus.sort((a, b) => 
                        new Date(b.data) - new Date(a.data)
                    );
                    
                    historicoOrdenado.forEach(item => {
                        historyHTML += `
                            <div class="history-item">
                                <div class="history-status">${item.status}</div>
                                <div class="history-date">${item.dataExibicao || item.data}</div>
                                ${item.observacao ? `<div class="history-notes">${item.observacao}</div>` : ''}
                            </div>
                        `;
                    });
                } else {
                    historyHTML += '<p>Nenhum histórico disponível</p>';
                }
                
                document.getElementById('history-content').innerHTML = historyHTML;
                document.getElementById('history-modal').classList.add('active');
            }
        });
    });
    
    document.querySelectorAll('#finished-tickets-table-body .delete-ticket').forEach(btn => {
        btn.addEventListener('click', async function() {
            const ticketId = this.getAttribute('data-id');
            
            if (confirm('Tem certeza que deseja excluir este chamado finalizado?')) {
                try {
                    const success = await dbManager.deleteTicket(ticketId);
                    
                    if (success) {
                        await dbManager.loadTickets();
                        renderFinishedTicketsTable();
                        updateDashboard();
                        
                        showPushNotification({
                            title: 'Chamado Excluído',
                            message: 'Chamado finalizado excluído com sucesso!',
                            type: 'success',
                            duration: 3000
                        });
                    }
                } catch (error) {
                    console.error('Erro ao excluir chamado:', error);
                    showPushNotification({
                        title: 'Erro',
                        message: 'Não foi possível excluir o chamado.',
                        type: 'error',
                        duration: 5000
                    });
                }
            }
        });
    });
}

// Função para exportar chamados finalizados
async function exportFinishedTickets() {
    const finishedTickets = tickets.filter(ticket => ticket.status === 'Finalizado');
    
    if (finishedTickets.length === 0) {
        showPushNotification({
            title: 'Atenção',
            message: 'Não há chamados finalizados para exportar.',
            type: 'warning',
            duration: 3000
        });
        return;
    }
    
    try {
        // Usar a função de exportação existente, passando apenas os chamados finalizados
        await exportToExcel(finishedTickets);
        
        showPushNotification({
            title: 'Exportação Concluída',
            message: `${finishedTickets.length} chamado(s) finalizado(s) exportado(s) com sucesso!`,
            type: 'success',
            duration: 3000
        });
    } catch (error) {
        console.error('Erro ao exportar chamados finalizados:', error);
        showPushNotification({
            title: 'Erro na Exportação',
            message: 'Não foi possível exportar os chamados finalizados.',
            type: 'error',
            duration: 5000
        });
    }
}
async function exportToExcel(ticketsToExport = tickets, fileName = 'chamados') {
    if (ticketsToExport.length === 0) {
        showPushNotification({
            title: 'Atenção',
            message: 'Não há chamados para exportar.',
            type: 'warning',
            duration: 3000
        });
        return;
    }

    try {
        // Verificar se estamos no Electron
        if (typeof ipcRenderer !== 'undefined' && ipcRenderer.invoke) {
            // No Electron - usar método nativo
            const result = await ipcRenderer.invoke('export-to-excel', ticketsToExport);

            if (result.success) {
                showPushNotification({
                    title: 'Exportação Concluída',
                    message: `${ticketsToExport.length} chamado(s) exportado(s) com sucesso!`,
                    type: 'success',
                    duration: 3000
                });
            } else {
                throw new Error(result.error);
            }
        } else {
            // No navegador - usar método web
            exportToExcelWeb(ticketsToExport, fileName);
        }
    } catch (error) {
        console.error('Erro ao exportar:', error);
        // Fallback para método web
        exportToExcelWeb(ticketsToExport, fileName);
    }
}

// ============ FUNÇÃO PARA EXTRAIR NÚMERO DA URL ============
function extrairNumeroChamadoDaURL(url) {
    if (!url) return '';
    
    try {
        // Padrão 1: Extrair do parâmetro "k=" na URL (ex: ?k=3201206)
        const kParamMatch = url.match(/[?&]k=(\d+)/);
        if (kParamMatch && kParamMatch[1]) {
            return kParamMatch[1];
        }
        
        // Padrão 2: Extrair números no final da URL (ex: .../atendimento/3201206)
        const finalNumberMatch = url.match(/(\d+)(?:\?|$)/);
        if (finalNumberMatch && finalNumberMatch[1]) {
            return finalNumberMatch[1];
        }
        
        // Padrão 3: Extrair qualquer sequência de 4+ dígitos na URL
        const anyNumberMatch = url.match(/\/(\d{4,})/);
        if (anyNumberMatch && anyNumberMatch[1]) {
            return anyNumberMatch[1];
        }
        
        return '';
    } catch (error) {
        console.error('Erro ao extrair número da URL:', error, url);
        return '';
    }
}
// ============ FUNÇÃO PARA ATUALIZAR NÚMERO DO CHAMADO AUTOMATICAMENTE ============
function atualizarNumeroChamadoDaURL() {
    const urlInput = document.getElementById('ticket-url');
    const numeroInput = document.getElementById('ticket-numero-chamado');
    
    if (!urlInput || !numeroInput) return;
    
    // Se o campo de número já tiver valor, não sobrescrever
    if (numeroInput.value && numeroInput.value.trim() !== '') {
        return;
    }
    
    const url = urlInput.value.trim();
    if (!url) return;
    
    const numeroChamado = extrairNumeroChamadoDaURL(url);
    if (numeroChamado) {
        numeroInput.value = numeroChamado;
        
        // Feedback visual
        showPushNotification({
            title: 'Número Extraído',
            message: `Número do chamado extraído da URL: ${numeroChamado}`,
            type: 'success',
            duration: 2000
        });
    }
}




// ============ CONFIGURAÇÕES DE STATUS DO DASHBOARD ============

let dashboardStatusSettings = {
  enabledStatuses: ["Aguardando Cliente", "Retomar Atendimento", "Em Atendimento", "Pré-Finalizado", "Finalizado"]
};

// ============ FUNÇÕES PARA GERENCIAR STATUS DO DASHBOARD ============

// Função para carregar configurações de status do dashboard
async function loadDashboardStatusSettings() {
  try {
    const result = await ipcRenderer.invoke('load-dashboard-status-settings');
    if (result.success && result.data.dashboardStatusSettings) {
      dashboardStatusSettings = result.data.dashboardStatusSettings;
    }
    renderStatusList(); // Atualiza a lista de status com os toggles
  } catch (error) {
    console.error('Erro ao carregar configurações do dashboard:', error);
  }
}

// Função para salvar configurações de status do dashboard
async function saveDashboardStatusSettings() {
  try {
    const result = await ipcRenderer.invoke('save-dashboard-status-settings', dashboardStatusSettings);
    return result.success;
  } catch (error) {
    console.error('Erro ao salvar configurações do dashboard:', error);
    return false;
  }
}

async function toggleDashboardStatus(status, isEnabled) {
    if (isEnabled) {
        // Adicionar status se não existir
        if (!dashboardStatusSettings.enabledStatuses.includes(status)) {
            dashboardStatusSettings.enabledStatuses.push(status);
        }
    } else {
        // Remover status
        dashboardStatusSettings.enabledStatuses = dashboardStatusSettings.enabledStatuses.filter(s => s !== status);
    }
    
    const success = await saveDashboardStatusSettings();
    if (success) {
        // Atualizar o botão visualmente
        const toggleBtn = document.querySelector(`.toggle-status-btn[data-status="${status}"]`);
        if (toggleBtn) {
            if (isEnabled) {
                toggleBtn.classList.remove('btn-secondary');
                toggleBtn.classList.add('btn-success');
                toggleBtn.innerHTML = '<i class="fas fa-power-off"></i><span>ON</span>';
            } else {
                toggleBtn.classList.remove('btn-success');
                toggleBtn.classList.add('btn-secondary');
                toggleBtn.innerHTML = '<i class="fas fa-power-off"></i><span>OFF</span>';
            }
        }
        
        // CORREÇÃO: Forçar atualização completa do dashboard
        updateDashboard();
        
        showPushNotification({
            title: 'Configuração Salva',
            message: `Status "${status}" ${isEnabled ? 'ativado' : 'desativado'} no dashboard`,
            type: 'success',
            duration: 3000
        });
    }
}

// Função para verificar se um status está ativo no dashboard
function isStatusEnabled(status) {
    return dashboardStatusSettings.enabledStatuses.includes(status);
}

// ============ CORREÇÃO DA EXCLUSÃO DE STATUS PERSONALIZADOS ============

// Modificar a função renderStatusList para corrigir a exclusão
function sanitizeId(str) {
    return str.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-_]/g, '').toLowerCase();
}

function renderStatusList() {
    const statusList = document.getElementById('status-list');
    if (!statusList) return;

    statusList.innerHTML = '';

    customStatuses.forEach(status => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';
        li.style.padding = '12px 0';
        li.style.borderBottom = '1px solid var(--border-primary)';

        const isEnabled = isStatusEnabled(status);
        const corAtual = getStatusColor(status);

        // cria um id único para o input (necessário se usar label[for] ou múltiplos inputs)
        const inputId = `color-${sanitizeId(status)}`;

        li.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px;">
                <div style="width: 16px; height: 16px; border-radius: 20px; background-color: ${corAtual}; border: 1px solid var(--border-primary);"></div>
                <span style="font-weight: 500;">${status}</span>
            </div>

            <div class="status-actions">
                <label class="color-button" title="Alterar cor do status">
                    <i class="fas fa-palette"></i>
                    <div class="color-preview" id="preview-${inputId}" style="background: ${corAtual};"></div>
                    <input id="${inputId}" type="color" value="${corAtual}" class="status-color-input" data-status="${status}">
                </label>

                <button class="btn btn-sm ${isEnabled ? 'btn-success' : 'btn-secondary'} toggle-status-btn" 
                        data-status="${status}" 
                        title="${isEnabled ? 'Remover do Card Dashboard' : 'Adicionar Card Dashboard'}">
                    <i class="fas fa-power-off"></i>
                    <span>${isEnabled ? 'ON' : 'OFF'}</span>
                </button>

              ${!["Aguardando Cliente", "Retomar Atendimento", "Em Analise", "Finalizado", "Em Atendimento", "Pré-Finalizado"].includes(status) ? 
    `<button class="btn btn-danger btn-sm delete-status-btn" 
            data-status="${status}" 
            title="Excluir este status personalizado">
        <i class="fas fa-trash"></i>
    </button>` : 
    `<button class="btn btn-danger btn-sm" disabled 
            style="opacity: 0.5; cursor: not-allowed; width: 32px; height: 30px;"
            title="Status básico do sistema não pode ser excluído">
        <i class="fas fa-trash"></i>
    </button>`
}
            </div>
        `;
        statusList.appendChild(li);
    });

    // Event listener para alterar cor (mantive sua lógica de salvar)
   document.querySelectorAll('.status-color-input').forEach(input => {
    input.addEventListener('change', async function() {
        const status = this.getAttribute('data-status');
        const novaCor = this.value;
        
        if (!systemSettings.statusColors) {
            systemSettings.statusColors = {};
        }
        
        systemSettings.statusColors[status] = novaCor;
        
        // Atualizar visualmente
        const li = this.closest('li');
        const colorIndicator = li.querySelector('div > div:first-child');
        if (colorIndicator) {
            colorIndicator.style.backgroundColor = novaCor;
        }
        
        const preview = li.querySelector(`#preview-${this.id}`);
        if (preview) {
            preview.style.backgroundColor = novaCor;
        }

        // SALVAR CONFIGURAÇÕES IMEDIATAMENTE
        const success = await dbManager.saveSettings();
        
        if (success) {
            // Atualizar toda a interface
            updateDashboard();
            renderTicketsTable();
            renderFinishedTicketsTable();
            aplicarCoresNosSelectsStatus();
            
            showPushNotification({
                title: 'Cor Alterada',
                message: `Cor do status "${status}" salva com sucesso!`,
                type: 'success',
                duration: 3000
            });
        } else {
            showPushNotification({
                title: 'Erro',
                message: 'Não foi possível salvar a cor do status.',
                type: 'error',
                duration: 3000
            });
        }
    });
});


    // CORREÇÃO: Event listener para os botões de toggle
    document.querySelectorAll('.toggle-status-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const status = this.getAttribute('data-status');
            const isCurrentlyEnabled = this.classList.contains('btn-success');
            const newState = !isCurrentlyEnabled;
            
            toggleDashboardStatus(status, newState);
        });
    });

    // CORREÇÃO: Event listener para os botões de exclusão
    document.querySelectorAll('.delete-status-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
            const statusToDelete = this.getAttribute('data-status');
            
            // Não permitir excluir status básicos
            const statusBasicos = ["Aguardando Cliente", "Retomar Atendimento", "Em Analise", "Finalizado"];
            if (statusBasicos.includes(statusToDelete)) {
                showPushNotification({
                    title: 'Ação não permitida',
                    message: 'Não é possível excluir status básicos do sistema.',
                    type: 'warning',
                    duration: 3000
                });
                return;
            }
            
            // CORREÇÃO: Verificar se existem tickets usando este status
            const ticketsComEsteStatus = tickets.filter(ticket => ticket.status === statusToDelete);
            if (ticketsComEsteStatus.length > 0) {
                showPushNotification({
                    title: 'Não é possível excluir',
                    message: `Existem ${ticketsComEsteStatus.length} chamado(s) usando este status. Altere o status desses chamados antes de excluir.`,
                    type: 'error',
                    duration: 5000
                });
                return;
            }
            
            if (confirm(`Tem certeza que deseja excluir o status "${statusToDelete}"?`)) {
                try {
                    // Remover da lista de status personalizados
                    customStatuses = customStatuses.filter(s => s !== statusToDelete);
                    
                    // Salvar a lista atualizada
                    const success = await dbManager.saveCustomStatuses(customStatuses);
                    
                    if (success) {
                        // Remover das configurações do dashboard
                        if (dashboardStatusSettings.enabledStatuses.includes(statusToDelete)) {
                            dashboardStatusSettings.enabledStatuses = dashboardStatusSettings.enabledStatuses.filter(s => s !== statusToDelete);
                            await saveDashboardStatusSettings();
                        }
                        
                        // Remover a cor das configurações
                        if (systemSettings.statusColors && systemSettings.statusColors[statusToDelete]) {
                            delete systemSettings.statusColors[statusToDelete];
                            await dbManager.saveSettings();
                        }
                        
                        // Recarregar todas as interfaces
                        renderStatusList();
                        updateStatusSelects();
                        updateDashboard();
                        
                        showPushNotification({
                            title: 'Status Excluído',
                            message: `Status "${statusToDelete}" excluído com sucesso!`,
                            type: 'success',
                            duration: 3000
                        });
                    } else {
                        throw new Error('Falha ao salvar no banco');
                    }
                } catch (error) {
                    console.error('Erro ao excluir status:', error);
                    // Reverter a exclusão em caso de erro
                    customStatuses.push(statusToDelete);
                    showPushNotification({
                        title: 'Erro',
                        message: 'Não foi possível excluir o status do banco de dados.',
                        type: 'error',
                        duration: 3000
                    });
                }
            }
        });
    });
}

// ============ ATUALIZAÇÃO DO DASHBOARD ============

// CORREÇÃO: Função melhorada para atualizar dashboard
function updateDashboard() {
    console.log('Atualizando dashboard...');
    
    const statsGrid = document.querySelector('.stats-grid');
    if (!statsGrid) return;

    // Atualizar o total de chamados
    const totalTickets = tickets.length;
    const totalTicketsElement = document.getElementById('total-tickets');
    if (totalTicketsElement) {
        totalTicketsElement.textContent = totalTickets;
    }

    // CORREÇÃO: Aplicar cor neutra ao card "Total de Chamados"
    const totalCard = document.getElementById('total-tickets')?.closest('.stat-card');
    if (totalCard) {
        const isDarkTheme = document.body.classList.contains('dark-theme');
        const backgroundColor = isDarkTheme ? '#ffffff' : '#000000';
        const textColor = isDarkTheme ? '#000000' : '#ffffff';
        
        totalCard.style.backgroundColor = backgroundColor;
        totalCard.style.color = textColor;
        totalCard.style.border = 'none';
        totalCard.removeAttribute('data-status');
        
        const statValueElement = totalCard.querySelector('.stat-value');
        const statLabelElement = totalCard.querySelector('.stat-label');
        if (statValueElement) statValueElement.style.color = textColor;
        if (statLabelElement) statLabelElement.style.color = textColor;
    }

    // CORREÇÃO: Atualizar cards principais com cores dinâmicas
    const statusCards = {
        'Aguardando Cliente': document.getElementById('open-tickets')?.closest('.stat-card'),
        'Retomar Atendimento': document.getElementById('pending-tickets')?.closest('.stat-card'),
        'Em Analise': document.getElementById('progress-tickets')?.closest('.stat-card'),
        'Finalizado': document.getElementById('finished-tickets')?.closest('.stat-card')
    };

    for (const [status, card] of Object.entries(statusCards)) {
        if (card) {
            const count = tickets.filter(t => t.status === status).length;
            const statValue = card.querySelector('.stat-value');
            if (statValue) statValue.textContent = count;
            
            // CORREÇÃO: Aplicar cor dinâmica apenas se o status estiver ativo
            if (isStatusEnabled(status)) {
                const corFundo = getStatusColor(status);
                const corTexto = getContrastColor(corFundo);
                
                card.style.backgroundColor = corFundo;
                card.style.color = corTexto;
                card.style.border = 'none';
                card.setAttribute('data-status', status);
                
                const statValueElement = card.querySelector('.stat-value');
                const statLabelElement = card.querySelector('.stat-label');
                if (statValueElement) statValueElement.style.color = corTexto;
                if (statLabelElement) statLabelElement.style.color = corTexto;
                
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        }
    }

    // CORREÇÃO: Adicionar cards dinâmicos para status personalizados
    addDynamicStatusCards(statsGrid);
    
    // CORREÇÃO: Atualizar gráficos
    updateCharts();
    
    // CORREÇÃO: Reaplicar event listeners após atualizar os cards
    setTimeout(() => {
        inicializarEventListenersDashboard();
        
        // CORREÇÃO: Se há filtro ativo, reaplicar após atualização
        if (filtroStatusAtivo) {
            console.log('Reaplicando filtro após updateDashboard:', filtroStatusAtivo);
            filtrarChamadosPorStatus(filtroStatusAtivo);
        } else {
            renderRecentTickets();
        }
    }, 100);
}


// CORREÇÃO: Função melhorada para adicionar cards dinâmicos
function addDynamicStatusCards(statsGrid) {
    // Status que já têm cards próprios (para não duplicar)
    const statusComCards = ["Aguardando Cliente", "Retomar Atendimento", "Em Analise", "Finalizado"];
    
    // Status personalizados ativos (excluindo os que já têm cards)
    const enabledStatuses = customStatuses.filter(status => 
        isStatusEnabled(status) && !statusComCards.includes(status)
    );

    // CORREÇÃO: Limpar apenas os cards dinâmicos anteriores
    const cardsDinamicos = statsGrid.querySelectorAll('.stat-card[data-status]:not([data-status="Aguardando Cliente"]):not([data-status="Retomar Atendimento"]):not([data-status="Em Analise"]):not([data-status="Finalizado"])');
    cardsDinamicos.forEach(card => card.remove());

    // Adicionar cards para status personalizados ativos
    enabledStatuses.forEach(status => {
        const count = tickets.filter(ticket => ticket.status === status).length;
        
        const card = document.createElement('div');
        card.className = 'stat-card clickable-card';
        card.setAttribute('data-status', status);
        
        const corFundo = getStatusColor(status);
        const corTexto = getContrastColor(corFundo);
        
        card.style.backgroundColor = corFundo;
        card.style.color = corTexto;
        card.style.border = `none`;
        card.style.boxShadow = 'var(--shadow)';
        
        card.innerHTML = `
            <div class="stat-value" style="color: ${corTexto} !important;">${count}</div>
            <div class="stat-label" style="color: ${corTexto} !important;">${status}</div>
        `;
        
        statsGrid.appendChild(card);
    });

    console.log('Cards dinâmicos adicionados:', enabledStatuses.length);
}

// ============ ATUALIZAÇÃO DOS GRÁFICOS ============

function updateStatusChart() {
    const ctx = document.getElementById('status-chart');
    if (!ctx) return;

    // Destruir gráfico anterior se existir
    if (statusChartInstance) {
        statusChartInstance.destroy();
    }

    const statusCount = {};
    
    // Contar apenas os status ativos
    const enabledStatuses = customStatuses.filter(status => isStatusEnabled(status));
    enabledStatuses.forEach(status => {
        statusCount[status] = tickets.filter(ticket => ticket.status === status).length;
    });

    const labels = Object.keys(statusCount);
    const data = Object.values(statusCount);

    // CORREÇÃO: Gerar cores dinâmicas baseadas nos status
    const backgroundColors = labels.map(status => getStatusColor(status));

    // Só criar o gráfico se houver dados
    if (labels.length > 0 && data.some(val => val > 0)) {
        statusChartInstance = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: backgroundColors,
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            usePointStyle: true,
                            padding: 20,
                            font: {
                                family: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif",
                                size: 12
                            }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const label = context.label || '';
                                const value = context.raw || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = Math.round((value / total) * 100);
                                return `${label}: ${value} (${percentage}%)`;
                            }
                        }
                    }
                },
                cutout: '60%',
                animation: {
                    animateScale: true,
                    animateRotate: true
                }
            }
        });
    }
}

// No final do seu código, certifique-se de que estes event listeners existem:
document.getElementById('gerar-relatorio-btn').addEventListener('click', gerarRelatorio);
document.getElementById('generate-report-pdf').addEventListener('click', generateReportPDF);

// Event listeners para atualizar relatório quando mudar as opções
document.getElementById('relatorio-tipo').addEventListener('change', gerarRelatorio);
document.getElementById('periodo').addEventListener('change', gerarRelatorio);

// CORREÇÃO: Função melhorada para alterar status
async function alterarStatusTicket(ticketId, novoStatus) {
    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket) return;

    const statusAnterior = ticket.status;
    ticket.status = novoStatus;

    // Inicializar observações se for finalizado
    if (novoStatus === 'Finalizado' && !ticket.observacoesFinalizado) {
        ticket.observacoesFinalizado = '';
    }

    // Atualizar histórico
    if (!ticket.historicoStatus) {
        ticket.historicoStatus = [];
    }
    ticket.historicoStatus.push({
        status: novoStatus,
        data: formatarDataParaMySQL(new Date()),
        dataExibicao: formatarDataParaExibicao(new Date()),
        observacao: `Status alterado de "${statusAnterior}" para "${novoStatus}"`
    });

    // Salvar no banco
    const success = await dbManager.saveTicket(ticket);
    if (success) {
        // CORREÇÃO: Recarregar os tickets do banco para garantir consistência
        await dbManager.loadTickets();
        
        showPushNotification({
            title: 'Status Atualizado',
            message: `Status alterado para "${novoStatus}"`,
            type: 'success',
            duration: 3000
        });

        // CORREÇÃO: Atualizar TODAS as interfaces relevantes
        updateDashboard();
        aplicarCoresNosSelectsStatus();
        
        // CORREÇÃO: Se estamos na página de dashboard e há filtro ativo, reaplicar o filtro
        if (document.getElementById('dashboard-page').classList.contains('active') && filtroStatusAtivo) {
            console.log('Reaplicando filtro após alteração de status:', filtroStatusAtivo);
            filtrarChamadosPorStatus(filtroStatusAtivo);
        }
        
        // CORREÇÃO: Se o status foi alterado para Finalizado, atualizar ambas as tabelas
        if (novoStatus === 'Finalizado') {
            renderTicketsTable(); // Remove da lista principal
            renderFinishedTicketsTable(); // Adiciona na lista de finalizados
        } else if (statusAnterior === 'Finalizado' && novoStatus !== 'Finalizado') {
            // Se estava finalizado e foi reaberto
            renderTicketsTable(); // Adiciona na lista principal
            renderFinishedTicketsTable(); // Remove da lista de finalizados
        } else {
            // Apenas atualizar a tabela atual
            if (document.getElementById('chamados-page').classList.contains('active')) {
                renderTicketsTable();
            } else if (document.getElementById('chamados-finalizados-page').classList.contains('active')) {
                renderFinishedTicketsTable();
            }
        }
        
    } else {
        showPushNotification({
            title: 'Erro',
            message: 'Não foi possível alterar o status',
            type: 'error',
            duration: 5000
        });
    }
}


// ============ MELHORIA NA FUNÇÃO DE CORES ============

function getStatusColor(status) {
    // Se existir cor salva, usar ela
    if (systemSettings.statusColors && systemSettings.statusColors[status]) {
        return systemSettings.statusColors[status];
    }
    
    // Cores padrão para status básicos
    const coresPadrao = {
        'Aguardando Cliente': '#ccc',
        'Retomar Atendimento': '#ccc',
        'Em Analise': '#ccc',
        'Finalizado': '#ccc'
    };
    
    const corPadrao = coresPadrao[status] || '#6b7280';
    
    // Salvar a cor padrão se não existir
    if (systemSettings.statusColors && !systemSettings.statusColors[status]) {
        systemSettings.statusColors[status] = corPadrao;
        // Salvar de forma assíncrona
        setTimeout(() => {
            dbManager.saveSettings();
        }, 1000);
    }
    
    return corPadrao;
}
function getContrastColor(hexcolor) {
    hexcolor = hexcolor.replace("#", "");
    const r = parseInt(hexcolor.substr(0, 2), 16);
    const g = parseInt(hexcolor.substr(2, 2), 16);
    const b = parseInt(hexcolor.substr(4, 2), 16);
    const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#ffffff';
}

   
// ============ SISTEMA DE CORES DINÂMICAS PARA STATUS ============

function aplicarCoresNosSelectsStatus() {
    document.querySelectorAll('.status-select').forEach(select => {
        // Aplicar cor ao select baseado no valor atual
        const statusAtual = select.value;
        const corFundo = getStatusColor(statusAtual);
        const corTexto = getContrastColor(corFundo);
        
        // CORREÇÃO: Estilo arredondado sem bordas
        select.style.backgroundColor = corFundo;
        select.style.color = corTexto;
        select.style.border = 'none'; // Remove borda
        select.style.borderRadius = '20px'; // Borda totalmente arredondada
        select.style.padding = '6px 12px';
        select.style.fontWeight = '500';
        select.style.cursor = 'pointer';
        select.style.outline = 'none';
        select.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        select.style.transition = 'all 0.3s ease';
        select.style.appearance = 'none'; // Remove estilo padrão do navegador
        select.style.backgroundImage = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='${encodeURIComponent(corTexto)}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;
        select.style.backgroundRepeat = 'no-repeat';
        select.style.backgroundPosition = 'right 12px center';
        select.style.backgroundSize = '12px';
        select.style.paddingRight = '32px'; // Espaço para a seta
        
        // Efeito hover
        select.addEventListener('mouseenter', function() {
            this.style.transform = 'translateY(-1px)';
            this.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
        });
        
        select.addEventListener('mouseleave', function() {
            this.style.transform = 'translateY(0)';
            this.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        });
        
        // Aplicar cores nas opções
        Array.from(select.options).forEach(option => {
            const optionStatus = option.value;
            const optionCorFundo = getStatusColor(optionStatus);
            const optionCorTexto = getContrastColor(optionCorFundo);
            
            option.style.backgroundColor = optionCorFundo;
            option.style.color = optionCorTexto;
            option.style.fontWeight = '500';
            option.style.padding = '8px 12px';
        });

        // Atualizar cor quando o select mudar
        select.addEventListener('change', function() {
            const novoStatus = this.value;
            const novaCorFundo = getStatusColor(novoStatus);
            const novaCorTexto = getContrastColor(novaCorFundo);
            
            this.style.backgroundColor = novaCorFundo;
            this.style.color = novaCorTexto;
            this.style.backgroundImage = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='${encodeURIComponent(novaCorTexto)}' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;
        });
    });
}

// ============ INICIALIZAR CORES PADRÃO ============
function inicializarCoresPadrao() {
    if (!systemSettings.statusColors || Object.keys(systemSettings.statusColors).length === 0) {
        systemSettings.statusColors = {
            "Aguardando Cliente": "#ffaf83",
            "Retomar Atendimento": "#ffbdbd", 
            "Em Atendimento": "#e0e7ff",
            "Pré-Finalizado": "#d1fae5",
            "Finalizado": "#d1fae5"
        };
        
        // Salvar as cores padrão
        dbManager.saveSettings();
    }
}

// Chame esta função após carregar as configurações


let filtroStatusAtivo = null;
let notificacaoAtual = null;

// CORREÇÃO: Adicionar event listeners aos cards do dashboard
function adicionarEventListenersCardsDashboard() {
    const statsGrid = document.querySelector('.stats-grid');
    if (!statsGrid) return;

    // Usar event delegation para evitar múltiplos listeners
    statsGrid.addEventListener('click', function(e) {
        const card = e.target.closest('.stat-card.clickable-card');
        if (!card) return;

        const status = card.getAttribute('data-status');
        console.log('Card clicado:', status);
        
        if (status) {
            filtrarChamadosPorStatusNoDashboard(status);
        }
    });

     // Adicionar indicador visual de que são clicáveis
    document.querySelectorAll('.stat-card.clickable-card').forEach(card => {
        card.style.cursor = 'pointer';
        card.style.transition = 'all 0.2s ease';
        card.setAttribute('title', 'Clique para ver os 10 últimos chamados deste status');
        
        card.addEventListener('mouseenter', function() {
            if (!this.classList.contains('active-filter')) {
                this.style.transform = 'translateY(-2px)';
                this.style.boxShadow = 'var(--shadow-lg)';
            }
        });
        
        card.addEventListener('mouseleave', function() {
            if (!this.classList.contains('active-filter')) {
                this.style.transform = 'translateY(0)';
                this.style.boxShadow = 'var(--shadow)';
            }
        });
    });
}
// Função para inicializar os event listeners do dashboard
function inicializarEventListenersDashboard() {
    console.log('Inicializando event listeners do dashboard...');
    
    const statsGrid = document.querySelector('.stats-grid');
    if (!statsGrid) {
        console.error('Stats grid não encontrada');
        return;
    }
    
    // Remover event listeners anteriores para evitar duplicação
    statsGrid.removeEventListener('click', handleCardClick);
    
    // Adicionar novo event listener
    statsGrid.addEventListener('click', handleCardClick);
    
    console.log('Event listeners do dashboard inicializados');
}

function filtrarChamadosPorStatusNoDashboard(status) {
    console.log('Filtrando por status:', status);
    
    // Fechar notificação anterior se existir
    if (notificacaoAtual) {
        closeNotification(notificacaoAtual);
        notificacaoAtual = null;
    }

    // Remover filtro anterior se for o mesmo status
    if (filtroStatusAtivo === status) {
        removerFiltroStatusDashboard();
        return;
    }

    // Atualizar filtro ativo
    filtroStatusAtivo = status;

    // Aplicar estilo visual ao card ativo
    document.querySelectorAll('.stat-card.clickable-card').forEach(card => {
        card.classList.remove('active-filter');
        card.style.transform = 'scale(1)';
    });

    const cardAtivo = document.querySelector(`.stat-card[data-status="${status}"]`);
    if (cardAtivo) {
        cardAtivo.classList.add('active-filter');
        cardAtivo.style.transform = 'scale(1.02)';
    }

    // CORREÇÃO: Filtrar tickets pelo status específico e pegar os 10 mais recentes
    let ticketsFiltrados = tickets
        .filter(ticket => ticket.status === status)
        .sort((a, b) => new Date(b.dataRegistro) - new Date(a.dataRegistro))
        .slice(0, 10); // Apenas os 10 mais recentes

    console.log('Tickets filtrados para', status, ':', ticketsFiltrados.length);

    // Atualizar interface
    atualizarTabelaChamadosFiltrados(ticketsFiltrados, status);

 
    // Adicionar botão de limpar filtro
    adicionarBotaoLimparFiltro();
}


function removerFiltroStatusDashboard() {
    console.log('Removendo filtro do dashboard');
    
    // Fechar notificação se existir
    if (notificacaoAtual) {
        closeNotification(notificacaoAtual);
        notificacaoAtual = null;
    }

    filtroStatusAtivo = null;

    // Remover estilos visuais dos cards
    document.querySelectorAll('.stat-card.clickable-card').forEach(card => {
        card.classList.remove('active-filter');
        card.style.transform = 'translateY(0)';
        card.style.boxShadow = 'var(--shadow)';
    });

    // Restaurar chamados recentes padrão (5 mais recentes de todos os status)
    renderRecentTickets();

    // Atualizar título
    const titulo = document.querySelector('#dashboard-page .card-header h3');
    if (titulo) {
        titulo.textContent = 'Chamados Recentes';
    }

    // Remover botão de limpar filtro
    const botaoLimpar = document.getElementById('limpar-filtro-dashboard');
    if (botaoLimpar) {
        botaoLimpar.remove();
    }
}


function limparNotificacoesAntigas() {
    const container = document.getElementById('push-notification-container');
    const notifications = container.querySelectorAll('.push-notification');
    notifications.forEach(notification => {
        if (!notification.classList.contains('show')) {
            notification.remove();
        }
    });
}


// Modificar a função showPushNotification para garantir que apenas uma notificação de filtro esteja ativa
function showPushNotification(options) {
    // Verificar se as notificações estão habilitadas
    if (!systemSettings.notificationsEnabled) {
        return null;
    }

    const {
        title = 'Notificação',
        message = '',
        type = 'info',
        duration = 1000,
        action = null
    } = options;

    // Criar elemento de notificação
    const notification = document.createElement('div');
    notification.className = `push-notification ${type}`;

    // Definir ícone baseado no tipo
    let icon = 'info-circle';
    switch (type) {
        case 'success':
            icon = 'check-circle';
            break;
        case 'warning':
            icon = 'exclamation-triangle';
            break;
        case 'error':
            icon = 'exclamation-circle';
            break;
        default:
            icon = 'info-circle';
    }

    // Gerar ID único para a notificação
    const notificationId = 'notification-' + Date.now();
    notification.id = notificationId;

    // Construir conteúdo da notificação
    let actionButton = '';
    if (action) {
        actionButton = `<button class="push-notification-action" onclick="${action.handler}">${action.text}</button>`;
    }

    notification.innerHTML = `
        <div class="push-notification-icon">
            <i class="fas fa-${icon}"></i>
        </div>
        <div class="push-notification-content">
            <div class="push-notification-title">${title}</div>
            <div class="push-notification-message">${message}</div>
            ${actionButton}
        </div>
        <button class="push-notification-close" onclick="closeNotification('${notificationId}')">
            <i class="fas fa-times"></i>
        </button>
    `;

    // Adicionar ao container
    const container = document.getElementById('push-notification-container');
    if (container) {
        // Limpar notificações anteriores do mesmo tipo (opcional)
        const existingNotifications = container.querySelectorAll('.push-notification.info');
        if (existingNotifications.length > 2) { // Manter algumas notificações
            existingNotifications[0].remove();
        }

        container.appendChild(notification);

        // Mostrar notificação com animação
        setTimeout(() => {
            notification.classList.add('show');
        }, 100);

        // Fechar automaticamente após o tempo especificado
        if (duration > 0) {
            setTimeout(() => {
                closeNotification(notificationId);
            }, duration);
        }

        return notificationId;
    }

    return null;
}


function atualizarTabelaChamadosFiltrados(ticketsFiltrados, status) {
    const tbody = document.getElementById('recent-tickets-body');
    const cardHeader = document.querySelector('#dashboard-page .card-header h3');
    
    if (!tbody || !cardHeader) {
        console.error('Elementos não encontrados:', { tbody, cardHeader });
        return;
    }
    
    // Atualizar título
    cardHeader.textContent = `Chamados - ${status} (${ticketsFiltrados.length})`;
    
    // Limpar tabela
    tbody.innerHTML = '';
    
    if (ticketsFiltrados.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="placeholder-text">Nenhum chamado encontrado com status "${status}"</td>
            </tr>
        `;
        return;
    }
    
    // Renderizar os tickets filtrados
    ticketsFiltrados.forEach(ticket => {
        const tr = document.createElement('tr');
        
        // Determinar classe do status
        let statusClass = '';
        switch (ticket.status) {
            case 'Aguardando Cliente': statusClass = 'status-open'; break;
            case 'Em Analise': statusClass = 'status-in-progress'; break;
            case 'Retomar Atendimento': statusClass = 'status-pending'; break;
            case 'Finalizado': statusClass = 'status-finished'; break;
            default: statusClass = 'status-open';
        }
        
        const dataExibicao = ticket.dataRegistroExibicao || 
                           (ticket.dataRegistro ? formatarDataParaExibicao(ticket.dataRegistro) : 
                           formatarDataParaExibicao(new Date()));
        
        tr.innerHTML = `
            <td>
                <a href="${ticket.url}" target="_blank" title="Abrir chamado no MQ360º" style="font-weight: 600; color: var(--accent-primary);">
                    ${ticket.numeroChamado}
                </a>
            </td>
            <td>${ticket.cliente}</td>
            <td>
                <span class="status-badge ${statusClass}">
                    ${ticket.status}
                </span>
            </td>
            <td>${dataExibicao}</td>
        `;
        
        tbody.appendChild(tr);
    });
    
    console.log('Tabela atualizada com', ticketsFiltrados.length, 'chamados do status:', status);
}

function adicionarBotaoLimparFiltro() {
    const cardHeader = document.querySelector('#dashboard-page .card-header');
    if (!cardHeader) return;
    
    // Remover botão anterior se existir
    const botaoExistente = document.getElementById('limpar-filtro-dashboard');
    if (botaoExistente) {
        botaoExistente.remove();
    }
    
    // Criar novo botão
    const botaoLimpar = document.createElement('button');
    botaoLimpar.id = 'limpar-filtro-dashboard';
    botaoLimpar.className = 'btn btn-secondary btn-sm';
    botaoLimpar.innerHTML = '<i class="fas fa-times"></i> Limpar Filtro';
    botaoLimpar.title = 'Remover filtro e voltar a mostrar chamados recentes';
    
    botaoLimpar.addEventListener('click', function() {
        removerFiltroStatusDashboard();
    });
    
    // Inserir no header-actions
    const headerActions = cardHeader.querySelector('.header-actions');
    if (headerActions) {
        headerActions.appendChild(botaoLimpar);
    } else {
        // Se não existir header-actions, criar um
        const newHeaderActions = document.createElement('div');
        newHeaderActions.className = 'header-actions';
        newHeaderActions.appendChild(botaoLimpar);
        cardHeader.appendChild(newHeaderActions);
    }
}

// Função para lidar com clique nos cards
function handleCardClick(event) {
    const card = event.target.closest('.stat-card.clickable-card');
    if (!card) return;
    
    const status = card.getAttribute('data-status');
    console.log('Card clicado:', status);
    
    if (status) {
        filtrarChamadosPorStatus(status);
    }
}
// Função principal para filtrar chamados por status
function filtrarChamadosPorStatus(status) {
    console.log('Filtrando chamados por status:', status);
    
    // Se clicar no mesmo status, remove o filtro
    if (filtroStatusAtivo === status) {
        removerFiltroStatus();
        return;
    }
    
    // Atualizar filtro ativo
    filtroStatusAtivo = status;
    
    // Aplicar estilo visual ao card ativo
    document.querySelectorAll('.stat-card.clickable-card').forEach(card => {
        card.classList.remove('active-filter');
        card.style.boxShadow = 'var(--shadow)';
    });
    
    const cardAtivo = document.querySelector(`.stat-card[data-status="${status}"]`);
    if (cardAtivo) {
        cardAtivo.classList.add('active-filter');
        cardAtivo.style.boxShadow = '0 0 0 3px var(--accent-primary)';
    }
    
    // Filtrar tickets pelo status específico
    const ticketsFiltrados = tickets
        .filter(ticket => ticket.status === status)
        .sort((a, b) => new Date(b.dataRegistro) - new Date(a.dataRegistro));
    
    console.log(`Encontrados ${ticketsFiltrados.length} chamados com status "${status}"`);
    
    // Atualizar a tabela de chamados recentes
    atualizarTabelaComChamadosFiltrados(ticketsFiltrados, status);
    
      
    // Adicionar botão para remover filtro
    adicionarBotaoRemoverFiltro();
}
// Função para atualizar a tabela com os chamados filtrados
function atualizarTabelaComChamadosFiltrados(ticketsFiltrados, status) {
    const tbody = document.getElementById('recent-tickets-body');
    const cardHeader = document.querySelector('#dashboard-page .card-header h3');
    
    if (!tbody || !cardHeader) {
        console.error('Elementos da tabela não encontrados');
        return;
    }
    
    // Atualizar título da seção
    cardHeader.textContent = `Chamados - ${status} (${ticketsFiltrados.length})`;
    
    // Limpar tabela
    tbody.innerHTML = '';
    
    if (ticketsFiltrados.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="placeholder-text">
                    Nenhum chamado encontrado com status "${status}"
                </td>
            </tr>
        `;
        return;
    }
    
    // Adicionar cada ticket à tabela (máximo 10 para não sobrecarregar)
    const ticketsParaExibir = ticketsFiltrados.slice(0, 10);
    
    ticketsParaExibir.forEach(ticket => {
        const tr = document.createElement('tr');
        
        let statusClass = '';
        if (ticket.status === 'Aguardando Cliente') statusClass = 'status-open';
        else if (ticket.status === 'Em Analise') statusClass = 'status-in-progress';
        else if (ticket.status === 'Retomar Atendimento') statusClass = 'status-pending';
        else if (ticket.status === 'Finalizado') statusClass = 'status-finished';
        else statusClass = 'status-open';
        
        const dataExibicao = ticket.dataRegistroExibicao || 
                           (ticket.dataRegistro ? formatarDataParaExibicao(ticket.dataRegistro) : 
                           formatarDataParaExibicao(new Date()));
        
        tr.innerHTML = `
            <td>
                <a href="${ticket.url}" target="_blank" style="font-weight: 600; color: var(--accent-primary);">
                    ${ticket.numeroChamado}
                </a>
            </td>
            <td>${ticket.cliente}</td>
            <td>
                <span class="status-badge ${statusClass}">${ticket.status}</span>
            </td>
            <td>${dataExibicao}</td>
        `;
        
        tbody.appendChild(tr);
    });
    
    console.log('Tabela atualizada com', ticketsParaExibir.length, 'chamados do status:', status);
}

// Função para adicionar botão de remover filtro
function adicionarBotaoRemoverFiltro() {
    const cardHeader = document.querySelector('#dashboard-page .card-header');
    if (!cardHeader) return;
    
    // Remover botão anterior se existir
    const botaoExistente = document.getElementById('remover-filtro-dashboard');
    if (botaoExistente) {
        botaoExistente.remove();
    }
    
    // Criar novo botão
    const botaoRemover = document.createElement('button');
    botaoRemover.id = 'remover-filtro-dashboard';
    botaoRemover.className = 'btn btn-secondary btn-sm';
    botaoRemover.innerHTML = '<i class="fas fa-times"></i> Remover Filtro';
    
    botaoRemover.addEventListener('click', removerFiltroStatus);
    
    // Adicionar ao header
    const headerActions = cardHeader.querySelector('.header-actions');
    if (headerActions) {
        headerActions.appendChild(botaoRemover);
    } else {
        const newHeaderActions = document.createElement('div');
        newHeaderActions.className = 'header-actions';
        newHeaderActions.appendChild(botaoRemover);
        cardHeader.appendChild(newHeaderActions);
    }
}

// Função para remover o filtro
function removerFiltroStatus() {
    console.log('Removendo filtro de status');
    
    // Remover estilo dos cards
    document.querySelectorAll('.stat-card.clickable-card').forEach(card => {
        card.classList.remove('active-filter');
        card.style.boxShadow = 'var(--shadow)';
    });
    
    filtroStatusAtivo = null;
    
    // Restaurar tabela original
    renderRecentTickets();
    
    // Restaurar título original
    const cardHeader = document.querySelector('#dashboard-page .card-header h3');
    if (cardHeader) {
        cardHeader.textContent = 'Chamados Recentes';
    }
    
    // Remover botão de remover filtro
    const botaoRemover = document.getElementById('remover-filtro-dashboard');
    if (botaoRemover) {
        botaoRemover.remove();
    }
 }


// ============ FUNÇÃO PARA ALTERAR STATUS AUTOMATICAMENTE ============
async function verificarChamadosAguardandoCliente() {
    console.log('Verificando chamados em "Aguardando Cliente" há mais de 3 dias...');
    
    const agora = new Date();
    const tresDiasEmMs = 3 * 24 * 60 * 60 * 1000; // 3 dias em milissegundos
    let chamadosAlterados = 0;

    for (const ticket of tickets) {
        if (ticket.status === 'Aguardando Cliente') {
            // Verificar a data do último status "Aguardando Cliente"
            let dataStatus = new Date(ticket.dataRegistro); // Data de registro como fallback
            
            // Se houver histórico, pegar a data da última alteração para "Aguardando Cliente"
            if (ticket.historicoStatus && ticket.historicoStatus.length > 0) {
                const historicoAguardando = ticket.historicoStatus
                    .filter(entry => entry.status === 'Aguardando Cliente')
                    .sort((a, b) => new Date(b.data) - new Date(a.data))[0];
                
                if (historicoAguardando) {
                    dataStatus = new Date(historicoAguardando.data);
                }
            }

            // Se a diferença for maior ou igual a 3 dias, alterar para "Finalizado"
            if (agora - dataStatus >= tresDiasEmMs) {
                console.log(`Alterando chamado ${ticket.numeroChamado} para Finalizado (aguardando desde ${dataStatus})`);
                
                // Alterar o status do ticket
                const statusAnterior = ticket.status;
                ticket.status = 'Finalizado';
                
                // Adicionar ao histórico
                if (!ticket.historicoStatus) {
                    ticket.historicoStatus = [];
                }
                
                ticket.historicoStatus.push({
                    status: 'Finalizado',
                    data: formatarDataParaMySQL(agora),
                    dataExibicao: formatarDataParaExibicao(agora),
                    observacao: 'Status alterado automaticamente após 3 dias em "Aguardando Cliente"'
                });

                // Salvar no banco de dados
                const success = await dbManager.saveTicket(ticket);
                
                if (success) {
                    chamadosAlterados++;
                    console.log(`Chamado ${ticket.numeroChamado} alterado para Finalizado automaticamente`);
                }
            }
        }
    }

    if (chamadosAlterados > 0) {
        // Recarregar os dados do banco
        await dbManager.loadTickets();
        
        // Atualizar as interfaces
        updateDashboard();
        renderTicketsTable();
        renderFinishedTicketsTable();
        
        showPushNotification({
            title: 'Status Atualizados Automaticamente',
            message: `${chamadosAlterados} chamado(s) em "Aguardando Cliente" há mais de 3 dias foram automaticamente finalizados.`,
            type: 'info',
            duration: 1000
        });
        
        console.log(`${chamadosAlterados} chamados alterados automaticamente`);
    }
    
    return chamadosAlterados;
}

// ============ EXECUTAR VERIFICAÇÃO PERIÓDICA ============

// Executar a verificação a cada 6 horas (21600000 ms)
setInterval(verificarChamadosAguardandoCliente, 21600000);

// Executar também quando o sistema inicia (após carregar os tickets)
document.addEventListener('DOMContentLoaded', function() {
    // Executar a verificação 10 segundos após o carregamento inicial
    setTimeout(verificarChamadosAguardandoCliente, 10000);
});

// Executar verificação quando a página de chamados for carregada
function initializeChamadosPage() {
    if (document.getElementById('chamados-page').classList.contains('active')) {
        setTimeout(verificarChamadosAguardandoCliente, 2000);
    }
}

// ============ FUNÇÃO PARA MIGRAR E REMOVER STATUS "EM ANALISE" ============
async function migrarStatusExistente() {
    console.log('Migrando e removendo status "Em Analise"...');
    
    let ticketsMigrados = 0;
    let ticketsComProblema = [];

    // Migrar tickets de "Em Analise" para "Em Atendimento"
    for (const ticket of tickets) {
        if (ticket.status === 'Em Analise') {
            try {
                const statusAnterior = ticket.status;
                ticket.status = 'Em Atendimento';
                
                // Atualizar histórico
                if (ticket.historicoStatus) {
                    ticket.historicoStatus.forEach(entry => {
                        if (entry.status === 'Em Analise') {
                            entry.status = 'Em Atendimento';
                            if (entry.observacao) {
                                entry.observacao = entry.observacao.replace('Em Analise', 'Em Atendimento');
                            }
                        }
                    });
                }
                
                // Adicionar entrada no histórico sobre a migração
                if (!ticket.historicoStatus) {
                    ticket.historicoStatus = [];
                }
                
                ticket.historicoStatus.push({
                    status: 'Em Atendimento',
                    data: formatarDataParaMySQL(new Date()),
                    dataExibicao: formatarDataParaExibicao(new Date()),
                    observacao: `Status migrado automaticamente de "Em Analise" para "Em Atendimento" durante atualização do sistema`
                });
                
                await dbManager.saveTicket(ticket);
                ticketsMigrados++;
                
            } catch (error) {
                console.error(`Erro ao migrar ticket ${ticket.id}:`, error);
                ticketsComProblema.push(ticket.numeroChamado || ticket.id);
            }
        }
    }

    // Remover "Em Analise" da lista de status personalizados se existir
    const indexEmAnalise = customStatuses.indexOf('Em Analise');
    if (indexEmAnalise > -1) {
        customStatuses.splice(indexEmAnalise, 1);
        await dbManager.saveCustomStatuses(customStatuses);
    }

    // Remover "Em Analise" das configurações do dashboard
    const indexDashboard = dashboardStatusSettings.enabledStatuses.indexOf('Em Analise');
    if (indexDashboard > -1) {
        dashboardStatusSettings.enabledStatuses.splice(indexDashboard, 1);
        await saveDashboardStatusSettings();
    }

    // Remover cor do status "Em Analise" se existir
    if (systemSettings.statusColors && systemSettings.statusColors['Em Analise']) {
        delete systemSettings.statusColors['Em Analise'];
        await dbManager.saveSettings();
    }

    if (ticketsMigrados > 0 || ticketsComProblema.length > 0) {
        // Recarregar dados
        await dbManager.loadTickets();
        updateDashboard();
        renderTicketsTable();
        renderFinishedTicketsTable();
        renderStatusList();
        updateStatusSelects();
        
        let mensagem = '';
        if (ticketsMigrados > 0) {
            mensagem += `${ticketsMigrados} chamados migrados de "Em Analise" para "Em Atendimento". `;
        }
        if (ticketsComProblema.length > 0) {
            mensagem += `Problemas em ${ticketsComProblema.length} chamados.`;
        }
        
        console.log(`Migração concluída: ${mensagem}`);
        
        showPushNotification({
            title: 'Migração de Status Concluída',
            message: mensagem,
            type: ticketsComProblema.length > 0 ? 'warning' : 'success',
            duration: 1000
        });
    }
    
    return { ticketsMigrados, ticketsComProblema };
}// ============ FUNÇÃO PARA MIGRAR E REMOVER STATUS "EM ANALISE" ============
async function migrarStatusExistente() {
    console.log('Migrando e removendo status "Em Analise"...');
    
    let ticketsMigrados = 0;
    let ticketsComProblema = [];

    // Migrar tickets de "Em Analise" para "Em Atendimento"
    for (const ticket of tickets) {
        if (ticket.status === 'Em Analise') {
            try {
                const statusAnterior = ticket.status;
                ticket.status = 'Em Atendimento';
                
                // Atualizar histórico
                if (ticket.historicoStatus) {
                    ticket.historicoStatus.forEach(entry => {
                        if (entry.status === 'Em Analise') {
                            entry.status = 'Em Atendimento';
                            if (entry.observacao) {
                                entry.observacao = entry.observacao.replace('Em Analise', 'Em Atendimento');
                            }
                        }
                    });
                }
                
                // Adicionar entrada no histórico sobre a migração
                if (!ticket.historicoStatus) {
                    ticket.historicoStatus = [];
                }
                
                ticket.historicoStatus.push({
                    status: 'Em Atendimento',
                    data: formatarDataParaMySQL(new Date()),
                    dataExibicao: formatarDataParaExibicao(new Date()),
                    observacao: `Status migrado automaticamente de "Em Analise" para "Em Atendimento" durante atualização do sistema`
                });
                
                await dbManager.saveTicket(ticket);
                ticketsMigrados++;
                
            } catch (error) {
                console.error(`Erro ao migrar ticket ${ticket.id}:`, error);
                ticketsComProblema.push(ticket.numeroChamado || ticket.id);
            }
        }
    }

    // Remover "Em Analise" da lista de status personalizados se existir
    const indexEmAnalise = customStatuses.indexOf('Em Analise');
    if (indexEmAnalise > -1) {
        customStatuses.splice(indexEmAnalise, 1);
        await dbManager.saveCustomStatuses(customStatuses);
    }

    // Remover "Em Analise" das configurações do dashboard
    const indexDashboard = dashboardStatusSettings.enabledStatuses.indexOf('Em Analise');
    if (indexDashboard > -1) {
        dashboardStatusSettings.enabledStatuses.splice(indexDashboard, 1);
        await saveDashboardStatusSettings();
    }

    // Remover cor do status "Em Analise" se existir
    if (systemSettings.statusColors && systemSettings.statusColors['Em Analise']) {
        delete systemSettings.statusColors['Em Analise'];
        await dbManager.saveSettings();
    }

    if (ticketsMigrados > 0 || ticketsComProblema.length > 0) {
        // Recarregar dados
        await dbManager.loadTickets();
        updateDashboard();
        renderTicketsTable();
        renderFinishedTicketsTable();
        renderStatusList();
        updateStatusSelects();
        
        let mensagem = '';
        if (ticketsMigrados > 0) {
            mensagem += `${ticketsMigrados} chamados migrados de "Em Analise" para "Em Atendimento". `;
        }
        if (ticketsComProblema.length > 0) {
            mensagem += `Problemas em ${ticketsComProblema.length} chamados.`;
        }
        
        console.log(`Migração concluída: ${mensagem}`);
        
        showPushNotification({
            title: 'Migração de Status Concluída',
            message: mensagem,
            type: ticketsComProblema.length > 0 ? 'warning' : 'success',
            duration: 1000
        });
    }
    
    return { ticketsMigrados, ticketsComProblema };
}

// Executar migração uma vez ao carregar o sistema
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(migrarStatusExistente, 5000);
});

// Event listener para abrir modal de novo chamado
document.getElementById('new-ticket-btn').addEventListener('click', function() {
    // Limpar formulário e resetar para novo chamado
    document.getElementById('modal-title').textContent = 'Novo Chamado';
    document.getElementById('ticket-form').reset();
    document.getElementById('ticket-id').value = '';
    document.getElementById('ticket-numero-chamado').value = '';
    
    // Preencher data atual como padrão
    const now = new Date();
    document.getElementById('ticket-data-registro').value = formatarDataParaInput(now);
    
    // Preencher status com a primeira opção
    document.getElementById('ticket-status').value = customStatuses[0] || 'Aguardando Cliente';
    
    // Ocultar campo de observações (só aparece para Finalizado)
    document.getElementById('observacoes-group').style.display = 'none';
    
    // Aplicar cores nos selects
    setTimeout(() => {
        aplicarCoresNosSelectsStatus();
    }, 100);
    
    // Mostrar modal
    document.getElementById('ticket-modal').classList.add('active');
});

// Event listener para extrair dados da página de captura
document.getElementById('extrair-dados-btn').addEventListener('click', function() {
    const conteudo = document.getElementById('conteudo-pagina').value;
    
    if (!conteudo) {
        showPushNotification({
            title: 'Campo Vazio',
            message: 'Por favor, cole o conteúdo da página do chamado.',
            type: 'error',
            duration: 3000
        });
        return;
    }
    
    // Extrair dados
    const dadosExtraidos = extrairDados(conteudo);
    
    // Exibir resumo
    const extractedDataDiv = document.getElementById('extracted-data');
    extractedDataDiv.innerHTML = '';
    
    if (dadosExtraidos.numeroChamado) {
        let html = `
            <div class="extracted-item">
                <strong>Número do Chamado:</strong> ${dadosExtraidos.numeroChamado}
            </div>
        `;
        
        if (dadosExtraidos.cliente) {
            html += `
                <div class="extracted-item">
                    <strong>Cliente:</strong> ${dadosExtraidos.cliente}
                </div>
            `;
        }
        
        if (dadosExtraidos.dataRegistro) {
            html += `
                <div class="extracted-item">
                    <strong>Data de Registro:</strong> ${dadosExtraidos.dataRegistro}
                </div>
            `;
        }
        
        if (dadosExtraidos.status) {
            html += `
                <div class="extracted-item">
                    <strong>Status:</strong> ${dadosExtraidos.status}
                </div>
            `;
        }
        
        if (dadosExtraidos.descricao) {
            // Limitar a exibição da descrição para não ficar muito longo
            const descricaoResumida = dadosExtraidos.descricao.length > 200 ? 
                dadosExtraidos.descricao.substring(0, 200) + '...' : 
                dadosExtraidos.descricao;
            
            html += `
                <div class="extracted-item">
                    <strong>Descrição:</strong> ${descricaoResumida}
                </div>
            `;
        }
        
        extractedDataDiv.innerHTML = html;
        
        // Mostrar botão de salvar
        document.getElementById('save-ticket-btn').classList.remove('hidden');
        document.getElementById('extracted-summary').classList.remove('hidden');
        
        // Armazenar dados extraídos para salvar depois
        window.dadosExtraidosAtuais = dadosExtraidos;
        
    } else {
        extractedDataDiv.innerHTML = `
            <div class="extracted-error">
                Não foi possível identificar um número de chamado. Certifique-se de que o conteúdo foi copiado corretamente.
            </div>
        `;
        document.getElementById('save-ticket-btn').classList.add('hidden');
        document.getElementById('extracted-summary').classList.add('hidden');
    }
});

// ============ MODIFICAÇÕES PARA OBSERVAÇÕES DE CHAMADOS FINALIZADOS ============

// Função para abrir modal de observações
function abrirModalObservacoes(ticketId) {
    const ticket = tickets.find(t => t.id === ticketId);
    
    if (!ticket) {
        showPushNotification({
            title: 'Erro',
            message: 'Chamado não encontrado.',
            type: 'error',
            duration: 3000
        });
        return;
    }
    
    // Preencher modal com dados atuais
    document.getElementById('observacoes-ticket-id').value = ticket.id;
    document.getElementById('observacoes-text').value = ticket.observacoesFinalizado || '';
    
    // Abrir modal
    document.getElementById('observacoes-modal').classList.add('active');
}

async function salvarObservacoes() {
    const ticketId = document.getElementById('observacoes-ticket-id').value;
    const observacoes = document.getElementById('observacoes-text').value;
    
    const ticket = tickets.find(t => t.id === ticketId);
    
    if (!ticket) {
        showPushNotification({
            title: 'Erro',
            message: 'Chamado não encontrado.',
            type: 'error',
            duration: 3000
        });
        return;
    }
    
    // CORREÇÃO: Garantir que o ticket está finalizado
    if (ticket.status !== 'Finalizado') {
        showPushNotification({
            title: 'Aviso',
            message: 'Este chamado não está finalizado. As observações só podem ser editadas para chamados finalizados.',
            type: 'warning',
            duration: 3000
        });
        return;
    }
    
    // Atualizar observações
    ticket.observacoesFinalizado = observacoes;
    
    // Salvar no banco
    const success = await dbManager.saveTicket(ticket);
    
    if (success) {
        // Fechar modal
        document.getElementById('observacoes-modal').classList.remove('active');
        
        // Recarregar tabela de finalizados
        renderFinishedTicketsTable();
        
        showPushNotification({
            title: 'Observações Salvas',
            message: 'Observações do chamado salvas com sucesso!',
            type: 'success',
            duration: 3000
        });
    } else {
        showPushNotification({
            title: 'Erro',
            message: 'Não foi possível salvar as observações.',
            type: 'error',
            duration: 3000
        });
    }
}

// Event listeners para o modal de observações
document.getElementById('save-observacoes').addEventListener('click', salvarObservacoes);

document.getElementById('cancel-observacoes').addEventListener('click', function() {
    document.getElementById('observacoes-modal').classList.remove('active');
});

// Fechar modal com X
document.querySelector('#observacoes-modal .modal-close').addEventListener('click', function() {
    document.getElementById('observacoes-modal').classList.remove('active');
});
// ============ FUNÇÃO PARA ATUALIZAR TEMA ============
function atualizarTema() {
    const isDarkTheme = document.body.classList.contains('dark-theme');
    
    // Atualizar variáveis CSS baseadas no tema
    document.documentElement.style.setProperty('--bg-primary', 
        isDarkTheme ? getComputedStyle(document.documentElement).getPropertyValue('--escuro-bg-primary') : 
                      getComputedStyle(document.documentElement).getPropertyValue('--claro-bg-primary'));
    
    // Aplicar tema específico aos botões de toggle
    document.querySelectorAll('.toggle-observacoes').forEach(btn => {
        atualizarEstiloBotaoObservacoes(btn);
    });
}
// ============ FUNÇÃO PARA ATUALIZAR ESTILO DO BOTÃO ============
function atualizarEstiloBotaoObservacoes(btn) {
    const isDarkTheme = document.body.classList.contains('dark-theme');
    const isActive = btn.classList.contains('active');
    const hasObservations = btn.classList.contains('has-observations');
    const isDisabled = btn.disabled;
    
    if (isDisabled) {
        btn.style.backgroundColor = isDarkTheme ? '#475569' : '#e9ecef';
        btn.style.color = isDarkTheme ? '#94a3b8' : '#6c757d';
        btn.style.borderColor = isDarkTheme ? '#475569' : '#dee2e6';
    } else if (isActive) {
        btn.style.backgroundColor = isDarkTheme ? '#3b82f6' : '#2563eb';
        btn.style.color = 'white';
        btn.style.borderColor = isDarkTheme ? '#3b82f6' : '#2563eb';
    } else if (hasObservations) {
        btn.style.backgroundColor = isDarkTheme ? '#10b981' : '#059669';
        btn.style.color = 'white';
        btn.style.borderColor = isDarkTheme ? '#10b981' : '#059669';
    } else {
        btn.style.backgroundColor = isDarkTheme ? '#334155' : '#f8f9fa';
        btn.style.color = isDarkTheme ? '#cbd5e1' : '#212529';
        btn.style.borderColor = isDarkTheme ? '#475569' : '#dee2e6';
    }
}

// ============ FUNÇÃO PARA CRIAR MODAL DE OBSERVAÇÕES ============
function criarModalObservacoes() {
    // Verificar se o modal já existe
    if (document.getElementById('observacoes-modal')) return;
    
    const modalHTML = `
        <div id="observacoes-modal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h3>Observações do Chamado Finalizado</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <form id="observacoes-form">
                        <div class="form-group">
                            <label for="observacoes-text">Observações</label>
                            <textarea id="observacoes-text" class="form-textarea" rows="6" 
                                      placeholder="Digite observações sobre o chamado finalizado..."></textarea>
                            <div id="observacoes-counter" class="observacoes-counter">0/1000</div>
                        </div>
                        <input type="hidden" id="observacoes-ticket-id">
                    </form>
                </div>
                <div class="modal-footer">
                    <button id="cancel-observacoes" class="btn btn-secondary">Cancelar</button>
                    <button id="save-observacoes" class="btn btn-primary">Salvar</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    // Adicionar event listeners ao modal
    inicializarModalObservacoes();
}

// ============ INICIALIZAR MODAL DE OBSERVAÇÕES ============
function inicializarModalObservacoes() {
    const modal = document.getElementById('observacoes-modal');
    const textarea = document.getElementById('observacoes-text');
    const counter = document.getElementById('observacoes-counter');
    
    if (!modal || !textarea || !counter) return;
    
    // Contador de caracteres
    textarea.addEventListener('input', function() {
        const length = this.value.length;
        counter.textContent = `${length}/1000`;
        
        if (length > 900) {
            counter.classList.add('warning');
            counter.classList.remove('danger');
        } else if (length > 990) {
            counter.classList.remove('warning');
            counter.classList.add('danger');
        } else {
            counter.classList.remove('warning', 'danger');
        }
    });
    
    // Fechar modal com X
    modal.querySelector('.modal-close').addEventListener('click', function() {
        modal.classList.remove('active');
    });
    
    // Cancelar
    document.getElementById('cancel-observacoes').addEventListener('click', function() {
        modal.classList.remove('active');
    });
    
    // Salvar (implementação existente)
    document.getElementById('save-observacoes').addEventListener('click', salvarObservacoes);
    
    // Fechar modal com ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && modal.classList.contains('active')) {
            modal.classList.remove('active');
        }
    });
}
// Função para debug - adicione antes do DOMContentLoaded
function debugTicketData(ticket) {
    console.log('=== DEBUG DO TICKET ===');
    console.log('ID:', ticket.id);
    console.log('Número:', ticket.numeroChamado);
    console.log('Cliente:', ticket.cliente);
    console.log('Status:', ticket.status);
    console.log('Data Registro:', ticket.dataRegistro);
    console.log('Observações:', ticket.observacoesFinalizado);
    console.log('Histórico:', ticket.historicoStatus?.length || 0);
    console.log('=======================');
}

// Event listener para mostrar/ocultar campo de observações baseado no status
document.getElementById('ticket-status').addEventListener('change', function() {
    const observacoesGroup = document.getElementById('ticket-observacoes').closest('.form-group');
    if (this.value === 'Finalizado') {
        observacoesGroup.style.display = 'block';
    } else {
        observacoesGroup.style.display = 'none';
    }
});



document.getElementById('cancel-ticket').addEventListener('click', function() {
    document.getElementById('ticket-modal').classList.remove('active');
    document.getElementById('ticket-form').reset();
    document.getElementById('ticket-id').value = '';
    document.getElementById('ticket-numero-chamado').value = '';
    
    // Esconder campo de observações
    const observacoesGroup = document.getElementById('ticket-observacoes').closest('.form-group');
    observacoesGroup.style.display = 'none';
});

// Função para alternar a exibição das observações com melhor posicionamento
function toggleObservacoes(ticketId, observacoesId) {
    const observacoesElement = document.getElementById(observacoesId);
    const eyeIcon = document.querySelector(`.toggle-observacoes[data-ticket-id="${ticketId}"] i`);
    
    if (observacoesElement) {
        if (observacoesElement.style.display === 'none') {
            // Mostrar observações
            observacoesElement.style.display = 'block';
            
            // Ajustar posicionamento para não sair da célula
            const cell = observacoesElement.closest('td');
            const table = observacoesElement.closest('table');
            const tableRect = table.getBoundingClientRect();
            const cellRect = cell.getBoundingClientRect();
            
            // Verificar se o conteúdo vai sair da tabela
            if (cellRect.right + 400 > tableRect.right) {
                observacoesElement.style.maxWidth = (tableRect.right - cellRect.left - 20) + 'px';
            }
            
            eyeIcon.classList.remove('fa-eye');
            eyeIcon.classList.add('fa-eye-slash');
        } else {
            // Ocultar observações
            observacoesElement.style.display = 'none';
            eyeIcon.classList.remove('fa-eye-slash');
            eyeIcon.classList.add('fa-eye');
        }
    }
}

// Atualize o event listener dos botões de toggle:
document.querySelectorAll('#finished-tickets-table-body .toggle-observacoes').forEach(btn => {
    btn.addEventListener('click', function() {
        const ticketId = this.getAttribute('data-ticket-id');
        const observacoesId = this.getAttribute('data-observacoes-id');
        toggleObservacoes(ticketId, observacoesId);
    });
});


// Função para abrir observações em modal
function abrirObservacoesModal(ticketId) {
    const ticket = tickets.find(t => t.id === ticketId);
    
    if (!ticket) return;
    
    // Criar ou atualizar modal
    let modal = document.getElementById('observacoes-detail-modal');
    
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'observacoes-detail-modal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h3>Observações - ${ticket.numeroChamado}</h3>
                    <button class="modal-close">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="observacoes-modal-content" style="
                        background: var(--bg-secondary);
                        padding: 20px;
                        border-radius: 4px;
                        max-height: 400px;
                        overflow-y: auto;
                        white-space: pre-wrap;
                        word-wrap: break-word;
                    "></div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        
        // Event listener para fechar
        modal.querySelector('.modal-close').addEventListener('click', () => {
            modal.classList.remove('active');
        });
    }
    
    // Preencher conteúdo
    modal.querySelector('.observacoes-modal-content').textContent = 
        ticket.observacoesFinalizado || 'Nenhuma observação registrada.';
    
    // Mostrar modal
    modal.classList.add('active');
}

// No seu arquivo JavaScript do frontend
document.addEventListener('DOMContentLoaded', function() {
  // Monitorar eventos de mouse e teclado no frontend
  document.addEventListener('mousemove', sendUserActivity);
  document.addEventListener('keydown', sendUserActivity);
  document.addEventListener('click', sendUserActivity);
  document.addEventListener('scroll', sendUserActivity);
  
  function sendUserActivity() {
    if (window.ipcRenderer) {
      window.ipcRenderer.send('user-activity');
    }
  }
  
  // Listener para recarregar dados durante inatividade
  if (window.ipcRenderer) {
    window.ipcRenderer.on('reload-data-inactive', async () => {
      console.log('🔄 Recarregando dados por inatividade...');
      
      // Recarregar dados dos tickets
      await loadTickets(true); // forceRefresh = true
      
      // Recarregar agendamentos
      await loadSchedules();
      
      // Atualizar dashboard
      updateDashboard();
      
      console.log('✅ Dados recarregados durante inatividade');
    });
  }
});


    // Exportar funções para uso global
        window.extrairDados = extrairDados;
        window.extrairDadosSimples = extrairDadosSimples;
        window.closeNotification = closeNotification;
        window.navigateToPage = navigateToPage;
        window.formatarData = formatarDataParaExibicao;
        window.exportToExcel = exportToExcel;
        window.importFromExcel = importFromExcel;
        window.gerarRelatorio = gerarRelatorio;
        window.criarBackupSistema = criarBackupSistema;
        window.restaurarSistema = restaurarSistema;