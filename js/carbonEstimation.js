/**
 * 单株属性提取与碳储量估算模块
 */
const CarbonEstimation = {
  // 当前树冠检测作业 ID
  currentTreeJobId: null,
  
  // 当前碳储量估算作业 ID
  currentCarbonJobId: null,
  
  // 已知的 DEM 文件路径
  knownDemPath: null,
  
  // 初始化模块
  init() {
    this.bindEvents();
    this.setupModelParamsUI();
  },
  
  // 绑定界面事件
  bindEvents() {
    // 启动碳储量估算按钮
    document.getElementById('startCarbonEstimationBtn').addEventListener('click', () => {
      this.startCarbonEstimation();
    });
    
    // 应用模型参数按钮
    document.getElementById('applyModelParamsBtn').addEventListener('click', () => {
      this.applyModelParams();
    });
    
    // 下载CSV按钮
    document.getElementById('downloadTreeAttributesBtn').addEventListener('click', (e) => {
      if (e.target.classList.contains('disabled')) {
        e.preventDefault();
      }
    });
    
    // 模型参数滑块值显示
    document.getElementById('modelParamA').addEventListener('input', (e) => {
      document.getElementById('modelParamAValue').textContent = e.target.value;
    });
    
    document.getElementById('modelParamB').addEventListener('input', (e) => {
      document.getElementById('modelParamBValue').textContent = e.target.value;
    });
    
    document.getElementById('modelParamC').addEventListener('input', (e) => {
      document.getElementById('modelParamCValue').textContent = e.target.value;
    });
    
    document.getElementById('carbonFactor').addEventListener('input', (e) => {
      document.getElementById('carbonFactorValue').textContent = e.target.value;
    });
    
    // DEM文件上传事件
    document.getElementById('demFileInput').addEventListener('change', (e) => {
      if (e.target.files[0]) {
        this.uploadDEM(e.target.files[0]);
      }
    });
  },
  
  // 设置模型参数UI
  setupModelParamsUI() {
    // 设置默认值
    document.getElementById('modelParamA').value = '0.05';
    document.getElementById('modelParamAValue').textContent = '0.05';
    
    document.getElementById('modelParamB').value = '2.0';
    document.getElementById('modelParamBValue').textContent = '2.0';
    
    document.getElementById('modelParamC').value = '1.0';
    document.getElementById('modelParamCValue').textContent = '1.0';
    
    document.getElementById('carbonFactor').value = '0.5';
    document.getElementById('carbonFactorValue').textContent = '0.5';
  },
  
  // 上传DEM文件
  uploadDEM(file) {
    // 显示上传状态
    document.getElementById('demUploadStatus').textContent = '正在上传DEM文件...';
    
    // 创建FormData对象
    const formData = new FormData();
    formData.append('dem', file);
    
    // 上传DEM文件
    fetch('/api/lidar/upload-dem', {
      method: 'POST',
      body: formData,
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        this.knownDemPath = data.path;
        document.getElementById('demUploadStatus').textContent = '上传成功：' + file.name;
        document.getElementById('demUploadStatus').classList.add('text-success');
      } else {
        throw new Error(data.message || '上传失败');
      }
    })
    .catch(error => {
      document.getElementById('demUploadStatus').textContent = `上传出错: ${error.message}`;
      document.getElementById('demUploadStatus').classList.add('text-danger');
    });
  },
  
  // 启动碳储量估算
  startCarbonEstimation() {
    if (!TreeDetection.currentJobId) {
      alert('请先完成树冠检测');
      return;
    }
    
    this.currentTreeJobId = TreeDetection.currentJobId;
    
    // 更新进度状态
    document.getElementById('carbonEstimationStatus').classList.remove('hidden');
    document.getElementById('carbonEstimationStatusText').textContent = '正在启动碳储量估算...';
    document.getElementById('carbonEstimationProgressBar').style.width = '5%';
    
    // 获取模型参数
    const modelParams = this.getModelParams();
    
    // 准备请求参数
    const params = {
      jobId: this.currentTreeJobId,
      modelParams: modelParams
    };
    
    // 如果有DEM路径，添加到参数中
    if (this.knownDemPath) {
      params.demPath = this.knownDemPath;
    }
    
    // 发送处理请求
    fetch('/api/carbon-estimation/calculate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(params)
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        this.currentCarbonJobId = data.carbonJobId;
        document.getElementById('carbonEstimationStatusText').textContent = '碳储量估算处理已启动...';
        document.getElementById('carbonEstimationProgressBar').style.width = '15%';
        
        // 轮询作业状态
        this.pollCarbonJobStatus(data.carbonJobId);
      } else {
        throw new Error(data.message || '启动碳储量估算失败');
      }
    })
    .catch(error => {
      document.getElementById('carbonEstimationStatusText').textContent = `启动碳储量估算出错: ${error.message}`;
      document.getElementById('carbonEstimationProgressBar').style.width = '0%';
      document.getElementById('carbonEstimationProgressBar').classList.add('bg-danger');
    });
  },
  
  // 应用模型参数并重新计算
  applyModelParams() {
    if (!this.currentTreeJobId) {
      alert('请先完成树冠检测');
      return;
    }
    
    // 重置进度状态
    document.getElementById('carbonEstimationProgressBar').classList.remove('bg-success');
    document.getElementById('carbonEstimationProgressBar').classList.remove('bg-danger');
    document.getElementById('carbonEstimationStatusText').textContent = '使用新参数计算碳储量...';
    document.getElementById('carbonEstimationProgressBar').style.width = '5%';
    
    // 获取模型参数
    const modelParams = this.getModelParams();
    
    // 准备请求参数
    const params = {
      jobId: this.currentTreeJobId,
      modelParams: modelParams
    };
    
    // 如果有DEM路径，添加到参数中
    if (this.knownDemPath) {
      params.demPath = this.knownDemPath;
    }
    
    // 发送处理请求
    fetch('/api/carbon-estimation/calculate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      },
      body: JSON.stringify(params)
    })
    .then(response => response.json())
    .then(data => {
      if (data.success) {
        this.currentCarbonJobId = data.carbonJobId;
        document.getElementById('carbonEstimationStatusText').textContent = '使用新参数计算碳储量...';
        document.getElementById('carbonEstimationProgressBar').style.width = '15%';
        
        // 轮询作业状态
        this.pollCarbonJobStatus(data.carbonJobId);
      } else {
        throw new Error(data.message || '应用参数失败');
      }
    })
    .catch(error => {
      document.getElementById('carbonEstimationStatusText').textContent = `应用参数出错: ${error.message}`;
      document.getElementById('carbonEstimationProgressBar').style.width = '0%';
      document.getElementById('carbonEstimationProgressBar').classList.add('bg-danger');
    });
  },
  
  // 获取当前模型参数
  getModelParams() {
    return {
      a: parseFloat(document.getElementById('modelParamA').value),
      b: parseFloat(document.getElementById('modelParamB').value),
      c: parseFloat(document.getElementById('modelParamC').value),
      carbonFactor: parseFloat(document.getElementById('carbonFactor').value)
    };
  },
  
  // 轮询碳储量估算作业状态
  pollCarbonJobStatus(jobId) {
    const checkStatus = () => {
      fetch(`/api/carbon-estimation/job/${jobId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      })
      .then(response => response.json())
      .then(data => {
        if (data.status === 'processing') {
          // 更新进度条（模拟进度，实际进度由后端控制）
          let progressValue = parseInt(document.getElementById('carbonEstimationProgressBar').style.width) || 15;
          if (progressValue < 90) {
            progressValue += 5;
          }
          document.getElementById('carbonEstimationProgressBar').style.width = `${progressValue}%`;
          document.getElementById('carbonEstimationStatusText').textContent = '计算中...';
          
          // 继续轮询
          setTimeout(checkStatus, 2000);
        } else if (data.status === 'completed') {
          // 处理完成
          document.getElementById('carbonEstimationProgressBar').style.width = '100%';
          document.getElementById('carbonEstimationProgressBar').classList.add('bg-success');
          document.getElementById('carbonEstimationStatusText').textContent = '碳储量估算完成';
          
          // 显示结果
          this.showResults(data.results);
        } else if (data.status === 'failed') {
          // 处理失败
          document.getElementById('carbonEstimationProgressBar').style.width = '100%';
          document.getElementById('carbonEstimationProgressBar').classList.add('bg-danger');
          document.getElementById('carbonEstimationStatusText').textContent = `处理失败: ${data.error || '未知错误'}`;
        }
      })
      .catch(error => {
        console.error('检查碳储量估算状态失败:', error);
        document.getElementById('carbonEstimationStatusText').textContent = `检查状态出错: ${error.message}`;
      });
    };
    
    // 开始轮询
    setTimeout(checkStatus, 2000);
  },
  
  // 显示碳储量估算结果
  showResults(results) {
    // 显示结果面板
    document.getElementById('carbonEstimationResultPanel').classList.remove('hidden');
    
    // 启用下载按钮
    if (results.csv) {
      document.getElementById('downloadTreeAttributesBtn').href = results.csv;
      document.getElementById('downloadTreeAttributesBtn').classList.remove('disabled');
    }
    
    // 更新统计信息
    const summary = results.summary;
    if (summary) {
      // 总体统计
      document.getElementById('totalTreesValue').textContent = summary.total_trees;
      document.getElementById('totalCarbonValue').textContent = summary.total_carbon_t.toFixed(2) + ' 吨';
      document.getElementById('totalCo2eValue').textContent = summary.total_co2e_t.toFixed(2) + ' 吨CO2e';
      
      // 密度统计
      document.getElementById('carbonDensityValue').textContent = summary.carbon_density_t_ha.toFixed(2) + ' tC/ha';
      document.getElementById('co2eDensityValue').textContent = summary.co2e_density_t_ha.toFixed(2) + ' tCO2e/ha';
      
      // 平均值统计
      document.getElementById('meanHeightValue').textContent = summary.mean_height_m.toFixed(2) + ' m';
      document.getElementById('meanDbhValue').textContent = summary.mean_dbh_cm.toFixed(2) + ' cm';
      document.getElementById('meanCarbonValue').textContent = summary.mean_carbon_kg.toFixed(2) + ' kg';
      
      // 总面积
      document.getElementById('totalAreaValue').textContent = summary.total_crown_area_ha.toFixed(4) + ' ha';
      
      // 更新主页面的碳汇量指标
      this.updateMainSummary(summary);
    }
  },
  
  // 更新主页面的碳汇量指标
  updateMainSummary(summary) {
    try {
      // 更新碳汇量指标
      if (document.getElementById('abovegroundCarbon')) {
        document.getElementById('abovegroundCarbon').textContent = summary.total_co2e_t.toFixed(2);
      }
      
      // 假设地下碳汇量为地上的20%
      const belowgroundCarbon = summary.total_co2e_t * 0.2;
      if (document.getElementById('belowgroundCarbon')) {
        document.getElementById('belowgroundCarbon').textContent = belowgroundCarbon.toFixed(2);
      }
      
      // 总碳汇量
      const totalCarbon = summary.total_co2e_t + belowgroundCarbon;
      if (document.getElementById('totalCarbon')) {
        document.getElementById('totalCarbon').textContent = totalCarbon.toFixed(2);
      }
      
      // 林木总数
      if (document.getElementById('totalTrees')) {
        document.getElementById('totalTrees').textContent = summary.total_trees;
      }
      
      // 平均碳密度
      if (document.getElementById('carbonDensity')) {
        document.getElementById('carbonDensity').textContent = summary.co2e_density_t_ha.toFixed(2);
      }
      
      // 分析区域面积
      if (document.getElementById('totalArea')) {
        document.getElementById('totalArea').textContent = summary.total_crown_area_ha.toFixed(4);
      }
    } catch (error) {
      console.error('更新主页面碳汇量指标失败:', error);
    }
  }
};

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', function() {
  // 确保DOM加载完成后再初始化
  if (document.getElementById('carbonEstimationForm')) {
    CarbonEstimation.init();
  }
}); 