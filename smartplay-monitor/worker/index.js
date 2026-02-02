// SmartPlay Worker - 监控场地并提供API代理
// 包含Cookie管理、缓存处理和请求聚合功能

// ==================== 常量配置 ====================

// 加点东西

// R2中存储Cookie的键名
const COOKIE_STORAGE_KEY = "smartplay-cookies";

// 获取新Cookie的外部服务地址
const COOKIE_SOURCE_URL = "https://smartplay-cookie-30995984708.europe-west1.run.app/scrape";

// SmartPlay 官方API地址
const TARGET_API_URL = "https://www.smartplay.lcsd.gov.hk/rest/facility-catalog/api/v1/publ/facilities";

// 区域分组定义 (对应前端 district-dict.js)
// 用于批量查询接口，将全港分为4个大区并行查询
const DISTRICT_GROUPS = {
    'HK_ISLAND': ['CW', 'EN', 'SN', 'WCH'],      // 香港岛
    'KOWLOON': ['KC', 'KT', 'SSP', 'WTS', 'YTM'], // 九龙
    'NT_EAST': ['N', 'SK', 'ST', 'TP'],          // 新界东
    'NT_WEST': ['IS', 'KWT', 'TW', 'TM', 'YL']   // 新界西
};

// ==================== 工具函数 ====================

/**
 * 格式化Cookie数组为请求头字符串
 * @param {Array} cookies - cookie对象数组
 * @returns {string} 格式化后的cookie字符串
 */
function formatCookieString(cookies) {
    return cookies.map(c => `${c.name}=${c.value}`).join("; ");
}

/**
 * 验证响应中的Cookie是否失效
 * 通常 401 或 403 表示需要更新 Cookie
 */
function isCookieInvalid(response) {
    return response.status === 401 || response.status === 403;
}

// ==================== Cookie 管理 ====================

/**
 * 从 R2 存储桶获取缓存的 Cookie
 */
async function getCookiesFromStorage(env) {
    try {
        const object = await env.COOKIE_BUCKET.get(COOKIE_STORAGE_KEY);
        if (!object) return null;
        
        const data = await object.json();
        console.log(`[Cookie] 从 R2 读取成功，数量: ${data.cookies.length}`);
        return data;
    } catch (error) {
        console.error("[Cookie] 读取 R2 失败:", error);
        return null;
    }
}

/**
 * 保存 Cookie 到 R2 存储桶
 */
async function saveCookiesToStorage(env, cookies) {
    try {
        const data = {
            cookies,
            cookieString: formatCookieString(cookies),
            timestamp: Date.now()
        };
        
        await env.COOKIE_BUCKET.put(
            COOKIE_STORAGE_KEY,
            JSON.stringify(data),
            { httpMetadata: { contentType: "application/json" } }
        );
        console.log(`[Cookie] 已保存到 R2，数量: ${cookies.length}`);
    } catch (error) {
        console.error("[Cookie] 保存到 R2 失败:", error);
        throw error; // 继续抛出以便上层处理
    }
}

/**
 * 从外部 Scraper 服务获取全新 Cookie
 */
async function fetchNewCookies() {
    try {
        console.log("[Cookie] 正在从 Scraper 获取新 Cookie...");
        const response = await fetch(COOKIE_SOURCE_URL);
        
        if (!response.ok) {
            throw new Error(`Scraper 服务返回错误: ${response.status}`);
        }
        
        const json = await response.json();
        if (!json.success || !json.data || !json.data.cookies) {
            throw new Error("Scraper 响应格式错误");
        }
        
        console.log(`[Cookie] 获取成功，数量: ${json.data.cookies.length}`);
        return json.data.cookies;
    } catch (error) {
        console.error("[Cookie] 获取新 Cookie 失败:", error);
        throw error;
    }
}

/**
 * 获取可用 Cookie (优先读缓存，失效则更新)
 * @returns {Promise<string>} 格式化好的 Cookie 字符串
 */
async function getValidCookieString(env) {
    // 1. 尝试读取缓存
    let cacheData = await getCookiesFromStorage(env);
    
    // 2. 如果没有缓存，获取新的
    if (!cacheData) {
        console.log("[Cookie] 无缓存，初始化...");
        const newCookies = await fetchNewCookies();
        await saveCookiesToStorage(env, newCookies);
        return formatCookieString(newCookies);
    }
    
    return cacheData.cookieString;
}

