import test from'node:test';import assert from'node:assert/strict';import{readFileSync,existsSync}from'node:fs';
test('v0.2.0 no longer bundles mp3',()=>{assert.equal(existsSync('public/packs/audio/audio/love-attack.mp3'),false)});
test('audio catalog points to Dropbox direct download',()=>{const d=JSON.parse(readFileSync('public/audio-catalog.json'));assert.equal(d.schemaVersion,'rechant-audio-catalog-1');assert.ok(d.defaultDownloadUrl.includes('dropbox.com'));assert.ok(d.defaultDownloadUrl.endsWith('dl=1'));assert.equal(d.tracks.length,11)});
test('vite base supports production and beta repositories',()=>{const config=readFileSync('vite.config.ts','utf8');assert.match(config,/RECHANT_BASE_PATH/);assert.match(config,/\/Re-chant\//);});
test('content directory exists for Studio export',()=>assert.ok(existsSync('public/content')));
