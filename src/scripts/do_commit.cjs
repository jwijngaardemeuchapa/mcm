const { execSync } = require('child_process');

try {
  execSync('git add .', { stdio: 'inherit' });
  execSync('git commit -m "feat: implementa leads saac integration e bid dashboard UI otimizacao MCM-84"', { stdio: 'inherit' });
  console.log('Committed successfully');
} catch (e) {
  console.error('Error committing', e);
}
