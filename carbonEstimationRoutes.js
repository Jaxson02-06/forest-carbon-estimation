const express = require('express');
const router = express.Router();
const { protect } = require('../utils/auth');
const {
  calculateCarbonEstimation,
  getCarbonJobStatus,
  getAllCarbonJobs
} = require('../controllers/carbonEstimationController');

// 计算碳储量估算
router.post('/calculate', protect, calculateCarbonEstimation);

// 获取碳储量估算作业状态
router.get('/job/:jobId', protect, getCarbonJobStatus);

// 获取所有碳储量估算作业
router.get('/jobs', protect, getAllCarbonJobs);

module.exports = router; 