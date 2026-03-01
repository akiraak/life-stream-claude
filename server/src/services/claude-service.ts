import { spawn } from 'child_process';

const CLAUDE_TIMEOUT_MS = 120_000;

export function askClaude(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.CLAUDECODE;

    const child = spawn('claude', ['--print', prompt], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: CLAUDE_TIMEOUT_MS,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error('Claude CLI timed out'));
    }, CLAUDE_TIMEOUT_MS);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Claude CLI error (exit ${code}): ${stderr}`));
        return;
      }
      resolve(stdout.trim());
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new Error(`Claude CLI error: ${err.message}`));
    });
  });
}
