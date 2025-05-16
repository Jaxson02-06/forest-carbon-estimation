const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { pool } = require('../config/db');
// 创建我们自己的 asyncHandler 函数替代 express-async-handler
const asyncHandler = fn => (req, res, next) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
};
const { exec } = require('child_process');
// 替代uuid的简单实现
const generateUniqueId = () => {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
};

// 确保目录存在
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// 进度通知管理器
const progressManager = {
  clients: {},
  
  // 注册客户端进度监听
  registerClient(jobId, res) {
    this.clients[jobId] = res;
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    res.write(`data: ${JSON.stringify({ status: 'started', progress: 0 })}\n\n`);
  },
  
  // 更新进度
  updateProgress(jobId, status, progress, message = '') {
    const client = this.clients[jobId];
    if (client) {
      client.write(`data: ${JSON.stringify({ status, progress, message })}\n\n`);
    }
  },
  
  // 完成并关闭连接
  completeJob(jobId, result) {
    const client = this.clients[jobId];
    if (client) {
      client.write(`data: ${JSON.stringify({ status: 'completed', progress: 100, result })}\n\n`);
      client.end();
      delete this.clients[jobId];
    }
  },
  
  // 处理错误
  handleError(jobId, error) {
    const client = this.clients[jobId];
    if (client) {
      client.write(`data: ${JSON.stringify({ status: 'error', error: error.message })}\n\n`);
      client.end();
      delete this.clients[jobId];
    }
  }
};

/**
 * 创建新的多光谱处理作业
 * @param {Array} files - 上传的多光谱影像文件
 * @returns {Object} - 作业信息
 */
const createMultispectralJob = async (files) => {
  try {
    const jobId = Date.now().toString();
    const jobDir = path.join(process.cwd(), 'uploads', 'multispectral', jobId);
    
    // 创建作业目录
    fs.mkdirSync(jobDir, { recursive: true });
    fs.mkdirSync(path.join(jobDir, 'images'), { recursive: true });
    
    // 移动上传的文件到作业目录
    const filePaths = [];
    for (const file of files) {
      const destPath = path.join(jobDir, 'images', file.originalname);
      fs.copyFileSync(file.path, destPath);
      fs.unlinkSync(file.path); // 删除临时文件
      filePaths.push(destPath);
    }
    
    // 创建输出目录
    fs.mkdirSync(path.join(jobDir, 'ortho'), { recursive: true });
    fs.mkdirSync(path.join(jobDir, 'registered'), { recursive: true });
    
    // 将作业信息存入数据库
    await pool.query(
      'INSERT INTO multispectral_jobs(job_id, status, created_at) VALUES($1, $2, NOW())',
      [jobId, 'uploaded']
    );
    
    return {
      jobId,
      jobDir,
      filePaths
    };
  } catch (error) {
    console.error('创建多光谱处理作业失败:', error);
    throw error;
  }
};

/**
 * 更新作业状态
 * @param {string} jobId - 作业ID
 * @param {string} status - 作业状态
 * @param {string} errorMsg - 错误信息
 */
const updateJobStatus = async (jobId, status, errorMsg = null) => {
  try {
    await pool.query(
      'UPDATE multispectral_jobs SET status = $1, error_message = $2, updated_at = NOW() WHERE job_id = $3',
      [status, errorMsg, jobId]
    );
  } catch (error) {
    console.error('更新作业状态失败:', error);
  }
};

/**
 * 保存作业结果
 * @param {string} jobId - 作业ID
 * @param {Object} results - 处理结果
 */
const saveJobResults = async (jobId, results) => {
  try {
    await pool.query(
      'UPDATE multispectral_jobs SET results = $1, status = $2, updated_at = NOW() WHERE job_id = $3',
      [JSON.stringify(results), 'completed', jobId]
    );
  } catch (error) {
    console.error('保存作业结果失败:', error);
    throw error;
  }
};

/**
 * 执行ODM正射校正
 * @param {string} jobId - 作业ID
 * @param {string} jobDir - 作业目录
 * @param {string} demPath - DEM文件路径
 * @returns {Promise<string>} - 正射影像输出路径
 */
