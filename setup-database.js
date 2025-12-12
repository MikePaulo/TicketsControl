const mysql = require('mysql2');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}



async function setupDatabase() {
  console.log('=== CONFIGURAÇÃO DO BANCO DE DADOS MYSQL ===\n');
  
  // Configurações básicas
  const config = {
    host: await askQuestion('Host do MySQL (localhost): ') || 'localhost',
    user: await askQuestion('Usuário MySQL (root): ') || 'root',
    password: await askQuestion('Senha MySQL (deixe vazio se não tiver): ') || '',
    port: await askQuestion('Porta MySQL (3306): ') || '3306'
  };

  console.log('\n⏳ Conectando ao MySQL...');

  try {
    // Primeiro conectar sem selecionar banco
    const connection = mysql.createConnection({
      host: config.host,
      user: config.user,
      password: config.password,
      port: config.port,
      multipleStatements: true
    });

    // Conectar
    await new Promise((resolve, reject) => {
      connection.connect((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log('✅ Conectado ao MySQL com sucesso!');
    
    // Criar banco de dados
    const dbName = 'tickets_control';
    console.log(`📁 Criando banco de dados '${dbName}'...`);
    
    await new Promise((resolve, reject) => {
      connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Usar o banco
    await new Promise((resolve, reject) => {
      connection.query(`USE \`${dbName}\``, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log('✅ Banco de dados criado/selecionado!');

    // Criar tabelas
    console.log('🗃️ Criando tabelas...');
    
    const createTablesSQL = `
      -- Tabela de tickets
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
        status VARCHAR(50),
        data_registro DATETIME,
        prioridade VARCHAR(50),
        data DATE,
        deletion_date DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
      
      -- Tabela de histórico de status
      CREATE TABLE IF NOT EXISTS status_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        ticket_id VARCHAR(50),
        status VARCHAR(50),
        data DATETIME,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
      );
      
      -- Tabela de agendamentos
      CREATE TABLE IF NOT EXISTS schedules (
        id VARCHAR(50) PRIMARY KEY,
        ticket_id VARCHAR(50),
        cliente VARCHAR(255),
        data DATETIME,
        responsavel VARCHAR(255),
        observacoes TEXT,
        notified BOOLEAN DEFAULT FALSE,
        status_changed BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
      );
      
      -- Tabela de configurações
      CREATE TABLE IF NOT EXISTS settings (
        key_name VARCHAR(100) PRIMARY KEY,
        value TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      );
    `;

    await new Promise((resolve, reject) => {
      connection.query(createTablesSQL, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log('✅ Tabelas criadas com sucesso!');
    
    // Inserir alguns dados de exemplo
    console.log('📝 Inserindo dados iniciais...');
    
    const initialDataSQL = `
      -- Inserir configurações padrão
      INSERT IGNORE INTO settings (key_name, value) VALUES 
      ('systemSettings', '{"theme":"claro","autoDeleteFinalized":true,"deleteAfterDays":3,"notificationsEnabled":true}'),
      ('customStatuses', '["Aberto","Em Andamento","Resolvido","Fechado","Finalizado"]');
    `;

    await new Promise((resolve, reject) => {
      connection.query(initialDataSQL, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log('✅ Dados iniciais inseridos!');
    
    // Fechar conexão
    connection.end();
    
    console.log('\n🎉 CONFIGURAÇÃO CONCLUÍDA COM SUCESSO!');
    console.log('\n📋 RESUMO DA CONFIGURAÇÃO:');
    console.log(`   Host: ${config.host}`);
    console.log(`   Usuário: ${config.user}`);
    console.log(`   Porta: ${config.port}`);
    console.log(`   Banco: tickets_control`);
    console.log('\n▶️  Agora execute: npm start');

  } catch (error) {
    console.error('\n❌ ERRO NA CONFIGURAÇÃO:', error.message);
    console.log('\n🔧 SOLUÇÕES POSSÍVEIS:');
    console.log('1. Verifique se o MySQL está instalado e rodando');
    console.log('2. Confirme o usuário e senha do MySQL');
    console.log('3. Verifique se a porta 3306 está liberada');
    console.log('4. No Windows: Verifique se o serviço "MySQL" está iniciado');
    console.log('5. Tente executar como administrador se necessário');
  }

  rl.close();
}

// Executar o setup
setupDatabase();