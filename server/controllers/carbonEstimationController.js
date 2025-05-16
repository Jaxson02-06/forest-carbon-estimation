const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { pool } = require('../config/db');

// 创建我们自己的 asyncHandler 函数替代 express-async-handler
const asyncHandler = fn => (req, res, next) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * 计算单株属性和碳储量
 * @route POST /api/carbon-estimation/calculate
 * @access Private
 */
const calculateCarbonEstimation = asyncHandler(async (req, res) => {
  try {
    const { 
      jobId, 
      demPath,  // 可选参数
      modelParams 
    } = req.body;
    
    if (!jobId) {
      return res.status(400).json({ 
        success: false, 
        message: '缺少作业ID' 
      });
    }
    
    // 从数据库获取树冠检测作业信息
    const result = await pool.query(
      'SELECT * FROM tree_detection_jobs WHERE job_id = $1',
      [jobId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: '找不到指定的树冠检测作业' 
      });
    }
    
    const job = result.rows[0];
    
    // 检查作业状态是否为已完成
    if (job.status !== 'completed') {
      return res.status(400).json({
        success: false,
        message: '树冠检测作业尚未完成，无法计算碳储量'
      });
    }
    
    // 检查结果中是否包含GeoJSON路径
    const results = job.results ? JSON.parse(job.results) : {};
    if (!results.geojson) {
      return res.status(400).json({
        success: false,
        message: '未找到树冠检测结果GeoJSON'
      });
    }
    
    // 获取CHM文件路径
    const chmPath = job.chm_path;
    
    // 准备输出目录
    const outputDir = path.join(path.dirname(chmPath), 'carbon');
    fs.mkdirSync(outputDir, { recursive: true });
    
    // 创建碳储量估算作业记录
    const carbonJobId = Date.now().toString();
    await pool.query(
      'INSERT INTO carbon_estimation_jobs(job_id, tree_detection_job_id, status, created_at) VALUES($1, $2, $3, NOW())',
      [carbonJobId, jobId, 'processing']
    );
    
    // 发送成功响应，继续异步处理
    res.status(200).json({
      success: true,
      message: '碳储量估算处理已启动',
      carbonJobId
    });
    
    // 准备Python脚本路径
    const scriptPath = path.join(process.cwd(), 'server', 'scripts', 'tree_attributes.py');
    
    // 准备GeoJSON文件的完整路径
    const geojsonPath = path.join(process.cwd(), results.geojson.replace(/^\//, ''));
    
    // 准备模型参数
    const a = modelParams?.a || 0.05;
    const b = modelParams?.b || 2.0;
    const c = modelParams?.c || 1.0;
    const carbonFactor = modelParams?.carbonFactor || 0.5;
    
    // 构建Python脚本参数
    let pythonArgs = [
      scriptPath,
      '--geojson', geojsonPath,
      '--chm', chmPath,
      '--output-dir', outputDir,
      '--a', a.toString(),
      '--b', b.toString(),
      '--c', c.toString(),
      '--carbon-factor', carbonFactor.toString()
    ];
    
    // 如果提供了DEM路径，添加到参数列表
    if (demPath) {
      const fullDemPath = path.join(process.cwd(), demPath.replace(/^\//, ''));
      if (fs.existsSync(fullDemPath)) {
        pythonArgs.push('--dem', fullDemPath);
      }
    }
    
    // 启动Python进程
    const python = spawn('python', pythonArgs);
    
    let stdout = '';
    let stderr = '';
    
    python.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log(`碳储量估算输出: ${data}`);
    });
    
    python.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error(`碳储量估算错误: ${data}`);
    });
    
    python.on('close', async (code) => {
      try {
        if (code !== 0) {
          console.error(`碳储量估算失败，退出代码: ${code}`);
          await pool.query(
            'UPDATE carbon_estimation_jobs SET status = $1, error_message = $2, updated_at = NOW() WHERE job_id = $3',
            ['failed', stderr, carbonJobId]
          );
          return;
        }
        
        // 从输出中提取CSV路径和摘要
        const csvPath = stdout.match(/CSV: (.+)/)?.[1]?.trim();
        const summaryMatch = stdout.match(/SUMMARY: (.+)/)?.[1]?.trim();
        
        if (!csvPath || !summaryMatch) {
          throw new Error('未找到生成的CSV文件路径或摘要信息');
        }
        
        // 解析摘要JSON
        const summary = JSON.parse(summaryMatch);
        
        // 相对于静态资源目录的路径，用于前端访问
        const baseDir = process.cwd();
        const relCsvPath = csvPath.replace(baseDir, '').replace(/\\/g, '/');
        
        // 更新作业结果
        const results = {
          csv: relCsvPath,
          summary: summary,
          modelParams: {
            a,
            b,
            c,
            carbonFactor
          }
        };
        
        await pool.query(
          'UPDATE carbon_estimation_jobs SET status = $1, results = $2, updated_at = NOW() WHERE job_id = $3',
          ['completed', JSON.stringify(results), carbonJobId]
        );
        
        console.log(`碳储量估算成功完成，总碳储量: ${summary.total_carbon_t.toFixed(2)} 吨`);
      } catch (error) {
        console.error('处理碳储量估算结果失败:', error);
        await pool.query(
          'UPDATE carbon_estimation_jobs SET status = $1, error_message = $2, updated_at = NOW() WHERE job_id = $3',
          ['failed', error.message, carbonJobId]
        );
      }
    });
    
  } catch (error) {
    console.error('碳储量估算请求失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '服务器处理请求时出错',
      error: error.message
    });
  }
});

