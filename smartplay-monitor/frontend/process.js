function processVenueData(responseData) {
    // 初始化结果数组
    const results = [];
    
    // 验证数据结构
    if (!responseData || !responseData.data) {
        throw new Error('无效的数据格式：缺少data字段');
    }
    
    const data = responseData.data;
    
    // 处理所有时段 (morning, afternoon, evening)
    const periods = {
        'morning': '早上',
        'afternoon': '下午', 
        'evening': '晚上'
    };

    Object.entries(periods).forEach(([periodKey, periodName]) => {
        // 检查该时段是否存在
        if (!data[periodKey] || !data[periodKey].distList) {
            console.warn(`警告: ${periodName}时段数据不存在或格式错误`);
            return;
        }
        
        // 获取该时段的所有区域
        const districts = data[periodKey].distList;
        
        // 遍历每个区域
        districts.forEach(district => {
            // 遍历该区域的所有场地
            district.venueList.forEach(venue => {
                // 遍历场地的所有设施
                venue.fatList.forEach(facility => {
                    // 遍历设施的所有时段
                    facility.sessionList.forEach(session => {
                        // 构建单行数据
                        const row = {
                            venueName: venue.venueName, // 场地名称
                            facilityName: facility.fatName, // 设施类型
                            period: periodName, // 时段名称
                            startTime: session.ssnStartTime, // 开始时间
                            endTime: session.ssnEndTime, // 结束时间
                            available: session.available ? '是' : '否', // 是否可预订
                            isPeakHour: session.peakHour ? '是' : '否', // 是否高峰时段
                            district: district.distName, // 区域名称
                            enFacilityName: facility.enFatName // 英文设施名称
                        };
                        
                        results.push(row);
                    });
                });
            });
        });
    });

    return results;
}

// 将数据转换为Excel友好的CSV格式
function convertToCSV(data) {
    // 定义表头
    const headers = [
        '区域',
        '场地名称',
        '设施类型',
        '时段',
        '开始时间',
        '结束时间',
        '是否可预订',
        '是否高峰时段'
    ];

    // 转换数据为CSV行
    const rows = data.map(row => [
        row.district,
        row.venueName,
        row.facilityName,
        row.period,
        row.startTime,
        row.endTime,
        row.available,
        row.isPeakHour
    ]);

    // 组合表头和数据行
    return [headers, ...rows]
        .map(row => row.join('\t'))
        .join('\n');
}

// 示例使用:
// const venueData = {...}; // 你的原始数据
// const processed = processVenueData(venueData);
// const csv = convertToCSV(processed);
// console.log(csv);

// 检测环境
function isBrowser() {
    return typeof window !== 'undefined' && typeof document !== 'undefined';
}

// 如果需要下载为Excel文件 (浏览器环境):
function downloadExcel(data, filename = 'venue_data.xls') {
    const csv = convertToCSV(data);
    
    if (isBrowser()) {
        // 浏览器环境
        const blob = new Blob(['\ufeff' + csv], { type: 'text/tab-separated-values;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        link.click();
        console.log(`文件已下载: ${filename}`);
    } else {
        // Node.js环境 - 写入文件
        const fs = require('fs');
        fs.writeFileSync(filename, '\ufeff' + csv, 'utf-8');
        console.log(`文件已保存: ${filename}`);
    }
}

// 完整使用示例:
function processAndDownload(jsonData) {
    const processed = processVenueData(jsonData);
    downloadExcel(processed);
}

// 主函数 - 自动运行
async function main() {
    try {
        console.log('正在获取数据...');
        
        // 确保fetch可用 (Node.js 18+自带，或使用全局fetch)
        const response = await fetch("https://smartplay-monitor.tianruifan21.workers.dev/?distCode=CW,EN,SN,WCH&faCode=FOTP&playDate=2026-01-24");
        
        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
        }
        
        const jsondata = await response.json();
        console.log('数据获取成功，开始处理...');
        
        // 打印数据结构信息以便调试
        if (jsondata.data) {
            const morningCount = jsondata.data.morning?.distList?.length || 0;
            const afternoonCount = jsondata.data.afternoon?.distList?.length || 0;
            const eveningCount = jsondata.data.evening?.distList?.length || 0;
            console.log(`时段数据 - 早上:${morningCount}区, 下午:${afternoonCount}区, 晚上:${eveningCount}区`);
        }
        
        processAndDownload(jsondata);
        console.log('✓ 处理完成！');
    } catch (error) {
        console.error('✗ 处理失败:', error.message);
        console.error('错误详情:', error);
        if (isBrowser()) {
            alert('获取或处理数据时出错: ' + error.message);
        }
        throw error; // 重新抛出错误以便调试
    }
}

// 自动运行 (可以注释掉这行，改为手动调用main())
main();