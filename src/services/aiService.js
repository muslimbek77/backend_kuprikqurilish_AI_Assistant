import fs from "fs";
import path from "path";
import OpenAI from "openai";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const siteMapPath = path.join(__dirname, "../data/siteMap.json");
const faqPath = path.join(__dirname, "../data/faq.json");

const siteMap = JSON.parse(fs.readFileSync(siteMapPath, "utf-8"));
const faqData = JSON.parse(fs.readFileSync(faqPath, "utf-8"));

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// =====================================================
// 1️⃣ FAQ MATCHING (highest priority)
// =====================================================
function matchFAQ(query) {
  const q = query.toLowerCase().trim();

  // Remove common stop words
  const stopWords = [
    "uchun",
    "bilan",
    "dan",
    "ga",
    "ni",
    "ning",
    "lar",
    "chi",
    "nima",
    "qanday",
  ];
  const queryWords = q
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.includes(word));

  let bestMatch = null;
  let highestScore = 0;

  for (const faq of faqData.faqs) {
    let score = 0;
    let matchedKeywords = [];

    for (const keyword of faq.keywords) {
      const keywordLower = keyword.toLowerCase();

      // EXACT MATCH (highest priority)
      if (q === keywordLower) {
        score += 100;
        matchedKeywords.push(keyword);
      }
      // EXACT PHRASE MATCH
      else if (q.includes(keywordLower) || keywordLower.includes(q)) {
        score += 50;
        matchedKeywords.push(keyword);
      }
      // MULTI-WORD MATCH
      else {
        const keywordWords = keywordLower.split(/\s+/);
        const allWordsMatch = keywordWords.every((kw) =>
          queryWords.some((qw) => qw.includes(kw) || kw.includes(qw))
        );

        if (allWordsMatch && keywordWords.length > 1) {
          score += 30 * keywordWords.length;
          matchedKeywords.push(keyword);
        }
        // SINGLE WORD MATCH
        else if (
          keywordWords.length === 1 &&
          queryWords.some(
            (qw) => qw.includes(keywordWords[0]) || keywordWords[0].includes(qw)
          )
        ) {
          score += 10;
          matchedKeywords.push(keyword);
        }
      }
    }

    if (score > highestScore && score >= 10) {
      highestScore = score;
      bestMatch = {
        ...faq,
        matched: true,
        score: score,
        matchedKeywords: matchedKeywords,
      };
    }
  }

  if (bestMatch) {
    console.log(
      `💡 FAQ Match Found: ${bestMatch.question} (score: ${highestScore})`
    );
    console.log(`   Matched keywords: ${bestMatch.matchedKeywords.join(", ")}`);
  }

  return bestMatch;
}

// =====================================================
// 2️⃣ NAVIGATION KEYWORD MATCHING
// =====================================================
function keywordMatch(query) {
  const q = query.toLowerCase().trim();

  const stopWords = ["uchun", "bilan", "dan", "ga", "ni", "ning", "lar", "chi"];
  const queryWords = q
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.includes(word));

  let bestMatch = null;
  let highestScore = 0;

  for (const item of siteMap) {
    let score = 0;
    let matchedKeywords = [];

    for (const keyword of item.keywords) {
      const keywordLower = keyword.toLowerCase();

      if (q === keywordLower) {
        score += 100;
        matchedKeywords.push(keyword);
      } else if (q.includes(keywordLower) || keywordLower.includes(q)) {
        score += 50;
        matchedKeywords.push(keyword);
      } else {
        const keywordWords = keywordLower.split(/\s+/);
        const allWordsMatch = keywordWords.every((kw) =>
          queryWords.some((qw) => qw.includes(kw) || kw.includes(qw))
        );

        if (allWordsMatch && keywordWords.length > 1) {
          score += 30 * keywordWords.length;
          matchedKeywords.push(keyword);
        } else if (
          keywordWords.length === 1 &&
          queryWords.some(
            (qw) => qw.includes(keywordWords[0]) || keywordWords[0].includes(qw)
          )
        ) {
          score += 10;
          matchedKeywords.push(keyword);
        }
      }
    }

    if (score > highestScore && score > 0) {
      highestScore = score;
      bestMatch = {
        url: item.url,
        intent: item.intent,
        matched: true,
        score: score,
        matchedKeywords: matchedKeywords,
      };
    }
  }

  if (bestMatch && highestScore >= 10) {
    console.log(
      `🎯 Navigation Match Found: ${bestMatch.intent} (score: ${highestScore})`
    );
    console.log(`   Matched keywords: ${bestMatch.matchedKeywords.join(", ")}`);
    return bestMatch;
  }

  return null;
}

