const fs = require('fs');
const content = fs.readFileSync('src/main.ts', 'utf8');

// 修复整部剧价格逻辑，优先使用CMS配置的bundlePriceCoins
const updatedContent = content.replace(
  /seriesPriceCoins: calculateSeriesPricing\(title\.episodes\.length, title\)/g,
  'seriesPriceCoins: title.bundlePriceCoins || calculateSeriesPricing(title.episodes.length, title)'
);

fs.writeFileSync('src/main.ts', updatedContent);
console.log('✅ 整部剧价格逻辑已修复');
