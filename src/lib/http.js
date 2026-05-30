class ApiError extends Error {
  constructor(message, response, bodyText) {
    super(message);
    this.name = "ApiError";
    this.status = response ? response.status : undefined;
    this.statusText = response ? response.statusText : undefined;
    this.bodyText = bodyText;
  }
}

function trimTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}

function normalizeBaseUrl(input, defaultProtocol = "https") {
  const trimmed = String(input || "").trim();
  if (!trimmed) {
    return "";
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `${defaultProtocol}://${trimmed}`;

  return trimTrailingSlash(withProtocol);
}

function appendQuery(url, params = {}) {
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!response.ok) {
    const snippet = text ? `: ${text.slice(0, 500)}` : "";
    throw new ApiError(`HTTP ${response.status} ${response.statusText}${snippet}`, response, text);
  }
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ApiError(`Invalid JSON response: ${error.message}`, response, text);
  }
}

function normalizeArrayResponse(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && Array.isArray(payload.results)) {
    return payload.results;
  }
  if (payload && Array.isArray(payload.items)) {
    return payload.items;
  }
  if (payload && Array.isArray(payload.res)) {
    return payload.res;
  }
  return [];
}

module.exports = {
  ApiError,
  appendQuery,
  normalizeArrayResponse,
  normalizeBaseUrl,
  parseJsonResponse,
  trimTrailingSlash
};
