// scripts/backup.js - Automated Database Backup
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const nodemailer = require('nodemailer');
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/backup.log' })
  ]
});

// AWS S3 configuration for cloud backups
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

// Email transporter for notifications
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

class BackupManager {
  constructor() {
    this.backupDir = path.join(__dirname, '../backups');
    this.dbName = process.env.MONGODB_NAME || 'zass';
    this.dbUser = process.env.MONGODB_USER;
    this.dbPass = process.env.MONGODB_PASSWORD;
    this.dbHost = process.env.MONGODB_HOST || 'localhost';
  }

  ensureBackupDir() {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  // Create MongoDB backup
  async backupMongoDB() {
    return new Promise((resolve, reject) => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `mongodb-${timestamp}.gz`;
      const filepath = path.join(this.backupDir, filename);
      
      let cmd = `mongodump --host ${this.dbHost} --db ${this.dbName}`;
      if (this.dbUser && this.dbPass) {
        cmd += ` --username ${this.dbUser} --password ${this.dbPass} --authenticationDatabase admin`;
      }
      cmd += ` --archive=${filepath} --gzip`;
      
      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          logger.error(`MongoDB backup failed: ${error.message}`);
          reject(error);
        } else {
          logger.info(`MongoDB backup created: ${filename}`);
          resolve({ filename, filepath, size: fs.statSync(filepath).size });
        }
      });
    });
  }

  // Create PostgreSQL backup
  async backupPostgreSQL() {
    return new Promise((resolve, reject) => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `postgres-${timestamp}.sql.gz`;
      const filepath = path.join(this.backupDir, filename);
      
      const cmd = `PGPASSWORD=${process.env.PGPASSWORD} pg_dump -h ${process.env.PGHOST || 'localhost'} -U ${process.env.PGUSER || 'postgres'} -d ${process.env.PGDATABASE || 'zass'} | gzip > ${filepath}`;
      
      exec(cmd, (error, stdout, stderr) => {
        if (error) {
          logger.error(`PostgreSQL backup failed: ${error.message}`);
          reject(error);
        } else {
          logger.info(`PostgreSQL backup created: ${filename}`);
          resolve({ filename, filepath, size: fs.statSync(filepath).size });
        }
      });
    });
  }

  // Backup Redis data
  async backupRedis() {
    return new Promise((resolve, reject) => {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `redis-${timestamp}.rdb`;
      const filepath = path.join(this.backupDir, filename);
      
      // Execute Redis SAVE command and copy dump.rdb
      exec(`redis-cli SAVE && cp /var/lib/redis/dump.rdb ${filepath}`, (error) => {
        if (error) {
          logger.error(`Redis backup failed: ${error.message}`);
          reject(error);
        } else {
          logger.info(`Redis backup created: ${filename}`);
          resolve({ filename, filepath, size: fs.statSync(filepath).size });
        }
      });
    });
  }

  // Upload backup to S3
  async uploadToS3(filepath, filename) {
    try {
      const fileContent = fs.readFileSync(filepath);
      
      const params = {
        Bucket: process.env.AWS_S3_BACKUP_BUCKET || 'zass-backups',
        Key: `backups/${new Date().toISOString().split('T')[0]}/${filename}`,
        Body: fileContent,
        StorageClass: 'STANDARD_IA'
      };
      
      const command = new PutObjectCommand(params);
      await s3Client.send(command);
      
      logger.info(`Uploaded ${filename} to S3`);
      return true;
    } catch (error) {
      logger.error(`S3 upload failed: ${error.message}`);
      return false;
    }
  }

  // Send backup notification email
  async sendNotification(backups, success = true) {
    try {
      const emailContent = `
        <h2>ZASS Backup Report</h2>
        <p>Time: ${new Date().toISOString()}</p>
        <p>Status: ${success ? 'SUCCESS' : 'FAILED'}</p>
        <h3>Backups:</h3>
        <ul>
          ${backups.map(b => `<li>${b.filename} - ${(b.size / 1024 / 1024).toFixed(2)} MB</li>`).join('')}
        </ul>
        <p>Location: ${process.env.AWS_S3_BACKUP_BUCKET ? 'S3 Cloud Storage' : 'Local Disk'}</p>
      `;
      
      await transporter.sendMail({
        to: process.env.ADMIN_EMAIL || 'admin@zass.website',
        subject: `[ZASS Backup] ${success ? 'Success' : 'Failure'} - ${new Date().toISOString()}`,
        html: emailContent
      });
      
      logger.info('Backup notification sent');
    } catch (error) {
      logger.error(`Notification failed: ${error.message}`);
    }
  }

  // Clean old backups (keep last 30 days)
  async cleanOldBackups() {
    try {
      const files = fs.readdirSync(this.backupDir);
      const now = Date.now();
      const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
      
      let deleted = 0;
      for (const file of files) {
        const filepath = path.join(this.backupDir, file);
        const stats = fs.statSync(filepath);
        
        if (now - stats.mtimeMs > maxAge) {
          fs.unlinkSync(filepath);
          deleted++;
        }
      }
      
      logger.info(`Cleaned ${deleted} old backups`);
      return deleted;
    } catch (error) {
      logger.error(`Clean backups failed: ${error.message}`);
      return 0;
    }
  }

  // Run full backup
  async runFullBackup() {
    this.ensureBackupDir();
    
    const backups = [];
    let allSuccess = true;
    
    try {
      // Backup MongoDB
      const mongoBackup = await this.backupMongoDB();
      backups.push(mongoBackup);
      if (process.env.AWS_S3_BACKUP_BUCKET) {
        await this.uploadToS3(mongoBackup.filepath, mongoBackup.filename);
      }
    } catch (error) {
      allSuccess = false;
      logger.error('MongoDB backup failed:', error);
    }
    
    try {
      // Backup PostgreSQL
      const pgBackup = await this.backupPostgreSQL();
      backups.push(pgBackup);
      if (process.env.AWS_S3_BACKUP_BUCKET) {
        await this.uploadToS3(pgBackup.filepath, pgBackup.filename);
      }
    } catch (error) {
      allSuccess = false;
      logger.error('PostgreSQL backup failed:', error);
    }
    
    // Clean old backups
    await this.cleanOldBackups();
    
    // Send notification
    await this.sendNotification(backups, allSuccess);
    
    return { success: allSuccess, backups };
  }
}

// Run backup if called directly
if (require.main === module) {
  const backupManager = new BackupManager();
  backupManager.runFullBackup().then(() => {
    process.exit(0);
  }).catch(() => {
    process.exit(1);
  });
}

module.exports = BackupManager;
