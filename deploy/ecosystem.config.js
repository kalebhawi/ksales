// PM2 — processo da aplicação ksales na VPS.
// Uso: pm2 start deploy/ecosystem.config.js  (a partir de /var/www/ksales)
module.exports = {
  apps: [
    {
      name: "ksales",
      cwd: "/var/www/ksales",

      // Chamar o binário do Next direto evita um processo `npm` intermediário,
      // que o PM2 não consegue reiniciar de forma limpa.
      script: "node_modules/next/dist/bin/next",
      args: "start -H 127.0.0.1 -p 3000",
      interpreter: "node",

      // Instância única e proposital:
      // - o limitador de tentativas de login (src/lib/rate-limit.ts) guarda
      //   estado em memória e não é compartilhado entre workers;
      // - a VPS tem um único site, então não há ganho real em cluster.
      // Para escalar, troque o limitador por Redis ANTES de subir instances.
      instances: 1,
      exec_mode: "fork",

      // O `next start` carrega o .env de /var/www/ksales sozinho.
      // Mantenha DATABASE_URL fora daqui: este arquivo vai para o Git.
      env: {
        NODE_ENV: "production",
        PORT: "3000",
        HOSTNAME: "127.0.0.1",
      },

      autorestart: true,
      max_memory_restart: "512M",
      min_uptime: "20s",
      max_restarts: 10,

      merge_logs: true,
      time: true,
      error_file: "/var/log/ksales/error.log",
      out_file: "/var/log/ksales/out.log",
    },
  ],
};