// =====================================================
// 3️⃣ AI FALLBACK FOR NAVIGATION
// =====================================================
async function aiMatch(query) {
  const sectionsText = siteMap
    .map(
      (item, idx) =>
        `${idx + 1}. "${item.intent}" → ${
          item.url
        }\n   Keywords: ${item.keywords.slice(0, 5).join(", ")}`
    )
    .join("\n\n");

  const prompt = `You are a navigation assistant for the Kuprik Qurilish website.

User query: "${query}"

Available sections:
${sectionsText}

TASK:
1. Analyze the user's intent
2. Match it to ONE of the sections above
3. Return ONLY the exact URL from the list (e.g., "/corporativ/monitoring")
4. If no good match exists, return exactly: NOT_FOUND

IMPORTANT:
- Return ONLY the URL path or NOT_FOUND
- No explanations, no extra text
- Match based on meaning, not just keywords
- Be precise with URL paths

Your response:`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      max_tokens: 50,
    });

    const text = response.choices[0].message.content.trim();
    console.log(`🤖 AI Response: "${text}"`);

    if (text === "NOT_FOUND") {
      return { url: "NOT_FOUND", matched: false };
    }

    const foundItem = siteMap.find((item) => item.url === text);

    if (!foundItem) {
      console.log(`⚠️ AI returned invalid URL: ${text}`);
      return { url: "NOT_FOUND", matched: false };
    }

    console.log(`✅ AI Match Found: ${foundItem.intent}`);
    return {
      url: text,
      intent: foundItem.intent,
      matched: true,
    };
  } catch (error) {
    console.error("AI Match Error:", error);
    return { url: "NOT_FOUND", matched: false };
  }
}

// =====================================================
// 🔍 MAIN DETECTION FUNCTION
// =====================================================
export async function detectNavigation(query) {
  console.log(`\n🔍 Processing query: "${query}"`);

  // Step 1: Check FAQ first (highest priority)
  const faqResult = matchFAQ(query);
  if (faqResult) {
    console.log(`✅ FAQ answer found\n`);
    return {
      type: "FAQ",
      matched: true,
      faq: faqResult,
    };
  }

  // Step 2: Try navigation keyword match
  const keywordResult = keywordMatch(query);
  if (keywordResult) {
    console.log(`✅ Navigation detected via keywords\n`);
    return {
      type: "NAVIGATION",
      ...keywordResult,
    };
  }

  console.log(`⏭️ No keyword match, trying AI...`);

  // Step 3: AI fallback for navigation
  const aiResult = await aiMatch(query);
  console.log(`${aiResult.matched ? "✅" : "❌"} AI navigation result\n`);

  if (aiResult.matched) {
    return {
      type: "NAVIGATION",
      ...aiResult,
    };
  }

  return {
    type: "NOT_FOUND",
    matched: false,
  };
}

// =====================================================
// 💬 GENERATE CHAT RESPONSE
// =====================================================
export async function generateChatResponse(query, detectionResult) {
  // Handle FAQ responses
  if (detectionResult && detectionResult.type === "FAQ") {
    return detectionResult.faq.answer;
  }

  // Handle navigation responses
  const isNavigating =
    detectionResult &&
    detectionResult.type === "NAVIGATION" &&
    detectionResult.matched &&
    detectionResult.url !== "NOT_FOUND";

  let systemPrompt = `Siz "Ko'prikqurilish" aksiyadorlik jamiyatining AI yordamchisisiz.
Siz QISQA, ANIQ va DO'STONA javob berasiz.

ASOSIY QOIDALAR:
1. Agar foydalanuvchi sahifaga o'tmoqchi bo'lsa → JUDA QISQA javob (maksimum 1-2 gap)
2. Oddiy suhbat uchun → do'stona va tabiiy javob
3. HAR DOIM o'zbek tilida yozing
4. Ortiqcha tafsilot berMANG

${
  isNavigating
    ? `
HOZIR: Foydalanuvchini "${detectionResult.intent}" bo'limiga yo'naltiryapsiz.

Faqat shuni yozing (variantlardan birini tanla):
- "Marhamat, bu yerga bosing"
- "Bo'lim ochilishi uchun bu yerga bosing"
- "Iltimos, bu yerga o'ting"
- "Tayyor, bu yerni bosing"

MUHIM: Link avtomatik chiqadi, siz faqat 1 gap yozing!
`
    : ""
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
      temperature: 0.3,
      max_tokens: isNavigating ? 30 : 100,
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error("Chat Response Error:", error);
    return isNavigating
      ? "Bu yerga bosing"
      : "Kechirasiz, xatolik yuz berdi. Qaytadan urinib ko'ring.";
  }
}

// =====================================================
// 💬 CONVERSATIONAL CHAT (no navigation/FAQ)
// =====================================================
export async function generateGeneralChat(query) {
  const systemPrompt = `Siz "Ko'prikqurilish" aksiyadorlik jamiyatining yordamchi AI assistentisiz.

VAZIFANGIZ:
1. Do'stona va professional javob bering
2. Qisqa va aniq gaplashing (3-4 gap)
3. Agar kerak bo'lsa, sayt bo'limlari haqida ma'lumot bering
4. O'zbek tilida yozing

Kompaniya: Ko'prikqurilish - qurilish sohasida faoliyat yuritadi.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: query },
      ],
      temperature: 0.7,
      max_tokens: 100,
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error("General Chat Error:", error);
    return "Kechirasiz, xatolik yuz berdi. Qaytadan urinib ko'ring.";
  }
}
