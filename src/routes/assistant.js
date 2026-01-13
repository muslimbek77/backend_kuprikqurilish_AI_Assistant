// routes/assistant.js - Complete with FAQ support and rate limiting
import express from "express";
import { 
  detectNavigation, 
  generateChatResponse,
  generateGeneralChat 
} from "../services/aiService.js";
import { rateLimiter, getRateLimitStatus } from "../middleware/rateLimiter.js";

const router = express.Router();

// Apply rate limiter to all assistant routes
router.use(rateLimiter);

/**
 * POST /api/assistant/chat
 * body: { query: string }
 * Returns AI chat response with optional navigation or FAQ answer
 * 
 * Response types:
 * - FAQ: Direct answer from FAQ database
 * - NAVIGATION: Redirect to a page
 * - CHAT: General conversational response
 */
router.post("/chat", async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== "string") {
      return res.status(400).json({
        error: "Query is required"
      });
    }

    // Validate query length
    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) {
      return res.status(400).json({
        error: "Bo'sh xabar yuborib bo'lmaydi"
      });
    }

    if (trimmedQuery.length > 500) {
      return res.status(400).json({
        error: "Xabar juda uzun (maksimal 500 belgi)"
      });
    }

    console.log(`📨 New query from ${req.ip}: "${trimmedQuery}"`);

    // Detect what user wants (FAQ, Navigation, or General chat)
    const detectionResult = await detectNavigation(trimmedQuery);

    // Generate smart response
    const aiResponse = await generateChatResponse(trimmedQuery, detectionResult);

    // Get rate limit status
    const rateLimitStatus = getRateLimitStatus(req);

    // Return FAQ answer (no navigation)
    if (detectionResult && detectionResult.type === "FAQ") {
      return res.json({
        message: aiResponse,
        type: "FAQ",
        faq: {
          id: detectionResult.faq.id,
          question: detectionResult.faq.question,
          category: detectionResult.faq.category,
        },
        rateLimit: {
          remaining: rateLimitStatus.remaining,
          resetAt: rateLimitStatus.resetAt,
        },
      });
    }

    // Return navigation response
    if (
      detectionResult && 
      detectionResult.type === "NAVIGATION" && 
      detectionResult.matched && 
      detectionResult.url !== "NOT_FOUND"
    ) {
      return res.json({
        message: aiResponse,
        type: "NAVIGATION",
        navigation: {
          url: detectionResult.url,
          intent: detectionResult.intent
        },
        rateLimit: {
          remaining: rateLimitStatus.remaining,
          resetAt: rateLimitStatus.resetAt,
        },
      });
    }

    // Just a general chat response
    return res.json({
      message: aiResponse,
      type: "CHAT",
      rateLimit: {
        remaining: rateLimitStatus.remaining,
        resetAt: rateLimitStatus.resetAt,
      },
    });

  } catch (err) {
    console.error("Chat error:", err);
    return res.status(500).json({
      error: "Internal server error",
      message: "Kechirasiz, xatolik yuz berdi. Qaytadan urinib ko'ring."
    });
  }
});

/**
 * POST /api/assistant/navigate
 * body: { query: string }
 * Returns navigation URL if found (ignores FAQ)
 * 
 * This endpoint is specifically for navigation detection only.
 * It will NOT return FAQ answers.
 */
router.post("/navigate", async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== "string") {
      return res.status(400).json({
        error: "Query is required"
      });
    }

    console.log(`🧭 Navigation query from ${req.ip}: "${query}"`);

    const result = await detectNavigation(query);

    // Get rate limit status
    const rateLimitStatus = getRateLimitStatus(req);

    // Ignore FAQ results for this endpoint - only return navigation
    if (!result || result.type !== "NAVIGATION" || result.url === "NOT_FOUND") {
      return res.json({
        type: "NOT_FOUND",
        rateLimit: {
          remaining: rateLimitStatus.remaining,
          resetAt: rateLimitStatus.resetAt,
        },
      });
    }

    return res.json({
      type: "NAVIGATE",
      url: result.url,
      intent: result.intent,
      rateLimit: {
        remaining: rateLimitStatus.remaining,
        resetAt: rateLimitStatus.resetAt,
      },
    });
  } catch (err) {
    console.error("Navigate error:", err);
    return res.status(500).json({
      error: "Internal server error",
      message: "Kechirasiz, xatolik yuz berdi."
    });
  }
});

/**
 * POST /api/assistant/talk
 * body: { query: string }
 * Returns only conversational response (no navigation/FAQ detection)
 * 
 * This endpoint skips all detection and just chats.
 * Use this for pure conversational mode.
 */
router.post("/talk", async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || typeof query !== "string") {
      return res.status(400).json({
        error: "Query is required"
      });
    }

    // Validate query length
    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) {
      return res.status(400).json({
        error: "Bo'sh xabar yuborib bo'lmaydi"
      });
    }

    if (trimmedQuery.length > 500) {
      return res.status(400).json({
        error: "Xabar juda uzun (maksimal 500 belgi)"
      });
    }

    console.log(`💬 Talk query from ${req.ip}: "${trimmedQuery}"`);

    const aiResponse = await generateGeneralChat(trimmedQuery);

    // Get rate limit status
    const rateLimitStatus = getRateLimitStatus(req);

    return res.json({
      message: aiResponse,
      type: "CHAT",
      rateLimit: {
        remaining: rateLimitStatus.remaining,
        resetAt: rateLimitStatus.resetAt,
      },
    });

  } catch (err) {
    console.error("Talk error:", err);
    return res.status(500).json({
      error: "Internal server error",
      message: "Kechirasiz, xatolik yuz berdi."
    });
  }
});

/**
 * GET /api/assistant/health
 * Health check endpoint (not rate limited)
 */
router.get("/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    service: "Kuprik Qurilish AI Assistant"
  });
});

export default router;