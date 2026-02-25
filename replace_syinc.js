const fs = require('fs');
const path = require('path');

function replaceRecursively(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            replaceRecursively(fullPath);
        } else if (/\.(tsx|ts|js|jsx)$/.test(entry.name)) {
            let content = fs.readFileSync(fullPath, 'utf-8');
            if (content.includes('SY INC.')) {
                content = content.replace(/SY INC\./g, '운영본부');
                fs.writeFileSync(fullPath, content, 'utf-8');
                console.log(`Updated ${fullPath}`);
            }
        }
    }
}

replaceRecursively('./app');
replaceRecursively('./lib');
replaceRecursively('./main'); // main folder doesn't exist but let's be thorough if there is one
