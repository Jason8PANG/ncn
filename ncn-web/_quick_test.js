const http = require('http');

// Simple: login, save cookie, create entry - all in one
function request(method, path, body, cookie) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (cookie) headers['Cookie'] = cookie;
    const bodyStr = body ? JSON.stringify(body) : null;
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);
    const req = http.request({ hostname: 'localhost', port: 3000, path, method, headers }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        const cookies = res.headers['set-cookie'] ? res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ') : cookie;
        try { resolve({ status: res.statusCode, body: JSON.parse(d), cookie: cookies }); }
        catch(e) { resolve({ status: res.statusCode, body: { raw: d }, cookie: cookies }); }
      });
    });
    req.on('error', e => reject(e));
    req.setTimeout(15000, () => { req.destroy(new Error('timeout')); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function run() {
  console.log('1. Windows Login...');
  const login = await request('POST', '/api/auth/windows-login', {});
  console.log('   Status:', login.status, login.body.success ? 'OK' : 'FAIL');
  if (!login.body.success) { console.log('   ERROR:', login.body.error); return; }
  console.log('   User:', login.body.user.lanId);
  const cookie = login.cookie;
  console.log('   Cookie:', cookie ? cookie.substring(0, 60) + '...' : 'NONE');

  console.log('\n2. Auth check...');
  const me = await request('GET', '/api/auth/me', null, cookie);
  console.log('   Authenticated:', me.body.authenticated);

  console.log('\n3. Create NCN...');
  const entry = {
    NCN_Type: 'A',
    SBU: 'TEST',
    SBU_Des: 'Test SBU',
    Finder_Dept: 'PD',
    Finder: login.body.user.displayName,
    Finder_Date: '2026-04-17',
    WO: 'WO-TEST-001',
    Part_ID: 'PART-TEST-001',
    Customer: 'Test',
    Defect_Description: 'E2E test - delete me',
    Defect_Qty: 1,
    Defect_Rate: '0.1',
    ME_Engineer: 'test',
    QualityEngineer: 'test',
    CreateBy: login.body.user.lanId,
    CreateDate: new Date().toISOString()
  };
  
  const create = await request('POST', '/api/entry', entry, cookie);
  console.log('   Status:', create.status);
  console.log('   Body:', JSON.stringify(create.body, null, 2));
  
  if (create.body.success) console.log('\n SUCCESS!');
  else console.log('\n FAILED:', create.body.error || create.body.raw);
}

run().catch(e => console.error('Crash:', e));
