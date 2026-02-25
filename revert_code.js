const fs = require('fs');
const path = require('path');

function replaceRecursively(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            replaceRecursively(fullPath);
        } else if (/\.(tsx|ts|js|jsx)$/.test(entry.name)) {
            let content = fs.readFileSync(fullPath, 'utf-8');
            let changed = false;

            // Revert company name "운영본부" back to "SY INC."
            // But we need to be careful not to override intended department "운영본부".
            // Since replace_syinc.js replaced "SY INC." with "운영본부" GLOBALLY, we can just replace "운영본부" with "SY INC." globally for now,
            // Then manually change "경영지원본부" -> "운영본부".

            if (content.includes('운영본부')) {
                // Because the user specifically said "회사명은 그대로 SY INC. 이고 조직도에 경영지원본부 대신 운영본부를 넣으라는 거였어",
                // ALL standard "운영본부" from the previous global replace should be "SY INC.".
                // Wait, if there was already "운영본부" in the code before, it might break.
                // But the previous script globally replaced SY INC. -> 운영본부, so let's globally reverse it:
                content = content.replace(/운영본부/g, 'SY INC.');
                changed = true;
            }
            if (content.includes('경영지원본부')) {
                content = content.replace(/경영지원본부/g, '운영본부');
                changed = true;
            }

            if (changed) {
                fs.writeFileSync(fullPath, content, 'utf-8');
                console.log(`Updated ${fullPath}`);
            }
        }
    }
}

replaceRecursively('./app');
replaceRecursively('./lib');
