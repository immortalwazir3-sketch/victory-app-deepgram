export const config = {
  api: {
    bodyParser: { sizeLimit: '10mb' },
  },
  maxDuration: 30,
};
 
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
 
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: { message: 'Method not allowed' } }); return; }
 
  const dgKey  = process.env.DEEPGRAM_API_KEY;
  const gqKey  = process.env.GROQ_API_KEY;
 
  if (!dgKey) {
    res.status(500).json({ error: { message: 'DEEPGRAM_API_KEY not configured' } });
    return;
  }
 
  try {
    const { audio, mimeType, lang } = req.body;
    if (!audio) { res.status(400).json({ error: { message: 'No audio received' } }); return; }
 
    // ── STEP 1: DEEPGRAM ─────────────────────────────────────────
    const buffer = Buffer.from(audio, 'base64');
    const dgLang = lang === 'hi' ? 'hi' : 'en-IN';
 
    const dgRes = await fetch(
      `https://api.deepgram.com/v1/listen?model=nova-2&language=${dgLang}&smart_format=true&filler_words=false&punctuate=true`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Token ${dgKey}`,
          'Content-Type': mimeType || 'audio/webm',
        },
        body: buffer,
      }
    );
 
    if (!dgRes.ok) {
      const e = await dgRes.json().catch(() => ({}));
      res.status(dgRes.status).json({ error: { message: e.err_msg || `Deepgram error ${dgRes.status}` } });
      return;
    }
 
    const dgData  = await dgRes.json();
    const rawText = dgData?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
 
    if (!rawText.trim()) { res.status(200).json({ text: '' }); return; }
 
    // ── STEP 2: GROQ LLAMA CORRECTION ────────────────────────────
    if (!gqKey) {
      // No Groq key — return Deepgram text as-is, nothing breaks
      res.status(200).json({ text: rawText });
      return;
    }
 
    const gqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${gqKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        max_tokens: 1024,
        temperature: 0,
        messages: [
          {
            role: 'system',
            content: `You are a transcription corrector for a personal journal app called Victory Journal.
 
The user spoke a personal win or achievement and it was transcribed by speech-to-text. Clean it up.
 
Rules:
- User speaks Indian English, Hindi, or Hinglish (mixed Hindi-English)
- Fix obvious speech-to-text errors based on context
- Preserve Hindi words exactly — do NOT translate them to English
- Keep the meaning and tone completely intact — this is their personal voice
- Fix grammar only if a word is clearly wrong
- Remove filler sounds (uh, um, hmm) if any remain
- Return ONLY the corrected text — no explanation, no quotes, nothing extra
- If already correct, return it unchanged
- Keep it natural and conversational — do not make it formal`,
          },
          {
            role: 'user',
            content: `Correct this transcription:\n\n${rawText}`,
          },
        ],
      }),
    });
 
    if (!gqRes.ok) {
      // Groq failed — return Deepgram text, don't break flow
      res.status(200).json({ text: rawText });
      return;
    }
 
    const gqData       = await gqRes.json();
    const corrected    = gqData?.choices?.[0]?.message?.content?.trim() || rawText;
 
    res.status(200).json({ text: corrected });
 
  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
}
 
