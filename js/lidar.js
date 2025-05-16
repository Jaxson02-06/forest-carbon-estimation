/**
 * LiDAR 数据处理模块
 */
const LidarProcessor = {
  // 当前处理作业 ID
  currentJobId: null,
  
  // 处理进度监听器
  progressEventSource: null,
  
  // 初始化模块
  init() {
    this.bindEvents();
    this.setupUI();
  },
  
  // 设置界面初始状态
  setupUI() {
    // 初始化滑块值显示
    document.getElementById('groundFilterThresholdValue').textContent = 
      document.getElementById('groundFilterThreshold').value;
    
    document.getElementById('chmSmoothRadiusValue').textContent = 
      document.getElementById('chmSmoothRadius').value;
      
    // 隐藏进度和结果区域
    document.getElementById('processingStatus').classList.add('hidden');
    document.getElementById('resultPanel').classList.add('hidden');
  },
  
  // 绑定界面事件
  bindEvents() {
    // 处理参数滑块更新显示值
    document.getElementById('groundFilterThreshold').addEventListener('input', (e) => {
      document.getElementById('groundFilterThresholdValue').textContent = e.target.value;
    });
    
    document.getElementById('chmSmoothRadius').addEventListener('input', (e) => {
      document.getElementById('chmSmoothRadiusValue').textContent = e.target.value;
    });
    
    // 绑定上传按钮事件
    document.getElementById('uploadLidarBtn').addEventListener('click', () => {
      this.uploadLidarFile();
    });
    
    // 绑定取消处理按钮事件
    document.getElementById('cancelProcessingBtn').addEventListener('click', () => {
      this.cancelProcessing();
    });
    
    // 为地图显示按钮绑定事件
    this.bindMapButtons();
  },
  
  // 绑定地图按钮事件
  bindMapButtons() {
    document.querySelectorAll('.show-in-map-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const layerType = e.target.getAttribute('data-layer');
        if (window.MapViewer) {
          window.MapViewer.showLayer(layerType);
        }
      });
    });
  },
  
  // 上传 LiDAR 文件
  uploadLidarFile() {
    const fileInput = document.getElementById('lidarUpload');
    if (!fileInput.files || fileInput.files.length === 0) {
      alert('请先选择 LiDAR 点云文件');
      return;
    }
    
    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);
    
    // 显示上传中状态
    this.showUploadingStatus();
    
    // 发送上传请求
    fetch('/api/lidar/upload', {
      method: 'POST',
      body: formData
    })
    .then(response => response.json())
    .then(data => {
      if (!data.success) {
        this.showError(data.message || '上传失败');
        return;
      }
      
      // 上传成功，开始处理
      this.processLidarData(data.filePath, file.name);
    })
    .catch(error => {
      this.showError('上传文件失败: ' + error.message);
    });
  },
  
  // 处理 LiDAR 数据
  processLidarData(filePath, fileName) {
    // 获取处理参数
    const params = {
      filePath,
      fileName,
      resolution: document.getElementById('gridResolution').value,
      groundFilterThreshold: document.getElementById('groundFilterThreshold').value,
      smoothRadius: document.getElementById('chmSmoothRadius').value
    };
    
    // 显示处理状态
    this.showProcessingStatus();
    
    // 发送处理请求
    fetch('/api/lidar/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(params)
    })
    .then(response => response.json())
    .then(data => {
      if (!data.success) {
        this.showError(data.message || '处理请求失败');
        return;
      }
      
      this.currentJobId = data.jobId;
      this.listenForProgress(data.jobId);
    })
    .catch(error => {
      this.showError('处理请求失败: ' + error.message);
    });
  },
  
  // 监听处理进度
  listenForProgress(jobId) {
    // 关闭之前的连接
    if (this.progressEventSource) {
      this.progressEventSource.close();
    }
    
    this.progressEventSource = new EventSource(`/api/lidar/progress/${jobId}`);
    
    // 接收进度更新
    this.progressEventSource.addEventListener('message', (event) => {
      const data = JSON.parse(event.data);
      this.updateProgressDisplay(data);
      
      // 处理完成或出错时关闭连接
      if (data.status === 'completed' || data.status === 'error') {
        this.progressEventSource.close();
        this.progressEventSource = null;
        
        if (data.status === 'completed') {
          this.processingComplete(data.result);
        }
      }
    });
    
    // 连接错误处理
    this.progressEventSource.addEventListener('error', () => {
      this.progressEventSource.close();
      this.progressEventSource = null;
      
      // 连接错误时，尝试通过 API 查询状态
      this.queryJobStatus(jobId);
    });
  },
  
  // 当 SSE 连接失败时，通过 API 查询作业状态
  queryJobStatus(jobId) {
    fetch(`/api/lidar/job/${jobId}`)
      .then(response => response.json())
      .then(data => {
        if (data.status === 'completed') {
          this.processingComplete(data.outputs);
        } else if (data.status === 'failed') {
          this.showError(`处理失败: ${data.error || '未知错误'}`);
        } else {
          // 仍在处理中，继续轮询
          setTimeout(() => this.queryJobStatus(jobId), 2000);
        }
      })
      .catch(error => {
        this.showError('无法获取处理状态: ' + error.message);
      });
  },
  
  // 更新进度显示
  updateProgressDisplay(data) {
    const progressBar = document.getElementById('processingProgressBar');
    const statusText = document.getElementById('processingStatusText');
    
    if (data.status === 'error') {
      statusText.textContent = `处理失败: ${data.error || '未知错误'}`;
      progressBar.classList.add('error');
      return;
    }
    
    // 更新进度条
    progressBar.style.width = `${data.progress}%`;
    progressBar.setAttribute('aria-valuenow', data.progress);
    
    // 更新状态文本
    statusText.textContent = data.message || `处理中... ${data.progress}%`;
  },
  
  // 处理完成
  processingComplete(result) {
    const statusText = document.getElementById('processingStatusText');
    statusText.textContent = '处理完成!';
    
    // 显示结果面板
    this.showResults(result);
    
    // 重置上传表单
    document.getElementById('lidarUpload').value = '';
  },
  
  // 显示处理结果
  showResults(result) {
    const resultPanel = document.getElementById('resultPanel');
    resultPanel.classList.remove('hidden');
    
    // 构建结果链接
    const demLink = document.getElementById('demDownloadLink');
    const dsmLink = document.getElementById('dsmDownloadLink');
    const chmLink = document.getElementById('chmDownloadLink');
    
    // 设置下载链接
    demLink.href = result.outputs.dem;
    dsmLink.href = result.outputs.dsm;
    chmLink.href = result.outputs.chm;
    
    // 如果使用 Leaflet 地图展示结果，在这里更新地图图层
    if (window.MapViewer) {
      window.MapViewer.addRasterLayer('dem', result.outputs.dem, 'terrain');
      window.MapViewer.addRasterLayer('dsm', result.outputs.dsm, 'terrain');
      window.MapViewer.addRasterLayer('chm', result.outputs.chm, 'forest');
    }
  },
  
  // 显示错误信息
  showError(message) {
    const statusText = document.getElementById('processingStatusText');
    statusText.textContent = message;
    statusText.classList.add('error');
    
    const progressBar = document.getElementById('processingProgressBar');
    progressBar.classList.add('error');
  },
  
  // 显示上传中状态
  showUploadingStatus() {
    const processingStatus = document.getElementById('processingStatus');
    processingStatus.classList.remove('hidden');
    
    const resultPanel = document.getElementById('resultPanel');
    resultPanel.classList.add('hidden');
    
    const progressBar = document.getElementById('processingProgressBar');
    progressBar.classList.remove('error');
    progressBar.style.width = '10%';
    progressBar.setAttribute('aria-valuenow', 10);
    
    const statusText = document.getElementById('processingStatusText');
    statusText.textContent = '正在上传文件...';
    statusText.classList.remove('error');
  },
  
  // 显示处理状态面板
  showProcessingStatus() {
    const processingStatus = document.getElementById('processingStatus');
    processingStatus.classList.remove('hidden');
    
    const resultPanel = document.getElementById('resultPanel');
    resultPanel.classList.add('hidden');
    
    const progressBar = document.getElementById('processingProgressBar');
    progressBar.classList.remove('error');
    progressBar.style.width = '0%';
    progressBar.setAttribute('aria-valuenow', 0);
    
    const statusText = document.getElementById('processingStatusText');
    statusText.textContent = '准备处理...';
    statusText.classList.remove('error');
  },
  
  // 取消处理
  cancelProcessing() {
    if (this.progressEventSource) {
      this.progressEventSource.close();
      this.progressEventSource = null;
    }
    
    // 如果有活动的作业，发送取消请求
    if (this.currentJobId) {
      fetch(`/api/lidar/cancel/${this.currentJobId}`, { method: 'POST' })
        .then(response => response.json())
        .then(data => {
          if (data.success) {
            this.showError('处理已取消');
          }
        })
        .catch(error => {
          console.error('取消处理时出错:', error);
        });
    }
    
    // 隐藏处理状态面板
    const processingStatus = document.getElementById('processingStatus');
    processingStatus.classList.add('hidden');
    
    this.currentJobId = null;
  }
};

// 当页面加载完成时初始化
document.addEventListener('DOMContentLoaded', () => {
  LidarProcessor.init();
}); 