#!/usr/bin/env node
'use strict';
/* 临时：应用块语法自检 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '_vs3-app.js'), 'utf8');
let body = src;
if (body.startsWith('<script>')) body = body.slice('<script>'.length);
const i = body.lastIndexOf('</script>');
if (i >= 0) body = body.slice(0, i);
try { new Function(body); console.log('APP SYNTAX OK  (' + body.length + ' chars)'); }
catch (e) { console.error('APP SYNTAX FAIL:', e.message); process.exit(1); }
