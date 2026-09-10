const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const ROOT = __dirname;
const STATE_FILE = path.join(ROOT, 'data', 'state.json');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';
const STAGES = ['Understand', 'Plan', 'Implement', 'Verify', 'Ship'];
const WORKSPACE_ROOT = path.resolve(process.env.DEVPILOT_WORKSPACE_ROOT || ROOT);
const CODEX_BIN = process.env.CODEX_BIN || '/Applications/Codex.app/Contents/Resources/codex';
const agentProcesses = new Map();
const PROVIDERS = new Set(['github', 'gitlab', 'slack', 'jira', 'vercel', 'aws']);
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.json':'application/json; charset=utf-8'};

fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { missions: [], workspace: null, policies: {}, integrations: {}, audit: [] }; }
}

function writeState(state) {
  const temp = `${STATE_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(state, null, 2));
  fs.renameSync(temp, STATE_FILE);
}

function json(res, status, payload) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => { raw += chunk; if (raw.length > 32_000) reject(new Error('Payload too large')); });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

function publicMission(mission) { return {...mission, logs:(mission.logs || []).slice(-30)}; }

function mutateState(mutator) { const state = readState(); const result = mutator(state); writeState(state); return result; }

function safeWorkspacePath(relativePath) {
  if (path.isAbsolute(relativePath)) throw new Error('Use a path relative to the approved workspace root.');
  const resolved = path.resolve(WORKSPACE_ROOT, relativePath || '.');
  if (resolved !== WORKSPACE_ROOT && !resolved.startsWith(`${WORKSPACE_ROOT}${path.sep}`)) throw new Error('Workspace path is outside the approved root.');
  const stat = fs.statSync(resolved); if (!stat.isDirectory()) throw new Error('Workspace path must be a directory.'); return resolved;
}

function appendMissionLog(id, text, kind = 'info', stage) {
  if (!text) return;
  mutateState(state => { const mission = state.missions.find(item => item.id === id); if (!mission) return; mission.logs ||= []; mission.logs.push({at:Date.now(), kind, text:String(text).slice(0,1200)}); mission.logs = mission.logs.slice(-200); if (Number.isInteger(stage)) mission.currentStage = Math.max(mission.currentStage || 0, stage); mission.progress = Math.min(92, Math.max(mission.progress || 3, 8 + mission.logs.length * 3)); });
}

function friendlyEvent(line) {
  try {
    const event = JSON.parse(line); const type = String(event.type || 'event'); const item = event.item || {};
    if (type === 'thread.started') return {text:'Agent session initialized', stage:0};
    if (type === 'turn.started') return {text:'Inspecting the workspace and planning the change', stage:1};
    if (type.includes('error')) return {text:event.message || event.error?.message || 'Agent runtime error', kind:'error'};
    if (item.type === 'command_execution') { const command = item.command || item.text || 'Workspace command'; const verify = /test|lint|check|build/i.test(command); return {text:`${verify ? 'Verification' : 'Command'}: ${command}`, stage:verify ? 3 : 2}; }
    if (item.type === 'file_change') return {text:`Changed ${item.path || item.file_path || 'workspace files'}`, stage:2};
    if (item.type === 'agent_message') return {text:item.text || item.message || 'Agent update received', stage:4, summary:item.text || item.message};
    if (type === 'turn.completed') return {text:'Agent finished the requested engineering work', stage:4};
    return null;
  } catch { return line.trim() ? {text:line.trim().slice(0,600), stage:2} : null; }
}

function runMission(id) {
  const state = readState(); const mission = state.missions.find(item => item.id === id); if (!mission) return;
  let workspacePath; try { workspacePath = safeWorkspacePath(mission.workspace.projectPath); } catch (error) { mutateState(s => { const m=s.missions.find(x=>x.id===id); if(m){m.status='failed';m.error=error.message;m.finishedAt=Date.now();} }); return; }
  const contextLabels = (mission.contexts || []).join(', ') || 'repository';
  const prompt = `You are the DevPilot AI software engineering agent. Perform this task completely in the current workspace:\n\n${mission.brief}\n\nMode: ${mission.mode}. Available context: ${contextLabels}.\n\nInspect the existing project first. Make only changes needed for the task, preserve unrelated user work, run appropriate tests or checks, and finish with a concise summary of changes and verification. Stay inside the current workspace. Do not publish, deploy, send messages, or access unrelated data.`;
  const child = spawn(CODEX_BIN, ['exec','--json','--ephemeral','--sandbox','workspace-write','--approve-for-me','--skip-git-repo-check','-C',workspacePath,prompt], {cwd:workspacePath, env:{...process.env}, stdio:['ignore','pipe','pipe']});
  agentProcesses.set(id, child); mutateState(s => { const m=s.missions.find(x=>x.id===id); if(m){m.status='running';m.startedAt=Date.now();m.currentStage=0;m.progress=3;} }); appendMissionLog(id, 'Codex agent process started', 'info', 0);
  let stdoutBuffer = '', stderrBuffer = '', finalSummary = '';
  child.stdout.on('data', chunk => { stdoutBuffer += chunk.toString(); const lines=stdoutBuffer.split('\n'); stdoutBuffer=lines.pop(); for(const line of lines){const event=friendlyEvent(line);if(event){if(event.summary)finalSummary=event.summary;appendMissionLog(id,event.text,event.kind||'info',event.stage);}} });
  child.stderr.on('data', chunk => { stderrBuffer += chunk.toString(); const lines=stderrBuffer.split('\n'); stderrBuffer=lines.pop(); for(const line of lines) if(line.trim()) appendMissionLog(id,line.trim(),'warning'); });
  child.on('error', error => { agentProcesses.delete(id); mutateState(s => { const m=s.missions.find(x=>x.id===id); if(m){m.status='failed';m.error=error.message;m.finishedAt=Date.now();m.logs.push({at:Date.now(),kind:'error',text:error.message});} addAudit(s,'Mission failed','Codex agent','Runtime error',error.message); }); });
  child.on('close', code => { agentProcesses.delete(id); mutateState(s => { const m=s.missions.find(x=>x.id===id); if(!m)return; if(m.status==='cancelled')return; m.status=code===0?'completed':'failed';m.progress=code===0?100:m.progress;m.currentStage=code===0?STAGES.length:m.currentStage;m.finishedAt=Date.now();m.summary=finalSummary || (code===0?'Engineering task completed successfully.':`Codex exited with code ${code}.`);if(stderrBuffer.trim()&&code!==0)m.error=stderrBuffer.trim().slice(-1200);addAudit(s,code===0?'Mission completed':'Mission failed','Codex agent',code===0?'Changes and verification finished':`Exit code ${code}`,m.summary); }); });
}

function addAudit(state, title, actor, result, evidence) {
  state.audit.unshift({id:crypto.randomUUID(), title, actor, result, evidence, createdAt:Date.now()});
  state.audit = state.audit.slice(0, 100);
}

async function api(req, res, url) {
  const state = readState();
  if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, {status:'ok', service:'devpilot-api', now:Date.now()});
  if (req.method === 'GET' && url.pathname === '/api/agent/status') {
    const available = fs.existsSync(CODEX_BIN); let authenticated = false, detail = available ? 'Codex CLI available' : 'Codex CLI not found';
    if (available) { const check = spawnSync(CODEX_BIN, ['login','status'], {encoding:'utf8',timeout:5000}); authenticated = check.status === 0; detail = authenticated ? 'Signed in with Codex' : 'Codex sign-in required'; }
    return json(res, 200, {available, authenticated, detail, activeProcesses:agentProcesses.size, sandbox:'workspace-write'});
  }
  if (req.method === 'GET' && url.pathname === '/api/workspace') return json(res, 200, {workspace:state.workspace || null});
  if (req.method === 'PUT' && url.pathname === '/api/workspace') {
    const body = await readBody(req); const repository = String(body.repository || '').trim(); const branch = String(body.branch || 'main').trim(); const environment = String(body.environment || 'preview'); const projectPath = String(body.projectPath || '.').trim();
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) return json(res, 400, {error:'Repository must use the owner/repository format.'});
    if (!branch || branch.length > 120) return json(res, 400, {error:'Enter a valid branch name.'});
    if (!['preview','staging','production'].includes(environment)) return json(res, 400, {error:'Unsupported environment.'});
    try { safeWorkspacePath(projectPath); } catch (error) { return json(res, 400, {error:error.message}); }
    state.workspace = {repository, branch, environment, projectPath, updatedAt:Date.now()}; addAudit(state, 'Workspace configured', 'Current user', 'Repository ready', `${repository} · ${branch} · ${environment} · ${projectPath}`); writeState(state); return json(res, 200, {workspace:state.workspace});
  }
  if (req.method === 'GET' && url.pathname === '/api/missions') return json(res, 200, {missions:state.missions.map(publicMission)});
  if (req.method === 'POST' && url.pathname === '/api/missions') {
    const body = await readBody(req); const brief = String(body.brief || '').trim(); const mode = String(body.mode || 'Build');
    if (!state.workspace) return json(res, 409, {error:'Configure a repository workspace before starting a mission.'});
    if (agentProcesses.size >= 2) return json(res, 429, {error:'Two agent missions are already running. Wait for one to finish.'});
    if (brief.length < 8 || brief.length > 2000) return json(res, 400, {error:'Mission brief must be between 8 and 2,000 characters.'});
    if (!['Build','Debug','Review'].includes(mode)) return json(res, 400, {error:'Unsupported mission mode.'});
    const allowedContexts = new Set(['repository','design','ci','memory']); const contexts = Array.isArray(body.contexts) ? body.contexts.filter(value => allowedContexts.has(value)) : ['repository','memory'];
    const mission = {id:crypto.randomUUID(), brief, mode, contexts, workspace:{...state.workspace}, status:'queued', currentStage:0, progress:0, logs:[], createdAt:Date.now()}; state.missions.unshift(mission);
    addAudit(state, `${mode} mission created`, 'Current user', 'Agent swarm deployed', brief.slice(0, 160)); writeState(state);
    setImmediate(() => runMission(mission.id));
    return json(res, 201, {mission:publicMission(mission)});
  }
  if (req.method === 'DELETE' && url.pathname.startsWith('/api/missions/')) {
    const id = url.pathname.split('/').pop(); const process = agentProcesses.get(id); if (process) { mutateState(s => { const m=s.missions.find(x=>x.id===id); if(m)m.status='cancelled'; }); process.kill('SIGTERM'); agentProcesses.delete(id); }
    const before = state.missions.length; state.missions = state.missions.filter(m => m.id !== id);
    if (before === state.missions.length) return json(res, 404, {error:'Mission not found.'}); addAudit(state, 'Mission removed', 'Current user', 'Mission stopped or archived', id); writeState(state); return json(res, 200, {ok:true});
  }
  if (req.method === 'GET' && url.pathname === '/api/policies') return json(res, 200, {policies:state.policies});
  if (req.method === 'PUT' && url.pathname === '/api/policies') {
    const body = await readBody(req); if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, {error:'Invalid policy payload.'});
    state.policies = {...state.policies, ...body}; addAudit(state, 'Policy configuration updated', 'Current user', 'Saved', `${Object.keys(body).length} controls updated`); writeState(state); return json(res, 200, {policies:state.policies});
  }
  if (req.method === 'GET' && url.pathname === '/api/integrations') return json(res, 200, {integrations:state.integrations});
  if (url.pathname.startsWith('/api/integrations/')) {
    const provider = url.pathname.split('/').pop(); if (!PROVIDERS.has(provider)) return json(res, 404, {error:'Unknown provider.'});
    if (req.method === 'POST') { const body = await readBody(req); state.integrations[provider] = {account:String(body.account || 'DevPilot Engineering').slice(0,100), connectedAt:Date.now(), status:'healthy'}; addAudit(state, `${provider} connected`, 'Current user', 'OAuth connection active', 'Requested scopes approved'); writeState(state); return json(res, 201, {connection:state.integrations[provider]}); }
    if (req.method === 'DELETE') { delete state.integrations[provider]; addAudit(state, `${provider} disconnected`, 'Current user', 'Access revoked', 'Stored provider grant removed'); writeState(state); return json(res, 200, {ok:true}); }
  }
  if (req.method === 'GET' && url.pathname === '/api/audit') return json(res, 200, {events:state.audit});
  return json(res, 404, {error:'API route not found.'});
}

function staticFile(req, res, url) {
  const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
  const file = path.resolve(ROOT, `.${requested}`);
  if (!file.startsWith(`${ROOT}${path.sep}`)) return json(res, 403, {error:'Forbidden.'});
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) return json(res, 404, {error:'File not found.'});
    res.writeHead(200, {'Content-Type':MIME[path.extname(file)] || 'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    fs.createReadStream(file).pipe(res);
  });
}

mutateState(state => {
  for (const mission of state.missions) {
    if (mission.status === 'running' || mission.status === 'queued') {
      mission.status = 'failed'; mission.error = 'Agent runtime restarted before this mission completed.'; mission.finishedAt = Date.now();
      mission.logs ||= []; mission.logs.push({at:Date.now(),kind:'warning',text:'Mission interrupted by a backend restart.'});
    }
  }
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try { if (url.pathname.startsWith('/api/')) await api(req, res, url); else staticFile(req, res, url); }
  catch (error) { json(res, error.message === 'Payload too large' ? 413 : 400, {error:error.message || 'Request failed.'}); }
});

server.listen(PORT, HOST, () => console.log(`DevPilot AI running at http://${HOST}:${PORT}`));
