const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const writeFileAsync = promisify(fs.writeFile);
const mkdirAsync = promisify(fs.mkdir);
const existsAsync = promisify(fs.exists);
const { spawn } = require('child_process');
const { pool } = require('../config/db');

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
 * @desc    处理LiDAR点云数据，提取地面点
 * @route   POST /api/lidar/process
 * @access  私有
 */
const processLidarData = async (req, res) => {
  try {
    const { filePath, jobId } = req.body;
    
    if (!filePath) {
      return res.status(400).json({ success: false, message: '缺少文件路径' });
    }
    
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: '文件不存在' });
    }
    
    // 创建唯一作业ID，如果未提供
    const processingJobId = jobId || Date.now().toString();
    
    // 创建输出目录
    const outputDir = path.join(process.cwd(), 'outputs', processingJobId);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // 获取请求中的参数，使用默认值
    const options = {
      resolution: parseFloat(req.body.resolution || '1.0'),
      groundFilterThreshold: parseFloat(req.body.groundFilterThreshold || '1.0'),
      smoothRadius: parseInt(req.body.smoothRadius || '2')
    };
    
    // 启动异步处理
    res.status(200).json({
      success: true,
      message: '开始处理 LiDAR 数据',
      jobId: processingJobId
    });
    
    // 异步执行处理步骤
    processPipeline(filePath, processingJobId, options).catch(error => {
      console.error('处理 LiDAR 数据失败:', error);
    });
    
  } catch (error) {
    console.error('处理请求错误:', error);
    res.status(500).json({ 
      success: false, 
      message: '服务器处理 LiDAR 数据时出错',
      error: error.message
    });
    }
};

/**
 * 处理 LiDAR 数据的流水线
 */
const processPipeline = async (filePath, jobId, options) => {
  try {
    const outputDir = path.join(process.cwd(), 'outputs', jobId);
    const inputFile = filePath;
    const groundFile = path.join(outputDir, 'ground.laz');
    const demFile = path.join(outputDir, 'dem.tif');
    const dsmFile = path.join(outputDir, 'dsm.tif');
    const chmFile = path.join(outputDir, 'chm.tif');
    
    // 1. 地面点分类
    await classifyGroundPoints(inputFile, groundFile, jobId, options);
    
    // 2. 生成 DEM
    await createDEM(groundFile, demFile, jobId, options);
    
    // 3. 生成 DSM
    await createDSM(inputFile, dsmFile, jobId, options);
    
    // 4. 计算 CHM
    await calculateCHM(demFile, dsmFile, chmFile, jobId, options);
    
    // 处理完成，保存结果信息到数据库
    await saveLidarResults(jobId, {
      dem: `/outputs/${jobId}/dem.tif`,
      dsm: `/outputs/${jobId}/dsm.tif`,
      chm: `/outputs/${jobId}/chm.tif`
    });
    
    // 通知客户端处理完成
    progressManager.completeJob(jobId, {
      jobId,
      outputs: {
        dem: `/outputs/${jobId}/dem.tif`,
        dsm: `/outputs/${jobId}/dsm.tif`,
        chm: `/outputs/${jobId}/chm.tif`
      }
    });
    
  } catch (error) {
    console.error('LiDAR 处理流水线失败:', error);
    progressManager.handleError(jobId, error);
    // 更新数据库中的状态为失败
    await updateJobStatus(jobId, 'failed', error.message);
  }
};

/**
 * 地面点分类
 */
const classifyGroundPoints = async (inputFile, outputFile, jobId, options) => {
  return new Promise((resolve, reject) => {
    progressManager.updateProgress(jobId, 'processing', 10, '正在进行地面点分类...');
    
    // 构建 PDAL 管道 JSON
    const pipelineJson = {
      pipeline: [
        inputFile,
        {
          type: "filters.csf",
          cloth_resolution: options.groundFilterThreshold || 0.5,
          rigidness: 1
        },
        {
          type: "filters.range",
          limits: "Classification[2:2]" // 只提取分类为地面点(2)的点
        },
        outputFile
      ]
    };
    
    // 将管道配置写入临时文件
    const pipelinePath = path.join(path.dirname(outputFile), 'ground_pipeline.json');
    fs.writeFileSync(pipelinePath, JSON.stringify(pipelineJson, null, 2));
    
    // 执行 PDAL 命令
    const pdal = spawn('pdal', ['pipeline', pipelinePath]);
    
    let stderr = '';
    
    pdal.stdout.on('data', (data) => {
      console.log(`地面点分类输出: ${data}`);
      // 更新进度（可以基于输出解析实际进度）
      progressManager.updateProgress(jobId, 'processing', 15, '正在进行地面点分类...');
    });
    
    pdal.stderr.on('data', (data) => {
      stderr += data;
      console.error(`地面点分类错误: ${data}`);
    });
    
    pdal.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`地面点分类失败，退出代码: ${code}，错误: ${stderr}`));
      } else {
        progressManager.updateProgress(jobId, 'processing', 25, '地面点分类完成');
        resolve();
      }
    });
  });
};

