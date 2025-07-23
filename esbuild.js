const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
	name: 'esbuild-problem-matcher',

	setup(build) {
		build.onStart(() => {
			console.log('[watch] build started');
		});
		build.onEnd((result) => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log('[watch] build finished');
		});
	},
};

/**
 * 複製靜態資源的插件
 * @type {import('esbuild').Plugin}
 */
const copyStaticFilesPlugin = {
	name: 'copy-static-files',
	setup(build) {
		build.onEnd(() => {
			// 確保目標目錄存在
			const webviewDir = path.join(__dirname, 'dist', 'webview');
			if (!fs.existsSync(webviewDir)) {
				fs.mkdirSync(webviewDir, { recursive: true });
			}

			// 複製 HTML 文件
			const srcHtml = path.join(__dirname, 'src', 'webview', 'word-detail.html');
			const destHtml = path.join(webviewDir, 'word-detail.html');
			
			if (fs.existsSync(srcHtml)) {
				fs.copyFileSync(srcHtml, destHtml);
				console.log('✓ Copied word-detail.html to dist/webview/');
			}
		});
	},
};

async function main() {
	const ctx = await esbuild.context({
		entryPoints: [
			'src/extension.ts'
		],
		bundle: true,
		format: 'cjs',
		minify: production,
		sourcemap: !production,
		sourcesContent: false,
		platform: 'node',
		outfile: 'dist/extension.js',
		external: ['vscode'],
		logLevel: 'silent',
		plugins: [
			copyStaticFilesPlugin,
			/* add to the end of plugins array */
			esbuildProblemMatcherPlugin,
		],
	});
	if (watch) {
		await ctx.watch();
	} else {
		await ctx.rebuild();
		await ctx.dispose();
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
