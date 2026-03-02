/**
 * SmartPlay 场地监控 - 数据处理模块
 * 包含数据获取、处理、过滤、排序功能
 */

// ==================== 配置 ====================
const API_BASE = 'smartplay-monitor-api.tianruifan21.workers.dev/';

// 4个大区域配置
const DISTRICT_REGIONS = {
    '香港岛': ['CW', 'EN', 'SN', 'WCH'],
    '九龙': ['KC', 'KT', 'SSP', 'WTS', 'YTM'],
    '新界东': ['N', 'SK', 'ST', 'TP'],
    '新界西': ['IS', 'KWT', 'TW', 'TM', 'YL']
};

// ==================== 状态管理 ====================
let allData = [];
let filteredData = [];
let sortColumn = '';
let sortDirection = 'asc';
let timeSlots = [];

// ==================== 数据获取 ====================

/**
 * 从API获取场地数据
 * @param {string} playDate - 查询日期
 * @param {string} faCode - 设施代码
 * @returns {Promise<Object>} 返回处理后的数据和状态
 */
async function fetchVenueData(playDate, faCode) {
    if (!playDate) {
        throw new Error('请选择查询日期');
    }

    // 发送单次请求获取所有区域数据
    const url = `${API_BASE}?faCode=${faCode}&playDate=${playDate}`;
    
    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`API请求失败: ${response.status}`);
        }
        
        const data = await response.json();
        
        // 处理返回的数据
        const { venues, timeSlots: slots } = processVenueData(data, faCode);
        allData = venues;
        timeSlots = slots;
        
        console.log(`成功获取 ${allData.length} 个场地`);
        
    } catch (error) {
        console.error('请求失败:', error);
        throw error;
    }
    
    return {
        data: allData,
        timeSlots,
        totalCount: allData.length
    };
}

// ==================== 数据处理 ====================

/**
 * 处理场地数据 - 创建时间网格结构（羽毛球）或时间段列表（足球）
 * @param {Object} responseData - API返回的原始数据
 * @param {string} faCode - 设施代码
 * @returns {Object} 处理后的场地数据和时间段
 */
function processVenueData(responseData, faCode) {
    const venueMap = new Map();
    const timeSlots = new Set();
    const isFootball = faCode === 'FOTP';
    
    if (!responseData || !responseData.data) {
        throw new Error('无效的数据格式：缺少data字段');
    }
    
    const data = responseData.data;
    const periods = {
        'morning': '早上',
        'afternoon': '下午', 
        'evening': '晚上'
    };

    Object.entries(periods).forEach(([periodKey, periodName]) => {
        if (!data[periodKey] || !data[periodKey].distList) {
            return;
        }
        
        const districts = data[periodKey].distList;
        
        districts.forEach(district => {
            district.venueList.forEach(venue => {
                venue.fatList.forEach(facility => {
                    const key = `${district.distName}|${venue.venueName}|${facility.fatName}`;
                    
                    if (!venueMap.has(key)) {
                        venueMap.set(key, {
                            district: district.distName,
                            venueName: venue.venueName,
                            facilityName: facility.fatName,
                            timeSlots: new Map(), // hour -> {sessionCount, unavailable} for badminton
                            availableSlots: [] // [{start, end, count}] for football
                        });
                    }
                    
                    const venueData = venueMap.get(key);
                    
                    facility.sessionList.forEach(session => {
                        if (isFootball) {
                            // 足球：收集具体可用时间段
                            const count = session.sessionCount !== undefined ? session.sessionCount : (session.available ? 1 : 0);
                            if (count > 0) {
                                venueData.availableSlots.push({
                                    start: session.ssnStartTime,
                                    end: session.ssnEndTime,
                                    count: count
                                });
                            }
                        } else {
                            // 羽毛球：使用时间格子
                            const startHour = parseInt(session.ssnStartTime.split(':')[0]);
                            timeSlots.add(startHour);
                            
                            if (!venueData.timeSlots.has(startHour)) {
                                venueData.timeSlots.set(startHour, { sessionCount: 0, unavailable: 0 });
                            }
                            
                            const slot = venueData.timeSlots.get(startHour);
                            if (session.sessionCount !== undefined && session.sessionCount > 0) {
                                slot.sessionCount += session.sessionCount;
                            } else if (session.available) {
                                slot.sessionCount++;
                            } else {
                                slot.unavailable++;
                            }
                        }
                    });
                });
            });
        });
    });

    // 足球：对时间段进行排序
    if (isFootball) {
        venueMap.forEach(venue => {
            venue.availableSlots.sort((a, b) => a.start.localeCompare(b.start));
        });
    }

    const sortedTimeSlots = Array.from(timeSlots).sort((a, b) => a - b);
    const results = Array.from(venueMap.values());

    return { venues: results, timeSlots: sortedTimeSlots };
}

// ==================== 过滤和排序 ====================

/**
 * 应用过滤条件
 * @param {string} searchTerm - 搜索关键词
 * @returns {Array} 过滤后的数据
 */
function applyFilters(searchTerm = '') {
    const lowerSearchTerm = searchTerm.toLowerCase();

    filteredData = allData.filter(row => {
        return !lowerSearchTerm || 
            row.venueName.toLowerCase().includes(lowerSearchTerm) ||
            row.district.toLowerCase().includes(lowerSearchTerm);
    });

    if (sortColumn) {
        filteredData.sort((a, b) => {
            let valA = a[sortColumn];
            let valB = b[sortColumn];
            
            if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
            if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
            return 0;
        });
    }

    return filteredData;
}

/**
 * 处理排序
 * @param {string} column - 排序列名
 * @returns {Object} 返回排序状态
 */
function handleSort(column) {
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'asc';
    }

    return {
        column: sortColumn,
        direction: sortDirection
    };
}

/**
 * 重置排序
 */
function resetSort() {
    sortColumn = '';
    sortDirection = 'asc';
}

// ==================== 状态获取器 ====================

/**
 * 获取当前所有数据
 */
function getAllData() {
    return allData;
}

/**
 * 获取当前过滤后的数据
 */
function getFilteredData() {
    return filteredData;
}

/**
 * 获取当前时间段列表
 */
function getTimeSlots() {
    return timeSlots;
}

/**
 * 获取当前排序状态
 */
function getSortState() {
    return {
        column: sortColumn,
        direction: sortDirection
    };
}

// ==================== 工具函数 ====================

/**
 * 防抖函数
 * @param {Function} func - 需要防抖的函数
 * @param {number} wait - 等待时间（毫秒）
 * @returns {Function} 防抖后的函数
 */
function debounce(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}
