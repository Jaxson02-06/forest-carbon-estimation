const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const path = require('path');

const { connectDB } = require('./config/db');
const { notFound, errorHandler } = require('./utils/errorHandler');

// 加载环境变量
dotenv.config();

// 导入表创建脚本
const { createUsersTable } = require('./scripts/create_users_table');
const { createRegionsTable } = require('./scripts/create_regions_table');
const { createProjectsTable } = require('./scripts/create_projects_table');
const { createForestSubtypesTable } = require('./scripts/create_forest_subtypes_table');
const { createMultispectralTables } = require('./scripts/create_multispectral_table');
const { createLidarJobTable } = require('./scripts/create_lidar_job_table');
const { createTreeDetectionTable } = require('./scripts/create_tree_detection_table');
const { createCarbonEstimationTable } = require('./scripts/create_carbon_estimation_table');

// 连接数据库
connectDB()
  .then(async () => {
    // 确保数据库表已创建 (按照依赖顺序)
    await createUsersTable();       // 用户表优先
    await createRegionsTable();     // 区域表依赖用户表
    await createProjectsTable();    // 项目表依赖用户和区域表 (通过 projects_regions)
    await createForestSubtypesTable();
    await createMultispectralTables();
    await createLidarJobTable();
    await createTreeDetectionTable();
    await createCarbonEstimationTable();
    
    // 导入路由
    const userRoutes = require('./routes/userRoutes');
    const regionRoutes = require('./routes/regionRoutes');
    const projectRoutes = require('./routes/projectRoutes');
    const forestSubtypeRoutes = require('./routes/forestSubtypeRoutes');
    const lidarRoutes = require('./routes/lidarRoutes');
    const multispectralRoutes = require('./routes/multispectralRoutes');
    const treeDetectionRoutes = require('./routes/treeDetectionRoutes');
    const carbonEstimationRoutes = require('./routes/carbonEstimationRoutes');
    
    const app = express();
    
    // 中间件
    app.use(express.json());
    app.use(cors());
    app.use(helmet());
    
    // 添加静态文件访问路由，用于访问处理生成的栅格文件
    app.use('/outputs', express.static(path.join(process.cwd(), 'outputs')));
    app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
    
    // 日志
    if (process.env.NODE_ENV === 'development') {
      app.use(morgan('dev'));
    }
    
    // API 路由
    app.use('/api/users', userRoutes);
    app.use('/api/regions', regionRoutes);
    app.use('/api/projects', projectRoutes);
    app.use('/api/forest-subtypes', forestSubtypeRoutes);
    app.use('/api/lidar', lidarRoutes);
    app.use('/api/multispectral', multispectralRoutes);
    app.use('/api/tree-detection', treeDetectionRoutes);
    app.use('/api/carbon-estimation', carbonEstimationRoutes);
    
    // 在生产环境中提供静态文件
    if (process.env.NODE_ENV === 'production') {
      app.use(express.static(path.join(__dirname, '../')));
      
      app.get('*', (req, res) => {
        res.sendFile(path.resolve(__dirname, '../', 'index.html'));
      });
    } else {
      app.get('/', (req, res) => {
        res.send('API 运行中...');
      });
    }
    
    // 错误处理中间件
    app.use(notFound);
    app.use(errorHandler);
    
    // 启动服务器
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`服务器在 ${process.env.NODE_ENV} 模式下运行，端口: ${PORT}`);
    });
  })
  .catch((error) => {
    console.error('无法启动服务器:', error);
    process.exit(1);
  }); 