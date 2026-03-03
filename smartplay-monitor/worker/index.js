// SmartPlay Worker - 监控场地并提供API代理
// 包含Cookie管理、缓存处理和请求聚合功能

// TODO 现在有时候会发送两条一样的webhook信息

// ==================== 常量配置 ====================

// 加点东西

// 获取新Cookie的外部服务地址
const COOKIE_SOURCE_URL = "https://smartplay-cookie-30995984708.europe-west1.run.app/scrape";

// SmartPlay 官方API地址
const TARGET_API_URL = "https://www.smartplay.lcsd.gov.hk/rest/facility-catalog/api/v1/publ/facilities";

const SMARTPLAY_COOKIE = "SMARTPLAY_COOKIE"

const SMARTPLAY_FOTC_DATA = "SMARTPLAY_FOTC_DATA"

// 区域分组定义 (对应前端 district-dict.js)
// 用于批量查询接口，将全港分为4个大区并行查询
const DISTRICT_GROUPS = {
    'HK_ISLAND': ['CW', 'EN', 'SN', 'WCH'],      // 香港岛
    'KOWLOON': ['KC', 'KT', 'SSP', 'WTS', 'YTM'], // 九龙
    'NT_EAST': ['N', 'SK', 'ST', 'TP'],          // 新界东
    'NT_WEST': ['IS', 'KWT', 'TW', 'TM', 'YL']   // 新界西
};

// Discord Webhook 地址 (请替换为实际地址)
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1467889458597859405/O3HypxxqxgSBHsxwgB1EH61aOYosM052zjWh69a7QNzTY-CJaR9jOLigG6FhB3XzVP_b";

// ==================== 工具函数 ====================

/**
 * 随机延迟函数
 * @param {number} min - 最小毫秒
 * @param {number} max - 最大毫秒
 */
const delay = (min, max) => {
    const ms = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, ms));
};

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
 * 检查状态码、Content-Type 以及响应体结构
 */
async function isCookieInvalid(response) {
    // 1. 状态码检查
    if (response.status === 401 || response.status === 403) return true;

    // 2. Content-Type 检查 (期望 JSON)
    const contentType = response.headers.get("content-type");
    if (contentType && !contentType.includes("application/json")) {
        console.warn(`[CookieCheck] 响应类型异常: ${contentType} (期望 JSON)`);
        return true;
    }

    // 3. 内容结构检查 (尝试解析 JSON 并检查 data 字段)
    try {
        // 克隆响应以避免消耗流
        const clone = response.clone();
        const json = await clone.json();
        
        // 如果没有 data 字段，视为无效 (可能是 HTML 错误页被解析成了空对象，或者是 API 错误消息)
        if (!json || !json.data) {
            console.warn(`[CookieCheck] 响应缺少 data 字段`);
            return true;
        }
    } catch (e) {
        console.warn(`[CookieCheck] JSON 解析失败: ${e.message}`);
        return true;
    }

    return false;
}

// ==================== Cookie 管理 ====================

/**
 * 从 KV 存储桶获取缓存的 Cookie
 */
async function getCookiesFromStorage(env) {
    try {
        const data = await env.Smartplay_KV.get(SMARTPLAY_COOKIE, { type: "json" });
        if (!data) return null;
        
        console.log(`[Cookie] 从 KV 读取成功，数量: ${data.cookies.length}`);
        return data;
    } catch (error) {
        console.error("[Cookie] 读取 KV 失败:", error);
        return null;
    }
}

/**
 * 保存 Cookie 到 KV 存储桶
 */
async function saveCookiesToStorage(env, cookies) {
    try {
        const data = {
            cookies,
            cookieString: formatCookieString(cookies),
            timestamp: Date.now()
        };
        
        await env.Smartplay_KV.put(
            SMARTPLAY_COOKIE,
            JSON.stringify(data),
            { metadata: { contentType: "application/json" } }
        );
        console.log(`[Cookie] 已保存到 KV，数量: ${cookies.length}`);
    } catch (error) {
        console.error("[Cookie] 保存到 KV 失败:", error);   
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
        console.log(`[Cookie] 缓存初始化完成`);
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
            "sec-ch-ua": '"Google Chrome";v="132", "Chromium";v="132", "Not A(Brand";v="24"',
            "sec-ch-ua-mobile": "?0",
            "Cookie": cookieString,
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
            "Accept": "application/json",
            "channel": "INTERNET",
            "Content-Type": "application/json; charset=utf-8"
        }
    });
}