const performOrthorectification = (jobId, jobDir, demPath) => {
  return new Promise((resolve, reject) => {
    progressManager.updateProgress(jobId, 'processing', 10, '正在准备ODM正射校正...');
    
    // ODM输出路径
    const outputDir = path.join(jobDir, 'ortho');
    const orthoOutputPath = path.join(outputDir, 'odm_orthophoto.tif');
    
    // 构建ODM命令
    // 注意: 在实际环境中需要根据Docker安装情况调整命令
    // 这里简化为直接调用ODM命令行，实际使用时应调整为Docker方式
    const odmArgs = [
      'run', '-ti', '--rm',
      '-v', `${jobDir}:/datasets/project`,
      'opendronemap/odm',
      '--project-path', '/datasets/project',
      'project',
      '--align', `/datasets/project/${path.basename(demPath)}`,
      '--end-with', 'odm_orthophoto',
      '--orthophoto-resolution', '5',
      '--verbose'
    ];
    
    // 拷贝DEM到作业目录
    try {
      fs.copyFileSync(demPath, path.join(jobDir, path.basename(demPath)));
    } catch (error) {
      console.error('拷贝DEM文件失败:', error);
      reject(new Error('无法拷贝DEM文件'));
      return;
    }
    
    // 启动ODM进程
    progressManager.updateProgress(jobId, 'processing', 15, '启动ODM处理...');
    const odm = spawn('docker', odmArgs);
    
    let stderr = '';
    
    odm.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`ODM输出: ${output}`);
      
      // 根据输出更新进度
      if (output.includes('running dataset stage')) {
        progressManager.updateProgress(jobId, 'processing', 20, '正在处理数据集...');
      } else if (output.includes('running split stage')) {
        progressManager.updateProgress(jobId, 'processing', 25, '分割处理中...');
      } else if (output.includes('running merge stage')) {
        progressManager.updateProgress(jobId, 'processing', 35, '合并处理中...');
      } else if (output.includes('running orthophoto stage')) {
        progressManager.updateProgress(jobId, 'processing', 45, '正在生成正射影像...');
      }
    });
    
    odm.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error(`ODM错误: ${data}`);
    });
    
    odm.on('close', (code) => {
      if (code !== 0) {
        progressManager.updateProgress(jobId, 'error', 0, `ODM处理失败，错误代码: ${code}`);
        reject(new Error(`ODM处理失败: ${stderr}`));
      } else {
        progressManager.updateProgress(jobId, 'processing', 50, 'ODM正射校正完成');
        
        // 检查输出文件是否存在
        if (fs.existsSync(orthoOutputPath)) {
          resolve(orthoOutputPath);
        } else {
          reject(new Error('ODM处理完成但未找到输出文件'));
        }
      }
    });
  });
};

/**
 * 执行影像配准
 * @param {string} jobId - 作业ID
 * @param {string} orthoPath - 正射影像路径
 * @param {string} chmPath - CHM影像路径
 * @returns {Promise<string>} - 配准后的影像路径
 */
const performImageRegistration = (jobId, orthoPath, chmPath) => {
  return new Promise((resolve, reject) => {
    progressManager.updateProgress(jobId, 'processing', 55, '正在准备影像配准...');
    
    // 配准输出路径
    const jobDir = path.dirname(path.dirname(orthoPath));
    const outputDir = path.join(jobDir, 'registered');
    const registeredOutputPath = path.join(outputDir, 'registered.tif');
    
    // 准备Python脚本路径
    const scriptPath = path.join(process.cwd(), 'server', 'scripts', 'register_image.py');
    
    // 检查Python脚本是否存在
    if (!fs.existsSync(scriptPath)) {
      reject(new Error('配准脚本不存在'));
      return;
    }
    
    // 启动Python配准脚本
    progressManager.updateProgress(jobId, 'processing', 60, '启动图像配准处理...');
    const python = spawn('python', [scriptPath, orthoPath, chmPath, registeredOutputPath]);
    
    let stderr = '';
    
    python.stdout.on('data', (data) => {
      const output = data.toString();
      console.log(`配准输出: ${output}`);
      
      // 解析进度信息
      if (output.includes('Extracting features')) {
        progressManager.updateProgress(jobId, 'processing', 65, '正在提取图像特征...');
      } else if (output.includes('Matching features')) {
        progressManager.updateProgress(jobId, 'processing', 70, '正在匹配特征点...');
      } else if (output.includes('Computing homography')) {
        progressManager.updateProgress(jobId, 'processing', 80, '计算变换矩阵...');
      } else if (output.includes('Warping image')) {
        progressManager.updateProgress(jobId, 'processing', 85, '正在变换影像...');
      }
    });
    
    python.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error(`配准错误: ${data}`);
    });
    
    python.on('close', (code) => {
      if (code !== 0) {
        progressManager.updateProgress(jobId, 'error', 0, `影像配准失败，错误代码: ${code}`);
        reject(new Error(`影像配准失败: ${stderr}`));
      } else {
        progressManager.updateProgress(jobId, 'processing', 90, '影像配准完成');
        
        // 检查输出文件是否存在
        if (fs.existsSync(registeredOutputPath)) {
          resolve(registeredOutputPath);
        } else {
          reject(new Error('配准处理完成但未找到输出文件'));
        }
      }
    });
  });
};