// ==================== 核心业务逻辑 ====================

/**
 * 调用 SmartPlay API 查询场地
 * @param {string} cookieString - 认证 Cookie
 * @param {URLSearchParams} params - 查询参数 (distCode, faCode, playDate)
 * @returns {Promise<Response>} API 响应
 */
async function querySmartPlayAPI(cookieString, params) {
    const url = `${TARGET_API_URL}?${params.toString()}`;
    // console.log(`[API] 调用 SmartPlay: ${params.toString()}`);
    
    return await fetch(url, {
        method: "GET",
        headers: {
            // 模拟浏览器指纹，避免被拦截
            "sec-ch-ua-platform": '"macOS"',
            "Referer": "https://www.smartplay.lcsd.gov.hk/facilities/search-result",
            "Accept-Language": "zh-hk",
            "sec-ch-ua": '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
            "sec-ch-ua-mobile": "?0",
            "Cookie": cookieString,
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "channel": "INTERNET",
            "Content-Type": "application/json; charset=utf-8"
        }
    });
}

/**
 * 带自动重试(Cookie失效时)的 API 调用封装
 */
async function queryWithRetry(env, params) {
    // 1. 获取当前 Cookie
    let cookieString = await getValidCookieString(env);
    
    // 2. 发起请求
    let response = await querySmartPlayAPI(cookieString, params);
    
    // 3. 如果 Cookie 失效 (401/403)，刷新 Cookie 并重试一次
    if (isCookieInvalid(response)) {
        console.warn("[API] Cookie 失效，正在刷新并重试...");
        
        try {
            const newCookies = await fetchNewCookies();
            await saveCookiesToStorage(env, newCookies);
            cookieString = formatCookieString(newCookies);
            
            // 使用新 Cookie 重试
            response = await querySmartPlayAPI(cookieString, params);
        } catch (e) {
            console.error("[API] 刷新 Cookie 失败，无法重试:", e);
            // 此时继续返回原始错误响应
        }
    }
    
    return response;
}

/**
 * 验证请求参数
 */
function validateParams(url) {
    const faCode = url.searchParams.get("faCode");
    const playDate = url.searchParams.get("playDate");
    
    if (!faCode || faCode.trim() === "") {
        return { valid: false, error: "缺少 faCode 参数 (必须为非空字符串)" };
    }
    
    if (!playDate) {
        return { valid: false, error: "缺少 playDate 参数" };
    }
    
    // 简单日期格式检查 YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(playDate)) {
        return { valid: false, error: "playDate 格式需为 YYYY-MM-DD" };
    }
    
    const date = new Date(playDate);
    if (isNaN(date.getTime())) {
        return { valid: false, error: "playDate 不是有效的日期" };
    }
    
    return { valid: true, faCode: faCode.trim(), playDate };
}

// ==================== 请求处理 ====================

/**
 * 处理单个/自定义区域查询 (保留原有接口逻辑)
 * 接受 distCode 参数
 */
async function handleCustomSearch(request, env, ctx, params) {
    const cacheKey = new Request(request.url, request);
    const cache = caches.default;
    
    // 1. 检查 Cloudflare 缓存
    try {
        const cachedRes = await cache.match(cacheKey);
        if (cachedRes) {
            console.log("[Cache] 命中缓存");
            const res = new Response(cachedRes.body, cachedRes);
            res.headers.set("X-Cache-Status", "HIT");
            res.headers.set("Access-Control-Allow-Origin", "*");
            return res;
        }
    } catch (e) {
        console.error("[Cache] 读取失败:", e);
    }

    // 2. 执行查询
    const response = await queryWithRetry(env, params);
    
    // 3. 处理错误
    if (!response.ok) {
        return new Response(JSON.stringify({
            error: "SmartPlay API 请求失败",
            status: response.status,
            message: await response.text()
        }), { 
            status: response.status, 
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } 
        });
    }

    // 4. 读取并构建响应
    const data = await response.json();
    const finalRes = new Response(JSON.stringify(data), {
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=180", // 缓存 180 秒
            "X-Cache-Status": "MISS"
        }
    });

    // 5. 写入缓存 (异步)
    ctx.waitUntil(cache.put(cacheKey, finalRes.clone()));
    
    return finalRes;
}

