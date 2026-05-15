export const config = { runtime: 'edge' };

export default async function handler(request) {

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }

  if (request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const key = process.env.DEEPGRAM_API_KEY;
  if (!key) {
    return new Response(
      JSON.stringify({ error: { message: 'DEEPGRAM_API_KEY not set in Vercel environment variables' } }),
      { status: 500, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
    );
  }

  try {
    const { audio, mimeType } = await request.json();

    if (!audio) {
      return new Response(
        JSON.stringify({ error: { message: 'No audio data received' } }),
        { status: 400, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    // Decode base64 back to binary
    const binaryStr = atob(audio);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }

    // Deepgram Nova-2 — en-IN for Indian English accuracy
    // smart_format cleans punctuation, filler_words removes uh/um
    const dgUrl = 'https://api.deepgram.com/v1/listen' +
      '?model=nova-2' +
      '&language=en-IN' +
      '&smart_format=true' +
      '&filler_words=false' +
      '&punctuate=true';

    const dgRes = await fetch(dgUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Token ${key}`,
        'Content-Type': mimeType || 'audio/webm',
      },
      body: bytes
    });

    if (!dgRes.ok) {
      const e = await dgRes.json().catch(() => ({}));
      return new Response(
        JSON.stringify({ error: { message: e.err_msg || `Deepgram error ${dgRes.status}` } }),
        { status: dgRes.status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } }
      );
    }

    const data = await dgRes.json();
    const transcript = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';

    return new Response(JSON.stringify({ text: transcript }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });

  } catch (err) {
    return new Response(
      JSON.stringify({ error: { message: err.message } }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      }
    );
  }
