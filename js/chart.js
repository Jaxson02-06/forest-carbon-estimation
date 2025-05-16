// 图表初始化和更新
function initChart() {
  console.log('[chart.js] initChart called.');
  try {
    if (typeof echarts === 'undefined') {
      console.error('[chart.js] ECharts library not loaded. Cannot initialize chart.');
      return false;
    }
    console.log('[chart.js] ECharts library found.');
    
    const chartContainer = document.getElementById('chartContainer');
    if (!chartContainer) {
      console.error('[chart.js] Chart container element #chartContainer not found.');
      return false;
    }
    console.log('[chart.js] Chart container found:', chartContainer);
    
    // 尝试销毁旧实例（如果存在）
    if (analysisChart && analysisChart.dispose) {
      console.log('[chart.js] Disposing previous chart instance.');
      analysisChart.dispose();
    }
    
    console.log('[chart.js] Initializing ECharts...');
    analysisChart = echarts.init(chartContainer);
    console.log('[chart.js] ECharts initialized successfully. Instance:', analysisChart);
    
    // 设置初始选项
    analysisChart.setOption({
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      legend: { data: ['面积 (ha)', '碳储量 (t)', '密度 (t/ha)'], bottom: 10 },
      grid: { left: '3%', right: '10%', top: 80, bottom: 60, containLabel: true },
      xAxis: { type: 'category', data: [] },
      yAxis: [
        { type: 'value', name: '面积 (ha)', position: 'left', axisLine: { lineStyle: { color: '#5470c6' } }, splitLine: { show: false } },
        { type: 'value', name: '碳储量 (t)', position: 'right', offset: 0, axisLine: { lineStyle: { color: '#91cc75' } }, splitLine: { show: false } },
        { type: 'value', name: '密度 (t/ha)', position: 'right', offset: 60, axisLine: { lineStyle: { color: '#fac858' } }, splitLine: { show: false } }
      ],
      series: [
        { name: '面积 (ha)', type: 'bar', yAxisIndex: 0, data: [], itemStyle: { color: '#5470c6' }, barMaxWidth: 50 },
        { name: '碳储量 (t)', type: 'bar', yAxisIndex: 1, data: [], itemStyle: { color: '#91cc75' }, barMaxWidth: 50 },
        { name: '密度 (t/ha)', type: 'line', yAxisIndex: 2, data: [], itemStyle: { color: '#fac858' }, symbol: 'circle', symbolSize: 8, lineStyle: { width: 3 } }
      ]
    });
    console.log('[chart.js] Initial chart options set.');
    
    // 添加窗口大小改变时重绘图表
    window.addEventListener('resize', function() {
      if (analysisChart) {
        analysisChart.resize();
      }
    });
    
    setTimeout(() => {
      if (analysisChart) {
        console.log('[chart.js] Performing initial resize.');
        analysisChart.resize();
      }
    }, 100);
    
    console.log('[chart.js] initChart finished successfully.');
    return true;
  } catch (error) {
    console.error('[chart.js] Error during chart initialization:', error);
    return false;
  }
}

// 更新图表数据
function updateAnalysisChart() {
  try {
    if (!analysisChart) {
      console.error('图表未初始化，尝试重新初始化');
      if (!initChart()) {
        return;
      }
    }
    
    if (!regionsData || regionsData.length === 0) {
      analysisChart.setOption({
        xAxis: { data: [] },
        series: [
          { data: [] },
          { data: [] },
          { data: [] }
        ]
      });
      return;
    }
    
    analysisChart.setOption({
      xAxis: { data: regionsData.map(r => r.name) },
      series: [
        { data: regionsData.map(r => r.area) },
        { data: regionsData.map(r => r.carbon) },
        { data: regionsData.map(r => r.density) }
      ]
    });
  } catch (error) {
    console.error('更新图表失败:', error);
  }
} 