/**
 * 带自动重试(Cookie失效时)的 API 调用封装
 */
async function queryWithRetry(env, params, currentCookie = null) {
    // 1. 获取当前 Cookie (如果外部没传入，则从存储获取)
    let cookieString = currentCookie || await getValidCookieString(env);
    
    // 2. 发起请求
    let response = await querySmartPlayAPI(cookieString, params);
    
    // 3. 如果 Cookie 失效，刷新 Cookie 并重试一次
    if (await isCookieInvalid(response)) {
        console.warn("[API] Cookie 失效，正在刷新并重试...");
        
        try {
            const newCookies = await fetchNewCookies();
            await saveCookiesToStorage(env, newCookies);
            const newCookieString = formatCookieString(newCookies);
            
            // 使用新 Cookie 重试
            response = await querySmartPlayAPI(newCookieString, params);
            
            // 返回新 Cookie，以便调用者更新缓存
            return { response, newCookieString };
        } catch (e) {
            console.error("[API] 刷新 Cookie 失败，无法重试:", e);
        }
    }
    
    return { response, newCookieString: cookieString };
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
 * 处理全港批量查询 (新接口逻辑)
 * 场景：用户未提供 distCode，自动查询所有 4 个大区并合并结果
 * 行为：并行发起 4 个请求，合并返回
 * 修改：返回纯 JSON 对象，移除 Response 包装
 */
async function handleBatchSearch(env, faCode, playDate, currentCookie) {
    console.log(`[Batch] 开始全港查询: ${playDate} ${faCode}`);
    
    // 准备 4 个并行请求任务
    const tasks = Object.values(DISTRICT_GROUPS).map(async (districts) => {
        // 每个区域请求前加入微小随机延迟，避免瞬间并发过高
        await delay(100, 500);

        const params = new URLSearchParams();
        params.set("distCode", districts.join(",")); // 逗号分隔多个区域代码
        params.set("faCode", faCode);
        params.set("playDate", playDate);
        
        try {
            // 调用带重试的查询逻辑，传入当前的 Cookie 避免重复读取 KV
            const { response: res, newCookieString } = await queryWithRetry(env, params, currentCookie);
            
            // 如果 queryWithRetry 返回了更新后的 Cookie，更新本地状态
            if (newCookieString && newCookieString !== currentCookie) {
                 // 注意：这里可能会有并发更新，但一般来说最新的有效即可
                 currentCookie = newCookieString;
            }

            if (!res.ok) {
                console.error(`[Batch] 区域查询失败: ${districts[0]}... status=${res.status}`);
                return null;
            }
            
            const json = await res.json();
            if (!json || !json.data) {
                console.warn(`[Batch] 区域 ${districts[0]} 返回无数据 (可能参数错误或Cookie失效):`, JSON.stringify(json).substring(0, 300));
            }
            return json;
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
    
    // 如果没有任何成功的数据，返回 null 以便上层决定是否保留旧数据
    if (successCount === 0) {
        return { data: null, currentCookie };
    }
    
    // 返回合并后的对象和可能更新的 Cookie
    return { data: mergedData, currentCookie };
}

// ==================== 通知与比对逻辑 ====================

/**
 * 发送 Discord 通知 (使用 Embeds)
 */
async function sendDiscordNotification(content) {
    // 检查是否配置了有效的 Webhook URL
    if (!DISCORD_WEBHOOK_URL || DISCORD_WEBHOOK_URL.includes("YOUR_WEBHOOK_ID")) {
        console.warn("[Webhook] 未配置有效的 Webhook URL，跳过通知");
        return;
    }
    
    try {
        // 构造 Discord Payload
        // 将 Markdown 内容放入 Embed description
        const payload = {
            username: "SmartPlay Monitor",
            embeds: [
                {
                    title: "🏟️ SmartPlay 场地变动通知",
                    description: content,
                    color: 5763719, // 绿色 (0x57F287)
                    footer: {
                        text: `更新时间: ${new Date().toLocaleTimeString('en-HK', { timeZone: 'Asia/Hong_Kong' })}`
                    }
                }
            ]
        };

        const resp = await fetch(DISCORD_WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        
        if (!resp.ok) {
             console.error(`[Webhook] 发送失败: ${resp.status} ${await resp.text()}`);
        } else {
             console.log(`[Webhook] 发送成功`);
        }
    } catch (e) {
        console.error("[Webhook] 发送异常:", e);
    }
}

/**
 * 生成变更报告
 * @param {Object} oldData - 旧数据
 * @param {Object} newData - 新数据
 */
function generateChangeReport(oldData, newData) {
    const changes = [];
    
    // 辅助遍历函数
    const traverse = (data, callback) => {
        if (!data) return;
        ['morning', 'afternoon', 'evening'].forEach(period => {
            const periodData = data[period];
            if (!periodData || !periodData.distList) return;
            
            periodData.distList.forEach(dist => {
                dist.venueList.forEach(venue => {
                    venue.fatList.forEach(fat => {
                        fat.sessionList.forEach(session => {
                            callback(period, dist, venue, fat, session);
                        });
                    });
                });
            });
        });
    };

    // 构建旧数据索引: venueId-fatId-date-time -> session
    const oldSessions = new Map();
    traverse(oldData, (period, dist, venue, fat, session) => {
        // 使用组合键唯一标识一个场次
        const key = `${venue.venueId}-${fat.fatId}-${session.ssnStartDate}-${session.ssnStartTime}`;
        oldSessions.set(key, session);
    });

    // 遍历新数据并比对
    traverse(newData, (period, dist, venue, fat, session) => {
        const key = `${venue.venueId}-${fat.fatId}-${session.ssnStartDate}-${session.ssnStartTime}`;
        const oldSession = oldSessions.get(key);
        
        if (oldSession) {
            // 检查可用性变化: false -> true (新空场)
            if (!oldSession.available && session.available) {
                changes.push({
                    type: "NEW_SLOT",
                    dist: dist.distName,
                    venue: venue.venueName,
                    fat: fat.fatName,
                    date: session.ssnStartDate,
                    time: `${session.ssnStartTime}-${session.ssnEndTime}`,
                    period: period
                });
            }
             // 检查可用性变化: true -> false (被预订)
            else if (oldSession.available && !session.available) {
                 changes.push({
                    type: "SLOT_TAKEN",
                    dist: dist.distName,
                    venue: venue.venueName,
                    fat: fat.fatName,
                    date: session.ssnStartDate,
                    time: `${session.ssnStartTime}-${session.ssnEndTime}`,
                    period: period
                });
            }
        } else {
             // 新出现的场次 (极少见，可能是系统刚开放或排期更新)
             if (session.available) {
                 changes.push({
                    type: "NEW_SESSION",
                    dist: dist.distName,
                    venue: venue.venueName,
                    fat: fat.fatName,
                    date: session.ssnStartDate,
                    time: `${session.ssnStartTime}-${session.ssnEndTime}`,
                    period: period
                });
             }
        }
    });
    
    return changes;
}

/**
 * 格式化通知消息
 */
function formatReport(changes) {
    if (!changes || changes.length === 0) return null;
    
    const newSlots = changes.filter(c => c.type === "NEW_SLOT" || c.type === "NEW_SESSION");
    const takenSlots = changes.filter(c => c.type === "SLOT_TAKEN");
    
    if (newSlots.length === 0 && takenSlots.length === 0) return null;
    
    // 注意：Discord Embed Description 默认不支持一级标题 (#)，建议使用 **加粗** 或子标题
    // 另外，Embed 已经有了主标题，这里不需要再重复
    let msg = "";
    
    if (newSlots.length > 0) {
        msg += `\n### 🟢 新增空场 (${newSlots.length})\n`;
        newSlots.forEach(c => {
            msg += `- **${c.venue}**\n  ${c.date} ${c.time} (${c.fat})\n`;
        });
    }
    
    if (takenSlots.length > 0) {
        msg += `\n### 🔴 刚刚被订 (${takenSlots.length})\n`;
        takenSlots.forEach(c => {
            msg += `- **${c.venue}**\n  ${c.date} ${c.time} (${c.fat})\n`;
        });
    }
    
    return msg;
}

// ==================== 羽毛球按需查询 ====================

const BADMINTON_CACHE_PREFIX = "BADMINTON_CACHE_";
const BADMINTON_CACHE_TTL = 300; // 5 分钟

/**
 * 羽毛球按需查询 + KV 全局缓存 5 分钟
 *
 * 为何放弃 caches.default + 伪造主机名的方案：
 *  - CF Cache API 是 per-PoP 的，不同 PoP 各自冷启动，无法做到全局一致缓存
 *  - 伪造主机名（非 CF 代理域名）的缓存行为不被保证
 *  - 多请求并发时易产生缓存失效风暴
 *
 * KV 方案优势：
 *  - 全局分发，所有 PoP 共享同一份缓存
 *  - 原生支持 expirationTtl，无需手动管理过期
 *  - ctx.waitUntil 异步写入，不阻塞响应
 */
async function handleBadmintonOnDemand(request, env, ctx, playDate) {
    const kvCacheKey = `${BADMINTON_CACHE_PREFIX}${playDate}`;

    // 1. 查询 KV 缓存（全球一致）
    try {
        const cached = await env.Smartplay_KV.get(kvCacheKey, { type: "json" });
        if (cached) {
            console.log(`[Badminton] KV 缓存命中: ${playDate}`);
            return new Response(JSON.stringify(cached), {
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                    "Cache-Control": `public, max-age=${BADMINTON_CACHE_TTL}`,
                    "X-Cache": "HIT"
                }
            });
        }
    } catch (e) {
        console.warn("[Badminton] KV 缓存读取失败，将直接查询:", e);
    }

    console.log(`[Badminton] 缓存未命中，开始全港查询: ${playDate}`);

    // 2. 获取有效 Cookie
    let cookieString;
    try {
        cookieString = await getValidCookieString(env);
    } catch (e) {
        console.error("[Badminton] 获取 Cookie 失败:", e);
        return new Response(JSON.stringify({ error: "无法获取认证信息，请稍后重试" }), {
            status: 503,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
    }

    // 3. 执行全港批量查询
    const { data } = await handleBatchSearch(env, 'BADC', playDate, cookieString);

    if (!data) {
        return new Response(JSON.stringify({ error: "查询失败，请稍后重试" }), {
            status: 503,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
    }

    // 4. 异步写入 KV（5 分钟后自动过期），使用 waitUntil 不阻塞响应
    ctx.waitUntil(
        env.Smartplay_KV.put(kvCacheKey, JSON.stringify(data), { expirationTtl: BADMINTON_CACHE_TTL })
            .then(() => console.log(`[Badminton] 已写入 KV 缓存: ${kvCacheKey}`))
            .catch(e => console.error("[Badminton] 写入 KV 缓存失败:", e))
    );

    return new Response(JSON.stringify(data), {
        headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": `public, max-age=${BADMINTON_CACHE_TTL}`,
            "X-Cache": "MISS"
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

            // 3. 根据 faCode 路由到不同处理逻辑
            const { faCode, playDate } = validation;

            if (faCode === 'FOTP') {
                // 足球：从 KV 读取定时任务预抓取的数据
                const cachedObject = await env.Smartplay_KV.get(SMARTPLAY_FOTC_DATA, { type: "json" });

                if (cachedObject && cachedObject[playDate]) {
                    return new Response(JSON.stringify(cachedObject[playDate]), {
                        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
                    });
                } else {
                    return new Response(JSON.stringify({ error: "Data not found for this date" }), {
                        status: 404,
                        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
                    });
                }
            } else if (faCode === 'BADC') {
                // 羽毛球：按需实时查询 + Cloudflare Cache API 缓存 5 分钟
                return await handleBadmintonOnDemand(request, env, ctx, playDate);
            } else {
                return new Response(JSON.stringify({ error: `不支持的 faCode: ${faCode}` }), {
                    status: 400,
                    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
                });
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
    },


    // ==================== 定时任务入口 ====================
    async scheduled(event, env, ctx) {
        console.log("[Worker] 定时任务触发:", event.cron);

        // 每日零点 (HKT 00:00 = UTC 16:00) 强制刷新 Cookie
        // 配合 cron 设置 (每5分钟一次)，检测 16:00 - 16:04 期间的触发
        const now = new Date();
        const utcHour = now.getUTCHours();
        const utcMin = now.getUTCMinutes();
        let forcedCookie = null;

        if (utcHour === 16 && utcMin < 5) {
            console.log("[Worker] 🕛 每日零点 (HKT)，执行强制刷新 Cookie...");
            try {
                const newCookies = await fetchNewCookies();
                await saveCookiesToStorage(env, newCookies);
                forcedCookie = formatCookieString(newCookies);
            } catch (e) {
                console.error("[Worker] 强制刷新 Cookie 失败，将尝试使用现有缓存:", e);
            }
        }

        const faCode = "FOTP"; // 足球场
        
        // 1. 计算未来 6 天的日期列表
        const targetDates = [];
        // const now = new Date(); // 上面已经定义了 now
        const hktOffset = 8 * 60 * 60 * 1000;
        
        // 从明天开始监控未来6天 (Day 1 to Day 6)
        for (let i = 1; i <= 6; i++) {
            const d = new Date(now.getTime() + hktOffset);
            d.setDate(d.getDate() + i);
            targetDates.push(d.toISOString().split("T")[0]);
        }

        console.log(`[Worker] 将监控以下日期: ${targetDates.join(", ")}`);

        // 2. 读取旧的汇总数据和 Cookie
        let oldBigData = {};
        let currentCookie = null;
        try {
            // 这里读一次 KV 拿旧数据，读一次 KV 拿 Cookie (或者是第一次请求时拿)
            oldBigData = await env.Smartplay_KV.get(SMARTPLAY_FOTC_DATA, { type: "json" }) || {};
            // 如果刚刚强制刷新过，直接使用；否则尝试从 KV 获取
            currentCookie = forcedCookie || await getValidCookieString(env); 
        } catch (e) {
            console.warn("[Worker] 读取基准数据或 Cookie 失败:", e);
        }

        console.log(`[Worker] 读取到 ${Object.keys(oldBigData).length} 个日期的旧数据`);

        const currentBatchData = {}; 

        // 3. 逐日查询
        for (const playDate of targetDates) {
            // 添加随机延迟，避免请求过密
            const ms = Math.floor(Math.random() * (5000 - 2000 + 1)) + 2000;
            console.log(`[Worker] 等待 ${ms}ms 后查询 ${playDate}...`);
            await new Promise(resolve => setTimeout(resolve, ms));

            // 传入 currentCookie，handleBatchSearch 内部会使用它并返回可能更新后的 Cookie
            const { data: dayData, currentCookie: updatedCookie } = await handleBatchSearch(env, faCode, playDate, currentCookie);
            
            if (updatedCookie) {
                currentCookie = updatedCookie; // 更新本地变量，下一轮循环使用新 Cookie
            }

            if (dayData) {
                currentBatchData[playDate] = dayData;
                
                // 比对变更 (按日期顺序逐日比对并发送通知)
                const oldDayData = oldBigData[playDate];
                if (oldDayData) {
                    const changes = generateChangeReport(oldDayData, dayData);
                    if (changes && changes.length > 0) {
                        console.log(`[Worker] ${playDate} 发现 ${changes.length} 处变动`);
                        const report = formatReport(changes);
                        if (report) {
                            // 发送通知，带上日期标题
                            await sendDiscordNotification(`## 📅 ${playDate} 变动通知\n` + report);
                        }
                    }
                    else{
                        console.log(`[Worker] ${playDate} 无变动`);
                    }
                } else {
                    console.log(`[Worker] ${playDate} 为新增监控日期，已建立基准数据`);
                }
            } else if (oldBigData[playDate]) {
                console.warn(`[Worker] ${playDate} 查询失败，保留旧数据`);
                currentBatchData[playDate] = oldBigData[playDate];
            }
        }

        // 4. 更新存储 (只保留未来 6 天的数据，自动清理过期数据)
        await env.Smartplay_KV.put(
            SMARTPLAY_FOTC_DATA, 
            JSON.stringify(currentBatchData),
            { metadata: { contentType: "application/json" } }
        );
        console.log(`[Worker] 已更新缓存: ${SMARTPLAY_FOTC_DATA}，包含日期: ${Object.keys(currentBatchData).join(", ")}`);
    }
}

