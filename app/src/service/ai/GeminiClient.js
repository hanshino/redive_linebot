const { GoogleGenAI } = require("@google/genai");
const { buildGenerateContentRequest, cleanModelReply } = require("./GeminiPrompt");

function createGeminiClient({
  apiKey = process.env.GEMINI_API_KEY,
  genAI = new GoogleGenAI({ apiKey }),
} = {}) {
  return {
    async generateReply(promptContext) {
      const result = await genAI.models.generateContent(buildGenerateContentRequest(promptContext));
      return cleanModelReply(result.text);
    },
  };
}

module.exports = {
  createGeminiClient,
  defaultGeminiClient: createGeminiClient(),
};
