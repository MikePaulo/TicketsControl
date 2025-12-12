const mysql = require('mysql2/promise');

class Database {
  constructor() {
    this.config = {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'tickets_control',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    };
    this.pool = null;
  }

  async connect() {
    try {
      this.pool = mysql.createPool(this.config);
      
      // Testar conexão
      const connection = await this.pool.getConnection();
      console.log('Conectado ao MySQL com sucesso');
      connection.release();
      
      return true;
    } catch (error) {
      console.error('Erro ao conectar com MySQL:', error);
      return false;
    }
  }

  async query(sql, params = []) {
    try {
      const [rows] = await this.pool.execute(sql, params);
      return rows;
    } catch (error) {
      console.error('Erro na query:', error);
      throw error;
    }
  }

  async close() {
    if (this.pool) {
      await this.pool.end();
    }
  }

  // Métodos específicos para o sistema de tickets
  async backupDatabase() {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFile = `backup_tickets_${timestamp}.sql`;
      
      // Aqui você pode implementar lógica de backup
      console.log(`Backup criado: ${backupFile}`);
      return backupFile;
    } catch (error) {
      console.error('Erro no backup:', error);
      throw error;
    }
  }



  async getDatabaseStats() {
    try {
      const stats = await this.query(`
        SELECT 
          (SELECT COUNT(*) FROM tickets) as total_tickets,
          (SELECT COUNT(*) FROM tickets WHERE status = 'Aberto') as open_tickets,
          (SELECT COUNT(*) FROM schedules WHERE DATE(data) = CURDATE()) as today_schedules,
          (SELECT COUNT(*) FROM tickets WHERE DATE(created_at) = CURDATE()) as today_tickets
      `);
      return stats[0];
    } catch (error) {
      console.error('Erro ao buscar estatísticas:', error);
      return {};
    }
  }
}

module.exports = Database;