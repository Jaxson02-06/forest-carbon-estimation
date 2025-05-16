const express = require('express');
const {
  getForestSubtypes,
  createForestSubtype,
  deleteForestSubtype
} = require('../controllers/forestSubtypeController');
const { protect } = require('../utils/auth');

const router = express.Router();

// 所有路由都需要用户认证
router.use(protect);

// 获取当前用户的自定义森林子类型列表
router.get('/', getForestSubtypes);

// 创建新的自定义森林子类型
router.post('/', createForestSubtype);

// 删除自定义森林子类型
router.delete('/:value', deleteForestSubtype);

module.exports = router; 