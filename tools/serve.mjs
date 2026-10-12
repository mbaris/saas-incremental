import { createServer } from 'vite';

// Development only. Production is the static dist/ directory.
const server = await createServer({
  server: { port: Number(process.env.PORT || 4173) },
});
await server.listen();
server.printUrls();
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, async () => {
    await server.close();
    process.exit(0);
  });
}