/**
 * 获取碳储量估算作业状态
 * @route GET /api/carbon-estimation/job/:jobId
 * @access Private
 */
const getCarbonJobStatus = asyncHandler(async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // 从数据库查询作业状态
    const result = await pool.query(
      'SELECT * FROM carbon_estimation_jobs WHERE job_id = $1',
      [jobId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '找不到指定的碳储量估算作业'
      });
    }
    
    const job = result.rows[0];
    
    // 处理结果响应
    let response = {
      success: true,
      jobId,
      status: job.status,
      createdAt: job.created_at,
      updatedAt: job.updated_at
    };
    
    if (job.status === 'completed' && job.results) {
      response.results = JSON.parse(job.results);
    } else if (job.status === 'failed') {
      response.error = job.error_message;
      response.success = false;
    }
    
    res.status(200).json(response);
    
  } catch (error) {
    console.error('查询碳储量估算作业状态时出错:', error);
    res.status(500).json({
      success: false,
      message: '服务器处理请求时出错',
      error: error.message
    });
  }
});

/**
 * 获取所有碳储量估算作业
 * @route GET /api/carbon-estimation/jobs
 * @access Private
 */
const getAllCarbonJobs = asyncHandler(async (req, res) => {
  try {
    // 从数据库查询所有作业
    const result = await pool.query(
      'SELECT c.*, t.chm_path FROM carbon_estimation_jobs c ' +
      'LEFT JOIN tree_detection_jobs t ON c.tree_detection_job_id = t.job_id ' +
      'ORDER BY c.created_at DESC'
    );
    
    // 处理结果
    const jobs = result.rows.map(job => {
      const jobData = {
        jobId: job.job_id,
        treeDetectionJobId: job.tree_detection_job_id,
        status: job.status,
        createdAt: job.created_at,
        updatedAt: job.updated_at
      };
      
      if (job.status === 'completed' && job.results) {
        jobData.results = JSON.parse(job.results);
      } else if (job.status === 'failed') {
        jobData.error = job.error_message;
      }
      
      return jobData;
    });
    
    res.status(200).json({
      success: true,
      jobs
    });
    
  } catch (error) {
    console.error('获取所有碳储量估算作业失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器处理请求时出错',
      error: error.message
    });
  }
});

module.exports = {
  calculateCarbonEstimation,
  getCarbonJobStatus,
  getAllCarbonJobs
}; 