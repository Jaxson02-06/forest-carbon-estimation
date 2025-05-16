const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { pool } = require('../config/db');

// 创建我们自己的 asyncHandler 函数替代 express-async-handler
const asyncHandler = fn => (req, res, next) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * 上传CHM文件并处理单株树木检测
 * @route POST /api/tree-detection/upload
 * @access Private
 */
const uploadAndProcessCHM = asyncHandler(async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: '未上传CHM文件' 
      });
    }
    
    const jobId = Date.now().toString();
    const jobDir = path.join(process.cwd(), 'uploads', 'tree-detection', jobId);
    
    // 创建作业目录
    fs.mkdirSync(jobDir, { recursive: true });
    
    // 移动上传的文件到作业目录
    const chmFilePath = path.join(jobDir, req.file.originalname);
    fs.copyFileSync(req.file.path, chmFilePath);
    fs.unlinkSync(req.file.path); // 删除临时文件
    
    // 创建输出目录
    const outputDir = path.join(jobDir, 'output');
    fs.mkdirSync(outputDir, { recursive: true });
    
    // 将作业信息存入数据库
    await pool.query(
      'INSERT INTO tree_detection_jobs(job_id, chm_path, status, created_at) VALUES($1, $2, $3, NOW())',
      [jobId, chmFilePath, 'uploaded']
    );
    
    // 返回成功信息
    res.status(200).json({
      success: true,
      message: 'CHM文件上传成功',
      jobId: jobId
    });
    
    // 异步处理树冠检测
    processCHM(jobId, chmFilePath, outputDir);
    
  } catch (error) {
    console.error('上传CHM文件失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '服务器处理上传请求时出错',
      error: error.message
    });
  }
});

/**
 * 处理CHM文件，执行树冠检测
 * @param {string} jobId - 作业ID
 * @param {string} chmPath - CHM文件路径
 * @param {string} outputDir - 输出目录
 */
const processCHM = async (jobId, chmPath, outputDir) => {
  try {
    // 更新作业状态为处理中
    await pool.query(
      'UPDATE tree_detection_jobs SET status = $1, updated_at = NOW() WHERE job_id = $2',
      ['processing', jobId]
    );
    
    // 准备Python脚本路径
    const scriptPath = path.join(process.cwd(), 'server', 'scripts', 'tree_crown_detection.py');
    
    // 检查Python脚本是否存在
    if (!fs.existsSync(scriptPath)) {
      throw new Error('树冠检测脚本不存在');
    }
    
    // 通过配置从请求中获取参数，或使用默认值
    const minHeight = 2.0;           // 最小树高阈值
    const smoothSigma = 1.0;         // 高斯平滑参数
    const minDistance = 5;           // 树顶检测的最小距离
    
    // 启动Python脚本执行树冠检测
    const python = spawn('python', [
      scriptPath,
      chmPath,
      '--output-dir', outputDir,
      '--min-height', minHeight.toString(),
      '--smooth', smoothSigma.toString(),
      '--min-distance', minDistance.toString()
    ]);
    
    let stdout = '';
    let stderr = '';
    
    python.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log(`树冠检测输出: ${data}`);
    });
    
    python.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error(`树冠检测错误: ${data}`);
    });
    
    python.on('close', async (code) => {
      try {
        if (code !== 0) {
          console.error(`树冠检测失败，退出代码: ${code}`);
          await pool.query(
            'UPDATE tree_detection_jobs SET status = $1, error_message = $2, updated_at = NOW() WHERE job_id = $3',
            ['failed', stderr, jobId]
          );
          return;
        }
        
        // 从输出中提取GeoJSON和可视化图像的路径
        const geojsonPath = stdout.match(/GeoJSON: (.+)/)?.[1]?.trim();
        const vizPath = stdout.match(/Visualization: (.+)/)?.[1]?.trim();
        
        if (!geojsonPath) {
          throw new Error('未找到生成的GeoJSON文件路径');
        }
        
        // 相对于静态资源目录的路径，用于前端访问
        const baseDir = process.cwd();
        const relGeojsonPath = geojsonPath.replace(baseDir, '').replace(/\\/g, '/');
        const relVizPath = vizPath ? vizPath.replace(baseDir, '').replace(/\\/g, '/') : null;
        
        // 获取检测到的树木数量
        let treeCount = 0;
        if (fs.existsSync(geojsonPath)) {
          const geojsonContent = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
          treeCount = geojsonContent.features.filter(f => f.properties.type === 'tree_top').length;
        }
        
        // 更新作业结果
        const results = {
          geojson: relGeojsonPath,
          visualization: relVizPath,
          treeCount: treeCount
        };
        
        await pool.query(
          'UPDATE tree_detection_jobs SET status = $1, results = $2, updated_at = NOW() WHERE job_id = $3',
          ['completed', JSON.stringify(results), jobId]
        );
        
        console.log(`树冠检测成功完成，检测到 ${treeCount} 棵树`);
      } catch (error) {
        console.error('处理树冠检测结果失败:', error);
        await pool.query(
          'UPDATE tree_detection_jobs SET status = $1, error_message = $2, updated_at = NOW() WHERE job_id = $3',
          ['failed', error.message, jobId]
        );
      }
    });
    
  } catch (error) {
    console.error('树冠检测处理失败:', error);
    await pool.query(
      'UPDATE tree_detection_jobs SET status = $1, error_message = $2, updated_at = NOW() WHERE job_id = $3',
      ['failed', error.message, jobId]
    );
  }
};