/**
 * 应用手动调整
 * @param {string} jobId - 作业ID
 * @param {string} registeredPath - 自动配准影像路径
 * @param {number} dx - X方向偏移量
 * @param {number} dy - Y方向偏移量
 * @returns {Promise<string>} - 最终调整后的影像路径
 */
const applyManualAdjustment = (jobId, registeredPath, dx, dy) => {
  return new Promise((resolve, reject) => {
    progressManager.updateProgress(jobId, 'processing', 95, '应用手动调整...');
    
    // 调整后输出路径
    const jobDir = path.dirname(path.dirname(registeredPath));
    const outputDir = path.join(jobDir, 'registered');
    const finalOutputPath = path.join(outputDir, 'final_adjusted.tif');
    
    // 准备Python脚本路径
    const scriptPath = path.join(process.cwd(), 'server', 'scripts', 'adjust_image.py');
    
    // 检查Python脚本是否存在
    if (!fs.existsSync(scriptPath)) {
      reject(new Error('调整脚本不存在'));
      return;
    }
    
    // 启动Python调整脚本
    const python = spawn('python', [
      scriptPath, 
      registeredPath, 
      finalOutputPath,
      dx.toString(),
      dy.toString()
    ]);
    
    let stderr = '';
    
    python.stdout.on('data', (data) => {
      console.log(`调整输出: ${data}`);
    });
    
    python.stderr.on('data', (data) => {
      stderr += data.toString();
      console.error(`调整错误: ${data}`);
    });
    
    python.on('close', (code) => {
      if (code !== 0) {
        progressManager.updateProgress(jobId, 'error', 0, `手动调整失败，错误代码: ${code}`);
        reject(new Error(`手动调整失败: ${stderr}`));
      } else {
        progressManager.updateProgress(jobId, 'processing', 100, '处理完成');
        
        // 检查输出文件是否存在
        if (fs.existsSync(finalOutputPath)) {
          resolve(finalOutputPath);
        } else {
          reject(new Error('调整处理完成但未找到输出文件'));
        }
      }
    });
  });
};

/**
 * 完整的多光谱影像处理流程
 * @param {Object} job - 作业信息 
 * @param {string} demPath - DEM路径
 * @param {string} chmPath - CHM路径
 */
const processMultispectralPipeline = async (job, demPath, chmPath) => {
  try {
    const { jobId, jobDir } = job;
    
    // 更新作业状态为处理中
    await updateJobStatus(jobId, 'processing');
    
    // 1. 执行正射校正
    const orthoPath = await performOrthorectification(jobId, jobDir, demPath);
    
    // 2. 执行影像配准
    const registeredPath = await performImageRegistration(jobId, orthoPath, chmPath);
    
    // 处理完成，保存结果
    const results = {
      ortho: `/outputs/multispectral/${jobId}/ortho/odm_orthophoto.tif`,
      registered: `/outputs/multispectral/${jobId}/registered/registered.tif`
    };
    
    await saveJobResults(jobId, results);
    
    // 通知客户端处理完成
    progressManager.completeJob(jobId, {
      jobId,
      outputs: results
    });
    
  } catch (error) {
    console.error('多光谱影像处理失败:', error);
    await updateJobStatus(job.jobId, 'failed', error.message);
    progressManager.handleError(job.jobId, error);
  }
};

/**
 * 上传多光谱影像处理
 * @route POST /api/multispectral/upload
 * @access Private
 */
const uploadMultispectralImages = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: '没有上传文件' 
      });
    }
    
    // 创建新的处理作业
    const job = await createMultispectralJob(req.files);
    
    res.status(200).json({
      success: true,
      message: '文件上传成功',
      jobId: job.jobId
    });
    
  } catch (error) {
    console.error('上传多光谱影像失败:', error);
    res.status(500).json({ 
      success: false, 
      message: '服务器处理上传请求时出错',
      error: error.message
    });
  }
};

/**
 * 开始多光谱影像处理
 * @route POST /api/multispectral/process
 * @access Private
 */
