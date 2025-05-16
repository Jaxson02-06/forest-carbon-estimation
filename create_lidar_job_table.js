const { pool } = require('../config/db');

// 创建 LiDAR 作业数据表
const createLidarJobTable = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS lidar_jobs (
        id SERIAL PRIMARY KEY,
        job_id VARCHAR(255) UNIQUE NOT NULL,
        filename VARCHAR(255),
        filepath TEXT,
        status VARCHAR(50) DEFAULT 'processing',
        results JSONB,
        error_message TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    console.log('LiDAR 作业表创建或已存在');
    return true;
  } catch (error) {
    console.error('创建 LiDAR 作业表失败:', error);
    return false;
  }
};

module.exports = { createLidarJobTable }; 