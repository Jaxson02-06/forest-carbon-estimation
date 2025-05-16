const { pool } = require('../config/db');

/**
 * 创建碳储量估算相关的数据库表
 */
const createCarbonEstimationTable = async () => {
  const client = await pool.connect();

  try {
    // 开始事务
    await client.query('BEGIN');

    // 创建碳储量估算作业表
    await client.query(`
      CREATE TABLE IF NOT EXISTS carbon_estimation_jobs (
        id SERIAL PRIMARY KEY,
        job_id VARCHAR(255) UNIQUE NOT NULL,
        tree_detection_job_id VARCHAR(255) REFERENCES tree_detection_jobs(job_id),
        status VARCHAR(50) DEFAULT 'created',
        results JSONB,
        error_message TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);
    
    // 创建树木属性数据表
    await client.query(`
      CREATE TABLE IF NOT EXISTS tree_attributes (
        id SERIAL PRIMARY KEY,
        job_id VARCHAR(255) REFERENCES carbon_estimation_jobs(job_id),
        tree_id VARCHAR(50) NOT NULL,
        height_m FLOAT,
        crown_diameter_m FLOAT,
        crown_area_m2 FLOAT,
        dbh_cm FLOAT,
        biomass_kg FLOAT,
        carbon_kg FLOAT,
        centroid_x FLOAT,
        centroid_y FLOAT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // 提交事务
    await client.query('COMMIT');
    console.log('碳储量估算数据库表创建成功');
    return true;
  } catch (error) {
    // 回滚事务
    await client.query('ROLLBACK');
    console.error('创建碳储量估算数据库表失败:', error);
    return false;
  } finally {
    // 释放客户端
    client.release();
  }
};

module.exports = { createCarbonEstimationTable }; 