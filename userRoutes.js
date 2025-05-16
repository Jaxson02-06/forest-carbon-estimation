const express = require('express');
const { 
  registerUser, 
  loginUser, 
  getUserProfile,
  updateUserProfile
} = require('../controllers/userController');
const { protect } = require('../utils/auth');

const router = express.Router();

// 公开路由
router.post('/', registerUser);
router.post('/login', loginUser);

// 需要登录的路由
router.route('/profile')
  .get(protect, getUserProfile)
  .put(protect, updateUserProfile);

module.exports = router; 