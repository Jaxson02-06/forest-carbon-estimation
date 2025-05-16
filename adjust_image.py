#!/usr/bin/env python
# -*- coding: utf-8 -*-

"""
多光谱影像手动调整脚本
应用用户指定的偏移量调整已配准影像
"""

import sys
import os
import numpy as np
import gdal
from osgeo import osr

def read_geotiff(filepath):
    """读取GeoTIFF影像，返回影像数据和地理信息"""
    ds = gdal.Open(filepath)
    if ds is None:
        raise Exception(f"无法打开影像文件: {filepath}")
    
    # 读取影像数据
    if ds.RasterCount == 1:
        data = ds.GetRasterBand(1).ReadAsArray()
        # 单波段影像，保持二维数组
    else:
        # 多波段影像，转换为三维数组 (bands, height, width)
        data = np.zeros((ds.RasterCount, ds.RasterYSize, ds.RasterXSize), dtype=np.float32)
        for i in range(ds.RasterCount):
            band = ds.GetRasterBand(i+1)
            data[i, :, :] = band.ReadAsArray()
    
    # 获取地理信息
    geo_transform = ds.GetGeoTransform()
    projection = ds.GetProjection()
    
    return data, geo_transform, projection, ds.RasterCount

def apply_shift(geo_transform, dx, dy):
    """
    应用像素偏移到地理变换参数
    
    Args:
        geo_transform: 原始地理变换参数
        dx: X方向偏移量（像素）
        dy: Y方向偏移量（像素）
    
    Returns:
        更新后的地理变换参数
    """
    # 转换为列表以便修改
    new_geo = list(geo_transform)
    
    # 应用偏移
    # 地理变换参数为 (原点X, X方向分辨率, X斜率, 原点Y, Y斜率, Y方向分辨率)
    # 我们需要更新原点坐标以反映偏移
    new_geo[0] += dx * new_geo[1]  # X原点 += dx * X分辨率
    new_geo[3] += dy * new_geo[5]  # Y原点 += dy * Y分辨率
    
    return tuple(new_geo)

def write_geotiff(filepath, data, geo_transform, projection, datatype=gdal.GDT_Float32):
    """将影像数据写入GeoTIFF文件"""
    if len(data.shape) > 2 and data.shape[0] > 1:
        # 多波段影像
        bands, height, width = data.shape
    else:
        # 单波段影像
        if len(data.shape) > 2:
            bands = 1
            height, width = data[0].shape
        else:
            bands = 1
            height, width = data.shape
    
    driver = gdal.GetDriverByName('GTiff')
    out_ds = driver.Create(filepath, width, height, bands, datatype)
    
    if out_ds is None:
        raise Exception(f"无法创建输出文件: {filepath}")
    
    out_ds.SetGeoTransform(geo_transform)
    out_ds.SetProjection(projection)
    
    if bands > 1:
        for i in range(bands):
            out_ds.GetRasterBand(i+1).WriteArray(data[i])
    else:
        if len(data.shape) > 2:
            out_ds.GetRasterBand(1).WriteArray(data[0])
        else:
            out_ds.GetRasterBand(1).WriteArray(data)
    
    out_ds.FlushCache()
    return out_ds

def main():
    """主函数"""
    if len(sys.argv) != 5:
        print("用法: python adjust_image.py <输入影像> <输出路径> <X偏移> <Y偏移>")
        sys.exit(1)
    
    input_path = sys.argv[1]
    output_path = sys.argv[2]
    dx = float(sys.argv[3])
    dy = float(sys.argv[4])
    
    try:
        # 读取输入影像
        print(f"Reading input image: {input_path}")
        data, geo, proj, bands = read_geotiff(input_path)
        
        # 应用偏移
        print(f"Applying shift: dx={dx}, dy={dy}")
        new_geo = apply_shift(geo, dx, dy)
        
        # 写入结果
        print(f"Writing output image: {output_path}")
        write_geotiff(output_path, data, new_geo, proj)
        
        print("Manual adjustment completed successfully")
        sys.exit(0)
        
    except Exception as e:
        print(f"Error: {str(e)}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main() 