import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  spyOn,
  mock,
  type Mock,
} from 'bun:test';
import * as cli from './index.ts';
import cp from 'node:child_process';
import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs';
import process from 'node:process';
import { redLog, yellowLog } from '@/utils/log/log-color';

const options = {
  currentBunVersion: '1.1.1',
  brisaPackageManager: 'bun@1.1.1',
};

declare module './index.ts' {
  export function main({
    currentBunVersion,
    brisaPackageManager,
  }: typeof options): Promise<void>;
}

const OUT_PATH = path.join(import.meta.dir, 'out');
const FIXTURES = path.join(import.meta.dir, '..', '__fixtures__');
const INTEGRATIONS_PATH = path.join(OUT_PATH, 'cli', 'integrations');
const MDX_PATH = path.join(INTEGRATIONS_PATH, 'mdx', 'index.js');
const TAILWINDCSS_PATH = path.join(
  INTEGRATIONS_PATH,
  'tailwindcss',
  'index.js',
);
const PANDACSS_PATH = path.join(INTEGRATIONS_PATH, 'pandacss', 'index.js');
const BUILD_PATH = path.join(OUT_PATH, 'cli', 'build.js');
const SERVE_PATH = path.join(OUT_PATH, 'cli', 'serve', 'index.js');
const SERVE_PATH_PROD = path.join(process.cwd(), 'build', 'server.js');

let originalArgv: string[];
let mockSpawnSync: Mock<typeof cp.spawnSync>;
let mockExit: Mock<typeof process.exit>;
let mockLog: Mock<typeof console.log>;
let mockCwd: Mock<typeof process.cwd>;
let mockExistsSync: Mock<typeof fs.existsSync>;
let mockRandomBytes: Mock<typeof crypto.randomBytes>;

const BRISA_BUILD_FOLDER = undefined;

let prodOptions: any;
let devOptions: any;

