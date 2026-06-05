import sqlite3

db_path = r"D:\newmso\.wrangler\state\v3\d1\miniflare-D1DatabaseObject\327c6afe6741eb5c3878ba0df9d13732dafe263ef8bd0e6ac8a93a1b3198995a.sqlite"
conn = sqlite3.connect(db_path)
cur = conn.cursor()
cur.execute("SELECT id, title, poll, poll_votes FROM board_posts WHERE title LIKE '%프로그램%'")
rows = cur.fetchall()
if not rows:
    print("No posts found matching '%프로그램%'")
for r in rows:
    print("ID:", r[0])
    print("Title:", r[1])
    print("Poll:", r[2])
    print("Poll_Votes:", r[3])
conn.close()
