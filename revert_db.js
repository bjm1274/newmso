const fs = require('fs');
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
        // Revert Company Name
        console.log("Reverting companies name back to SY INC.");
        await request('PATCH', '/rest/v1/companies?name=eq.운영본부', { name: 'SY INC.' });

        console.log("Reverting staff_members company to SY INC.");
        await request('PATCH', '/rest/v1/staff_members?company=eq.운영본부', { company: 'SY INC.' });

        console.log("Reverting org_teams company_name to SY INC.");
        await request('PATCH', '/rest/v1/org_teams?company_name=eq.운영본부', { company_name: 'SY INC.' });

        console.log("Reverting board_posts target_audience approx back to SY INC.");
        await request('PATCH', '/rest/v1/board_posts?target_audience=cs.%7B%22운영본부%22%7D', { target_audience: ['SY INC.'] });

        // Update Department '경영지원본부' -> '운영본부'
        console.log("Updating staff_members department 경영지원본부 -> 운영본부");
        await request('PATCH', '/rest/v1/staff_members?department=eq.경영지원본부', { department: '운영본부' });

        console.log("Updating org_teams department_name 경영지원본부 -> 운영본부");
        await request('PATCH', '/rest/v1/org_teams?department_name=eq.경영지원본부', { department_name: '운영본부' });

        console.log("Done DB revert & update.");
    }
    updateDB();
}
