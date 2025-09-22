const fs = require('fs');
const content = fs.readFileSync('src/main.ts', 'utf8');

// 修复价格转换：priceUsd是以分为单位，应该除以100并保留两位小数
const updatedContent = content.replace(
  /price: pkg\.priceUsd \/ 100, \/\/ 转换为美元/g,
  'price: (pkg.priceUsd / 100).toFixed(2), // 转换为美元并保留两位小数'
);

fs.writeFileSync('src/main.ts', updatedContent);
console.log('✅ 价格转换逻辑已修复');
