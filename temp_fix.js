const fs = require('fs');
const content = fs.readFileSync('src/main.ts', 'utf8');

const updatedContent = content.replace(
  /cover: item\.coverUrl \|\| 'https:\/\/via\.placeholder\.com\/300x450'/g,
  `cover: item.coverUrl?.startsWith('http') 
        ? item.coverUrl 
        : \`http://localhost:3001\${item.coverUrl}\` || 'https://via.placeholder.com/300x450'`
);

fs.writeFileSync('src/main.ts', updatedContent);
console.log('✅ API字段映射已修复');

