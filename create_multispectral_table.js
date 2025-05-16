const { pool } = require('../config/db');

/**
 * 创建多光谱影像处理相关的数据库表
 */
const createMultispectralTables = async () => {
  const client = await pool.connect();

  try {
    // 开始事务
    await client.query('BEGIN');

    // 创建多光谱影像上传表
    await client.query(`
      CREATE TABLE IF NOT EXISTS multispectral_uploads (
        id VARCHAR(36) PRIMARY KEY,
        user_id INTEGER NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'uploaded',
        file_count INTEGER NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        ortho_completed_at TIMESTAMP,
        registration_completed_at TIMESTAMP,
        chm_id VARCHAR(36),
        logs JSONB,
        registration_logs JSONB
      );
    `);

    // 创建CHM文件表（如果不存在）
    await client.query(`
      CREATE TABLE IF NOT EXISTS chm_files (
        id VARCHAR(36) PRIMARY KEY,
        user_id INTEGER NOT NULL,
        file_path VARCHAR(255) NOT NULL,
        description TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        metadata JSONB
      );
    `);

    // 创建多光谱处理作业表
    await client.query(`
      CREATE TABLE IF NOT EXISTS multispectral_jobs (
        id SERIAL PRIMARY KEY,
        job_id VARCHAR(255) UNIQUE NOT NULL,
        status VARCHAR(50) DEFAULT 'uploaded',
        results JSONB,
        error_message TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    // 创建多光谱分析结果表
    await client.query(`
      CREATE TABLE IF NOT EXISTS multispectral_results (
        id SERIAL PRIMARY KEY,
        job_id VARCHAR(255) REFERENCES multispectral_jobs(job_id),
        region_id INTEGER,
        ndvi_mean FLOAT,
        ndvi_min FLOAT,
        ndvi_max FLOAT,
        indices JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // 提交事务
    await client.query('COMMIT');
    console.log('多光谱影像数据库表创建成功');
    return true;
  } catch (error) {
    // 回滚事务
    await client.query('ROLLBACK');
    console.error('创建多光谱影像数据库表失败:', error);
    return false;
  } finally {
    // 释放客户端
    client.release();
  }
};

module.exports = { createMultispectralTables }; 