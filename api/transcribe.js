export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
  maxDuration: 30,
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: { message: 'Method not allowed' } }); return; }

  const dgKey = process.env.DEEPGRAM_API_KEY;
  const aiKey = process.env.ANTHROPIC_API_KEY;

  if (!dgKey) { res.status(500).json({ error: { message: 'DEEPGRAM_API_KEY not configured' } }); return; }

  try {
    const { audio, mimeType, lang } = req.body;
    if (!audio) { res.status(400).json({ error: { message: 'No audio received' } }); return; }

    // ── STEP 1: DEEPGRAM ──────────────────────────────────────────
    const buffer = Buffer.from(audio, 'base64');
    const dgLang = lang === 'hi' ? 'hi' : 'en-IN';

    const dgUrl =
      'https://api.deepgram.com/v1/listen' +
      `?model=nova-2` +
      `&language=${dgLang}` +
      `&smart_format=true` +
      `&filler_words=false` +
      `&punctuate=true`;

    const dgRes = await fetch(dgUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${dgKey}`,
        'Content-Type': mimeType || 'audio/webm',
      },
      body: buffer,
    });

    if (!dgRes.ok) {
      const e = await dgRes.json().catch(() => ({}));
      res.status(dgRes.status).json({ error: { message: e.err_msg || `Deepgram error ${dgRes.status}` } });
      return;
    }

    const dgData = await dgRes.json();
    const rawText = dgData?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';

    if (!rawText.trim()) {
      res.status(200).json({ text: '' });
      return;
    }

    // ── STEP 2: CLAUDE CORRECTION (if key available) ──────────────
    if (!aiKey) {
      // No Claude key — return Deepgram text as-is
      res.status(200).json({ text: rawText });
      return;
    }

    const systemPrompt = `You are a transcription corrector for a personal journal app called Victory Journal.

The user has just spoken a personal win or achievement and it was transcribed by a speech-to-text engine. Your job is to clean up the transcription.

Rules:
- The user speaks Indian English, Hindi, or Hinglish (mixed Hindi-English)
- Fix obvious speech-to-text errors based on context
- Preserve Hindi words exactly as spoken — do NOT translate them to English
- Keep the meaning and tone completely intact — this is their personal voice
- Fix grammar only if a word is clearly wrong
- Remove filler sounds (uh, um, hmm) if any remain
- Return ONLY the corrected text — no explanation, no quotes, no extra words
- If the text is already correct, return it unchanged
- Keep it natural and conversational — do not make it formal`;

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': aiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Correct this transcription:\n\n${rawText}`,
          },
        ],
      }),
    });

    if (!claudeRes.ok) {
      // Claude failed — return Deepgram text, don't break the whole flow
      res.status(200).json({ text: rawText });
      return;
    }

    const claudeData = await claudeRes.json();
    const correctedText = claudeData?.content?.[0]?.text?.trim() || rawText;

    res.status(200).json({ text: correctedText });

  } catch (err) {
    res.status(500).json({ error: { message: err.message } });
  }
}
