// services/geminiService.js - AI Mentor service (Groq)

const API_KEY = import.meta.env.VITE_GROQ_API_KEY || "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";
const MODEL_NAME = import.meta.env.VITE_GROQ_MODEL || "llama-3.1-8b-instant";
const API_URL = "https://api.groq.com/openai/v1/chat/completions";
const REQUEST_TIMEOUT_MS = 15000;

const USE_DEMO_MODE = !API_KEY;

/**
 * AI Mentor dan javob olish
 * @param {Array} history - Chat tarixi
 * @param {String} userMessage - Foydalanuvchi xabari
 * @returns {Promise<String>} AI javobi
 */
export const getAIMentorResponse = async (history, userMessage) => {
  if (USE_DEMO_MODE) {
    return getDemoResponse(userMessage);
  }

  try {
    const messages = [
      { role: "system", content: buildSystemInstruction() },
      ...(history || []).map((msg) => ({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.text
      })),
      { role: "user", content: userMessage }
    ];

    const result = await withTimeout(
      () =>
        fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${API_KEY}`
          },
          body: JSON.stringify({
            model: MODEL_NAME,
            messages,
            temperature: 0.6,
            top_p: 0.9,
            max_tokens: 800
          })
        }),
      REQUEST_TIMEOUT_MS
    );

    if (!result.ok) {
      const text = await result.text();
      throw new Error(text || `HTTP ${result.status}`);
    }

    const data = await result.json();
    const content = data?.choices?.[0]?.message?.content;
    return content || "Kechirasiz, javob olishda muammo yuz berdi.";
  } catch (error) {
    console.error("AI Error:", error);

    const msg = String(error.message || "").toLowerCase();
    if (msg.includes("api key") || msg.includes("unauthorized")) {
      return "Groq API kaliti noto'g'ri yoki mavjud emas. .env faylida VITE_GROQ_API_KEY ni sozlang.";
    }
    if (msg.includes("quota") || msg.includes("rate") || msg.includes("limit")) {
      return "API limitiga yetdingiz. Iltimos, keyinroq urinib ko'ring.";
    }
    if (msg.includes("timeout")) {
      return "AI javobi kechikdi. Iltimos, qayta urinib ko'ring.";
    }

    return `AI bilan bog'lanishda xatolik: ${error?.message || "noma'lum xato"}. Console'da batafsil log bor.`;
  }
};

/**
 * Demo javoblar (API key bo'lmaganda)
 */
const getDemoResponse = (message) => {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("startup") || lowerMessage.includes("boshlash")) {
    return `Startup boshlash uchun qisqa yo'l xaritasi:

1. Muammoni aniqlang: Qaysi muammoni hal qilmoqchisiz?
2. Bozor tadqiqoti: Raqobatchilarni o'rganing
3. MVP yarating: Minimal mahsulotni tez ishlab chiqing
4. Foydalanuvchilar bilan gaplashing: Feedback to'plang
5. Iteratsiya qiling: Doimiy takomillashtiring

Qo'shimcha savollaringiz bo'lsa, bemalol so'rang!`;
  }

  if (lowerMessage.includes("jamoa") || lowerMessage.includes("team")) {
    return `Yaxshi jamoa tuzish uchun:

1. To'ldiruvchi ko'nikmalar: Har kim turli narsada yaxshi bo'lishi kerak
2. Umumiy viziya: Hammaning maqsadi bir bo'lishi muhim
3. Ishonch: Ochiq muloqot va halollik
4. Mas'uliyat: Har kim o'z vazifasiga javobgar bo'lishi
5. Moslashuvchanlik: Tez o'rganish va o'zgarishlarga tayyor bo'lish

GarajHub orqali mutaxassislar topishingiz mumkin!`;
  }

  if (lowerMessage.includes("marketing") || lowerMessage.includes("reklama")) {
    return `Startup marketingi uchun:

1. Target auditoriya: Mijozlaringizni aniq belgilang
2. Content marketing: Blog, video, social media
3. SEO: Google'da topilish uchun optimizatsiya
4. Networking: Tadbirlar va konferentsiyalarda qatnashing
5. Product-led growth: Mahsulot o'zi o'zini sotsin

Boshlang'ich bosqichda organik usullar ko'proq samarali!`;
  }

  if (lowerMessage.includes("texnologiya") || lowerMessage.includes("dasturlash") || lowerMessage.includes("kod")) {
    return `Startup uchun texnologiya tanlash:

Web:
- Frontend: React, Vue yoki Next.js
- Backend: Node.js, Python (Django/Flask)
- Database: PostgreSQL yoki MongoDB

Mobile:
- Cross-platform: React Native, Flutter
- Native: Swift (iOS), Kotlin (Android)

No-code:
- Bubble, Webflow, Adalo

MVP uchun no-code yoki tayyor yechimlar yaxshi tanlov!`;
  }

  if (lowerMessage.includes("pul") || lowerMessage.includes("moliya") || lowerMessage.includes("investitsiya")) {
    return `Startup moliyalashtirish:

Boshlang'ich bosqich:
1. Bootstrapping (o'z pullaringiz)
2. Friends & Family
3. Crowdfunding

O'sish bosqichi:
1. Angel investorlar
2. Venture Capital (VC)
3. Akseleratorlar

Tavsiya: Imkon qadar uzoq vaqt bootstrapping qiling. Bu sizga ko'proq nazorat beradi!`;
  }

  return `Assalomu alaykum! Men sizning startup maslahatchi AI mentoringizman.

Quyidagi mavzularda yordam bera olaman:
- Startup boshlash
- Jamoa tuzish
- Marketing strategiyasi
- Texnologiya tanlash
- Moliyalashtirish

Diqqat: Hozirda demo rejimida ishlayapman. To'liq AI uchun .env faylida VITE_GROQ_API_KEY ni sozlang.

Qanday yordam kerak?`;
};

/**
 * API kalitni tekshirish
 */
export const checkAPIKey = () => {
  return {
    isValid: !USE_DEMO_MODE,
    message: USE_DEMO_MODE
      ? "Demo rejim. API kalit sozlanmagan."
      : "Groq API ulangan"
  };
};

export default getAIMentorResponse;

const buildSystemInstruction = () => {
  return [
    "Siz startup bo'yicha professional maslahatchi - AI Mentorsiz.",
    "Javoblarni o'zbek tilida, qisqa va aniq qilib bering.",
    "Maslahatlar amaliy bo'lsin va imkon bo'lsa bosqichma-bosqich yozing.",
    "Keraksiz uzundan-uzoq tushuntirishlardan qoching.",
    "Agar savol noaniq bo'lsa, 1-2 ta aniqlashtiruvchi savol bering."
  ].join(" ");
};

const withTimeout = async (fn, ms) => {
  let timeoutId;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("timeout")), ms);
  });
  try {
    return await Promise.race([fn(), timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
};
