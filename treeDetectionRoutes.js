const express = require('express');
const router = express.Router();
const { protect } = require('../utils/auth');
const {
  uploadAndProcessCHM,
  getJobStatus,
  processWithParams,
  getAllJobs
} = require('../controllers/treeDetectionController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// 配置文件上传存储
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(process.cwd(), 'uploads', 'temp');
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

// 创建上传中间件，限制文件大小为50MB
const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    // 检查文件类型是否为GeoTIFF
    const filetypes = /tiff?|geotiff?/;
    const mimetype = filetypes.test(file.mimetype);
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('只支持TIFF/GeoTIFF格式的CHM文件'));
  }
});

// 上传CHM文件并处理
router.post('/upload', protect, upload.single('chm'), uploadAndProcessCHM);

// 使用自定义参数处理树冠检测
router.post('/process', protect, processWithParams);

// 获取作业状态
router.get('/job/:jobId', protect, getJobStatus);

// 获取所有作业
router.get('/jobs', protect, getAllJobs);

module.exports = router; 