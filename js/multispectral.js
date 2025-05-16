/**
 * 多光谱影像处理模块
 */
const MultispectralProcessor = {
  // 当前处理作业 ID
  currentJobId: null,
  
  // 处理进度监听器
  progressEventSource: null,
  
  // 地图对象
  map: null,
  
  // 图层对象
  layers: {
    ortho: null,
    registered: null,
    final: null,
    chm: null
  },
  
  // 初始化模块
  init() {
    this.bindEvents();
    this.initMap();
  },
  
  // 初始化地图
  initMap() {
    // 创建地图容器（如果不存在）
    if (!document.getElementById('multispectralMap')) {
      const mapContainer = document.createElement('div');
      mapContainer.id = 'multispectralMap';
      mapContainer.style.width = '100%';
      mapContainer.style.height = '400px';
      mapContainer.style.display = 'none';
      document.getElementById('resultPanel').appendChild(mapContainer);
    }
  },
  
  // 绑定界面事件
  bindEvents() {
    // 文件上传
    document.getElementById('multispectralForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.uploadFiles();
    });
    
    // 开始处理
    document.getElementById('startProcessingBtn').addEventListener('click', () => {
      this.startProcessing();
    });
    
    // 取消处理
    document.getElementById('cancelProcessingBtn').addEventListener('click', () => {
      this.cancelProcessing();
    });
    
    // 透明度滑块
    document.getElementById('opacitySlider').addEventListener('input', (e) => {
      this.updateOpacity(e.target.value / 100);
    });
    
    // 手动调整按钮
    document.getElementById('applyAdjustmentBtn').addEventListener('click', () => {
      this.applyAdjustment();
    });
    
    // 微调按钮
    document.getElementById('moveLeftBtn').addEventListener('click', () => this.moveLayer(-1, 0));
    document.getElementById('moveRightBtn').addEventListener('click', () => this.moveLayer(1, 0));
    document.getElementById('moveUpBtn').addEventListener('click', () => this.moveLayer(0, -1));
    document.getElementById('moveDownBtn').addEventListener('click', () => this.moveLayer(0, 1));
  },
  
  // 上传文件
  uploadFiles() {
    const fileInput = document.getElementById('multispectralFiles');
    const demInput = document.getElementById('demFile');
    const chmInput = document.getElementById('chmFile');
    
    if (fileInput.files.length === 0) {
      alert('请选择至少一个多光谱影像文件');
      return;
    }
    
    if (!demInput.files[0]) {
      alert('请选择DEM文件用于正射校正');
    return;
  }
  
    if (!chmInput.files[0]) {
      alert('请选择CHM文件用于影像配准');
    return;
  }
  
    // 显示进度状态
    document.getElementById('processingStatus').classList.remove('hidden');
    document.getElementById('processingStatusText').textContent = '正在上传文件...';
    document.getElementById('processingProgressBar').style.width = '5%';
    
    // 创建FormData对象
  const formData = new FormData();
  for (const file of fileInput.files) {
    formData.append('images', file);
  }
  
    // 上传多光谱影像
    fetch('/api/multispectral/upload', {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        this.currentJobId = data.jobId;
        document.getElementById('processingStatusText').textContent = '文件上传成功，准备处理...';
        document.getElementById('processingProgressBar').style.width = '10%';
        
        // 上传DEM和CHM文件
        this.uploadDemAndChm(demInput.files[0], chmInput.files[0]);
      } else {
        throw new Error(data.message || '上传失败');
      }
    })
    .catch(error => {
      document.getElementById('processingStatusText').textContent = `上传出错: ${error.message}`;
      document.getElementById('processingProgressBar').style.width = '0%';
      document.getElementById('processingProgressBar').classList.add('bg-danger');
    });
  },
  
  // 上传DEM和CHM文件
  uploadDemAndChm(demFile, chmFile) {
    // 创建FormData对象
    const formData = new FormData();
    formData.append('dem', demFile);
    formData.append('chm', chmFile);
    
    // 上传辅助文件
    fetch('/api/multispectral/upload-aux', {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        document.getElementById('processingStatusText').textContent = '所有文件上传成功，准备开始处理...';
        document.getElementById('processingProgressBar').style.width = '15%';
        
        // 启用开始处理按钮
        document.getElementById('startProcessingBtn').disabled = false;
      } else {
        throw new Error(data.message || '辅助文件上传失败');
      }
    })
    .catch(error => {
      document.getElementById('processingStatusText').textContent = `上传出错: ${error.message}`;
      document.getElementById('processingProgressBar').style.width = '0%';
      document.getElementById('processingProgressBar').classList.add('bg-danger');
    });
  },
  
  // 开始处理
  startProcessing() {
    if (!this.currentJobId) {
      alert('请先上传文件');
    return;
  }
  
    // 禁用开始按钮
    document.getElementById('startProcessingBtn').disabled = true;
    
    // 启动SSE进度监听
    this.connectToEventSource();
    
    // 发送处理请求
    fetch('/api/multispectral/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        jobId: this.currentJobId,
        demPath: document.getElementById('demPath').value,
        chmPath: document.getElementById('chmPath').value
      })
    })
    .then(response => response.json())
    .then(data => {
      if (!data.success) {
        throw new Error(data.message || '处理请求失败');
      }
      // 处理已启动，进度通过SSE更新
    })
    .catch(error => {
      document.getElementById('processingStatusText').textContent = `处理启动出错: ${error.message}`;
      document.getElementById('processingProgressBar').style.width = '0%';
      document.getElementById('processingProgressBar').classList.add('bg-danger');
      
      // 关闭SSE连接
      if (this.progressEventSource) {
        this.progressEventSource.close();
        this.progressEventSource = null;
      }
    });
  },
  
  // 连接到SSE进度事件
  connectToEventSource() {
    // 关闭现有连接
    if (this.progressEventSource) {
      this.progressEventSource.close();
    }
    
    // 创建新连接
    this.progressEventSource = new EventSource(`/api/multispectral/progress/${this.currentJobId}`);
    
    // 监听消息
    this.progressEventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      
      // 更新进度条
      document.getElementById('processingProgressBar').style.width = `${data.progress}%`;
      document.getElementById('processingStatusText').textContent = data.message || `处理中 (${data.progress}%)`;
      
      // 处理完成
      if (data.status === 'completed') {
        this.progressEventSource.close();
        this.progressEventSource = null;
        
        document.getElementById('processingStatusText').textContent = '处理完成';
        document.getElementById('processingProgressBar').classList.remove('bg-danger');
        document.getElementById('processingProgressBar').classList.add('bg-success');
        
        // 显示结果
        this.showResults(data.result.outputs);
      }
      
      // 处理错误
      if (data.status === 'error') {
        this.progressEventSource.close();
        this.progressEventSource = null;
        
        document.getElementById('processingStatusText').textContent = `处理出错: ${data.error}`;
        document.getElementById('processingProgressBar').style.width = '100%';
        document.getElementById('processingProgressBar').classList.add('bg-danger');
      }
    };
    
    // 监听错误
    this.progressEventSource.onerror = () => {
      document.getElementById('processingStatusText').textContent = '进度连接中断';
      this.progressEventSource.close();
      this.progressEventSource = null;
    };
  },
  
  // 取消处理
  cancelProcessing() {
    if (!this.currentJobId) return;
    
    // 关闭SSE连接
    if (this.progressEventSource) {
      this.progressEventSource.close();
      this.progressEventSource = null;
    }
    
    // 发送取消请求
    fetch(`/api/multispectral/cancel/${this.currentJobId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    })
    .then(response => response.json())
    .then(data => {
      document.getElementById('processingStatusText').textContent = '处理已取消';
      document.getElementById('processingProgressBar').style.width = '0%';
      document.getElementById('startProcessingBtn').disabled = false;
    })
    .catch(error => {
      console.error('取消处理失败:', error);
    });
  },
  
  // 显示处理结果
  showResults(outputs) {
    // 显示结果面板
    document.getElementById('resultPanel').classList.remove('hidden');
    document.getElementById('multispectralMap').style.display = 'block';
    
    // 更新下载链接
    document.getElementById('orthoDownloadLink').href = outputs.ortho;
    document.getElementById('registeredDownloadLink').href = outputs.registered;
    if (outputs.final) {
      document.getElementById('finalDownloadLink').href = outputs.final;
      document.getElementById('finalDownloadLink').classList.remove('hidden');
    } else {
      document.getElementById('finalDownloadLink').classList.add('hidden');
    }
    
    // 初始化地图（如果还没有）
    if (!this.map) {
      this.initializeLeafletMap();
    }
    
    // 加载图层
    this.loadImageLayers(outputs);
  },
  
  // 初始化Leaflet地图
  initializeLeafletMap() {
    // 创建地图
    this.map = L.map('multispectralMap').setView([0, 0], 2);
    
    // 添加底图
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(this.map);
    
    // 添加图层控制
    this.layerControl = L.control.layers(null, null, { collapsed: false }).addTo(this.map);
  },
  
  // 加载影像图层
  loadImageLayers(outputs) {
    // 移除现有图层
    if (this.layers.ortho) this.map.removeLayer(this.layers.ortho);
    if (this.layers.registered) this.map.removeLayer(this.layers.registered);
    if (this.layers.final) this.map.removeLayer(this.layers.final);
    if (this.layers.chm) this.map.removeLayer(this.layers.chm);
    
    // 移除图层控制
    if (this.layerControl) {
      this.map.removeControl(this.layerControl);
    }
    
    // 加载CHM图层
    fetch('/api/multispectral/get-bounds', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        path: document.getElementById('chmPath').value
      })
    })
    .then(response => response.json())
    .then(data => {
      if (!data.success) throw new Error('获取影像边界失败');
      
      const bounds = L.latLngBounds(
        [data.bounds.south, data.bounds.west],
        [data.bounds.north, data.bounds.east]
      );
      
      // 设置地图视图
      this.map.fitBounds(bounds);
      
      // 添加CHM图层
      this.layers.chm = L.imageOverlay(
        document.getElementById('chmPath').value,
        bounds,
        { opacity: 0.7 }
      ).addTo(this.map);
      
      // 添加正射影像图层
      this.layers.ortho = L.imageOverlay(
        outputs.ortho,
        bounds,
        { opacity: 0.7 }
      );
      
      // 添加配准影像图层
      this.layers.registered = L.imageOverlay(
        outputs.registered,
        bounds,
        { opacity: 0.7 }
      ).addTo(this.map);
      
      // 如果有最终调整影像
      if (outputs.final) {
        this.layers.final = L.imageOverlay(
          outputs.final,
          bounds,
          { opacity: 0.7 }
        );
      }
      
      // 重新添加图层控制
      this.layerControl = L.control.layers(
        {
          'CHM': this.layers.chm,
          '正射影像': this.layers.ortho,
          '自动配准影像': this.layers.registered,
          ...(outputs.final ? { '手动调整影像': this.layers.final } : {})
        },
        null,
        { collapsed: false }
      ).addTo(this.map);
      
      // 添加分屏控件（如果使用了leaflet-side-by-side插件）
      if (window.L.control.sideBySide) {
        this.sideControl = L.control.sideBySide(
          this.layers.registered,
          this.layers.chm
        ).addTo(this.map);
      }
    })
    .catch(error => {
      console.error('加载地图图层失败:', error);
      alert('加载地图图层失败: ' + error.message);
    });
  },
  
  // 更新图层不透明度
  updateOpacity(opacity) {
    if (this.layers.registered) {
      this.layers.registered.setOpacity(opacity);
    }
    if (this.layers.final) {
      this.layers.final.setOpacity(opacity);
    }
  },
  
  // 移动图层
  moveLayer(dx, dy) {
    // 存储偏移量到隐藏字段
    const xOffset = document.getElementById('xOffset');
    const yOffset = document.getElementById('yOffset');
    
    xOffset.value = (parseFloat(xOffset.value) || 0) + dx;
    yOffset.value = (parseFloat(yOffset.value) || 0) + dy;
    
    document.getElementById('offsetDisplay').textContent = 
      `当前偏移: X=${xOffset.value}, Y=${yOffset.value}`;
  },
  
  // 应用手动调整
  applyAdjustment() {
    const xOffset = parseFloat(document.getElementById('xOffset').value) || 0;
    const yOffset = parseFloat(document.getElementById('yOffset').value) || 0;
    
    if (!this.currentJobId) {
      alert('请先上传并处理文件');
      return;
    }
    
    // 显示进度
    document.getElementById('processingProgressBar').style.width = '95%';
    document.getElementById('processingStatusText').textContent = '正在应用手动调整...';
    
    // 重新连接到SSE
    this.connectToEventSource();
    
    // 发送调整请求
    fetch('/api/multispectral/adjust', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify({
        jobId: this.currentJobId,
        dx: xOffset,
        dy: yOffset
      })
    })
    .then(response => response.json())
    .then(data => {
      if (!data.success) {
        throw new Error(data.message || '调整请求失败');
      }
      // 调整已启动，进度通过SSE更新
    })
    .catch(error => {
      document.getElementById('processingStatusText').textContent = `调整出错: ${error.message}`;
      document.getElementById('processingProgressBar').classList.add('bg-danger');
      
      // 关闭SSE连接
      if (this.progressEventSource) {
        this.progressEventSource.close();
        this.progressEventSource = null;
      }
    });
  }
};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
  MultispectralProcessor.init();
}); 