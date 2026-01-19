var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// src/index.ts
var COOKIE_KEY = "smartplay-cookies";
var COOKIE_SCRAPER_URL = "https://smartplay-cookie-30995984708.europe-west1.run.app/scrape";
var SMARTPLAY_API_URL = "https://www.smartplay.lcsd.gov.hk/rest/facility-catalog/api/v1/publ/facilities";
function formatCookieString(cookies) {
  return cookies.map((cookie) => `${cookie.name}=${cookie.value}`).join("; ");
}
__name(formatCookieString, "formatCookieString");
async function getCachedCookie(env) {
  try {
    const object = await env.COOKIE_BUCKET.get(COOKIE_KEY);
    if (!object) {
      return null;
    }
    const data = await object.json();
    console.log("\u4ECE R2 \u83B7\u53D6\u5230\u7F13\u5B58\u7684 Cookie\uFF0C\u6570\u91CF:", data.cookies.length);
    return data;
  } catch (error) {
    console.error("\u8BFB\u53D6\u7F13\u5B58 Cookie \u5931\u8D25:", error);
    return null;
  }
}
__name(getCachedCookie, "getCachedCookie");
async function saveCookieToR2(env, cookies) {
  try {
    const cookieString = formatCookieString(cookies);
    const cacheData = {
      cookies,
      cookieString,
      timestamp: Date.now()
    };
    await env.COOKIE_BUCKET.put(
      COOKIE_KEY,
      JSON.stringify(cacheData),
      {
        httpMetadata: {
          contentType: "application/json"
        }
      }
    );
    console.log("Cookie \u5DF2\u4FDD\u5B58\u5230 R2\uFF0C\u6570\u91CF:", cookies.length);
  } catch (error) {
    console.error("\u4FDD\u5B58 Cookie \u5230 R2 \u5931\u8D25:", error);
    throw error;
  }
}
__name(saveCookieToR2, "saveCookieToR2");
async function fetchNewCookie() {
  try {
    console.log("\u6B63\u5728\u4ECE Cookie Scraper \u83B7\u53D6\u65B0 Cookie...");
    const response = await fetch(COOKIE_SCRAPER_URL);
    if (!response.ok) {
      throw new Error(`Cookie Scraper \u8FD4\u56DE\u9519\u8BEF: ${response.status}`);
    }
    const data = await response.json();
    if (!data.success || !data.data || !data.data.cookies) {
      throw new Error("Cookie Scraper \u54CD\u5E94\u683C\u5F0F\u9519\u8BEF");
    }
    console.log(`\u6210\u529F\u83B7\u53D6\u65B0 Cookie\uFF0C\u6570\u91CF: ${data.data.cookies.length}`);
    return data.data.cookies;
  } catch (error) {
    console.error("\u83B7\u53D6\u65B0 Cookie \u5931\u8D25:", error);
    throw error;
  }
}
__name(fetchNewCookie, "fetchNewCookie");
async function fetchSmartPlayFacilities(cookieString, params) {
  const url = `${SMARTPLAY_API_URL}?${params.toString()}`;
  console.log("\u8C03\u7528 SmartPlay API:", url);
  const response = await fetch(url, {
    method: "GET",
    headers: {
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
  return response;
}
__name(fetchSmartPlayFacilities, "fetchSmartPlayFacilities");
function isCookieInvalid(response) {
  return response.status === 401 || response.status === 403;
}
__name(isCookieInvalid, "isCookieInvalid");
function validateDistCode(distCodeParam) {
  if (!distCodeParam) {
    return { valid: false, error: "distCode 参数是必需的" };
  }
  // 支持数组格式 ?distCode=CW&distCode=EN 或逗号分隔 ?distCode=CW,EN
  let distCodes;
  if (Array.isArray(distCodeParam)) {
    distCodes = distCodeParam;
  } else {
    distCodes = distCodeParam.split(",").map(code => code.trim()).filter(code => code);
  }
  if (distCodes.length < 1) {
    return { valid: false, error: "distCode 至少需要1个地区代码" };
  }
  if (distCodes.length > 5) {
    return { valid: false, error: "distCode 最多只能有5个地区代码" };
  }
  return { valid: true, value: distCodes.join(",") };
}
__name(validateDistCode, "validateDistCode");
function validatePlayDate(dateParam) {
  if (!dateParam) {
    return { valid: false, error: "playDate 参数是必需的" };
  }
  // 验证日期格式 YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(dateParam)) {
    return { valid: false, error: "playDate 格式必须是 YYYY-MM-DD" };
  }
  const date = new Date(dateParam);
  if (isNaN(date.getTime())) {
    return { valid: false, error: "playDate 不是有效的日期" };
  }
  return { valid: true, value: dateParam };
}
__name(validatePlayDate, "validatePlayDate");
async function getCachedResponse(cacheKey) {
  try {
    const cache = caches.default;
    const cachedResponse = await cache.match(cacheKey);
    if (cachedResponse) {
      console.log("从缓存中获取到响应，缓存命中");
      return cachedResponse;
    }
    console.log("缓存未命中");
    return null;
  } catch (error) {
    console.error("读取缓存失败:", error);
    return null;
  }
}
__name(getCachedResponse, "getCachedResponse");
async function saveResponseToCache(cacheKey, response) {
  try {
    const cache = caches.default;
    // 克隆响应以便我们可以同时返回它和存储它
    const responseToCache = response.clone();
    // 添加 Cache-Control 头以设置缓存时间为 60 秒
    const headers = new Headers(responseToCache.headers);
    headers.set("Cache-Control", "public, max-age=60");
    const cachedResponse = new Response(responseToCache.body, {
      status: responseToCache.status,
      statusText: responseToCache.statusText,
      headers
    });
    await cache.put(cacheKey, cachedResponse);
    console.log("响应已保存到缓存，有效期 60 秒");
  } catch (error) {
    console.error("保存缓存失败:", error);
  }
}
__name(saveResponseToCache, "saveResponseToCache");
async function handleRequest(request, env) {
  const url = new URL(request.url);
  
  // 验证 distCode（必需，数组形式，1-5个）
  const distCodeParam = url.searchParams.get("distCode") || url.searchParams.getAll("distCode").join(",");
  const distCodeValidation = validateDistCode(distCodeParam);
  if (!distCodeValidation.valid) {
    return new Response(
      JSON.stringify({ error: distCodeValidation.error }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
  
  // 验证 faCode（必需，字符串）
  const faCode = url.searchParams.get("faCode");
  if (!faCode || typeof faCode !== "string" || faCode.trim() === "") {
    return new Response(
      JSON.stringify({ error: "faCode 参数是必需的，必须是非空字符串" }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
  
  // 验证 playDate（必需，日期格式）
  const playDateParam = url.searchParams.get("playDate");
  const playDateValidation = validatePlayDate(playDateParam);
  if (!playDateValidation.valid) {
    return new Response(
      JSON.stringify({ error: playDateValidation.error }),
      {
        status: 400,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
  
  // 构建查询参数
  const params = new URLSearchParams();
  params.set("distCode", distCodeValidation.value);
  params.set("faCode", faCode.trim());
  params.set("playDate", playDateValidation.value);
  
  // 生成缓存键（基于请求参数）
  const cacheKey = new Request(
    `https://cache.internal/smartplay?${params.toString()}`,
    { method: "GET" }
  );
  
  // 检查缓存
  const cachedResponse = await getCachedResponse(cacheKey);
  if (cachedResponse) {
    // 返回缓存的响应，添加 CORS 头
    const response = new Response(cachedResponse.body, {
      status: cachedResponse.status,
      statusText: cachedResponse.statusText,
      headers: {
        ...Object.fromEntries(cachedResponse.headers),
        "Access-Control-Allow-Origin": "*",
        "X-Cache-Status": "HIT"
      }
    });
    return response;
  }
  
  // 缓存未命中，执行实际请求
  let cookieCache = await getCachedCookie(env);
  let response;
  if (cookieCache) {
    console.log("\u4F7F\u7528\u7F13\u5B58\u7684 Cookie \u53D1\u8D77\u8BF7\u6C42");
    response = await fetchSmartPlayFacilities(cookieCache.cookieString, params);
    if (isCookieInvalid(response)) {
      console.log("\u7F13\u5B58\u7684 Cookie \u5DF2\u5931\u6548\uFF0C\u83B7\u53D6\u65B0 Cookie");
      const newCookies = await fetchNewCookie();
      await saveCookieToR2(env, newCookies);
      const newCookieString = formatCookieString(newCookies);
      response = await fetchSmartPlayFacilities(newCookieString, params);
    }
  } else {
    console.log("\u6CA1\u6709\u7F13\u5B58\u7684 Cookie\uFF0C\u83B7\u53D6\u65B0 Cookie");
    const newCookies = await fetchNewCookie();
    await saveCookieToR2(env, newCookies);
    const newCookieString = formatCookieString(newCookies);
    response = await fetchSmartPlayFacilities(newCookieString, params);
  }
  if (!response.ok) {
    return new Response(
      JSON.stringify({
        error: "SmartPlay API \u8BF7\u6C42\u5931\u8D25",
        status: response.status,
        message: await response.text()
      }),
      {
        status: response.status,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Access-Control-Allow-Origin": "*"
        }
      }
    );
  }
  const data = await response.json();
  const finalResponse = new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=60",
      "X-Cache-Status": "MISS"
      // 缓存 1 分钟
    }
  });
  
  // 保存到缓存
  await saveResponseToCache(cacheKey, finalResponse.clone());
  
  return finalResponse;
}
__name(handleRequest, "handleRequest");
var src_default = {
  async fetch(request, env) {
    try {
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
        return new Response(JSON.stringify({ error: "\u53EA\u652F\u6301 GET \u8BF7\u6C42" }), {
          status: 405,
          headers: {
            "Content-Type": "application/json; charset=utf-8"
          }
        });
      }
      return await handleRequest(request, env);
    } catch (error) {
      console.error("Worker \u9519\u8BEF:", error);
      return new Response(
        JSON.stringify({
          error: "\u5185\u90E8\u670D\u52A1\u5668\u9519\u8BEF",
          message: error instanceof Error ? error.message : "\u672A\u77E5\u9519\u8BEF"
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*"
          }
        }
      );
    }
  }
};
export {
  src_default as default
};

