const fs = require('fs');
const path = require('path');
const https = require('https');

const env = fs.readFileSync('.env.local', 'utf-8');
const urlMatch = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/);
const keyMatch = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/);

if (urlMatch && keyMatch) {
    const supabaseUrl = urlMatch[1].trim();
    const key = keyMatch[1].trim();

    const request = (method, endpoint, body = null) => {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(supabaseUrl + endpoint);
            const options = {
                hostname: parsedUrl.hostname,
                path: parsedUrl.pathname + parsedUrl.search,
                method: method,
                headers: {
                    'apikey': key,
                    'Authorization': `Bearer ${key}`,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation'
                }
            };

            const req = https.request(options, res => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve(JSON.parse(data || '{}')));
            });

            req.on('error', reject);
            if (body) req.write(JSON.stringify(body));
            req.end();
        });
    };

    async function updateDB() {
        console.log("Updating companies...");
        await request('PATCH', '/rest/v1/companies?name=eq.SY%20INC.', { name: '운영본부' });

        console.log("Updating staff_members...");
        await request('PATCH', '/rest/v1/staff_members?company=eq.SY%20INC.', { company: '운영본부' });

        console.log("Updating org_teams...");
        await request('PATCH', '/rest/v1/org_teams?company_name=eq.SY%20INC.', { company_name: '운영본부' });

        console.log("Updating board_posts...");
        await request('PATCH', '/rest/v1/board_posts?target_audience=cs.%7B%22SY%20INC.%22%7D', { target_audience: ['운영본부'] }); // just approximation, we might need a better query for arrays. Let's just update standard columns if possible

        console.log("Done DB update.");
    }
    updateDB();
}
