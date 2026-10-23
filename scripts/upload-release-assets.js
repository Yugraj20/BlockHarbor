const fs = require('fs');
const path = require('path');
const https = require('https');

const targetTag = process.argv[2] || 'v4.0.3';
const rootDir = path.resolve(__dirname, '..');
const releaseDir = path.join(rootDir, 'dist', 'release');
const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

if (!token) {
  console.error("❌ GH_TOKEN or GITHUB_TOKEN environment variable is required.");
  process.exit(1);
}

async function request(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch {
          resolve({ status: res.statusCode, headers: res.headers, data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function uploadFile(uploadUrlTemplate, filePath, filename) {
  const uploadUrl = uploadUrlTemplate.replace(/\{.*\}/, `?name=${encodeURIComponent(filename)}`);
  const fileBuffer = fs.readFileSync(filePath);
  const u = new URL(uploadUrl);

  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'BlockHarbor-Uploader',
        'Content-Type': 'application/octet-stream',
        'Content-Length': fileBuffer.length
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`✅ Uploaded ${filename} (${(fileBuffer.length / (1024*1024)).toFixed(2)} MB)`);
          resolve(true);
        } else {
          console.warn(`⚠️ Failed to upload ${filename}: HTTP ${res.statusCode}`, data);
          resolve(false);
        }
      });
    });
    req.on('error', reject);
    req.write(fileBuffer);
    req.end();
  });
}

async function main() {
  console.log(`Checking GitHub Release for tag: ${targetTag}...`);
  const releases = await request('https://api.github.com/repos/Yugraj20/BlockHarbor/releases', {
    headers: {
      'Authorization': `Bearer ${token}`,
      'User-Agent': 'BlockHarbor-Uploader'
    }
  });

  let release = Array.isArray(releases.data) ? releases.data.find(r => r.tag_name === targetTag) : null;
  if (!release) {
    console.log(`Release ${targetTag} not found. Creating it...`);
    const created = await request('https://api.github.com/repos/Yugraj20/BlockHarbor/releases', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'BlockHarbor-Uploader',
        'Content-Type': 'application/json'
      }
    }, JSON.stringify({
      tag_name: targetTag,
      name: targetTag,
      draft: false,
      prerelease: false
    }));
    release = created.data;
  }

  if (!release?.upload_url) {
    console.error('❌ Could not retrieve release upload URL:', release);
    process.exit(1);
  }

  const files = ['BlockHarbor-Setup-x64.exe', 'BlockHarbor-Portable-x64.zip', 'SHA256SUMS.txt'];
  for (const file of files) {
    const fullPath = path.join(releaseDir, file);
    if (!fs.existsSync(fullPath)) continue;

    // Delete existing asset if it exists
    const existing = release.assets?.find(a => a.name === file);
    if (existing) {
      console.log(`Deleting existing release asset ${file}...`);
      await request(`https://api.github.com/repos/Yugraj20/BlockHarbor/releases/assets/${existing.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'User-Agent': 'BlockHarbor-Uploader'
        }
      });
    }

    console.log(`Uploading ${file}...`);
    await uploadFile(release.upload_url, fullPath, file);
  }

  console.log(`\n🎉 Release assets published to: ${release.html_url}`);
}

main().catch(err => {
  console.error('❌ Upload error:', err);
  process.exit(1);
});
