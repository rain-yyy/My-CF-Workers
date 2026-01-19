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
async function handleRequest(request, env) {
  const url = new URL(request.url);
  const params = new URLSearchParams();
  params.set("distCode", url.searchParams.get("distCode") || "KC,KT,SSP,WTS,YTM");
  params.set("faCode", url.searchParams.get("faCode") || "FOTP");
  params.set("playDate", url.searchParams.get("playDate") || (/* @__PURE__ */ new Date()).toISOString().split("T")[0]);
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
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=60"
      // 缓存 1 分钟
    }
  });
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

