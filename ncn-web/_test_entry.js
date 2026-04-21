// 端到端测试：Windows 登录 → 创建 NCN
const http = require('http');

function makeRequest(path, method, bodyStr, cookies) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost',
      port: 3000,
      path: path,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (cookies && cookies.length > 0) {
      opts.headers['Cookie'] = cookies.join('; ');
    }
    if (bodyStr && method !== 'GET') {
      opts.headers['Content-Length'] = Buffer.byteLength(bodyStr);
    }

    const req = http.request(opts, (res) => {
      // Save cookies for next request
      if (res.headers['set-cookie']) {
        res.headers['set-cookie'].forEach(function(c) {
          cookies.push(c.split(';')[0]);
        });
      }

      let data = '';
      res.on('data', function(chunk) { data += chunk; });
      res.on('end', function() {
        console.log('[HTTP ' + method + ' ' + path + '] Status: ' + res.statusCode);
        console.log('  Response: ' + (data.length > 300 ? data.substring(0, 300) + '...' : data));
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          resolve({ raw: data, statusCode: res.statusCode });
        }
      });
    });

    req.on('error', function(e) {
      console.error('  Request ERROR: ' + e.message);
      reject(e);
    });

    if (bodyStr && method !== 'GET') {
      req.write(bodyStr);
    }
    req.end();
  });
}

async function test() {
  var cookies = [];

  console.log('\n=== Step 1: Windows Login ===');
  var loginResult = await makeRequest('/api/auth/windows-login', 'POST', '{}', cookies);

  if (!loginResult.success) {
    console.log('\n!!! LOGIN FAILED !!!');
    console.log('Full result:', JSON.stringify(loginResult, null, 2));
    return;
  }
  console.log('Login OK! User:', loginResult.user ? loginResult.user.lanId : 'unknown');

  console.log('\n=== Step 2: Check Auth Session ===');
  var authResult = await makeRequest('/api/auth/me', 'GET', null, cookies);
  console.log('Auth:', authResult.authenticated ? 'YES (authenticated)' : 'NO (not authenticated)');

  if (!authResult.authenticated) {
    console.log('\n!!! NOT AUTHENTICATED AFTER LOGIN !!!');
    console.log('Full auth result:', JSON.stringify(authResult, null, 2));
    return;
  }

  console.log('\n=== Step 3: Get New Serial No ===');
  var serialResult = await makeRequest('/api/entry/serialno/new?NCN_Type=A', 'GET', null, cookies);
  if (serialResult.error || !serialResult.serialNo) {
    console.log('SerialNo error:', serialResult.error || JSON.stringify(serialResult));
  } else {
    console.log('SerialNo generated:', serialResult.serialNo);
  }

  console.log('\n=== Step 4: Create NCN Entry ===');
  var entryBody = JSON.stringify({
    NCN_Type: 'A',
    Finder_Dept: 'PD',
    Finder: loginResult.user ? loginResult.user.displayName : 'TestUser',
    Finder_Date: new Date().toISOString(),
    WO: 'WO-TEST-001',
    Part_ID: 'PART-TEST-001',
    Customer: 'Test Customer',
    Defect_Description: 'Automated test defect - please delete this record',
    Defect_Qty: 1,
    Defect_Rate: '0.1',
    ME_Engineer: 'test',
    SBU: 'test',
    SBU_Des: 'test',
    QualityEngineer: 'test'
  });

  var createResult = await makeRequest('/api/entry', 'POST', entryBody, cookies);
  
  console.log('\n=== RESULT ===');
  if (createResult.success) {
    console.log('CREATE SUCCESS!');
    console.log('NCN SerialNo:', createResult.data ? createResult.data.SerialNo : createResult.ncnId);
  } else {
    console.log('!!! CREATE FAILED !!!');
    console.log('Error message:', createResult.error || 'Unknown error');
    console.log('Validation errors:', JSON.stringify(createResult.errors || createResult.validationErrors, null, 2));
    console.log('Full response:', JSON.stringify(createResult, null, 2));
  }
}

test().catch(function(err) {
  console.error('Test crashed:', err);
});