const processMultispectralImages = async (req, res) => {
  try {
    const { jobId, demPath, chmPath } = req.body;
    
    if (!jobId || !demPath || !chmPath) {
      return res.status(400).json({ 
        success: false, 
        message: '缺少必要参数' 
      });
    }
    
    // 检查文件是否存在
    if (!fs.existsSync(demPath)) {
      return res.status(404).json({ 
        success: false, 
        message: 'DEM文件不存在' 
      });
    }
    
    if (!fs.existsSync(chmPath)) {
      return res.status(404).json({ 
        success: false, 
        message: 'CHM文件不存在' 
      });
    }
    
    // 获取作业目录
    const jobDir = path.join(process.cwd(), 'uploads', 'multispectral', jobId);
    if (!fs.existsSync(jobDir)) {
      return res.status(404).json({ 
        success: false, 
        message: '作业不存在' 
      });
    }
    
    const job = { jobId, jobDir };
    
    // 启动异步处理
    res.status(200).json({
      success: true,
      message: '开始处理多光谱影像',
      jobId
    });
    
    // 异步执行处理流程
    processMultispectralPipeline(job, demPath, chmPath).catch(error => {
      console.error('处理多光谱影像失败:', error);
    });
    
  } catch (error) {
    console.error('处理请求错误:', error);
    res.status(500).json({ 
      success: false, 
      message: '服务器处理请求时出错',
      error: error.message
    });
  }
};

/**
 * 应用手动微调
 * @route POST /api/multispectral/adjust
 * @access Private
 */
const adjustMultispectralImages = async (req, res) => {
  try {
    const { jobId, dx, dy } = req.body;
    
    if (!jobId || typeof dx !== 'number' || typeof dy !== 'number') {
      return res.status(400).json({ 
        success: false, 
        message: '缺少必要参数或参数类型错误' 
      });
    }
    
    // 获取作业信息
    const result = await pool.query(
      'SELECT * FROM multispectral_jobs WHERE job_id = $1',
      [jobId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: '作业不存在' 
      });
    }
    
    const job = result.rows[0];
    
    // 检查作业状态
    if (job.status !== 'completed') {
      return res.status(400).json({ 
        success: false, 
        message: '只能调整已完成的作业' 
      });
    }
    
    // 获取已注册的影像路径
    const results = JSON.parse(job.results);
    const registeredPath = path.join(process.cwd(), results.registered.replace(/^\//, ''));
    
    // 启动异步调整
    res.status(200).json({
      success: true,
      message: '开始应用手动调整',
      jobId
    });
    
    // 执行手动调整
    try {
      const finalPath = await applyManualAdjustment(jobId, registeredPath, dx, dy);
      
      // 更新结果
      const updatedResults = {
        ...results,
        final: `/outputs/multispectral/${jobId}/registered/final_adjusted.tif`
      };
      
      await saveJobResults(jobId, updatedResults);
      
      // 通知客户端处理完成
      progressManager.completeJob(jobId, {
        jobId,
        outputs: updatedResults
      });
      
    } catch (error) {
      console.error('手动调整失败:', error);
      progressManager.handleError(jobId, error);
    }
    
  } catch (error) {
    console.error('处理调整请求错误:', error);
    res.status(500).json({ 
      success: false, 
      message: '服务器处理请求时出错',
      error: error.message
    });
  }
};

/**
 * 获取作业状态
 * @route GET /api/multispectral/job/:jobId
 * @access Private
 */
const getJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // 从数据库查询作业状态
    const result = await pool.query(
      'SELECT * FROM multispectral_jobs WHERE job_id = $1',
      [jobId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: '找不到指定的作业'
      });
    }
    
    const job = result.rows[0];
    
    // 根据作业状态返回相应结果
    if (job.status === 'completed') {
      const outputs = job.results ? JSON.parse(job.results) : {};
      
      res.status(200).json({
        success: true,
        jobId,
        status: job.status,
        outputs
      });
    } else if (job.status === 'failed') {
      res.status(200).json({
        success: false,
        jobId,
        status: job.status,
        error: job.error_message
      });
    } else {
      res.status(200).json({
        success: true,
        jobId,
        status: job.status,
        message: '处理中'
      });
    }
  } catch (error) {
    console.error('查询作业状态时出错:', error);
    res.status(500).json({
      success: false,
      message: '服务器处理请求时出错',
      error: error.message
    });
  }
};

/**
 * 监听处理进度
 * @route GET /api/multispectral/progress/:jobId
 * @access Private
 */
const monitorProgress = (req, res) => {
  const { jobId } = req.params;
  
  // 注册 SSE 客户端
  progressManager.registerClient(jobId, res);
  
  // 客户端关闭连接时清理
  req.on('close', () => {
    delete progressManager.clients[jobId];
  });
};

module.exports = {
  uploadMultispectralImages,
  processMultispectralImages,
  adjustMultispectralImages,
  getJobStatus,
  monitorProgress
}; 