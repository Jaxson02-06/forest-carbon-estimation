// 处理404错误 - 找不到资源
const notFound = (req, res, next) => {
  const error = new Error(`找不到资源 - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

// 全局错误处理中间件
const errorHandler = (err, req, res, next) => {
  // 检查状态码，如果还是200，设置为500
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode);
  
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack
  });
};

module.exports = { notFound, errorHandler }; 