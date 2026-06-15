fetch('https://erp.pchos.kr/api/d1/query', { 
  method: 'POST', 
  headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + 'my-secret' }, 
  body: JSON.stringify({ sql: "SELECT content FROM messages WHERE sender_name = '공지봇' LIMIT 10", params: [] }) 
}).then(r => r.json()).then(d => console.log(JSON.stringify(d, null, 2))).catch(e => console.log(e.message));