/**
 * 生成 DEM
 */
const createDEM = async (groundFile, outputFile, jobId, options) => {
  return new Promise((resolve, reject) => {
    progressManager.updateProgress(jobId, 'processing', 30, '正在生成数字高程模型(DEM)...');
    
    const resolution = options.resolution || 1.0;
    
    // 构建 PDAL 管道 JSON
    const pipelineJson = {
      pipeline: [
        groundFile,
        {
          type: "writers.gdal",
          filename: outputFile,
          gdaldriver: "GTiff",
          output_type: "all", // 所有点用于插值
          resolution: resolution.toString()
        }
      ]
    };

    // 将管道配置写入临时文件
    const pipelinePath = path.join(path.dirname(outputFile), 'dem_pipeline.json');
    fs.writeFileSync(pipelinePath, JSON.stringify(pipelineJson, null, 2));
    
    // 执行 PDAL 命令
    const pdal = spawn('pdal', ['pipeline', pipelinePath]);
    
    let stderr = '';
    
    pdal.stdout.on('data', (data) => {
      console.log(`DEM 生成输出: ${data}`);
      progressManager.updateProgress(jobId, 'processing', 40, '正在生成数字高程模型(DEM)...');
    });
    
    pdal.stderr.on('data', (data) => {
      stderr += data;
      console.error(`DEM 生成错误: ${data}`);
    });
    
    pdal.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`DEM 生成失败，退出代码: ${code}，错误: ${stderr}`));
      } else {
        progressManager.updateProgress(jobId, 'processing', 50, 'DEM 生成完成');
        resolve();
      }
    });
  });
};

/**
 * 生成 DSM
 */
const createDSM = async (inputFile, outputFile, jobId, options) => {
  return new Promise((resolve, reject) => {
    progressManager.updateProgress(jobId, 'processing', 55, '正在生成数字表面模型(DSM)...');
    
    const resolution = options.resolution || 1.0;
    
    // 构建 PDAL 管道 JSON
    const pipelineJson = {
      pipeline: [
        inputFile,
        {
          // 可以选择只使用第一回波点
          type: "filters.range",
          limits: "returnnumber[1:1]",
          optional: true
        },
        {
          type: "writers.gdal",
          filename: outputFile,
          gdaldriver: "GTiff",
          output_type: "max", // 取每个栅格内的最高点
          resolution: resolution.toString()
        }
      ]
    };

    // 将管道配置写入临时文件
    const pipelinePath = path.join(path.dirname(outputFile), 'dsm_pipeline.json');
    fs.writeFileSync(pipelinePath, JSON.stringify(pipelineJson, null, 2));

    // 执行 PDAL 命令
    const pdal = spawn('pdal', ['pipeline', pipelinePath]);
    
    let stderr = '';
    
    pdal.stdout.on('data', (data) => {
      console.log(`DSM 生成输出: ${data}`);
      progressManager.updateProgress(jobId, 'processing', 65, '正在生成数字表面模型(DSM)...');
    });
    
    pdal.stderr.on('data', (data) => {
      stderr += data;
      console.error(`DSM 生成错误: ${data}`);
    });
    
    pdal.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`DSM 生成失败，退出代码: ${code}，错误: ${stderr}`));
      } else {
        progressManager.updateProgress(jobId, 'processing', 75, 'DSM 生成完成');
        resolve();
      }
    });
  });
};

/**
 * 计算 CHM
 */
const calculateCHM = async (demFile, dsmFile, outputFile, jobId, options) => {
  return new Promise((resolve, reject) => {
    progressManager.updateProgress(jobId, 'processing', 80, '正在计算冠层高度模型(CHM)...');
    
    // 使用 gdal_calc.py 计算 DSM - DEM = CHM
    const args = [
      '-A', dsmFile,
      '-B', demFile,
      '--calc=A-B',
      '--outfile', outputFile,
      '--NoDataValue=-9999'
    ];

    // 执行 gdal_calc.py 命令
    const gdal = spawn('gdal_calc.py', args);
    
    let stderr = '';
    
    gdal.stdout.on('data', (data) => {
      console.log(`CHM 计算输出: ${data}`);
      progressManager.updateProgress(jobId, 'processing', 85, '正在计算冠层高度模型(CHM)...');
    });
    
    gdal.stderr.on('data', (data) => {
      stderr += data;
      console.error(`CHM 计算错误: ${data}`);
    });
    
    gdal.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`CHM 计算失败，退出代码: ${code}，错误: ${stderr}`));
      } else {
        progressManager.updateProgress(jobId, 'processing', 90, 'CHM 计算完成');
        
        // 如果需要平滑 CHM
        if (options.smoothRadius > 0) {
          smoothCHM(outputFile, outputFile, jobId, options)
            .then(resolve)
            .catch(reject);
        } else {
          progressManager.updateProgress(jobId, 'processing', 95, '全部处理完成');
          resolve();
        }
      }
    });
  });
};

