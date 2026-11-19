import http from 'node:http';
import { randomBytes, randomUUID, createHash, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { APP_NAME } from './app-identity.mjs';

// Independently implemented from the published SIWC protocol. No DevKit code is bundled.
export const ISSUER = 'https://auth.openai.com';
export const RESOURCE = 'https://api.openai.com/v1';
export const PLAN_SCOPE = 'chatgpt.tokens.use.direct';
export const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
export const hasPlanPermission = scopes => Array.isArray(scopes) && scopes.includes(PLAN_SCOPE);
const blank = () => ({ profiles: [], selected: null, host: 'urn:uuid:' + randomUUID() });
const opaque = () => randomBytes(32).toString('base64url');
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
export class ConnectionError extends Error {
  constructor(code, message, requestId) { super(message); this.code = code; this.requestId = requestId; }
}
export function connectionError(code = 'connection_failed', requestId) {
  const messages = {
    subscription_sharing_user_not_eligible: `This account or workspace is not eligible to use its ChatGPT plan in ${APP_NAME}. Your saved cards, document import, search and notes still work.`,
    subscription_sharing_usage_limit_exceeded: 'The app reached a ChatGPT plan usage limit. Review Manage usage before trying again.',
    subscription_sharing_usage_unavailable: 'ChatGPT could not check usage right now. Please try again later.',
    subscription_sharing_user_unavailable: 'ChatGPT could not check the account right now. Please try again later.',
    sharing_not_enabled: 'Sign-in succeeded, but permission to use your ChatGPT plan was not granted. Enable plan usage to use the AI conversation.',
    sign_in_required: 'Continue with ChatGPT to enable the AI conversation.',
    access_denied: 'The connection was not approved. Your saved experience is unchanged.',
    invalid_grant: 'The sign-in code or session is no longer usable. Continue with ChatGPT again.',
    invalid_client: 'ChatGPT could not accept this app registration. Please reconnect or contact the app maintainer.',
    invalid_identity: 'ChatGPT identity could not be verified. The account was not connected.',
    account_mismatch: 'The returning account does not match this saved connection. Use Add account instead.',
    invalid_stream: 'The response ended without confirmed completion. It has not been treated as a completed answer.',
    permission_denied: 'ChatGPT declined this request because of account, workspace, or integration permissions.',
    connection_failed: 'Could not reach ChatGPT. Check the connection and try again.',
    cancelled: 'The request was cancelled.'
  };
  return new ConnectionError(code, messages[code] || messages.connection_failed, requestId);
}

export class Vault {
  constructor(directory, encryption) { this.directory = directory; this.encryption = encryption; this.filename = path.join(directory, 'chatgpt.auth'); this.value = null; }
  async read() {
    if (this.value) return this.value;
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    if (!await this.encryption.available()) throw new Error('Unlock the computer’s secure credential storage before connecting ChatGPT.');
    try {
      const bytes = await readFile(this.filename);
      this.value = JSON.parse(await this.encryption.decrypt(bytes));
      if (!Array.isArray(this.value.profiles) || !/^urn:uuid:/.test(this.value.host)) throw new Error('Invalid credential storage');
    } catch (error) {
      if (error.code !== 'ENOENT') throw new Error('Saved credentials could not be decrypted. They have been preserved.');
      this.value = blank(); await this.save();
    }
    return this.value;
  }
  async save() {
    if (!await this.encryption.available()) throw new Error('Secure credential storage is unavailable.');
    const bytes = await this.encryption.encrypt(JSON.stringify(this.value));
    const temp = this.filename + '.' + randomUUID() + '.next';
    await writeFile(temp, bytes, { mode: 0o600, flag: 'wx' });
    await rename(temp, this.filename);
  }
}

export class ChatGPTConnection {
  constructor({ vault, openExternal, fetcher = fetch, verifyIdentity, onChange = () => {} }) {
    Object.assign(this, { vault, openExternal, fetcher, onChange });
    this.verifyIdentity = verifyIdentity || this.verify.bind(this);
    this.metadata = null; this.keys = null; this.busy = false; this.refreshing = null; this.cancelSignIn = null;
  }
  async discovery() {
    if (this.metadata) return this.metadata;
    const response = await this.fetcher(ISSUER + '/.well-known/openid-configuration', { signal: AbortSignal.timeout(15000), redirect: 'error' });
    const metadata = await response.json();
    if (!response.ok || metadata.issuer !== ISSUER || !metadata.jwks_uri || new URL(metadata.jwks_uri).origin !== ISSUER) throw connectionError('invalid_identity');
    this.metadata = metadata; return metadata;
  }
  async verify(token, clientId, nonce, subject) {
    const metadata = await this.discovery();
    this.keys ||= createRemoteJWKSet(new URL(metadata.jwks_uri));
    try {
      const { payload } = await jwtVerify(token, this.keys, { issuer: ISSUER, audience: clientId, requiredClaims: ['sub', 'exp', 'iss', 'aud'] });
      if (nonce && payload.nonce !== nonce) throw new Error('Nonce mismatch');
      if (subject && payload.sub !== subject) throw connectionError('account_mismatch');
      return { subject: payload.sub, email: typeof payload.email === 'string' ? payload.email : '', name: typeof payload.name === 'string' ? payload.name : '' };
    } catch (error) { if (error.code === 'account_mismatch') throw error; throw connectionError('invalid_identity'); }
  }
  async session() {
    const state = await this.vault.read();
    const active = state.profiles.find(profile => profile.id === state.selected);
    return {
      connected: Boolean(active?.credentials), sharing: Boolean(active?.credentials && hasPlanPermission(active.scopes)),
      profileId: active?.id || null, label: active?.email || active?.name || 'This computer',
      profiles: state.profiles.map(profile => ({ id: profile.id, label: profile.email || profile.name || 'Saved connection', connected: Boolean(profile.credentials), sharing: hasPlanPermission(profile.scopes) }))
    };
  }
  async signIn({ addAccount = false, enablePlan = false } = {}) {
    if (this.busy) throw new Error('Finish the current sign-in first.');
    this.busy = true;
    let server;
    let timer;
    try {
      const saved = await this.vault.read();
      const returning = saved.profiles.filter(profile => !profile.pending);
      const existing = addAccount ? null : saved.profiles.find(profile => profile.id === (saved.selected || saved.lastSelected)) || (returning.length === 1 ? returning[0] : null);
      const pending = existing || (addAccount ? null : saved.profiles.find(profile => profile.pending));
      const profile = pending || { id: randomUUID(), clientId: null, scopes: [], pending: true };
      const state = opaque(), nonce = opaque(), verifier = opaque();
      let deliver, fail;
      const callback = new Promise((resolve, reject) => { deliver = resolve; fail = reject; });
      // Attach rejection handling before the browser opens.
      callback.catch(() => {});
      let used = false;
      server = http.createServer((request, response) => {
        const url = new URL(request.url, 'http://127.0.0.1');
        response.setHeader('Cache-Control', 'no-store'); response.setHeader('Referrer-Policy', 'no-referrer');
        response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
        if (request.method !== 'GET' || url.pathname !== '/auth/callback' || !equal(url.searchParams.get('state'), state) || used) {
          response.writeHead(400); response.end('This callback does not match a pending sign-in.'); return;
        }
        used = true;
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        response.end(`<!doctype html><title>Return to ${APP_NAME}</title><body style="font:18px system-ui;padding:64px;color:#174b62"><h1>Return to ${APP_NAME}</h1><p>Your sign-in response was received. The app will verify the connection.</p></body>`);
        if (url.searchParams.get('error')) fail(connectionError(url.searchParams.get('error')));
        else deliver({ code: url.searchParams.get('code'), clientId: url.searchParams.get('client_id') });
      });
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
      const redirect = `http://127.0.0.1:${server.address().port}/auth/callback`;
      const auth = new URL(ISSUER + '/api/accounts/authorize');
      auth.search = new URLSearchParams({ client_id: profile.clientId || 'dynamic_agent_client', ext_agent_host_id: saved.host,
        response_type: 'code', redirect_uri: redirect, scope: SCOPES, resource: RESOURCE, state, nonce,
        code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') }).toString();
      if (!profile.clientId) auth.searchParams.set('agent_name_hint', APP_NAME);
      else if (profile.credentials?.idToken) auth.searchParams.set('id_token_hint', profile.credentials.idToken);
      if (enablePlan) auth.searchParams.set('prompt', 'consent');
      timer = setTimeout(() => fail(new Error('Sign-in timed out. Continue with ChatGPT to try again.')), 600000);
      this.cancelSignIn = () => fail(connectionError('cancelled'));
      await this.openExternal(auth.href);
      const result = await callback;
      if (!result.code || (profile.clientId && result.clientId && result.clientId !== profile.clientId)) throw connectionError('invalid_identity');
      const issued = profile.clientId || result.clientId;
      if (typeof issued !== 'string' || !issued || issued === 'dynamic_agent_client' || issued.length > 500) throw connectionError('invalid_client');
      profile.clientId = issued;
      if (!saved.profiles.some(item => item.id === profile.id)) saved.profiles.push(profile);
      // Preserve completed registration even if a one-time code expires.
      await this.vault.save();
      const data = await this.token({ grant_type: 'authorization_code', client_id: issued, code: result.code,
        code_verifier: verifier, redirect_uri: redirect, resource: RESOURCE });
      if (!data.id_token) throw connectionError('invalid_identity');
      const identity = await this.verifyIdentity(data.id_token, issued, nonce, profile.subject);
      Object.assign(profile, identity, { scopes: String(data.scope || '').split(/\s+/).filter(Boolean), credentials: this.credentials(data), pending: false });
      saved.selected = profile.id; saved.lastSelected = profile.id; await this.vault.save(); this.onChange(); return this.session();
    } finally {
      clearTimeout(timer); server?.closeAllConnections(); server?.close(); this.cancelSignIn = null; this.busy = false;
    }
  }
  credentials(data, old = {}) {
    if (typeof data.access_token !== 'string' || !data.access_token || !Number.isFinite(Number(data.expires_in))) throw connectionError('invalid_identity');
    return { accessToken: data.access_token, refreshToken: data.refresh_token || old.refreshToken,
      idToken: data.id_token || old.idToken, expires: Date.now() + Number(data.expires_in) * 1000, earliest: data.earliest_refresh_at };
  }
  async token(fields) {
    const response = await this.fetcher(ISSUER + '/api/accounts/oauth/token', { method: 'POST', redirect: 'error',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields), signal: AbortSignal.timeout(20000) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw connectionError(typeof data.error === 'string' ? data.error : 'connection_failed');
    return data;
  }
  async accessToken() {
    const state = await this.vault.read();
    const profile = state.profiles.find(item => item.id === state.selected);
    if (!profile?.credentials) throw connectionError('sign_in_required');
    if (!hasPlanPermission(profile.scopes)) throw connectionError('sharing_not_enabled');
    if (profile.pendingRefresh || profile.credentials.expires <= Date.now() + 60000) {
      this.refreshing ||= (async () => {
        try {
          const earliest = typeof profile.credentials.earliest === 'number' ? profile.credentials.earliest * 1000 : Date.parse(profile.credentials.earliest || '');
          if (!profile.pendingRefresh && earliest > Date.now() && profile.credentials.expires > Date.now()) return;
          const data = profile.pendingRefresh || await this.token({ grant_type: 'refresh_token', client_id: profile.clientId,
            refresh_token: profile.credentials.refreshToken || '', resource: RESOURCE });
          profile.pendingRefresh = data; await this.vault.save();
          if (data.id_token) await this.verifyIdentity(data.id_token, profile.clientId, null, profile.subject);
          profile.credentials = this.credentials(data, profile.credentials);
          if (data.scope !== undefined) profile.scopes = String(data.scope).split(/\s+/);
          delete profile.pendingRefresh; await this.vault.save();
        } catch (error) {
          if (['invalid_grant', 'invalid_refresh_token', 'refresh_token_expired', 'refresh_token_reused'].includes(error.code)) {
            delete profile.credentials; profile.scopes = []; await this.vault.save(); this.onChange();
          }
          throw error;
        }
      })().finally(() => { this.refreshing = null; });
      await this.refreshing;
    }
    if (state.selected !== profile.id || !profile.credentials) throw connectionError('sign_in_required');
    if (!hasPlanPermission(profile.scopes)) throw connectionError('sharing_not_enabled');
    return profile.credentials.accessToken;
  }
  async select(id) {
    if (this.busy || this.refreshing) throw new Error('Finish the connection change first.');
    const saved = await this.vault.read();
    if (!saved.profiles.some(profile => profile.id === id && !profile.pending)) throw new Error('Choose a saved account.');
    saved.selected = id; saved.lastSelected = id; await this.vault.save(); this.onChange(); return this.session();
  }
  async signOut() {
    if (this.busy || this.refreshing) throw new Error('Finish the connection change first.');
    const saved = await this.vault.read();
    const profile = saved.profiles.find(item => item.id === saved.selected);
    let revoked = true;
    if (profile?.credentials?.refreshToken) {
      try {
        const metadata = await this.discovery();
        if (!metadata.revocation_endpoint || new URL(metadata.revocation_endpoint).origin !== ISSUER) throw new Error('No revocation endpoint');
        const response = await this.fetcher(metadata.revocation_endpoint, { method: 'POST', redirect: 'error',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(10000),
          body: new URLSearchParams({ token: profile.credentials.refreshToken, token_type_hint: 'refresh_token', client_id: profile.clientId }) });
        revoked = response.status === 200;
      } catch { revoked = false; }
    }
    if (profile) { delete profile.credentials; delete profile.pendingRefresh; profile.scopes = []; }
    if (profile) saved.lastSelected = profile.id;
    saved.selected = null; await this.vault.save(); this.onChange(); return { revoked };
  }
}
