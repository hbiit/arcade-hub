const https = require('https');

function sendRequest(endpoint, payload) {
  return new Promise((resolve, reject) => {
    const dataString = JSON.stringify(payload);
    const url = new URL(endpoint);

    const options = {
      hostname: url.hostname,
      port: 443,
      path: url.pathname,
      method: 'POST',
      family: 4, // Force IPv4
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(dataString),
        'User-Agent': 'ArcadeHubPublisher/1.0'
      },
      timeout: 15000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.write(dataString);
    req.end();
  });
}

async function main() {
  const payload = {
    repo_url: 'https://github.com/hbiit/arcade-hub',
    name: 'arcade-hub'
  };

  console.log('--- Step 3: Running Pre-flight Check on https://api.start.ng/games/check ---');
  try {
    const checkRes = await sendRequest('https://api.start.ng/games/check', payload);
    console.log('Check Response Code:', checkRes.status);
    console.log('Check Response Data:', JSON.stringify(checkRes.data || checkRes.raw, null, 2));
  } catch (err) {
    console.error('Check Error:', err.message);
  }

  console.log('\n--- Step 4: Publishing on https://api.start.ng/games/publish ---');
  try {
    const publishRes = await sendRequest('https://api.start.ng/games/publish', payload);
    console.log('Publish Response Code:', publishRes.status);
    console.log('Publish Response Data:', JSON.stringify(publishRes.data || publishRes.raw, null, 2));
  } catch (err) {
    console.error('Publish Error:', err.message);
  }
}

main();
