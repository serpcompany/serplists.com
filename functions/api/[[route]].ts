import { Env } from './types';
import { 
  handleRegister, 
  handleLogin, 
  handleProfile, 
  handleProfileByUsername, 
  handleProfileById
} from './handlers/auth';
import { handleTemplates } from './handlers/templates';
import { handleChecklists } from './handlers/checklists';
import { handleUploads } from './handlers/uploads';

export const onRequestGet = handleRequest;
export const onRequestPost = handleRequest;
export const onRequestPut = handleRequest;
export const onRequestDelete = handleRequest;
export const onRequestOptions = handleCORS;

// Default export for module workers (required for tests)
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return handleCORS();
    }
    return handleRequest({ request, env });
  }
};

async function handleCORS(): Promise<Response> {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    }
  });
}

async function handleRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname.replace('/api/', '');
  
  let response: Response;
  
  try {
    // Handle specific auth routes
    if (path === 'auth/register') {
      response = await handleRegister(request, env);
    } else if (path === 'auth/login') {
      response = await handleLogin(request, env);
    } else if (path === 'auth/profile') {
      response = await handleProfile(request, env);
    } else if (path === 'profiles/by-username') {
      response = await handleProfileByUsername(request, env);
    } else if (path === 'profiles/by-id') {
      response = await handleProfileById(request, env);
    } else if (path.startsWith('templates')) {
      response = await handleTemplates(request, env);
    } else if (path.startsWith('checklists')) {
      response = await handleChecklists(request, env);
    } else if (path.startsWith('uploads')) {
      response = await handleUploads(request, env);
    } else {
      response = new Response('Not Found', { status: 404 });
    }
  } catch (error) {
    console.error('API Error:', error);
    response = new Response(JSON.stringify({ error: 'Internal Server Error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  // Add CORS headers to all responses
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  return response;
}
