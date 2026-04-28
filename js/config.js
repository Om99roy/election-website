// ElectAI Configuration
// API keys are stored here - do not expose in public repos
const CONFIG = {
  // Groq API (primary — fast LLaMA inference)
  GROQ_API_KEY: 'YOUR_GROQ_API_KEY_HERE',
  GROQ_API_URL: 'https://api.groq.com/openai/v1/chat/completions',
  GROQ_MODEL:   'llama-3.3-70b-versatile',

  // Gemini API (kept as fallback)
  GEMINI_API_KEY: 'YOUR_GEMINI_API_KEY_HERE',
  GEMINI_API_URL: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent',

  // Maps
  MAPS_API_KEY: 'YOUR_GOOGLE_MAPS_API_KEY_HERE',

  APP_NAME: 'ElectAI',
  VERSION:  '2.0.0'
};
