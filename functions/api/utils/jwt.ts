export async function verifyJWT(token: string, secret: string): Promise<string | null> {
  try {
    const [header, body, signature] = token.split('.');
    const payload = JSON.parse(atob(body));
    
    if (payload.exp < Date.now()) return null;
    
    const validSignature = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${header}.${body}.${secret}`)
    );
    
    const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(validSignature)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    if (signature !== expectedSignature) return null;
    
    return payload.userId;
  } catch {
    return null;
  }
}

export async function generateJWT(userId: string, secret: string): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    userId,
    exp: Date.now() + 30 * 24 * 60 * 60 * 1000 // 30 days
  };
  
  const encodedHeader = btoa(JSON.stringify(header))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  const encodedPayload = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  const signature = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}.${secret}`)
  );
  
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
  
  return `${encodedHeader}.${encodedPayload}.${encodedSignature}`;
}