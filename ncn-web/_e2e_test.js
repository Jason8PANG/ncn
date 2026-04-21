const http = require('http');
const fs = require('fs');
const path = require('path');

const COOKIE_FILE = path.join(__dirname, '_test_cookies.txt');

function request(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const isAbsolute = urlPath.startsWith('http');
    const parsedUrl = new URL(isAbsolute ? urlPath : `http://localhost:3000${urlPath}`);
    
    const headers = { 'Content-Type': 'application/json' };
    
    // Read saved cookies for all requests
    if (fs.existsSync(COOKIE_FILE)) {
      try {
        const saved = JSON.parse(fs.readFileSync(COOKIE_FILE, 'utf8'));
        if (saved.cookie) headers['Cookie'] = saved.cookie;
      } catch(e) {}
    }

    const bodyStr = body ? JSON.stringify(body) : null;
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const opts = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 3000,
      path: parsedUrl.pathname + parsedUrl.search,
      method,
      headers
    };

    const req = http.request(opts, (res) => {
      // Save cookies
      if (res.headers['set-cookie']) {
        fs.writeFileSync(COOKIE_FILE, JSON.stringify({ cookie: res.headers['set-cookie'].map(c => c.split(';')[0]).join('; ') }));
      }
      
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let json;
        try { json = JSON.parse(data); } catch(e) { json = { raw: data, statusCode: res.statusCode }; }
        resolve({ status: res.statusCode, body: json });
      });
    });

    req.on('error', e => reject(e));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

async function test() {
  console.log('===== NCN Create E2E Test =====\n');

  // Step 1: Health check
  console.log('--- Step 1: Health Check ---');
  const health = await request('GET', '/api/health');
  console.log('Status:', health.status, health.body.status === 'ok' ? '✅' : '❌');

  // Step 2: Windows Login
  console.log('\n--- Step 2: Windows Login ---');
  // Clear old cookies first
  if (fs.existsSync(COOKIE_FILE)) fs.unlinkSync(COOKIE_FILE);
  
  const login = await request('POST', '/api/auth/windows-login', {});
  console.log('Status:', login.status);
  console.log('Success:', login.body.success ? '✅' : '❌');
  if (login.body.success) {
    console.log('User:', login.body.user.lanId, login.body.user.displayName);
  } else {
    console.log('Error:', login.body.error);
    console.log('\n❌ LOGIN FAILED - cannot continue');
    return;
  }

  // Step 3: Auth check
  console.log('\n--- Step 3: Session Auth Check ---');
  const me = await request('GET', '/api/auth/me');
  console.log('Authenticated:', me.body.authenticated ? '✅' : '❌');

  // Step 4: Get serial number
  console.log('\n--- Step 4: Generate Serial Number ---');
  const serial = await request('GET', '/api/entry/serialno/new?NCN_Type=A');
  console.log('Status:', serial.status);
  console.log('SerialNo:', serial.body.serialNo || serial.body.error || JSON.stringify(serial.body));

  // Step 5: Create NCN Entry
  console.log('\n--- Step 5: Create NCN Entry ---');
  const entryData = {
    NCN_Type: 'A',
    SerialNo: serial.body.serialNo || undefined,
    SBU: 'TEST',
    SBU_Des: 'Test SBU',
    Finder_Dept: 'PD',
    Finder: login.body.user.displayName,
    Finder_Date: new Date().toISOString().split('T')[0],
    WO: 'WO-TEST-001',
    Part_ID: 'PART-TEST-001',
    Customer: 'Test Customer',
    Defect_Description: 'Automated test record - please delete',
    Defect_Qty: 1,
    Defect_Rate: '0.1',
    ME_Engineer: 'test',
    QualityEngineer: 'test',
    CreateBy: login.body.user.lanId,
    CreateDate: new Date().toISOString()
  };

  console.log('Request body:', JSON.stringify(entryData, null, 2));
  
  let createResult;
  try {
    createResult = await request('POST', '/api/entry', entryData);
  } catch(e) {
    console.log('❌ Request threw error:', e.message);
    return;
  }
  
  console.log('\nHTTP Status:', createResult.status);
  console.log('Response:', JSON.stringify(createResult.body, null, 2));
  
  if (createResult.body.success) {
    console.log('\n✅ CREATE SUCCESS!');
  } else {
    console.log('\n❌ CREATE FAILED!');
    console.log('Error:', createResult.body.error);
    console.log('Validation:', createResult.body.errors || createResult.body.validationErrors);
  }

  // Cleanup
  if (fs.existsSync(COOKIE_FILE)) fs.unlinkSync(COOKIE_FILE);
  console.log('\n===== Test Complete =====');
}

test().catch(err => console.error('Test crashed:', err));
