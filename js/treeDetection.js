/**
 * 单株分割与树冠提取模块
 */
const TreeDetection = {
  // 当前处理作业 ID
  currentJobId: null,
  
  // 地图对象
  map: null,
  
  // 图层对象
  layers: {
    chm: null,
    treeTops: null,
    treeCrowns: null
  },
  
  // 初始化模块
  init() {
    this.bindEvents();
    
    // 如果地图容器不存在，创建一个
    if (!document.getElementById('treeDetectionMap')) {
      const mapContainer = document.createElement('div');
      mapContainer.id = 'treeDetectionMap';
      mapContainer.style.width = '100%';
      mapContainer.style.height = '400px';
      mapContainer.style.display = 'none';
      document.getElementById('treeDetectionResultPanel').appendChild(mapContainer);
    }
  },
  
  // 绑定界面事件
  bindEvents() {
    // 文件上传表单提交
    document.getElementById('treeDetectionForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.uploadCHM();
    });
    
    // 开始处理按钮
    document.getElementById('startTreeDetectionBtn').addEventListener('click', () => {
      this.startProcessing();
    });
    
    // 取消处理按钮
    document.getElementById('cancelTreeDetectionBtn').addEventListener('click', () => {
      this.cancelProcessing();
    });
    
    // 参数调整应用按钮
    document.getElementById('applyTreeDetectionParamsBtn').addEventListener('click', () => {
      this.applyParams();
    });
    
    // 参数滑块值显示
    document.getElementById('minTreeHeight').addEventListener('input', (e) => {
      document.getElementById('minTreeHeightValue').textContent = e.target.value;
    });
    
    document.getElementById('smoothSigma').addEventListener('input', (e) => {
      document.getElementById('smoothSigmaValue').textContent = e.target.value;
    });
    
    document.getElementById('minTreeDistance').addEventListener('input', (e) => {
      document.getElementById('minTreeDistanceValue').textContent = e.target.value;
    });
  },
  
  // 上传CHM文件
  uploadCHM() {
    const fileInput = document.getElementById('chmFileInput');
    
    if (!fileInput.files[0]) {
      alert('请选择CHM文件');
      return;
    }
    
    // 显示进度状态
    document.getElementById('treeDetectionStatus').classList.remove('hidden');
    document.getElementById('treeDetectionStatusText').textContent = '正在上传文件...';
    document.getElementById('treeDetectionProgressBar').style.width = '5%';
    
    // 创建FormData对象
    const formData = new FormData();
    formData.append('chm', fileInput.files[0]);
    
    // 上传CHM文件
    fetch('/api/tree-detection/upload', {
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
        document.getElementById('treeDetectionStatusText').textContent = '文件上传成功，准备处理...';
        document.getElementById('treeDetectionProgressBar').style.width = '10%';
        
        // 启用开始处理按钮
        document.getElementById('startTreeDetectionBtn').disabled = false;
        
        // 轮询作业状态
        this.pollJobStatus(data.jobId);
      } else {
        throw new Error(data.message || '上传失败');
      }
    })
    .catch(error => {
      document.getElementById('treeDetectionStatusText').textContent = `上传出错: ${error.message}`;
      document.getElementById('treeDetectionProgressBar').style.width = '0%';
      document.getElementById('treeDetectionProgressBar').classList.add('bg-danger');
    });
  },
  
  // 开始树冠检测处理
  startProcessing() {
    if (!this.currentJobId) {
      alert('请先上传CHM文件');
      return;
    }
    
    // 禁用开始按钮
    document.getElementById('startTreeDetectionBtn').disabled = true;
    
    // 更新进度状态
    document.getElementById('treeDetectionStatusText').textContent = '开始树冠检测处理...';
    document.getElementById('treeDetectionProgressBar').style.width = '15%';
    
    // 获取参数（使用默认值，应用参数按钮会使用自定义值）
    const params = {
      jobId: this.currentJobId,
      minHeight: 2.0,
      smoothSigma: 1.0,
      minDistance: 5
    };
    
    // 发送处理请求
    fetch('/api/tree-detection/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(params)
    })
    .then(response => response.json())
    .then(data => {
      if (!data.success) {
        throw new Error(data.message || '处理请求失败');
      }
      // 处理已启动，继续轮询状态
      document.getElementById('treeDetectionStatusText').textContent = '正在处理中...';
    })
    .catch(error => {
      document.getElementById('treeDetectionStatusText').textContent = `处理启动出错: ${error.message}`;
      document.getElementById('treeDetectionProgressBar').style.width = '0%';
      document.getElementById('treeDetectionProgressBar').classList.add('bg-danger');
      document.getElementById('startTreeDetectionBtn').disabled = false;
    });
  },
  
  // 应用自定义参数重新处理
  applyParams() {
    if (!this.currentJobId) {
      alert('请先上传CHM文件');
      return;
    }
    
    // 获取用户设置的参数
    const minHeight = parseFloat(document.getElementById('minTreeHeight').value);
    const smoothSigma = parseFloat(document.getElementById('smoothSigma').value);
    const minDistance = parseInt(document.getElementById('minTreeDistance').value);
    
    // 更新进度状态
    document.getElementById('treeDetectionStatusText').textContent = '使用自定义参数重新处理...';
    document.getElementById('treeDetectionProgressBar').style.width = '15%';
    document.getElementById('treeDetectionProgressBar').classList.remove('bg-success');
    document.getElementById('treeDetectionProgressBar').classList.remove('bg-danger');
    
    // 构建参数对象
    const params = {
      jobId: this.currentJobId,
      minHeight,
      smoothSigma,
      minDistance
    };
    
    // 发送处理请求
    fetch('/api/tree-detection/process', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(params)
    })
    .then(response => response.json())
    .then(data => {
      if (!data.success) {
        throw new Error(data.message || '处理请求失败');
      }
      // 处理已启动，继续轮询状态
      document.getElementById('treeDetectionStatusText').textContent = '正在使用新参数处理中...';
    })
    .catch(error => {
      document.getElementById('treeDetectionStatusText').textContent = `处理启动出错: ${error.message}`;
      document.getElementById('treeDetectionProgressBar').classList.add('bg-danger');
    });
  },
  
  // 取消处理
  cancelProcessing() {
    if (!this.currentJobId) return;
    
    document.getElementById('treeDetectionStatusText').textContent = '处理已取消';
    document.getElementById('treeDetectionProgressBar').style.width = '0%';
    document.getElementById('startTreeDetectionBtn').disabled = false;
    
    // 注意：此处未实现后端取消逻辑，仅前端状态更新
  },
  
  // 轮询作业状态
  pollJobStatus(jobId) {
    const checkStatus = () => {
      fetch(`/api/tree-detection/job/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      .then(response => response.json())
      .then(data => {
        if (data.status === 'processing') {
          // 更新进度条（模拟进度，实际进度由后端控制）
          let progressValue = parseInt(document.getElementById('treeDetectionProgressBar').style.width) || 10;
          if (progressValue < 90) {
            progressValue += 5;
          }
          document.getElementById('treeDetectionProgressBar').style.width = `${progressValue}%`;
          document.getElementById('treeDetectionStatusText').textContent = '处理中...';
          
          // 继续轮询
          setTimeout(checkStatus, 2000);
        } else if (data.status === 'completed') {
          // 处理完成
          document.getElementById('treeDetectionProgressBar').style.width = '100%';
          document.getElementById('treeDetectionProgressBar').classList.add('bg-success');
          document.getElementById('treeDetectionStatusText').textContent = '处理完成';
          
          // 显示结果
          this.showResults(data.results);
        } else if (data.status === 'failed') {
          // 处理失败
          document.getElementById('treeDetectionProgressBar').style.width = '100%';
          document.getElementById('treeDetectionProgressBar').classList.add('bg-danger');
          document.getElementById('treeDetectionStatusText').textContent = `处理失败: ${data.error || '未知错误'}`;
        }
      })
      .catch(error => {
        console.error('检查作业状态失败:', error);
        document.getElementById('treeDetectionStatusText').textContent = `检查状态出错: ${error.message}`;
      });
    };
    
    // 开始轮询
    setTimeout(checkStatus, 2000);
  },
  
  // 显示处理结果
  showResults(results) {
    // 显示结果面板
    document.getElementById('treeDetectionResultPanel').classList.remove('hidden');
    
    // 更新树木数量显示
    document.getElementById('treeCountValue').textContent = results.treeCount || 0;
    
    // 启用下载按钮
    document.getElementById('downloadTreesGeojsonBtn').href = results.geojson;
    document.getElementById('downloadTreesGeojsonBtn').classList.remove('disabled');
    
    if (results.visualization) {
      document.getElementById('downloadTreesImageBtn').href = results.visualization;
      document.getElementById('downloadTreesImageBtn').classList.remove('disabled');
    }
    
    // 显示图片
    if (results.visualization) {
      const imgContainer = document.getElementById('treeVisualizationContainer');
      imgContainer.innerHTML = '';
      const img = document.createElement('img');
      img.src = results.visualization;
      img.className = 'img-fluid';
      img.alt = '树冠分割可视化';
      imgContainer.appendChild(img);
    }
    
    // 初始化地图
    this.initMap(results);
  },
  
  // 初始化地图并显示结果
  initMap(results) {
    const mapContainer = document.getElementById('treeDetectionMap');
    mapContainer.style.display = 'block';
    
    // 如果地图已存在，清除所有图层
    if (this.map) {
      this.map.eachLayer(layer => {
        if (layer !== this.basemap) {
          this.map.removeLayer(layer);
        }
      });
    } else {
      // 初始化地图
      this.map = L.map('treeDetectionMap').setView([0, 0], 2);
      
      // 添加底图
      this.basemap = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(this.map);
    }
    
    // 加载GeoJSON
    fetch(results.geojson)
      .then(response => response.json())
      .then(data => {
        // 分离树顶点和树冠
        const treeTops = {
          type: 'FeatureCollection',
          features: data.features.filter(f => f.properties.type === 'tree_top')
        };
        
        const treeCrowns = {
          type: 'FeatureCollection',
          features: data.features.filter(f => f.properties.type === 'tree_crown')
        };
        
        // 添加树顶点图层
        this.layers.treeTops = L.geoJSON(treeTops, {
          pointToLayer: (feature, latlng) => {
            return L.circleMarker(latlng, {
              radius: 4,
              fillColor: 'red',
              color: '#000',
              weight: 1,
              opacity: 1,
              fillOpacity: 0.8
            });
          },
          onEachFeature: (feature, layer) => {
            layer.bindPopup(`
              <strong>树ID:</strong> ${feature.properties.id}<br>
              <strong>树高:</strong> ${feature.properties.height.toFixed(2)} m
            `);
          }
        }).addTo(this.map);
        
        // 添加树冠图层
        this.layers.treeCrowns = L.geoJSON(treeCrowns, {
          style: (feature) => {
            // 根据树高生成颜色
            const height = feature.properties.height;
            const hue = Math.min(120, Math.max(0, height * 5)); // 树高映射到0-120色调范围
            return {
              fillColor: `hsl(${hue}, 70%, 50%)`,
              weight: 1,
              opacity: 1,
              color: '#666',
              fillOpacity: 0.6
            };
          },
          onEachFeature: (feature, layer) => {
            layer.bindPopup(`
              <strong>树冠ID:</strong> ${feature.properties.id}<br>
              <strong>树高:</strong> ${feature.properties.height.toFixed(2)} m<br>
              <strong>面积:</strong> ${feature.properties.area.toFixed(2)} m²
            `);
          }
        }).addTo(this.map);
        
        // 设置地图视图
        if (treeCrowns.features.length > 0) {
          this.map.fitBounds(this.layers.treeCrowns.getBounds());
        } else if (treeTops.features.length > 0) {
          this.map.fitBounds(this.layers.treeTops.getBounds());
        }
        
        // 添加图例
        this.addLegend();
      })
      .catch(error => {
        console.error('加载GeoJSON失败:', error);
        alert('加载树冠分割结果失败');
      });
  },
  
  // 添加图例
  addLegend() {
    // 移除现有图例
    if (this.legend) {
      this.map.removeControl(this.legend);
    }
    
    // 创建图例
    this.legend = L.control({ position: 'bottomright' });
    
    this.legend.onAdd = (map) => {
      const div = L.DomUtil.create('div', 'info legend');
      div.style.backgroundColor = 'white';
      div.style.padding = '6px 8px';
      div.style.border = 'solid 1px #aaa';
      div.style.borderRadius = '5px';
      div.style.lineHeight = '18px';
      div.style.color = '#555';
      
      // 添加图例标题
      div.innerHTML = '<h6 style="margin: 0 0 5px 0;">树高 (m)</h6>';
      
      // 添加色带
      const heights = [0, 5, 10, 15, 20, 25];
      
      for (let i = 0; i < heights.length - 1; i++) {
        const from = heights[i];
        const to = heights[i + 1];
        const hue = Math.min(120, Math.max(0, from * 5));
        
        div.innerHTML += 
          `<i style="display:inline-block; width:18px; height:18px; background:hsl(${hue}, 70%, 50%); margin-right: 8px;"></i>` +
          `${from}${(to ? '–' + to : '+')} m<br>`;
      }
      
      return div;
    };
    
    this.legend.addTo(this.map);
  }
};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
  // 确保DOM加载完成后再初始化
  if (document.getElementById('treeDetectionForm')) {
    TreeDetection.init();
  }
}); 