/**
 * 获取树冠检测作业状态
 * @route GET /api/tree-detection/job/:jobId
 * @access Private
 */
const getJobStatus = asyncHandler(async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // 从数据库查询作业状态
    const result = await pool.query(
      'SELECT * FROM tree_detection_jobs WHERE job_id = $1',
      [jobId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '找不到指定的作业'
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
    console.error('查询作业状态时出错:', error);
    res.status(500).json({
      success: false,
      message: '服务器处理请求时出错',
      error: error.message
    });
  }
});

/**
 * 执行单株分割与树冠提取，使用自定义参数
 * @route POST /api/tree-detection/process
 * @access Private
 */
const processWithParams = asyncHandler(async (req, res) => {
  try {
    const { 
      jobId, 
      minHeight = 2.0,
      smoothSigma = 1.0,
      minDistance = 5 
    } = req.body;
    
    if (!jobId) {
      return res.status(400).json({ 
        success: false, 
        message: '缺少作业ID' 
      });
    }
    
    // 从数据库获取作业信息
    const result = await pool.query(
      'SELECT * FROM tree_detection_jobs WHERE job_id = $1',
      [jobId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: '作业不存在' 
      });
    }
    
    const job = result.rows[0];
    const chmPath = job.chm_path;
    const outputDir = path.join(path.dirname(chmPath), 'output');
    
    // 确保输出目录存在
    fs.mkdirSync(outputDir, { recursive: true });
    
    // 更新作业状态为处理中
    await pool.query(
      'UPDATE tree_detection_jobs SET status = $1, updated_at = NOW() WHERE job_id = $2',
      ['processing', jobId]
    );
    
    // 启动异步处理
    res.status(200).json({
      success: true,
      message: '开始处理树冠检测',
      jobId
    });
    
    // 准备Python脚本路径
    const scriptPath = path.join(process.cwd(), 'server', 'scripts', 'tree_crown_detection.py');
    
    // 启动Python脚本执行树冠检测
    const python = spawn('python', [
      scriptPath,
      chmPath,
      '--output-dir', outputDir,
      '--min-height', minHeight.toString(),
      '--smooth', smoothSigma.toString(),
      '--min-distance', minDistance.toString()
    ]);
    
    let stdout = '';
    let stderr = '';
    
    python.stdout.on('data', (data) => {
      stdout += data.toString();
      console.log(`树冠检测输出: ${data}`);
    });
    
    python.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error(`树冠检测错误: ${data}`);
    });
    
    python.on('close', async (code) => {
      try {
        if (code !== 0) {
          console.error(`树冠检测失败，退出代码: ${code}`);
          await pool.query(
            'UPDATE tree_detection_jobs SET status = $1, error_message = $2, updated_at = NOW() WHERE job_id = $3',
            ['failed', stderr, jobId]
          );
          return;
        }
        
        // 从输出中提取GeoJSON和可视化图像的路径
        const geojsonPath = stdout.match(/GeoJSON: (.+)/)?.[1]?.trim();
        const vizPath = stdout.match(/Visualization: (.+)/)?.[1]?.trim();
        
        if (!geojsonPath) {
          throw new Error('未找到生成的GeoJSON文件路径');
        }
        
        // 相对于静态资源目录的路径，用于前端访问
        const baseDir = process.cwd();
        const relGeojsonPath = geojsonPath.replace(baseDir, '').replace(/\\/g, '/');
        const relVizPath = vizPath ? vizPath.replace(baseDir, '').replace(/\\/g, '/') : null;
        
        // 获取检测到的树木数量
        let treeCount = 0;
        if (fs.existsSync(geojsonPath)) {
          const geojsonContent = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
          treeCount = geojsonContent.features.filter(f => f.properties.type === 'tree_top').length;
        }
        
        // 更新作业结果
        const results = {
          geojson: relGeojsonPath,
          visualization: relVizPath,
          treeCount: treeCount,
          parameters: {
            minHeight,
            smoothSigma,
            minDistance
          }
        };
        
        await pool.query(
          'UPDATE tree_detection_jobs SET status = $1, results = $2, updated_at = NOW() WHERE job_id = $3',
          ['completed', JSON.stringify(results), jobId]
        );
        
        console.log(`树冠检测成功完成，检测到 ${treeCount} 棵树`);
      } catch (error) {
        console.error('处理树冠检测结果失败:', error);
        await pool.query(
          'UPDATE tree_detection_jobs SET status = $1, error_message = $2, updated_at = NOW() WHERE job_id = $3',
          ['failed', error.message, jobId]
        );
      }
    });
    
  } catch (error) {
    console.error('树冠检测请求失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '服务器处理请求时出错',
      error: error.message
    });
  }
});

/**
 * 获取所有树冠检测作业
 * @route GET /api/tree-detection/jobs
 * @access Private
 */
const getAllJobs = asyncHandler(async (req, res) => {
  try {
    // 从数据库查询所有作业
    const result = await pool.query(
      'SELECT * FROM tree_detection_jobs ORDER BY created_at DESC'
    );
    
    // 处理结果
    const jobs = result.rows.map(job => {
      const jobData = {
        jobId: job.job_id,
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
    console.error('获取所有作业失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器处理请求时出错',
      error: error.message
    });
  }
});

module.exports = {
  uploadAndProcessCHM,
  getJobStatus,
  processWithParams,
  getAllJobs
}; 