const { execSync } = require('child_process');
try {
  execSync('git add .', { stdio: 'inherit' });
  execSync('git commit -m "chore: atualiza handoff e docs Lead Protocol"', { stdio: 'inherit' });
  execSync('git push origin main', { stdio: 'inherit' });
  console.log("Git push concluído com sucesso!");
} catch (e) {
  console.error("Erro no git:", e.message);
}
