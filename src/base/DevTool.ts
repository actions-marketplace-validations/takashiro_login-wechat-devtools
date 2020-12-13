import * as fs from 'fs';
import * as path from 'path';
import * as util from 'util';

import exist from '../util/exist';

const readdir = util.promisify(fs.readdir);

interface DevTool {
	installDir: string;
	gui: string;
	allowCli: () => Promise<void>;
}

export const devToolMap: Record<string, DevTool> = {
	win32: {
		installDir: 'C:\\Progra~2\\Tencent\\微信web开发者工具',
		gui: '微信开发者工具.exe',
		async allowCli(): Promise<void> {
			const appDataDir = process.env.LOCALAPPDATA;
			if (!appDataDir) {
				throw new Error('AppData directory is not found.');
			}

			const userDataDir = path.join(appDataDir, '微信开发者工具', 'User Data');
			const userDirs = await readdir(userDataDir);
			for (const userDir of userDirs) {
				if (userDir === 'Crashpad' || userDir.startsWith('.')) {
					continue;
				}

				const markFile = path.join(userDataDir, userDir, 'Default', '.ide-status');
				await exist(markFile);
			}
		},
	},
};

export default DevTool;
