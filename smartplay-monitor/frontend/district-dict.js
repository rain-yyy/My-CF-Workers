// 香港区域代码字典
const DISTRICT_DICT = {
    // 香港岛 (Hong Kong Island)
    'CW': '中西区',
    'EN': '湾仔区',
    'SN': '南区',
    'WCH': '东区',
    
    // 九龙 (Kowloon)
    'KC': '九龙城区',
    'KT': '观塘区',
    'SSP': '深水埗区',
    'WTS': '黄大仙区',
    'YTM': '油尖旺区',
    
    // 新界东 (New Territories East)
    'N': '北区',
    'SK': '西贡区',
    'ST': '沙田区',
    'TP': '大埔区',
    
    // 新界西 (New Territories West)
    'IS': '离岛区',
    'KWT': '葵青区',
    'TW': '荃湾区',
    'TM': '屯门区',
    'YL': '元朗区'
};

// 按区域分组
const DISTRICT_GROUPS = {
    '香港岛': ['CW', 'EN', 'SN', 'WCH'],
    '九龙': ['KC', 'KT', 'SSP', 'WTS', 'YTM'],
    '新界东': ['N', 'SK', 'ST', 'TP'],
    '新界西': ['IS', 'KWT', 'TW', 'TM', 'YL']
};

// 默认查询的区域（香港岛4个区）
const DEFAULT_DISTRICTS = ['CW', 'EN', 'SN', 'WCH'];

// 导出（如果在模块环境）
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { DISTRICT_DICT, DISTRICT_GROUPS, DEFAULT_DISTRICTS };
}