/**
 * 处理全港批量查询 (新接口逻辑)
 * 场景：用户未提供 distCode，自动查询所有 4 个大区并合并结果
 * 行为：并行发起 4 个请求，合并返回
 */
async function handleBatchSearch(env, faCode, playDate) {
    console.log(`[Batch] 开始全港查询: ${playDate} ${faCode}`);
    
    // 准备 4 个并行请求任务
    const tasks = Object.values(DISTRICT_GROUPS).map(async (districts) => {
        const params = new URLSearchParams();
        params.set("distCode", districts.join(",")); // 逗号分隔多个区域代码
        params.set("faCode", faCode);
        params.set("playDate", playDate);
        
        try {
            // 调用带重试的查询逻辑
            const res = await queryWithRetry(env, params);
            if (!res.ok) {
                console.error(`[Batch] 区域查询失败: ${districts[0]}... status=${res.status}`);
                return null;
            }
            return await res.json();
        } catch (e) {
            console.error(`[Batch] 区域请求异常:`, e);
            return null;
        }
    });
    
    // 等待所有请求完成
    const results = await Promise.all(tasks);
    
    // 合并结果结构
    // 目标结构参考 API: { data: { morning: { distList: [] }, afternoon: ..., evening: ... } }
    const mergedData = {
        morning: { distList: [] },
        afternoon: { distList: [] },
        evening: { distList: [] }
    };
    
    let successCount = 0;
    
    for (const result of results) {
        if (!result || !result.data) continue;
        successCount++;
        
        // 遍历时段 (morning, afternoon, evening) 并合并 distList 数组
        ['morning', 'afternoon', 'evening'].forEach(period => {
            if (result.data[period]?.distList) {
                mergedData[period].distList.push(...result.data[period].distList);
            }
        });
    }
    
    console.log(`[Batch] 查询完成，成功合并 ${successCount}/4 个区域的数据`);
    
    // 返回合并后的 JSON (暂不缓存批量结果，或者由客户端控制)
    return new Response(JSON.stringify({ data: mergedData }), {
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*"
        }
    });
}

// ==================== 主入口 ====================

export default {
    async fetch(request, env, ctx) {
        // 1. 处理 CORS 预检请求
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "GET, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type"
                }
            });
        }

        if (request.method !== "GET") {
            return new Response(JSON.stringify({ error: "Method Not Allowed" }), { 
                status: 405,
                headers: { "Content-Type": "application/json" }
            });
        }

        try {
            const url = new URL(request.url);
            
            // 2. 参数验证
            const validation = validateParams(url);
            if (!validation.valid) {
                return new Response(JSON.stringify({ error: validation.error }), {
                    status: 400,
                    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
                });
            }

            // 3. 路由分发
            // 逻辑: 如果 URL 包含 distCode，则查询特定区域 (旧接口)
            //       如果 URL 没有 distCode，则默认为全港批量查询 (新接口)
            
            const distCode = url.searchParams.get("distCode");
            
            if (distCode) {
                // === 旧接口逻辑 ===
                // 验证 distCode 数量限制 (1-5个)
                const codes = distCode.split(",").filter(c => c.trim());
                if (codes.length > 5) {
                    return new Response(JSON.stringify({ error: "distCode 最多支持 5 个区域" }), {
                        status: 400,
                        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
                    });
                }
                
                // 重构 params 以确保格式正确
                const params = new URLSearchParams();
                params.set("distCode", codes.join(","));
                params.set("faCode", validation.faCode);
                params.set("playDate", validation.playDate);
                
                return await handleCustomSearch(request, env, ctx, params);
            } else {
                // === 新接口逻辑 (批量) ===
                return await handleBatchSearch(env, validation.faCode, validation.playDate);
            }
            
        } catch (error) {
            console.error("[Worker] 全局未捕获异常:", error);
            return new Response(JSON.stringify({ 
                error: "Internal Server Error", 
                message: error instanceof Error ? error.message : "Unknown error" 
            }), {
                status: 500,
                headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
            });
        }
    }
};
