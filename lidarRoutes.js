const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {
  processLidarData,
  getLidarStats,
  monitorProgress,
  getJobStatus
} = require('../controllers/lidarController');
const { protect } = require('../utils/auth');

const router = express.Router();

// 配置文件上传存储
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(process.cwd(), 'uploads');
    // 确保上传目录存在
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // 使用原始文件名，确保文件扩展名保持不变
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

// 创建上传中间件，限制文件大小为100MB
const upload = multer({
  storage: storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  fileFilter: function (req, file, cb) {
    // 只接受.las和.laz文件
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== '.las' && ext !== '.laz') {
      return cb(new Error('只支持.las和.laz文件格式'));
    }
    cb(null, true);
  }
});

// 部分路由不需要登录保护，如进度监控
// 监听处理进度
router.get('/progress/:jobId', monitorProgress);

// 获取作业状态
router.get('/job/:jobId', getJobStatus);

// 以下路由需要登录保护
router.use(protect);

// 文件上传路由
router.post('/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: '没有上传文件' });
    }
    
    res.status(200).json({
      success: true,
      filePath: req.file.path,
      fileName: req.file.originalname
    });
  } catch (error) {
    console.error('文件上传失败:', error);
    res.status(500).json({ message: '文件上传失败', error: error.message });
  }
});

// 处理LiDAR数据
router.post('/process', processLidarData);

// 获取点云统计信息
router.get('/stats', getLidarStats);

module.exports = router; 