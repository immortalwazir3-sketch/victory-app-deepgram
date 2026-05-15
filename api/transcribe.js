// Use Node runtime instead of Edge runtime
  }

  try {
    const key = process.env.DEEPGRAM_API_KEY;

    if (!key) {
      return res.status(500).json({
        error: {
          message: 'DEEPGRAM_API_KEY missing in Vercel environment variables'
        }
      });
    }

    const { audio, mimeType } = req.body;

    if (!audio) {
      return res.status(400).json({
        error: { message: 'No audio received' }
      });
    }

    // Convert base64 to buffer
    const buffer = Buffer.from(audio, 'base64');

    // Deepgram request timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 45000);

    const dgUrl =
      'https://api.deepgram.com/v1/listen' +
      '?model=nova-2' +
      '&language=en-IN' +
      '&smart_format=true' +
      '&punctuate=true';

    const dgRes = await fetch(dgUrl, {
      method: 'POST',
      headers: {
        Authorization: `Token ${key}`,
        'Content-Type': mimeType || 'audio/webm'
      },
      body: buffer,
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!dgRes.ok) {
      const errText = await dgRes.text();

      return res.status(dgRes.status).json({
        error: {
          message: errText || `Deepgram error ${dgRes.status}`
        }
      });
    }

    const data = await dgRes.json();

    const transcript =
      data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';

    return res.status(200).json({
      text: transcript
    });
  } catch (err) {
    const message =
      err.name === 'AbortError'
        ? 'Deepgram request timeout'
        : err.message;

    return res.status(500).json({
      error: { message }
    });
  }
}
