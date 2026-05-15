export const config = {
  runtime: 'nodejs'
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'Method not allowed'
    });
  }

  try {
    const { audio, mimeType } = req.body;

    if (!audio) {
      return res.status(400).json({
        error: 'No audio'
      });
    }

    const dg = await fetch(
      'https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true',
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${process.env.DEEPGRAM_API_KEY}`,
          'Content-Type': mimeType || 'audio/webm'
        },
        body: Buffer.from(audio, 'base64')
      }
    );

    const data = await dg.json();

    return res.status(200).json({
      text:
        data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || ''
    });
  } catch (err) {
    return res.status(500).json({
      error: err.message
    });
  }
}