/**
 * 平滑 CHM (可选)
 */
const smoothCHM = async (inputFile, outputFile, jobId, options) => {
  return new Promise((resolve, reject) => {
    progressManager.updateProgress(jobId, 'processing', 90, '正在平滑冠层高度模型...');
    
    const radius = options.smoothRadius || 2;
    const tempFile = inputFile.replace('.tif', '_smoothed.tif');
    
    // 使用 gdal_sieve 平滑
    const args = [
      '-st', radius.toString(),
      inputFile,
      tempFile
    ];
    
    // 执行 gdal_sieve.py 命令
    const gdal = spawn('gdal_sieve.py', args);
    
    let stderr = '';
    
    gdal.stdout.on('data', (data) => {
      console.log(`CHM 平滑输出: ${data}`);
    });
    
    gdal.stderr.on('data', (data) => {
      stderr += data;
      console.error(`CHM 平滑错误: ${data}`);
    });
    
    gdal.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`CHM 平滑失败，退出代码: ${code}，错误: ${stderr}`));
      } else {
        // 用平滑后的文件替换原文件
        fs.renameSync(tempFile, outputFile);
        progressManager.updateProgress(jobId, 'processing', 95, 'CHM 平滑完成');
        resolve();
      }
    });
  });
};

/**
 * 保存 LiDAR 处理结果到数据库
 */
const saveLidarResults = async (jobId, results) => {
  try {
    // 检查作业是否已存在
    const checkResult = await pool.query(
      'SELECT * FROM lidar_jobs WHERE job_id = $1',
      [jobId]
    );
    
    if (checkResult.rows.length > 0) {
      // 更新现有作业
      await pool.query(
        'UPDATE lidar_jobs SET status = $1, results = $2, updated_at = NOW() WHERE job_id = $3',
        ['completed', JSON.stringify(results), jobId]
      );
    } else {
      // 创建新作业记录
      await pool.query(
        'INSERT INTO lidar_jobs(job_id, status, results, created_at, updated_at) VALUES($1, $2, $3, NOW(), NOW())',
        [jobId, 'completed', JSON.stringify(results)]
      );
    }
  } catch (error) {
    console.error('保存 LiDAR 结果到数据库失败:', error);
    throw error;
  }
};

/**
 * 更新作业状态
 */
const updateJobStatus = async (jobId, status, errorMsg = null) => {
  try {
    await pool.query(
      'UPDATE lidar_jobs SET status = $1, error_message = $2, updated_at = NOW() WHERE job_id = $3',
      [status, errorMsg, jobId]
    );
  } catch (error) {
    console.error('更新作业状态失败:', error);
  }
};

/**
 * @desc    获取点云统计信息
 * @route   GET /api/lidar/stats
 * @access  私有
 */
const getLidarStats = async (req, res) => {
  try {
    const { filePath } = req.query;
    
    if (!filePath) {
      return res.status(400).json({ success: false, message: '缺少文件路径' });
    }
    
    // 检查文件是否存在
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: '文件不存在' });
    }
    
    // 使用 PDAL info 命令获取点云统计信息
    const pdal = spawn('pdal', ['info', filePath, '--summary']);
    
    let output = '';
    let stderr = '';
    
    pdal.stdout.on('data', (data) => {
      output += data;
    });
    
    pdal.stderr.on('data', (data) => {
      stderr += data;
    });
    
    pdal.on('close', (code) => {
      if (code !== 0) {
        return res.status(500).json({
          success: false,
          message: '获取点云统计信息失败',
          error: stderr
        });
      }
      
      try {
        // 解析 JSON 输出
        const stats = JSON.parse(output);
        res.status(200).json({
          success: true,
          stats
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: '解析点云统计信息失败',
          error: error.message
        });
      }
    });
    
  } catch (error) {
    console.error('获取点云统计信息失败:', error);
    res.status(500).json({
      success: false,
      message: '服务器处理请求时出错',
      error: error.message
    });
  }
};

/**
 * 监听处理进度
 * @route GET /api/lidar/progress/:jobId
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

/**
 * 获取处理作业状态
 * @route GET /api/lidar/job/:jobId
 * @access Private
 */
const getJobStatus = async (req, res) => {
  try {
    const { jobId } = req.params;
    
    // 从数据库查询作业状态
    const result = await pool.query(
      'SELECT * FROM lidar_jobs WHERE job_id = $1',
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

module.exports = {
  processLidarData,
  getLidarStats,
  monitorProgress,
  getJobStatus
}; 