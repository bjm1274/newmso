
const INLINE_EMOTICON_TOKEN = /\[(emo|stat):([a-z0-9-]+)\]/g;
let content = '[emo:love] hello [stat:worker-1] test';
INLINE_EMOTICON_TOKEN.lastIndex = 0;
let match;
while ((match = INLINE_EMOTICON_TOKEN.exec(content)) !== null) {
  console.log(match[0], match.index, INLINE_EMOTICON_TOKEN.lastIndex);
}

