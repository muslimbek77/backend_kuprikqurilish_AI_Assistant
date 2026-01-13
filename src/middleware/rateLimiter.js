// rateLimiter.js - Add this to your backend
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple in-memory store (use Redis for production)
const requestStore = new Map();
const RATE_LIMIT_FILE = path.join(__dirname, "../data/rateLimits.json");

// Configuration
const RATE_LIMIT = {
  MAX_REQUESTS: 30,
  WINDOW_HOURS: 12,
  WINDOW_MS: 12 * 60 * 60 * 1000, // 12 hours in milliseconds
};

// Load rate limits from file on startup
function loadRateLimits() {
  try {
    if (fs.existsSync(RATE_LIMIT_FILE)) {
      const data = JSON.parse(fs.readFileSync(RATE_LIMIT_FILE, "utf-8"));
      for (const [key, value] of Object.entries(data)) {
        requestStore.set(key, value);
      }
      console.log("✅ Rate limits loaded from file");
    }
  } catch (error) {
    console.error("Error loading rate limits:", error);
  }
}

// Save rate limits to file
function saveRateLimits() {
  try {
    const data = Object.fromEntries(requestStore);
    fs.writeFileSync(RATE_LIMIT_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("Error saving rate limits:", error);
  }
}

// Clean up old entries periodically (every hour)
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, data] of requestStore.entries()) {
    if (now - data.firstRequest > RATE_LIMIT.WINDOW_MS) {
      requestStore.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} expired rate limit entries`);
    saveRateLimits();
  }
}, 60 * 60 * 1000); // Run every hour

// Initialize
loadRateLimits();

/**
 * Rate limiter middleware
 * Uses IP address + User-Agent for identification
 */
export function rateLimiter(req, res, next) {
  // Get identifier (IP + User-Agent hash for better uniqueness)
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers["user-agent"] || "unknown";
  const identifier = `${ip}_${hashString(userAgent)}`;

  const now = Date.now();

  // Get or create request record
  let record = requestStore.get(identifier);

  if (!record) {
    // First request
    record = {
      count: 1,
      firstRequest: now,
      lastRequest: now,
    };
    requestStore.set(identifier, record);
    saveRateLimits();
    return next();
  }

  // Check if window has expired
  if (now - record.firstRequest > RATE_LIMIT.WINDOW_MS) {
    // Reset the window
    record = {
      count: 1,
      firstRequest: now,
      lastRequest: now,
    };
    requestStore.set(identifier, record);
    saveRateLimits();
    return next();
  }

  // Within the window - check limit
  if (record.count >= RATE_LIMIT.MAX_REQUESTS) {
    const resetTime = new Date(record.firstRequest + RATE_LIMIT.WINDOW_MS);
    const hoursLeft = Math.ceil((resetTime - now) / (1000 * 60 * 60));

    console.log(`🚫 Rate limit exceeded for ${ip}`);

    return res.status(429).json({
      error: "RATE_LIMIT_EXCEEDED",
      message: `Sizning so'rovlaringiz cheklovi tugadi. ${hoursLeft} soatdan keyin qaytadan urinib ko'ring.`,
      resetAt: resetTime.toISOString(),
      remaining: 0,
    });
  }

  // Increment count
  record.count++;
  record.lastRequest = now;
  requestStore.set(identifier, record);

  // Save periodically (every 5 requests to avoid too many writes)
  if (record.count % 5 === 0) {
    saveRateLimits();
  }

  // Add rate limit info to response headers
  res.setHeader("X-RateLimit-Limit", RATE_LIMIT.MAX_REQUESTS);
  res.setHeader(
    "X-RateLimit-Remaining",
    RATE_LIMIT.MAX_REQUESTS - record.count
  );
  res.setHeader(
    "X-RateLimit-Reset",
    new Date(record.firstRequest + RATE_LIMIT.WINDOW_MS).toISOString()
  );

  next();
}

/**
 * Simple hash function for User-Agent
 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Get current rate limit status
 */
export function getRateLimitStatus(req) {
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers["user-agent"] || "unknown";
  const identifier = `${ip}_${hashString(userAgent)}`;

  const record = requestStore.get(identifier);
  const now = Date.now();

  if (!record || now - record.firstRequest > RATE_LIMIT.WINDOW_MS) {
    return {
      remaining: RATE_LIMIT.MAX_REQUESTS,
      resetAt: null,
      isLimited: false,
    };
  }

  return {
    remaining: Math.max(0, RATE_LIMIT.MAX_REQUESTS - record.count),
    resetAt: new Date(record.firstRequest + RATE_LIMIT.WINDOW_MS),
    isLimited: record.count >= RATE_LIMIT.MAX_REQUESTS,
  };
}
