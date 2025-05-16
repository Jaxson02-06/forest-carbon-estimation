const { pool } = require('../config/db');

/**
 * 创建树冠检测相关的数据库表
 */
const createTreeDetectionTable = async () => {
  const client = await pool.connect();

  try {
    // 开始事务
    await client.query('BEGIN');

    // 创建树冠检测作业表
    await client.query(`
      CREATE TABLE IF NOT EXISTS tree_detection_jobs (
        id SERIAL PRIMARY KEY,
        job_id VARCHAR(255) UNIQUE NOT NULL,
        chm_path VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'uploaded',
        results JSONB,
        error_message TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    // 创建树冠检测结果表，用于存储单株树木信息
    await client.query(`
      CREATE TABLE IF NOT EXISTS tree_crown_data (
        id SERIAL PRIMARY KEY,
        job_id VARCHAR(255) REFERENCES tree_detection_jobs(job_id),
        tree_id VARCHAR(50) NOT NULL,
        height FLOAT,
        crown_area FLOAT,
        center_x FLOAT,
        center_y FLOAT,
        geometry JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // 提交事务
    await client.query('COMMIT');
    console.log('树冠检测数据库表创建成功');
    return true;
  } catch (error) {
    // 回滚事务
    await client.query('ROLLBACK');
    console.error('创建树冠检测数据库表失败:', error);
    return false;
  } finally {
    // 释放客户端
    client.release();
  }
};

module.exports = { createTreeDetectionTable }; 