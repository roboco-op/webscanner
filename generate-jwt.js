#!/usr/bin/env node
/**
 * Generate a valid JWT for local Supabase
 */
import crypto from 'crypto';

const SECRET = 'sb_secret_N7UND0UgjKTVK-Uodkm0Hg_xSvEMPvz'; // Local Supabase secret

function base64UrlEncode(str) {
  return Buffer.from(str).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function generateJWT() {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: 'supabase',
    ref: 'local',
    role: 'authenticated',
    aud: 'authenticated',
    iat: now,
    exp: now + 3600  // 1 hour expiry
  };

  const headerEncoded = base64UrlEncode(JSON.stringify(header));
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac('sha256', SECRET)
    .update(`${headerEncoded}.${payloadEncoded}`)
    .digest()
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');

  return `${headerEncoded}.${payloadEncoded}.${signature}`;
}

const token = generateJWT();
console.log(token);
