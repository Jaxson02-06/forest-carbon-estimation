#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
单株属性提取与碳储量估算脚本
从树冠多边形(GeoJSON)、CHM和DEM中提取树木属性，并计算碳储量
输出CSV格式的属性数据
"""

import sys
import os
import json
import argparse
import csv
import math
import numpy as np
import rasterio
from rasterio.mask import mask
from shapely.geometry import shape
import logging

# 配置日志
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def read_raster(raster_path):
    """
    读取栅格数据(GeoTIFF)
    
    Args:
        raster_path: 栅格文件路径
    
    Returns:
        src: 打开的栅格数据源
    """
    try:
        src = rasterio.open(raster_path)
        logger.info(f"成功读取栅格数据, 形状: {src.shape}, 坐标系统: {src.crs}")
        return src
    except Exception as e:
        logger.error(f"读取栅格文件失败: {str(e)}")
        raise

def read_geojson(geojson_path):
    """
    读取GeoJSON文件
    
    Args:
        geojson_path: GeoJSON文件路径
    
    Returns:
        data: GeoJSON数据
    """
    try:
        with open(geojson_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        # 检查是否是FeatureCollection
        if data.get('type') != 'FeatureCollection':
            raise ValueError("GeoJSON必须是FeatureCollection类型")
        
        # 过滤出树冠多边形
        crown_features = [f for f in data['features'] if f.get('properties', {}).get('type') == 'tree_crown']
        
        logger.info(f"成功读取GeoJSON, 共有{len(crown_features)}个树冠多边形")
        
        return data, crown_features
    except Exception as e:
        logger.error(f"读取GeoJSON文件失败: {str(e)}")
        raise

def calculate_tree_attributes(crown_features, chm_src, dem_src=None, a=0.05, b=2.0, c=1.0, carbon_factor=0.5):
    """
    计算每棵树的属性和碳储量
    
    Args:
        crown_features: 树冠多边形特征列表
        chm_src: CHM栅格数据源
        dem_src: DEM栅格数据源(可选)
        a: 生物量模型系数a
        b: 生物量模型指数b(胸径)
        c: 生物量模型指数c(树高)
        carbon_factor: 生物量到碳的转换因子
    
    Returns:
        tree_attributes: 包含树木属性的列表
    """
    tree_attributes = []
    
    for i, feature in enumerate(crown_features):
        try:
            # 获取多边形几何和ID
            geom = shape(feature['geometry'])
            tree_id = feature['properties'].get('tree_id', f"tree_{i+1}")
            
            # 计算树冠面积和等效直径
            area_m2 = geom.area  # 假设坐标单位为米
            crown_diameter = 2 * math.sqrt(area_m2 / math.pi)  # 等效直径
            
            # 获取质心坐标
            centroid = geom.centroid
            cx, cy = centroid.x, centroid.y
            
            # 提取CHM值
            chm_masked, _ = mask(chm_src, [geom], crop=True, filled=True, nodata=chm_src.nodata or 0)
            chm_values = chm_masked[0].astype('float32')
            chm_values[chm_values == (chm_src.nodata or 0)] = np.nan
            
            # 如果提供了DEM，则计算相对高度，否则直接使用CHM
            if dem_src is not None:
                dem_masked, _ = mask(dem_src, [geom], crop=True, filled=True, nodata=dem_src.nodata or 0)
                dem_values = dem_masked[0].astype('float32')
                dem_values[dem_values == (dem_src.nodata or 0)] = np.nan
                
                # 计算相对高度 (CHM - DEM)
                height_values = chm_values - dem_values
            else:
                height_values = chm_values
            
            # 获取树高(最大高度值)
            if np.any(~np.isnan(height_values)):
                height = float(np.nanmax(height_values))
            else:
                # 如果没有有效高度值，尝试使用属性中的高度
                height = float(feature['properties'].get('height', 0))
            
            # 估算胸径(DBH) - 使用冠幅与胸径的经验关系
            # 可以根据需要调整这个关系，这里使用简单的线性关系
            dbh_cm = 10 * crown_diameter  # 简化假设: DBH (cm) = 10 * 冠幅直径 (m)
            
            # 计算生物量 (kg)
            # 使用异速生长方程: M = a * (DBH^b) * (Height^c)
            biomass_kg = a * (dbh_cm ** b) * (height ** c)
            
            # 计算碳储量 (kg)
            carbon_kg = biomass_kg * carbon_factor
            
            # 将属性添加到结果列表
            tree_attributes.append({
                'tree_id': tree_id,
                'height_m': height,
                'crown_diameter_m': crown_diameter,
                'crown_area_m2': area_m2,
                'dbh_cm': dbh_cm,
                'biomass_kg': biomass_kg,
                'carbon_kg': carbon_kg,
                'centroid_x': cx,
                'centroid_y': cy
            })
            
        except Exception as e:
            logger.warning(f"处理树冠 {i+1} 属性时出错: {str(e)}")
    
    logger.info(f"成功计算 {len(tree_attributes)} 棵树的属性和碳储量")
    return tree_attributes

def write_csv(tree_attributes, output_path):
    """
    将树木属性写入CSV文件
    
    Args:
        tree_attributes: 树木属性列表
        output_path: 输出CSV文件路径
    """
    try:
        fieldnames = [
            'tree_id', 
            'height_m', 
            'crown_diameter_m', 
            'crown_area_m2', 
            'dbh_cm', 
            'biomass_kg', 
            'carbon_kg', 
            'centroid_x', 
            'centroid_y'
        ]
        
        with open(output_path, 'w', newline='', encoding='utf-8') as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()
            for tree in tree_attributes:
                writer.writerow(tree)
        
        logger.info(f"属性数据已保存至: {output_path}")
    except Exception as e:
        logger.error(f"写入CSV文件失败: {str(e)}")
        raise

def calculate_summary(tree_attributes):
    """
    计算碳储量的汇总统计信息
    
    Args:
        tree_attributes: 树木属性列表
    
    Returns:
        summary: 包含总碳储量和统计的字典
    """
    summary = {
        'total_trees': len(tree_attributes),
        'total_carbon_kg': 0,
        'total_biomass_kg': 0,
        'total_crown_area_m2': 0,
        'mean_height_m': 0,
        'mean_dbh_cm': 0,
        'mean_carbon_kg': 0
    }
    
    if not tree_attributes:
        return summary
    
    # 计算总计值
    heights = []
    dbhs = []
    carbon_values = []
    
    for tree in tree_attributes:
        summary['total_carbon_kg'] += tree['carbon_kg']
        summary['total_biomass_kg'] += tree['biomass_kg']
        summary['total_crown_area_m2'] += tree['crown_area_m2']
        
        heights.append(tree['height_m'])
        dbhs.append(tree['dbh_cm'])
        carbon_values.append(tree['carbon_kg'])
    
    # 计算平均值
    summary['mean_height_m'] = np.mean(heights)
    summary['mean_dbh_cm'] = np.mean(dbhs)
    summary['mean_carbon_kg'] = np.mean(carbon_values)
    
    # 转换单位 - 添加吨和公顷单位的值
    summary['total_carbon_t'] = summary['total_carbon_kg'] / 1000
    summary['total_biomass_t'] = summary['total_biomass_kg'] / 1000
    summary['total_crown_area_ha'] = summary['total_crown_area_m2'] / 10000
    
    # 计算每公顷碳密度
    if summary['total_crown_area_ha'] > 0:
        summary['carbon_density_t_ha'] = summary['total_carbon_t'] / summary['total_crown_area_ha']
    else:
        summary['carbon_density_t_ha'] = 0
    
    # 转换为CO2当量 (二氧化碳当量) - 碳到CO2的转换系数是 44/12 ≈ 3.67
    summary['total_co2e_t'] = summary['total_carbon_t'] * 3.67
    summary['co2e_density_t_ha'] = summary['carbon_density_t_ha'] * 3.67
    
    logger.info(f"计算得总碳储量: {summary['total_carbon_t']:.2f} 吨，" 
                f"CO2当量: {summary['total_co2e_t']:.2f} 吨CO2e，" 
                f"碳密度: {summary['carbon_density_t_ha']:.2f} tC/ha")
    
    return summary

def process_tree_attributes(
    geojson_path, 
    chm_path, 
    dem_path=None, 
    output_dir=None, 
    a=0.05, 
    b=2.0, 
    c=1.0, 
    carbon_factor=0.5
):
    """
    处理树冠多边形，计算属性和碳储量，输出CSV和统计信息
    
    Args:
        geojson_path: 树冠多边形GeoJSON文件路径
        chm_path: CHM栅格文件路径
        dem_path: DEM栅格文件路径（可选）
        output_dir: 输出目录，默认与GeoJSON同目录
        a, b, c: 生物量模型参数
        carbon_factor: 生物量到碳的转换因子
    
    Returns:
        csv_path: 输出的CSV文件路径
        summary: 碳储量统计摘要
    """
    try:
        # 如果未指定输出目录，使用输入文件所在目录
        if output_dir is None:
            output_dir = os.path.dirname(geojson_path)
        
        # 确保输出目录存在
        os.makedirs(output_dir, exist_ok=True)
        
        # 获取输入文件名（不含扩展名）
        base_name = os.path.splitext(os.path.basename(geojson_path))[0]
        
        # 设置输出文件路径
        csv_path = os.path.join(output_dir, f"{base_name}_attributes.csv")
        
        # 读取数据
        logger.info(f"读取GeoJSON文件: {geojson_path}")
        data, crown_features = read_geojson(geojson_path)
        
        logger.info(f"读取CHM文件: {chm_path}")
        chm_src = read_raster(chm_path)
        
        dem_src = None
        if dem_path:
            logger.info(f"读取DEM文件: {dem_path}")
            dem_src = read_raster(dem_path)
        
        # 计算树木属性
        logger.info(f"开始计算树木属性，使用生物量系数a={a}, b={b}, c={c}, 碳因子={carbon_factor}")
        tree_attributes = calculate_tree_attributes(
            crown_features, chm_src, dem_src, a, b, c, carbon_factor
        )
        
        # 计算统计摘要
        logger.info("计算碳储量统计摘要")
        summary = calculate_summary(tree_attributes)
        
        # 将属性写入CSV
        logger.info(f"将属性数据写入CSV: {csv_path}")
        write_csv(tree_attributes, csv_path)
        
        # 关闭栅格数据源
        chm_src.close()
        if dem_src:
            dem_src.close()
        
        return csv_path, summary
        
    except Exception as e:
        logger.error(f"处理树木属性时出错: {str(e)}")
        raise

def main():
    """命令行入口函数"""
    parser = argparse.ArgumentParser(description='从树冠多边形、CHM和DEM中提取树木属性和计算碳储量')
    parser.add_argument('--geojson', '-i', required=True, help='输入树冠多边形GeoJSON文件路径')
    parser.add_argument('--chm', required=True, help='输入冠层高度模型CHM栅格文件路径')
    parser.add_argument('--dem', help='输入数字高程模型DEM栅格文件路径（可选）')
    parser.add_argument('--output-dir', '-o', help='输出目录路径')
    parser.add_argument('--a', type=float, default=0.05, help='生物量模型系数a（默认: 0.05）')
    parser.add_argument('--b', type=float, default=2.0, help='生物量模型指数b（胸径）（默认: 2.0）')
    parser.add_argument('--c', type=float, default=1.0, help='生物量模型指数c（树高）（默认: 1.0）')
    parser.add_argument('--carbon-factor', type=float, default=0.5, help='碳转换因子（默认: 0.5）')
    
    args = parser.parse_args()
    
    try:
        # 处理树木属性
        csv_path, summary = process_tree_attributes(
            args.geojson,
            args.chm,
            args.dem,
            args.output_dir,
            args.a,
            args.b,
            args.c,
            args.carbon_factor
        )
        
        # 输出结果路径和摘要
        print(f"CSV: {csv_path}")
        print(f"SUMMARY: {json.dumps(summary)}")
        
        return 0
    except Exception as e:
        logger.error(f"处理失败: {str(e)}")
        return 1

if __name__ == "__main__":
    sys.exit(main()) 