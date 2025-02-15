import {
  describe,
  it,
  expect,
  mock,
  beforeEach,
  afterEach,
  spyOn,
} from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import build from './build';
import { getConstants } from '@/constants';
import type { Configuration } from '@/types';
import { enableANSIColors } from '@/utils/supports-basic-color';

const BRISA_DIR = path.join(import.meta.dirname, '..', '..');
const BUILD_DIR = path.join(import.meta.dirname, 'out');

const defaultResult = {
  success: true,
  pagesSize: {
    '/pages/index.js': 100,
  },
} as const;

const resultWithdDynamicRoute = {
  success: true,
  pagesSize: {
    '/pages/index.js': 100,
    '/pages/user/[username].js': 0,
  },
} as const;

const mockCompileAll = mock(async () => defaultResult);
const mockTable = mock((v: any) => null);
const mockGenerateStaticExport = mock(async () => [
  new Map<string, string[]>(),
]);
const mockLog = mock((...logs: string[]) => {});
const green = (text: string) =>
  enableANSIColors ? `\x1b[32m${text}\x1b[0m` : text;

describe('cli', () => {
  describe('build', () => {
    beforeEach(() => {
      if (!fs.existsSync(BUILD_DIR)) fs.mkdirSync(BUILD_DIR);
      spyOn(process, 'exit').mockImplementation(() => null as never);
      spyOn(console, 'log').mockImplementation((...logs) => mockLog(...logs));
      mock.module('@/utils/compile-all', () => ({
        default: async () => (await mockCompileAll()) || defaultResult,
      }));
      mock.module('./build-utils', () => ({
        logTable: (v: any) => mockTable(v),
        generateStaticExport: async () =>
          (await mockGenerateStaticExport()) || [new Map<string, string[]>()],
      }));
    });

    afterEach(() => {
      fs.rmSync(BUILD_DIR, { recursive: true, force: true });
      mockCompileAll.mockRestore();
      mockGenerateStaticExport.mockRestore();
      mockTable.mockRestore();
      mockLog.mockRestore();
      mock.restore();
      globalThis.mockConstants = undefined;
      process.env.QUIET_MODE = undefined;
    });

    it('should remove the content of build directory if it exists (except _brisa)', async () => {
      spyOn(fs, 'existsSync').mockImplementationOnce((v) => true);
      spyOn(fs, 'readdirSync').mockImplementationOnce(
        () => ['_brisa', 'pages'] as any,
      );
      spyOn(fs, 'rmSync').mockImplementationOnce((v) => null);

      await build();
      expect(fs.existsSync).toHaveBeenCalled();
      expect(fs.rmSync).toHaveBeenCalledWith(
        path.join(getConstants()?.BUILD_DIR, 'pages'),
        { recursive: true },
      );
    });

    it('should NOT remove the build directory if does not exist', async () => {
      spyOn(fs, 'existsSync').mockImplementationOnce((v) => false);
      spyOn(fs, 'rmSync').mockImplementationOnce((v) => null);

      await build();
      expect(fs.existsSync).toHaveBeenCalled();
      expect(fs.rmSync).not.toHaveBeenCalled();
    });

    it('should copy the prebuild directory to the build directory', async () => {
      const { ROOT_DIR, BUILD_DIR, LOG_PREFIX } = getConstants();
      const originPrebuildPath = path.join(ROOT_DIR, 'prebuild');
      const finalPrebuildPath = path.join(BUILD_DIR, 'prebuild');

      spyOn(fs, 'existsSync').mockImplementation((v) =>
        (v as string).includes('prebuild'),
      );
      spyOn(fs, 'cpSync').mockImplementationOnce(() => null);

      await build();
      const logs = mockLog.mock.calls.flat().join('');

      // It's important the order of logs, prebuild should be necessary
      // before the build because it needs to find the correct path
      // during the build
      expect(logs).toContain(
        `Copied prebuild folder inside build${LOG_PREFIX.INFO}${LOG_PREFIX.TICK}Compiled successfully!`,
      );
      expect(fs.existsSync).toHaveBeenCalledTimes(2);
      expect(fs.cpSync).toHaveBeenCalledWith(
        originPrebuildPath,
        finalPrebuildPath,
        {
          recursive: true,
        },
      );
    });

    it('should call compileAll if no "output" field is defined in the configuration', async () => {
      await build();
      expect(mockCompileAll).toHaveBeenCalled();
      expect(mockGenerateStaticExport).not.toHaveBeenCalled();
    });

    it('should not call generateStaticExport in development when is static export', async () => {
      globalThis.mockConstants = {
        ...(getConstants() ?? {}),
        IS_PRODUCTION: false,
        IS_STATIC_EXPORT: true,
        CONFIG: {
          output: 'static',
        },
      };
      await build();
      expect(mockCompileAll).toHaveBeenCalled();
      expect(mockGenerateStaticExport).not.toHaveBeenCalled();
    });

    it('should call generateStaticExport in production when is static export', async () => {
      globalThis.mockConstants = {
        ...(getConstants() ?? {}),
        IS_PRODUCTION: true,
        IS_STATIC_EXPORT: true,
        CONFIG: {
          output: 'static',
        },
      };
      await build();
      expect(mockCompileAll).toHaveBeenCalled();
      expect(mockGenerateStaticExport).toHaveBeenCalled();
    });

    it('should log the table with the generated static export pages', async () => {
      globalThis.mockConstants = {
        ...(getConstants() ?? {}),
        IS_PRODUCTION: true,
        IS_STATIC_EXPORT: true,
        CONFIG: {
          output: 'static',
        },
      };

      await build();
      const logs = mockLog.mock.calls.flat().toString();
      expect(mockTable).toHaveBeenCalledWith([
        {
          'JS client (gz)': green('100 B'),
          Route: '○ /pages/index',
        },
      ]);
      expect(logs).toContain('Generated static pages successfully!');
      expect(logs).not.toContain('Ω (i18n) prerendered for each locale');
    });

    it('should log "Ω (i18n) prerendered for each locale" if i18n is enabled', async () => {
      const constants = getConstants() ?? {};

      globalThis.mockConstants = {
        ...constants,
        IS_PRODUCTION: true,
        IS_STATIC_EXPORT: true,
        CONFIG: {
          output: 'static',
        },
        I18N_CONFIG: {
          ...constants?.I18N_CONFIG,
          locales: ['en', 'pt'],
        },
      };

      await build();
      const logs = mockLog.mock.calls.flat().toString();
      expect(mockTable).toHaveBeenCalledWith([
        {
          'JS client (gz)': green('100 B'),
          Route: '○ /pages/index',
        },
      ]);
      expect(logs).toContain('Generated static pages successfully!');
      expect(logs).toContain('Ω  (i18n) prerendered for each locale');
    });

    it('should log prerendered dynamic routes with output="static"', async () => {
      mockCompileAll.mockImplementationOnce(
        async () => resultWithdDynamicRoute,
      );
      mockGenerateStaticExport.mockImplementationOnce(async () => {
        const map = new Map<string, string[]>();
        map.set('/pages/user/[username].js', [
          '/user/john.html',
          '/user/jane.html',
        ]);
        return [map];
      });

      const constants = getConstants() ?? {};

      globalThis.mockConstants = {
        ...constants,
        IS_PRODUCTION: true,
        IS_STATIC_EXPORT: true,
        CONFIG: {
          output: 'static',
        },
      };

      await build();
      const logs = mockLog.mock.calls.flat().toString();
      expect(mockTable.mock.calls.flat()[0]).toEqual([
        {
          'JS client (gz)': green('100 B'),
          Route: '○ /pages/index',
        },
        {
          'JS client (gz)': green('0 B'),
          Route: '○ /pages/user/[username]',
        },
        {
          'JS client (gz)': green('0 B'),
          Route: '| ○ /user/john',
        },
        {
          'JS client (gz)': green('0 B'),
          Route: '| ○ /user/jane',
        },
      ]);
      expect(logs).toContain('Generated static pages successfully!');
    });

    it('should call outputAdapter if defined in the configuration (PROD)', async () => {
      const mockAdapter = mock((v: any) => v);

      globalThis.mockConstants = {
        ...(getConstants() ?? {}),
        IS_PRODUCTION: true,
        CONFIG: {
          output: 'static',
          outputAdapter: {
            name: 'my-adapter',
            adapt: mockAdapter,
          },
        },
      };

      await build();
      const logs = mockLog.mock.calls.flat().toString();
      expect(logs).toContain('Adapting output to my-adapter...');
      expect(mockAdapter).toHaveBeenCalledTimes(1);
      expect(mockAdapter.mock.calls[0][0]).toEqual(globalThis.mockConstants);
    });

    it('should NOT call outputAdapter if defined in the configuration in development', async () => {
      const mockAdapter = mock((v: any) => v);
      const config = {
        output: 'static',
        outputAdapter: {
          name: 'my-adapter',
          adapt: mockAdapter,
        },
      } as Configuration;

      globalThis.mockConstants = {
        ...(getConstants() ?? {}),
        IS_PRODUCTION: false,
        CONFIG: config,
      };

      await build();
      const logs = mockLog.mock.calls.flat().toString();
      expect(logs).not.toContain('Adapting output to my-adapter...');
      expect(mockAdapter).not.toHaveBeenCalled();
    });

    it('should move internals before the adapter (server.js, etc)', async () => {
      let existInternals = false;

      globalThis.mockConstants = {
        ...(getConstants() ?? {}),
        IS_PRODUCTION: true,
        BUILD_DIR,
        BRISA_DIR,
        CONFIG: {
          output: 'node',
          outputAdapter: {
            name: 'my-adapter',
            adapt: () => {
              existInternals = fs.existsSync(
                path.join(getConstants()?.BUILD_DIR, 'server.js'),
              );
            },
          },
        },
      };

      await build();
      expect(existInternals).toBeTrue();
    });

    it('should not log when process.env.QUIET_MODE is true', async () => {
      process.env.QUIET_MODE = 'true';
      await build();
      expect(mockLog).not.toHaveBeenCalled();
    });

    it('should NOT create deno.json when output is "bun" in production', async () => {
      globalThis.mockConstants = {
        ...(getConstants() ?? {}),
        BUILD_DIR,
        BRISA_DIR,
        CONFIG: {
          output: 'bun',
        },
        IS_PRODUCTION: false,
      };

      await build();
      expect(fs.existsSync(path.join(BUILD_DIR, 'deno.json'))).toBeFalse();
    });

    it('should NOT create deno.json when output is "node" in production', async () => {
      globalThis.mockConstants = {
        ...(getConstants() ?? {}),
        BUILD_DIR,
        BRISA_DIR,
        CONFIG: {
          output: 'bun',
        },
        IS_PRODUCTION: false,
      };

      await build();
      expect(fs.existsSync(path.join(BUILD_DIR, 'deno.json'))).toBeFalse();
    });

    it('should NOT create deno.json when output is "static" in production', async () => {
      globalThis.mockConstants = {
        ...(getConstants() ?? {}),
        BUILD_DIR,
        BRISA_DIR,
        CONFIG: {
          output: 'static',
        },
        IS_PRODUCTION: false,
      };

      await build();
      expect(fs.existsSync(path.join(BUILD_DIR, 'deno.json'))).toBeFalse();
    });

    it('should NOT create deno.json when output is "ios" in production', async () => {
      globalThis.mockConstants = {
        ...(getConstants() ?? {}),
        BUILD_DIR,
        BRISA_DIR,
        CONFIG: {
          output: 'ios',
        },
        IS_PRODUCTION: false,
      };

      await build();
      expect(fs.existsSync(path.join(BUILD_DIR, 'deno.json'))).toBeFalse();
    });

    it('should NOT create deno.json when output is "android" in production', async () => {
      globalThis.mockConstants = {
        ...(getConstants() ?? {}),
        BUILD_DIR,
        BRISA_DIR,
        CONFIG: {
          output: 'android',
        },
        IS_PRODUCTION: false,
      };

      await build();
      expect(fs.existsSync(path.join(BUILD_DIR, 'deno.json'))).toBeFalse();
    });

    it('should NOT create deno.json when output is "desktop" in production', async () => {
      globalThis.mockConstants = {
        ...(getConstants() ?? {}),
        BUILD_DIR,
        BRISA_DIR,
        CONFIG: {
          output: 'desktop',
        },
        IS_PRODUCTION: false,
      };

      await build();
      expect(fs.existsSync(path.join(BUILD_DIR, 'deno.json'))).toBeFalse();
    });

    it('should NOT create deno.json when output is "deno" in development', async () => {
      globalThis.mockConstants = {
        ...(getConstants() ?? {}),
        BUILD_DIR,
        BRISA_DIR,
        CONFIG: {
          output: 'deno',
        },
        IS_PRODUCTION: false,
      };

      await build();
      expect(fs.existsSync(path.join(BUILD_DIR, 'deno.json'))).toBeFalse();
    });

    it('should create deno.json when output is "deno" in production', async () => {
      globalThis.mockConstants = {
        ...(getConstants() ?? {}),
        BUILD_DIR,
        BRISA_DIR,
        CONFIG: {
          output: 'deno',
        },
        IS_PRODUCTION: true,
      };

      await build();
      expect(fs.existsSync(path.join(BUILD_DIR, 'deno.json'))).toBeTrue();
    });
  });
});
