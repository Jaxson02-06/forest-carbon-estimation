-- 林木碳汇测算系统 - 数据库清理脚本 (可选)
--
-- 重要提示:
-- 除非您确实需要完全重置相关表，否则请勿执行此脚本。
-- 系统的主要表结构和初始数据由应用服务器在启动时自动管理。
-- 此文件仅作为开发或特殊情况下手动清理数据库的参考。

-- -- 安装PostGIS扩展 (如果应用启动时未自动处理)
-- CREATE EXTENSION IF NOT EXISTS postgis;

-- -- 清理表 (请谨慎使用!)
-- DROP TABLE IF EXISTS projects_regions CASCADE;
-- DROP TABLE IF EXISTS carbon_estimation_results CASCADE;
-- DROP TABLE IF EXISTS tree_detection_results CASCADE;
-- DROP TABLE IF EXISTS tree_detection_jobs CASCADE;
-- DROP TABLE IF EXISTS lidar_outputs CASCADE;
-- DROP TABLE IF EXISTS lidar_jobs CASCADE;
-- DROP TABLE IF EXISTS multispectral_results CASCADE;
-- DROP TABLE IF EXISTS multispectral_jobs CASCADE;
-- DROP TABLE IF EXISTS chm_files CASCADE; -- 如果有单独的chm_files表
-- DROP TABLE IF EXISTS multispectral_uploads CASCADE; -- 如果有旧的uploads表结构
-- DROP TABLE IF EXISTS forest_subtypes CASCADE;
-- DROP TABLE IF EXISTS projects CASCADE;
-- DROP TABLE IF EXISTS regions CASCADE;
-- DROP TABLE IF EXISTS users CASCADE;

-- -- 删除旧的更新时间触发器函数 (如果需要彻底清理)
-- -- DROP FUNCTION IF EXISTS update_modified_column() CASCADE;

SELECT '- 数据库清理脚本加载完毕，请取消注释并逐条执行需要的命令。'; 