describe('Brisa CLI', () => {
  beforeEach(() => {
    mockCwd = spyOn(process, 'cwd').mockImplementation(() => FIXTURES);
    mockLog = spyOn(console, 'log').mockImplementation(() => null as any);
    mockExit = spyOn(process, 'exit').mockImplementation(() => null as never);
    mockExistsSync = spyOn(fs, 'existsSync').mockImplementation(
      (p) => typeof p === 'string' && !p.includes('tauri'),
    );
    mockRandomBytes = spyOn(crypto, 'randomBytes').mockImplementation(
      (bytes) => {
        if (bytes === 32)
          return Buffer.from(
            '5bebff7019fdfa19101753db711317c351eb0a3cc30a1a2665da921d6b8e978c',
            'hex',
          );
        return Buffer.from('cb05305ec1f382be', 'hex');
      },
    );
    mockSpawnSync = spyOn(cp, 'spawnSync').mockImplementation(
      () => ({ status: 0 }) as any,
    );
    originalArgv = process.argv.slice();
    mock.module(path.join(FIXTURES, 'brisa.config.ts'), () => ({
      default: {
        output: 'bun',
      },
    }));

    const __CRYPTO_KEY__ = crypto.randomBytes(32).toString('hex');
    const __CRYPTO_IV__ = crypto.randomBytes(8).toString('hex');

    prodOptions = {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        BRISA_BUILD_FOLDER,
        __CRYPTO_KEY__,
        __CRYPTO_IV__,
      },
    } as any;
    devOptions = {
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_ENV: 'development',
        BRISA_BUILD_FOLDER,
        __CRYPTO_KEY__,
        __CRYPTO_IV__,
      },
    } as any;
  });
  afterEach(() => {
    mockLog.mockRestore();
    mockExit.mockRestore();
    mockSpawnSync.mockRestore();
    mockCwd.mockRestore();
    mockExistsSync.mockRestore();
    mockRandomBytes.mockRestore();
    process.argv = originalArgv.slice();
    process.env.PORT = undefined;
  });

  it('should display the --help options', async () => {
    process.argv = ['bun', 'brisa', '--help'];

    await cli.main(options);

    expect(mockSpawnSync).toHaveBeenCalledTimes(1); // bun --version
    expect(mockLog.mock.calls).toEqual([
      ['Command not found'],
      ['Usage: brisa [options] <command>'],
      ['Options:'],
      [' --help        Show help'],
      ['Commands:'],
      [' dev           Start development server'],
      [' build         Build for production'],
      [' start         Start production server'],
      [' add           Add integrations (e.g., mdx, tailwindcss, pandacss)'],
    ]);
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('should display --help when the command is not found', async () => {
    process.argv = ['bun', 'brisa', 'not-found'];

    await cli.main(options);

    expect(mockSpawnSync).toHaveBeenCalledTimes(1); // bun --version
    expect(mockLog.mock.calls).toEqual([
      ['Command not found'],
      ['Usage: brisa [options] <command>'],
      ['Options:'],
      [' --help        Show help'],
      ['Commands:'],
      [' dev           Start development server'],
      [' build         Build for production'],
      [' start         Start production server'],
      [' add           Add integrations (e.g., mdx, tailwindcss, pandacss)'],
    ]);
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('should execute "brisa dev" command with default options', async () => {
    process.argv = ['bun', 'brisa', 'dev'];

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[0]).toEqual([
      'bun',
      ['--version'],
      { stdio: 'ignore' },
    ]);
    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      [BUILD_PATH, 'DEV'],
      devOptions,
    ]);
    expect(mockSpawnSync.mock.calls[2]).toEqual([
      'bun',
      [SERVE_PATH, '3000', 'DEV'],
      devOptions,
    ]);
  });

  it('should use process.env.PORT as default port on bun dev', async () => {
    process.env.PORT = '3005';
    process.argv = ['bun', 'brisa', 'dev'];

    const newDevOptions = {
      ...devOptions,
      env: { ...devOptions.env, PORT: '3005' },
    };

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[0]).toEqual([
      'bun',
      ['--version'],
      { stdio: 'ignore' },
    ]);
    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      [BUILD_PATH, 'DEV'],
      newDevOptions,
    ]);
    expect(mockSpawnSync.mock.calls[2]).toEqual([
      'bun',
      [SERVE_PATH, '3005', 'DEV'],
      newDevOptions,
    ]);
  });

  it('should execute "brisa dev" command with custom port', async () => {
    process.argv = ['bun', 'brisa', 'dev', '--port', '5000'];

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[0]).toEqual([
      'bun',
      ['--version'],
      { stdio: 'ignore' },
    ]);
    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      [BUILD_PATH, 'DEV'],
      devOptions,
    ]);
    expect(mockSpawnSync.mock.calls[2]).toEqual([
      'bun',
      [SERVE_PATH, '5000', 'DEV'],
      devOptions,
    ]);
  });

  it('should return the help of "brisa dev" command', async () => {
    process.argv = ['bun', 'brisa', 'dev', '--help'];

    await cli.main(options);

    expect(mockSpawnSync).toHaveBeenCalledTimes(1); // bun --version
    expect(mockLog.mock.calls).toEqual([
      ['Usage: brisa dev [options]'],
      ['Options:'],
      [' -p, --port         Specify port'],
      [' -d, --debug        Enable debug mode'],
      [
        " -s, --skip-tauri   Skip open tauri app when 'output': 'desktop' | 'android' | 'ios' in brisa.config.ts",
      ],
      [' --help             Show help'],
    ]);
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('should debug "brisa dev" command', async () => {
    process.argv = ['bun', 'brisa', 'dev', '--debug'];

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[0]).toEqual([
      'bun',
      ['--version'],
      { stdio: 'ignore' },
    ]);
    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      [BUILD_PATH, 'DEV'],
      devOptions,
    ]);
    expect(mockSpawnSync.mock.calls[2]).toEqual([
      'bun',
      ['--inspect', SERVE_PATH, '3000', 'DEV'],
      devOptions,
    ]);
  });

  it('should build a web app in development with the flag --dev', async () => {
    process.argv = ['bun', 'brisa', 'build', '--dev'];

    await cli.main(options);

    expect(mockSpawnSync).toHaveBeenCalledTimes(2); // bun --version
    expect(mockSpawnSync.mock.calls[0]).toEqual([
      'bun',
      ['--version'],
      { stdio: 'ignore' },
    ]);

    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      [BUILD_PATH, 'DEV'],
      devOptions,
    ]);
  });

  it('should build a desktop app with "brisa dev" command and output=desktop', async () => {
    process.argv = ['bun', 'brisa', 'dev'];

    mock.module(path.join(FIXTURES, 'brisa.config.ts'), () => ({
      default: {
        output: 'desktop',
      },
    }));

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[0]).toEqual([
      'bun',
      ['--version'],
      { stdio: 'ignore' },
    ]);
    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      ['i', '@tauri-apps/cli@2.0.0'],
      devOptions,
    ]);
    expect(mockSpawnSync.mock.calls[2]).toEqual([
      'bunx',
      [
        'tauri',
        'init',
        '-A',
        'test',
        '-W',
        'test',
        '-D',
        '../out',
        '--dev-url',
        'http://localhost:3000',
        '--before-dev-command',
        "echo 'Starting desktop app...'",
        '--before-build-command',
        "echo 'Building desktop app...'",
      ],
      devOptions,
    ]);

    expect(mockSpawnSync.mock.calls[3]).toEqual([
      'bun',
      [BUILD_PATH, 'DEV'],
      devOptions,
    ]);

    expect(mockSpawnSync.mock.calls[4]).toEqual([
      'bunx',
      ['tauri', 'dev', '--port', '3000'],
      devOptions,
    ]);
  });

  it('should use process.env.PORT as default port on tauri integration', async () => {
    process.env.PORT = '5000';
    process.argv = ['bun', 'brisa', 'dev'];

    const newDevOptions = {
      ...devOptions,
      env: { ...devOptions.env, PORT: '5000' },
    };

    mock.module(path.join(FIXTURES, 'brisa.config.ts'), () => ({
      default: {
        output: 'desktop',
      },
    }));

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[0]).toEqual([
      'bun',
      ['--version'],
      { stdio: 'ignore' },
    ]);
    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      ['i', '@tauri-apps/cli@2.0.0'],
      newDevOptions,
    ]);
    expect(mockSpawnSync.mock.calls[2]).toEqual([
      'bunx',
      [
        'tauri',
        'init',
        '-A',
        'test',
        '-W',
        'test',
        '-D',
        '../out',
        '--dev-url',
        'http://localhost:5000',
        '--before-dev-command',
        "echo 'Starting desktop app...'",
        '--before-build-command',
        "echo 'Building desktop app...'",
      ],
      newDevOptions,
    ]);

    expect(mockSpawnSync.mock.calls[3]).toEqual([
      'bun',
      [BUILD_PATH, 'DEV'],
      newDevOptions,
    ]);

    expect(mockSpawnSync.mock.calls[4]).toEqual([
      'bunx',
      ['tauri', 'dev', '--port', '5000'],
      newDevOptions,
    ]);
  });

  it('should build a desktop app with "brisa dev" command and output=desktop in another port', async () => {
    process.argv = ['bun', 'brisa', 'dev', '--port', '5000'];

    mock.module(path.join(FIXTURES, 'brisa.config.ts'), () => ({
      default: {
        output: 'desktop',
      },
    }));

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[0]).toEqual([
      'bun',
      ['--version'],
      { stdio: 'ignore' },
    ]);
    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      ['i', '@tauri-apps/cli@2.0.0'],
      devOptions,
    ]);
    expect(mockSpawnSync.mock.calls[2]).toEqual([
      'bunx',
      [
        'tauri',
        'init',
        '-A',
        'test',
        '-W',
        'test',
        '-D',
        '../out',
        '--dev-url',
        'http://localhost:5000',
        '--before-dev-command',
        "echo 'Starting desktop app...'",
        '--before-build-command',
        "echo 'Building desktop app...'",
      ],
      devOptions,
    ]);

    expect(mockSpawnSync.mock.calls[3]).toEqual([
      'bun',
      [BUILD_PATH, 'DEV'],
      devOptions,
    ]);

    expect(mockSpawnSync.mock.calls[4]).toEqual([
      'bunx',
      ['tauri', 'dev', '--port', '5000'],
      devOptions,
    ]);
  });

  it('should skip desktop "brisa dev" command', async () => {
    process.argv = ['bun', 'brisa', 'dev', '--skip-tauri'];

    mock.module(path.join(FIXTURES, 'brisa.config.ts'), () => ({
      default: {
        output: 'desktop',
      },
    }));

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[0]).toEqual([
      'bun',
      ['--version'],
      { stdio: 'ignore' },
    ]);
    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      [BUILD_PATH, 'DEV'],
      devOptions,
    ]);
    expect(mockSpawnSync.mock.calls[2]).toEqual([
      'bun',
      [SERVE_PATH, '3000', 'DEV'],
      devOptions,
    ]);
  });

  it('should execute "brisa build" command with default options', async () => {
    process.argv = ['bun', 'brisa', 'build'];

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[0]).toEqual([
      'bun',
      ['--version'],
      { stdio: 'ignore' },
    ]);
    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      [path.join(import.meta.dir, 'out', 'cli', 'build.js'), 'PROD'],
      prodOptions,
    ]);
  });

  it('should execute "brisa build --help" command', async () => {
    process.argv = ['bun', 'brisa', 'build', '--help'];

    await cli.main(options);

    expect(mockSpawnSync).toHaveBeenCalledTimes(1); // bun --version
    expect(mockLog.mock.calls).toEqual([
      ['Usage: brisa build [options]'],
      ['Options:'],
      [' -d, --dev           Build for development (useful for custom server)'],
      [
        ' -w, --web-component Build standalone web component to create a library',
      ],
      [
        ' -c, --component     Build standalone server component to create a library',
      ],
      [
        " -s, --skip-tauri    Skip open tauri app when 'output': 'desktop' | 'android' | 'ios' in brisa.config.ts",
      ],
      [' --help              Show help'],
    ]);
  });

  it('should build a standalone web component using --web-component flag', async () => {
    process.argv = [
      'bun',
      'brisa',
      'build',
      '--web-component',
      '/some/file.tsx',
    ];

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      [
        path.join(
          import.meta.dir,
          'out',
          'cli',
          'build-standalone',
          'index.js',
        ),
        'PROD',
        'WC',
        '/some/file.tsx',
      ],
      prodOptions,
    ]);
  });

  it('should build a standalone web component using -w flag', async () => {
    process.argv = ['bun', 'brisa', 'build', '-w', '/some/file.tsx'];

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      [
        path.join(
          import.meta.dir,
          'out',
          'cli',
          'build-standalone',
          'index.js',
        ),
        'PROD',
        'WC',
        '/some/file.tsx',
      ],
      prodOptions,
    ]);
  });

  it('should build a standalone web component in DEV using -w flag + -d', async () => {
    process.argv = ['bun', 'brisa', 'build', '-d', '-w', '/some/file.tsx'];

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      [
        path.join(
          import.meta.dir,
          'out',
          'cli',
          'build-standalone',
          'index.js',
        ),
        'DEV',
        'WC',
        '/some/file.tsx',
      ],
      devOptions,
    ]);
  });

  it('should displays an error log using -w flag without the file', async () => {
    process.argv = ['bun', 'brisa', 'build', '-w'];

    await cli.main(options);

    expect(mockLog.mock.calls).toEqual([
      [
        redLog(
          'Ops!: using --web-component (-w) flag you need to specify a file.',
        ),
      ],
      [redLog('Example: brisa build -w some/web-component.tsx')],
    ]);
  });

  it('should displays an error log using -w flag without the file + another flag', async () => {
    process.argv = ['bun', 'brisa', 'build', '-w', '-d'];
    mockExistsSync.mockImplementation(() => false);

    await cli.main(options);

    expect(mockLog.mock.calls).toEqual([
      [
        redLog(
          'Ops!: using --web-component (-w) flag you need to specify a file.',
        ),
      ],
      [redLog('Example: brisa build -w some/web-component.tsx')],
    ]);
  });
  it('should build a standalone web component in DEV using -w flag + -d in different order', async () => {
    process.argv = ['bun', 'brisa', 'build', '-w', '/some/file.tsx', '-d'];

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      [
        path.join(
          import.meta.dir,
          'out',
          'cli',
          'build-standalone',
          'index.js',
        ),
        'DEV',
        'WC',
        '/some/file.tsx',
      ],
      devOptions,
    ]);
  });

  it('should build a standalone server component using --component flag', async () => {
    process.argv = ['bun', 'brisa', 'build', '--component', '/some/file.tsx'];

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      [
        path.join(
          import.meta.dir,
          'out',
          'cli',
          'build-standalone',
          'index.js',
        ),
        'PROD',
        'SC',
        '/some/file.tsx',
      ],
      prodOptions,
    ]);
  });

  it('should build a standalone server component using -c flag', async () => {
    process.argv = ['bun', 'brisa', 'build', '-c', '/some/file.tsx'];

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      [
        path.join(
          import.meta.dir,
          'out',
          'cli',
          'build-standalone',
          'index.js',
        ),
        'PROD',
        'SC',
        '/some/file.tsx',
      ],
      prodOptions,
    ]);
  });

  it('should build a standalone server component in DEV using -c flag + -d', async () => {
    process.argv = ['bun', 'brisa', 'build', '-d', '-c', '/some/file.tsx'];

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      [
        path.join(
          import.meta.dir,
          'out',
          'cli',
          'build-standalone',
          'index.js',
        ),
        'DEV',
        'SC',
        '/some/file.tsx',
      ],
      devOptions,
    ]);
  });

  it('should displays an error log using -c flag without the file', async () => {
    process.argv = ['bun', 'brisa', 'build', '-c'];

    await cli.main(options);

    expect(mockLog.mock.calls).toEqual([
      [redLog('Ops!: using --component (-c) flag you need to specify a file.')],
      [redLog('Example: brisa build -c some/server-component.tsx')],
    ]);
  });

  it('should displays an error log using -c flag without the file + another flag', async () => {
    process.argv = ['bun', 'brisa', 'build', '-c', '-d'];
    mockExistsSync.mockImplementation(() => false);

    await cli.main(options);

    expect(mockLog.mock.calls).toEqual([
      [redLog('Ops!: using --component (-c) flag you need to specify a file.')],
      [redLog('Example: brisa build -c some/server-component.tsx')],
    ]);
  });
  it('should build a standalone web component in DEV using -c flag + -d in different order', async () => {
    process.argv = ['bun', 'brisa', 'build', '-c', '/some/file.tsx', '-d'];

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      [
        path.join(
          import.meta.dir,
          'out',
          'cli',
          'build-standalone',
          'index.js',
        ),
        'DEV',
        'SC',
        '/some/file.tsx',
      ],
      devOptions,
    ]);
  });

  it('should build multi standalone server components using multi -c flag', async () => {
    process.argv = [
      'bun',
      'brisa',
      'build',
      '-c',
      '/some/file.tsx',
      '-c',
      '/some/other-file.tsx',
    ];

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      [
        path.join(
          import.meta.dir,
          'out',
          'cli',
          'build-standalone',
          'index.js',
        ),
        'PROD',
        'SC',
        '/some/file.tsx',
        'SC',
        '/some/other-file.tsx',
      ],
      prodOptions,
    ]);
  });

  it('should build multi standalone web components using multi -w flag', async () => {
    process.argv = [
      'bun',
      'brisa',
      'build',
      '-w',
      '/some/file.tsx',
      '-w',
      '/some/other-file.tsx',
    ];

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      [
        path.join(
          import.meta.dir,
          'out',
          'cli',
          'build-standalone',
          'index.js',
        ),
        'PROD',
        'WC',
        '/some/file.tsx',
        'WC',
        '/some/other-file.tsx',
      ],
      prodOptions,
    ]);
  });

  it('should be possible to build a standalone web component and a standalone server component together', async () => {
    process.argv = [
      'bun',
      'brisa',
      'build',
      '-w',
      '/some/file.tsx',
      '-c',
      '/some/other-file.tsx',
    ];

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      [
        path.join(
          import.meta.dir,
          'out',
          'cli',
          'build-standalone',
          'index.js',
        ),
        'PROD',
        'WC',
        '/some/file.tsx',
        'SC',
        '/some/other-file.tsx',
      ],
      prodOptions,
    ]);
  });

  it('should log using the same file for standalone web component and standalone server component', async () => {
    process.argv = [
      'bun',
      'brisa',
      'build',
      '-w',
      '/some/file.tsx',
      '-c',
      '/some/file.tsx',
    ];
    await cli.main(options);

    expect(mockLog.mock.calls).toEqual([
      [
        redLog(
          'Error: The --web-component flag automatically builds both client and server. Using the same file for both --component (-c) and --web-component (-w) flags is not allowed.',
        ),
      ],
      [
        redLog(
          'Suggestion: Use only the --web-component flag instead: brisa build -w /some/file.tsx',
        ),
      ],
    ]);
  });

  it('should log using multiple files for standalone web component and standalone server component', async () => {
    process.argv = [
      'bun',
      'brisa',
      'build',
      '-w',
      '/some/file.tsx',
      '-c',
      '/some/file.tsx',
      '-w',
      '/some/another-file.tsx',
      '-c',
      '/some/another-file.tsx',
    ];
    await cli.main(options);

    expect(mockLog.mock.calls).toEqual([
      [
        redLog(
          'Error: The --web-component flag automatically builds both client and server. Using the same file for both --component (-c) and --web-component (-w) flags is not allowed.',
        ),
      ],
      [
        redLog(
          'Suggestion: Use only the --web-component flag instead: brisa build -w /some/file.tsx -w /some/another-file.tsx',
        ),
      ],
    ]);
  });

  it('should build a desktop app with "brisa build" command and output=desktop', async () => {
    process.argv = ['bun', 'brisa', 'build'];

    mock.module(path.join(FIXTURES, 'brisa.config.ts'), () => ({
      default: {
        output: 'desktop',
      },
    }));

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[0]).toEqual([
      'bun',
      ['--version'],
      { stdio: 'ignore' },
    ]);
    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      ['i', '@tauri-apps/cli@2.0.0'],
      prodOptions,
    ]);
    expect(mockSpawnSync.mock.calls[2]).toEqual([
      'bunx',
      [
        'tauri',
        'init',
        '-A',
        'test',
        '-W',
        'test',
        '-D',
        '../out',
        '--dev-url',
        'http://localhost:3000',
        '--before-dev-command',
        "echo 'Starting desktop app...'",
        '--before-build-command',
        "echo 'Building desktop app...'",
      ],
      prodOptions,
    ]);

    expect(mockSpawnSync.mock.calls[3]).toEqual([
      'bun',
      [BUILD_PATH, 'PROD'],
      prodOptions,
    ]);

    expect(mockSpawnSync.mock.calls[4]).toEqual([
      'bunx',
      ['tauri', 'build'],
      prodOptions,
    ]);
  });

  it('should skip desktop "brisa build" command', async () => {
    process.argv = ['bun', 'brisa', 'build', '--skip-tauri'];

    mock.module(path.join(FIXTURES, 'brisa.config.ts'), () => ({
      default: {
        output: 'desktop',
      },
    }));

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[0]).toEqual([
      'bun',
      ['--version'],
      { stdio: 'ignore' },
    ]);
    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      [path.join(import.meta.dir, 'out', 'cli', 'build.js'), 'PROD'],
      prodOptions,
    ]);
  });

  it('should build a android app with "brisa build" command and output=android', async () => {
    process.argv = ['bun', 'brisa', 'build'];

    mock.module(path.join(FIXTURES, 'brisa.config.ts'), () => ({
      default: {
        output: 'android',
      },
    }));

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[0]).toEqual([
      'bun',
      ['--version'],
      { stdio: 'ignore' },
    ]);
    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      ['i', '@tauri-apps/cli@2.0.0'],
      prodOptions,
    ]);
    expect(mockSpawnSync.mock.calls[2]).toEqual([
      'bunx',
      [
        'tauri',
        'init',
        '-A',
        'test',
        '-W',
        'test',
        '-D',
        '../out',
        '--dev-url',
        'http://localhost:3000',
        '--before-dev-command',
        "echo 'Starting android app...'",
        '--before-build-command',
        "echo 'Building android app...'",
      ],
      prodOptions,
    ]);

    expect(mockSpawnSync.mock.calls[3]).toEqual([
      'bun',
      [BUILD_PATH, 'PROD'],
      prodOptions,
    ]);

    expect(mockSpawnSync.mock.calls[4]).toEqual([
      'bunx',
      ['tauri', 'android', 'build'],
      prodOptions,
    ]);
  });

  it('should skip android "brisa build" command', async () => {
    process.argv = ['bun', 'brisa', 'build', '--skip-tauri'];

    mock.module(path.join(FIXTURES, 'brisa.config.ts'), () => ({
      default: {
        output: 'android',
      },
    }));

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[0]).toEqual([
      'bun',
      ['--version'],
      { stdio: 'ignore' },
    ]);
    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      [path.join(import.meta.dir, 'out', 'cli', 'build.js'), 'PROD'],
      prodOptions,
    ]);
  });

  it('should build a ios app with "brisa build" command and output=ios', async () => {
    process.argv = ['bun', 'brisa', 'build'];

    mock.module(path.join(FIXTURES, 'brisa.config.ts'), () => ({
      default: {
        output: 'ios',
      },
    }));

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[0]).toEqual([
      'bun',
      ['--version'],
      { stdio: 'ignore' },
    ]);
    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      ['i', '@tauri-apps/cli@2.0.0'],
      prodOptions,
    ]);
    expect(mockSpawnSync.mock.calls[2]).toEqual([
      'bunx',
      [
        'tauri',
        'init',
        '-A',
        'test',
        '-W',
        'test',
        '-D',
        '../out',
        '--dev-url',
        'http://localhost:3000',
        '--before-dev-command',
        "echo 'Starting ios app...'",
        '--before-build-command',
        "echo 'Building ios app...'",
      ],
      prodOptions,
    ]);

    expect(mockSpawnSync.mock.calls[3]).toEqual([
      'bun',
      [BUILD_PATH, 'PROD'],
      prodOptions,
    ]);

    expect(mockSpawnSync.mock.calls[4]).toEqual([
      'bunx',
      ['tauri', 'ios', 'build'],
      prodOptions,
    ]);
  });

  it('should skip ios "brisa build" command', async () => {
    process.argv = ['bun', 'brisa', 'build', '--skip-tauri'];

    mock.module(path.join(FIXTURES, 'brisa.config.ts'), () => ({
      default: {
        output: 'ios',
      },
    }));

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[0]).toEqual([
      'bun',
      ['--version'],
      { stdio: 'ignore' },
    ]);
    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      [path.join(import.meta.dir, 'out', 'cli', 'build.js'), 'PROD'],
      prodOptions,
    ]);
  });

  it('should execute "brisa start" command with default options', async () => {
    process.argv = ['bun', 'brisa', 'start'];

    await cli.main(options);

    expect(mockSpawnSync).toHaveBeenCalledTimes(2); // bun --version
    expect(mockSpawnSync.mock.calls[0]).toEqual([
      'bun',
      ['--version'],
      { stdio: 'ignore' },
    ]);
    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      [SERVE_PATH_PROD, '3000', 'PROD'],
      prodOptions,
    ]);
  });

  it('should use process.env.PORT as default port on bun start', async () => {
    process.env.PORT = '3005';
    process.argv = ['bun', 'brisa', 'start'];

    const newProdOptions = {
      ...prodOptions,
      env: { ...prodOptions.env, PORT: '3005' },
    };

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[0]).toEqual([
      'bun',
      ['--version'],
      { stdio: 'ignore' },
    ]);

    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      [SERVE_PATH_PROD, '3005', 'PROD'],
      newProdOptions,
    ]);
  });

  it('should "bun start" call "node" when output is "node"', async () => {
    process.argv = ['bun', 'brisa', 'start'];

    mock.module(path.join(FIXTURES, 'brisa.config.ts'), () => ({
      default: {
        output: 'node',
      },
    }));

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'node',
      [SERVE_PATH_PROD, '3000', 'PROD'],
      prodOptions,
    ]);
  });

  it('should "bun start" call "deno" when output is "deno"', async () => {
    process.argv = ['bun', 'brisa', 'start'];

    mock.module(path.join(FIXTURES, 'brisa.config.ts'), () => ({
      default: {
        output: 'deno',
      },
    }));

    await cli.main(options);

    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'deno',
      [
        'run',
        '--allow-net',
        '--allow-read',
        '--allow-env',
        '--allow-sys',
        SERVE_PATH_PROD,
        '3000',
        'PROD',
      ],
      prodOptions,
    ]);
  });

  it('should execute "brisa start --help" command', async () => {
    process.argv = ['bun', 'brisa', 'start', '--help'];

    await cli.main(options);

    expect(mockSpawnSync).toHaveBeenCalledTimes(1); // bun --version
    expect(mockLog.mock.calls).toEqual([
      ['Usage: brisa start [options]'],
      ['Options:'],
      [' -p, --port    Specify port'],
      [' --help        Show help'],
    ]);

    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('should execute "brisa start" command with custom port', async () => {
    process.argv = ['bun', 'brisa', 'start', '--port', '5000'];

    await cli.main(options);

    expect(mockSpawnSync).toHaveBeenCalledTimes(2); // bun --version
    expect(mockSpawnSync.mock.calls[0]).toEqual([
      'bun',
      ['--version'],
      { stdio: 'ignore' },
    ]);
    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      [SERVE_PATH_PROD, '5000', 'PROD'],
      prodOptions,
    ]);
  });

  it('should execute .bun/bin/bun when the bun command is not found', async () => {
    mockSpawnSync = spyOn(cp, 'spawnSync').mockImplementation(
      () => ({ status: 1 }) as any,
    );

    process.argv = ['bun', 'brisa', 'start'];

    await cli.main(options);

    expect(mockSpawnSync).toHaveBeenCalledTimes(2); // bun --version

    expect(mockSpawnSync.mock.calls[0]).toEqual([
      'bun',
      ['--version'],
      { stdio: 'ignore' },
    ]);

    expect(mockSpawnSync.mock.calls[1][0]).toBe(
      path.join(process.env.HOME!, '.bun', 'bin', 'bun'),
    );
    expect(mockSpawnSync.mock.calls[1]).toEqual([
      path.join(process.env.HOME!, '.bun', 'bin', 'bun'),
      [SERVE_PATH_PROD, '3000', 'PROD'],
      prodOptions,
    ]);
  });

  it('should "brisa add mdx" command integrate MDX', async () => {
    process.argv = ['bun', 'brisa', 'add', 'mdx'];

    await cli.main(options);

    expect(mockSpawnSync).toHaveBeenCalledTimes(3);
    expect(mockSpawnSync.mock.calls[0]).toEqual([
      'bun',
      ['--version'],
      { stdio: 'ignore' },
    ]);
    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      ['i', '@mdx-js/esbuild@3.0.1'],
      devOptions,
    ]);
    expect(mockSpawnSync.mock.calls[2]).toEqual([
      'bun',
      [MDX_PATH],
      devOptions,
    ]);
  });

  it('should "brisa add tailwindcss" command integrate TailwindCSS', async () => {
    process.argv = ['bun', 'brisa', 'add', 'tailwindcss'];

    await cli.main(options);

    expect(mockSpawnSync).toHaveBeenCalledTimes(2);
    expect(mockSpawnSync.mock.calls[0]).toEqual([
      'bun',
      ['--version'],
      { stdio: 'ignore' },
    ]);
    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      [TAILWINDCSS_PATH],
      devOptions,
    ]);
  });

  it('should "brisa add pandacss" command integrate PandaCSS', async () => {
    process.argv = ['bun', 'brisa', 'add', 'pandacss'];

    await cli.main(options);

    expect(mockSpawnSync).toHaveBeenCalledTimes(2);
    expect(mockSpawnSync.mock.calls[0]).toEqual([
      'bun',
      ['--version'],
      { stdio: 'ignore' },
    ]);
    expect(mockSpawnSync.mock.calls[1]).toEqual([
      'bun',
      [PANDACSS_PATH],
      devOptions,
    ]);
  });

  it('should "brisa add --help" command provide help', async () => {
    process.argv = ['bun', 'brisa', 'add', '--help'];

    await cli.main(options);

    expect(mockSpawnSync).toHaveBeenCalledTimes(1);
    expect(mockLog.mock.calls).toEqual([
      ['Integration not found'],
      ['Usage: brisa add <integration>'],
      ['Integrations:'],
      [' mdx          Add mdx integration'],
      [' tailwindcss  Add tailwindcss integration'],
      [' pandacss     Add pandacss integration'],
      ['Options:'],
      [' --help       Show help'],
    ]);
  });

  it('should warn when Bun.version is older than the required version', async () => {
    process.argv = ['bun', 'brisa'];

    await cli.main({
      currentBunVersion: '1.0.0',
      brisaPackageManager: 'bun@999.999.999',
    });

    expect(mockLog.mock.calls[0][0]).toBe(
      yellowLog(
        'Warning: Your current Bun version is not supported by the current version of Brisa, but you can still use older versions from Brisa. Please upgrade Bun to 999.999.999 or later to use latest version of Brisa.\n',
      ),
    );
    expect(mockLog.mock.calls[1][0]).toBe(
      yellowLog('You can upgrade Bun by running:\n'),
    );
  });

  it('should NOT warn when Bun.version is the same than the required version', async () => {
    process.argv = ['bun', 'brisa'];

    await cli.main({
      currentBunVersion: '1.0.0',
      brisaPackageManager: 'bun@1.0.0',
    });

    expect(mockLog.mock.calls[0][0]).not.toBe(
      yellowLog(
        'Warning: Your current Bun version is not supported by the current version of Brisa',
      ),
    );
    expect(mockLog.mock.calls[1][0]).not.toBe(
      yellowLog('You can upgrade Bun by running:\n'),
    );
  });

  it('should NOT warn when Bun.version is newer than the required version', async () => {
    process.argv = ['bun', 'brisa'];

    await cli.main({
      currentBunVersion: '1.0.0',
      brisaPackageManager: 'bun@0.1.0',
    });

    expect(mockLog.mock.calls[0][0]).not.toBe(
      yellowLog(
        'Warning: Your current Bun version is not supported by the current version of Brisa',
      ),
    );
    expect(mockLog.mock.calls[1][0]).not.toBe(
      yellowLog('You can upgrade Bun by running:\n'),
    );
  });
});
